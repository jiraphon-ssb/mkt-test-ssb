import { corsHeaders, decryptToken, graph, json, publicErrorCode, requireMember } from "../_shared/adsOAuth.ts";
import { googleRevokeRequest } from "../_shared/googleOAuth.js";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { db, user } = await requireMember(request);
    const { authorizationId, revoke = true } = await request.json().catch(() => ({}));
    if (!authorizationId) return json(request, { error: "AUTHORIZATION_ID_REQUIRED" }, 400);
    const { data: authorization } = await db.from("ad_provider_authorizations")
      .select("id,provider,token_ciphertext,token_iv").eq("id", authorizationId).eq("user_id", user.id).maybeSingle();
    if (!authorization) return json(request, { error: "NOT_FOUND" }, 404);
    let revokeWarning = null;
    if (revoke) {
      const secret = await decryptToken(authorization.token_ciphertext, authorization.token_iv);
      try {
        if (authorization.provider === "google") {
          // ถอนที่ Google จริง — ไม่งั้นลบแถวแล้วสิทธิ์ยังค้างในบัญชี Google ของผู้ใช้
          const request = googleRevokeRequest(secret);
          const response = await fetch(request.url, {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: request.body,
          });
          if (!response.ok) throw new Error(`revoke ${response.status}`);
        } else {
          await graph("/me/permissions", secret, {}, "DELETE");
        }
      }
      catch (error) { console.error("[ads-oauth-disconnect] revoke", error instanceof Error ? error.message : error); revokeWarning = authorization.provider === "google" ? "GOOGLE_REVOKE_FAILED" : "META_REVOKE_FAILED"; }
    }
    const { error } = await db.from("ad_provider_authorizations").delete().eq("id", authorization.id);
    if (error) throw error;
    return json(request, { disconnected: true, revokeWarning });
  } catch (error) {
    console.error("[ads-oauth-disconnect]", error instanceof Error ? error.message : error);
    const code = publicErrorCode(error, "DISCONNECT_FAILED");
    return json(request, { error: code }, code === "AUTH_REQUIRED" ? 401 : code === "TEAM_LEAD_REQUIRED" || code === "MEMBER_REQUIRED" ? 403 : 500);
  }
});
