import { OAUTH_SCOPES } from "../_shared/metaCreative.js";
import { GOOGLE_ADS_SCOPE, googleAuthorizeUrl } from "../_shared/googleOAuth.js";
import { corsHeaders, env, graphVersion, json, oauthReturnTarget, publicErrorCode, randomState, requireMember, sha256 } from "../_shared/adsOAuth.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { db, user } = await requireMember(request);
    const body = await request.json().catch(() => ({}));
    const provider = body.provider;
    if (provider !== "meta" && provider !== "google") return json(request, { error: "PROVIDER_NOT_SUPPORTED" }, 400);
    const state = randomState();
    const returnTo = oauthReturnTarget(request, body.returnTo);
    const { error } = await db.from("ad_oauth_states").insert({
      state_hash: await sha256(state), provider, user_id: user.id, return_to: returnTo,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (error) throw error;

    /* Google: ขอสิทธิ์ adwords อย่างเดียว · ตัว URL บังคับ access_type=offline + prompt=consent ไว้แล้ว
       (ขาดสองตัวนี้จะต่อสำเร็จแต่ไม่ได้ refresh token → พรุ่งนี้ดึงข้อมูลไม่ได้) */
    if (provider === "google") {
      const authorizeUrl = googleAuthorizeUrl({
        clientId: env("GOOGLE_OAUTH_CLIENT_ID"),
        redirectUri: env("GOOGLE_OAUTH_REDIRECT_URI"),
        state,
      });
      return json(request, { authorizeUrl, expiresIn: 600, scopes: [GOOGLE_ADS_SCOPE] });
    }
    const authorize = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
    authorize.searchParams.set("client_id", env("META_APP_ID"));
    authorize.searchParams.set("redirect_uri", env("META_OAUTH_REDIRECT_URI"));
    authorize.searchParams.set("response_type", "code");
    // ads_read = หลัก (callback บังคับ) · pages_show_list + pages_read_engagement = ภาพของโฆษณาที่บูสต์โพสต์เพจ (อ่านอย่างเดียว · ไม่ให้ก็ใช้งานได้)
    authorize.searchParams.set("scope", OAUTH_SCOPES.join(","));
    authorize.searchParams.set("state", state);
    return json(request, { authorizeUrl: authorize.toString(), expiresIn: 600, scopes: OAUTH_SCOPES });
  } catch (error) {
    console.error("[ads-oauth-start]", error instanceof Error ? error.message : error);
    const code = publicErrorCode(error, "OAUTH_START_FAILED");
    return json(request, { error: code }, code === "AUTH_REQUIRED" ? 401 : code === "TEAM_LEAD_REQUIRED" || code === "MEMBER_REQUIRED" ? 403 : 500);
  }
});
