import { adminClient, appRedirect, encryptToken, env, graph, graphVersion, publicErrorCode, sha256 } from "../_shared/adsOAuth.ts";

async function allAdAccounts(token: string) {
  const rows: Record<string,unknown>[] = [];
  let url: string | null = `https://graph.facebook.com/${graphVersion()}/me/adaccounts?fields=id,name,account_status,currency,timezone_name&limit=200`;
  while (url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok || payload?.error) throw new Error(payload?.error?.message || "ACCOUNT_DISCOVERY_FAILED");
    rows.push(...(payload.data ?? []));
    url = payload.paging?.next ?? null;
  }
  return rows;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const rawState = url.searchParams.get("state") ?? "";
  const db = adminClient();
  const fallback = "/mkt/ads?panel=settings";
  let returnTo: unknown = fallback;
  try {
    if (!rawState) throw new Error("STATE_MISSING");
    const { data: state, error: stateError } = await db.from("ad_oauth_states").select("*")
      .eq("state_hash", await sha256(rawState)).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (stateError || !state) throw new Error("STATE_INVALID_OR_EXPIRED");
    returnTo = state.return_to;   // appRedirect ตรวจ origin กับ allowlist + path ซ้ำอีกรอบ
    // ใช้ state ได้ครั้งเดียวแบบ atomic: ถ้า update ไม่โดนแถว (มีคนใช้ไปพร้อมกัน) ให้หยุด
    const { data: consumed } = await db.from("ad_oauth_states").update({ used_at: new Date().toISOString() })
      .eq("state_hash", state.state_hash).is("used_at", null).select("state_hash").maybeSingle();
    if (!consumed) throw new Error("STATE_INVALID_OR_EXPIRED");
    const providerError = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (providerError) throw new Error(providerError);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("CODE_MISSING");

    const exchange = new URLSearchParams({
      client_id: env("META_APP_ID"), client_secret: env("META_APP_SECRET"),
      redirect_uri: env("META_OAUTH_REDIRECT_URI"), code,
    });
    const shortResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: exchange,
    });
    const shortToken = await shortResponse.json();
    if (!shortResponse.ok || !shortToken.access_token) throw new Error(shortToken?.error?.message || "TOKEN_EXCHANGE_FAILED");

    const longExchange = new URLSearchParams({
      grant_type: "fb_exchange_token", client_id: env("META_APP_ID"), client_secret: env("META_APP_SECRET"),
      fb_exchange_token: shortToken.access_token,
    });
    const longResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: longExchange,
    });
    const longPayload = await longResponse.json();
    const accessToken = longResponse.ok && longPayload.access_token ? longPayload.access_token : shortToken.access_token;
    const expiresIn = Number(longPayload.expires_in ?? shortToken.expires_in) || null;
    const [identity, permissions, accounts, encrypted] = await Promise.all([
      graph("/me", accessToken, { fields: "id,name" }), graph("/me/permissions", accessToken), allAdAccounts(accessToken), encryptToken(accessToken),
    ]);
    const scopes = (permissions.data ?? []).filter((item: Record<string,string>) => item.status === "granted").map((item: Record<string,string>) => item.permission);
    if (!scopes.includes("ads_read")) throw new Error("ADS_READ_NOT_GRANTED");
    const authRecord = {
      provider: "meta", user_id: state.user_id, provider_user_id: String(identity.id), provider_user_name: identity.name ?? "",
      token_ciphertext: encrypted.ciphertext, token_iv: encrypted.iv, scopes,
      expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      status: "connected", last_verified_at: new Date().toISOString(),
    };
    const { data: authorization, error: authError } = await db.from("ad_provider_authorizations").upsert(authRecord, { onConflict: "provider,user_id,provider_user_id" }).select("id").single();
    if (authError) throw authError;
    await db.from("ad_authorized_accounts").delete().eq("authorization_id", authorization.id);
    if (accounts.length) {
      const { error: accountError } = await db.from("ad_authorized_accounts").insert(accounts.map((account) => ({
        authorization_id: authorization.id, external_account_id: String(account.id), account_name: account.name ?? "",
        account_status: account.account_status ?? null, currency: account.currency ?? null,
        timezone: account.timezone_name ?? null, business_id: null,   // field business ต้องใช้สิทธิ์ business_management ซึ่งระบบไม่ขอ (อ่านอย่างเดียว)
      })));
      if (accountError) throw accountError;
    }
    return appRedirect(returnTo, { oauth: "success", accounts: String(accounts.length) });
  } catch (error) {
    // รหัสที่ออกไปถึงเบราว์เซอร์มีแค่ชุดที่กำหนด (ข้อความ Postgres/Meta อยู่ใน log ฝั่ง server เท่านั้น)
    console.error("[ads-oauth-callback]", error instanceof Error ? error.message : error);
    return appRedirect(returnTo, { oauth: "error", reason: publicErrorCode(error, "OAUTH_CALLBACK_FAILED") });
  }
});
