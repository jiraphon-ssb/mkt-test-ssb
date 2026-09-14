import { corsHeaders, decryptToken, graph, json, publicErrorCode, requireTeamLead } from "../_shared/adsOAuth.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { db, user } = await requireTeamLead(request);
    const { authorizationId, revoke = true } = await request.json().catch(() => ({}));
    if (!authorizationId) return json(request, { error: "AUTHORIZATION_ID_REQUIRED" }, 400);
    const { data: authorization } = await db.from("ad_provider_authorizations")
      .select("id,token_ciphertext,token_iv").eq("id", authorizationId).eq("user_id", user.id).maybeSingle();
    if (!authorization) return json(request, { error: "NOT_FOUND" }, 404);
    let revokeWarning = null;
    if (revoke) {
      try { await graph("/me/permissions", await decryptToken(authorization.token_ciphertext, authorization.token_iv), {}, "DELETE"); }
      catch (error) { console.error("[ads-oauth-disconnect] revoke", error instanceof Error ? error.message : error); revokeWarning = "META_REVOKE_FAILED"; }
    }
    const { error } = await db.from("ad_provider_authorizations").delete().eq("id", authorization.id);
    if (error) throw error;
    return json(request, { disconnected: true, revokeWarning });
  } catch (error) {
    console.error("[ads-oauth-disconnect]", error instanceof Error ? error.message : error);
    const code = publicErrorCode(error, "DISCONNECT_FAILED");
    return json(request, { error: code }, code === "AUTH_REQUIRED" ? 401 : code === "TEAM_LEAD_REQUIRED" ? 403 : 500);
  }
});
