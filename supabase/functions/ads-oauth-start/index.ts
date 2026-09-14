import { corsHeaders, env, graphVersion, json, publicErrorCode, randomState, requireTeamLead, safeReturnTo, sha256 } from "../_shared/adsOAuth.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { db, user } = await requireTeamLead(request);
    const body = await request.json().catch(() => ({}));
    if (body.provider !== "meta") return json(request, { error: "PROVIDER_NOT_SUPPORTED" }, 400);
    const state = randomState();
    const returnTo = safeReturnTo(body.returnTo);
    const { error } = await db.from("ad_oauth_states").insert({
      state_hash: await sha256(state), provider: "meta", user_id: user.id, return_to: returnTo,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (error) throw error;
    const authorize = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
    authorize.searchParams.set("client_id", env("META_APP_ID"));
    authorize.searchParams.set("redirect_uri", env("META_OAUTH_REDIRECT_URI"));
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", "ads_read");
    authorize.searchParams.set("state", state);
    return json(request, { authorizeUrl: authorize.toString(), expiresIn: 600, scopes: ["ads_read"] });
  } catch (error) {
    console.error("[ads-oauth-start]", error instanceof Error ? error.message : error);
    const code = publicErrorCode(error, "OAUTH_START_FAILED");
    return json(request, { error: code }, code === "AUTH_REQUIRED" ? 401 : code === "TEAM_LEAD_REQUIRED" ? 403 : 500);
  }
});
