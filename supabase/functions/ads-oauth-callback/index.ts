import { adminClient, appRedirect, encryptToken, env, graph, graphVersion, metaTokenExpiry, publicErrorCode, sha256 } from "../_shared/adsOAuth.ts";
import { googleTokenExchange, parseGoogleTokenResponse } from "../_shared/googleOAuth.js";
import { GAQL_CUSTOMER_CLIENTS, collectCustomerClients, listAccessibleCustomersUrl, parseAccessibleCustomers } from "../_shared/googleAdsAccounts.js";
import { fetchSearchStream, searchStreamUrl } from "../_shared/googleAdsReports.js";

/* บัญชีที่ผู้กดเชื่อมเข้าถึงได้ — ถาม Google เอง ไม่ให้คนกรอกรหัสบัญชีเอง (พิมพ์ผิดแล้วหาสาเหตุยาก)
   listAccessibleCustomers คืนบัญชีระดับบน · customer_client ของแต่ละตัวคืนตัวเอง + ลูกทั้งหมด */
async function allGoogleAccounts(accessToken: string) {
  const response = await fetch(listAccessibleCustomersUrl(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "ACCOUNT_DISCOVERY_FAILED");
  const found: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const queriedCustomerId of parseAccessibleCustomers(payload)) {
    const { batches } = await fetchSearchStream({
      url: searchStreamUrl({ customerId: queriedCustomerId }), query: GAQL_CUSTOMER_CLIENTS,
      accessToken, loginCustomerId: queriedCustomerId, fetch, sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
    });
    for (const account of collectCustomerClients(batches, { queriedCustomerId })) {
      if (seen.has(account.external_account_id)) continue;
      seen.add(account.external_account_id);
      found.push(account);
    }
  }
  return found;
}

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

    /* ---- Google Ads ----
       เก็บ refresh token (ไม่ใช่ access token) เพราะของ Google อายุ 1 ชม. ตัวที่อยู่ยาวคือ refresh token
       ไม่ขอ scope โปรไฟล์ → ไม่มีชื่อ/อีเมลผู้ใช้ให้เก็บ ใช้ user id ของทีมเป็นตัวระบุแทน (ขอสิทธิ์เท่าที่จำเป็น) */
    if (state.provider === "google") {
      const exchangeRequest = googleTokenExchange({
        clientId: env("GOOGLE_OAUTH_CLIENT_ID"), clientSecret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
        redirectUri: env("GOOGLE_OAUTH_REDIRECT_URI"), code,
      });
      const tokenResponse = await fetch(exchangeRequest.url, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: exchangeRequest.body,
      });
      const tokens = parseGoogleTokenResponse(await tokenResponse.json());
      // บังคับ prompt=consent ไว้แล้วจึงต้องได้ refresh token ถ้าไม่ได้แปลว่ามีอะไรผิด อย่าเก็บสถานะว่าต่อสำเร็จ
      if (!tokens.refreshToken) throw new Error("GOOGLE_REFRESH_TOKEN_MISSING");
      const googleAccounts = await allGoogleAccounts(tokens.accessToken);
      const encryptedRefresh = await encryptToken(tokens.refreshToken);
      const { data: googleAuth, error: googleAuthError } = await db.from("ad_provider_authorizations").upsert({
        provider: "google", user_id: state.user_id, provider_user_id: state.user_id,
        provider_user_name: `Google Ads · ${googleAccounts.length} บัญชี`,
        token_ciphertext: encryptedRefresh.ciphertext, token_iv: encryptedRefresh.iv,
        scopes: tokens.scopes,
        expires_at: null,   // refresh token ไม่มีวันหมดอายุตามเวลา (หมดเมื่อถูกเพิกถอน)
        status: "connected", last_verified_at: new Date().toISOString(),
      }, { onConflict: "provider,user_id,provider_user_id" }).select("id").single();
      if (googleAuthError) throw googleAuthError;
      await db.from("ad_authorized_accounts").delete().eq("authorization_id", googleAuth.id);
      if (googleAccounts.length) {
        const { error: googleAccountError } = await db.from("ad_authorized_accounts").insert(googleAccounts.map((account) => ({
          authorization_id: googleAuth.id, external_account_id: account.external_account_id,
          account_name: account.account_name, account_status: null,
          currency: account.currency, timezone: account.timezone, business_id: null,
          login_customer_id: account.login_customer_id, is_manager: account.manager,
        })));
        if (googleAccountError) throw googleAccountError;
      }
      return appRedirect(returnTo, { oauth: "success", accounts: String(googleAccounts.filter((a) => !a.manager).length) });
    }

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
    const [identity, permissions, accounts, encrypted, debug] = await Promise.all([
      graph("/me", accessToken, { fields: "id,name" }), graph("/me/permissions", accessToken), allAdAccounts(accessToken), encryptToken(accessToken),
      metaTokenExpiry(accessToken),
    ]);
    // วันหมดอายุ: ถาม Meta ตรงๆ ก่อน (expires_in มักไม่มากับ token อายุยาว) · ถามไม่ได้ค่อยใช้ expires_in
    const expiresAt = debug?.valid ? debug.effectiveExpiresAt : expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const scopes = (permissions.data ?? []).filter((item: Record<string,string>) => item.status === "granted").map((item: Record<string,string>) => item.permission);
    if (!scopes.includes("ads_read")) throw new Error("ADS_READ_NOT_GRANTED");
    const authRecord = {
      provider: "meta", user_id: state.user_id, provider_user_id: String(identity.id), provider_user_name: identity.name ?? "",
      token_ciphertext: encrypted.ciphertext, token_iv: encrypted.iv, scopes,
      expires_at: expiresAt,
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
