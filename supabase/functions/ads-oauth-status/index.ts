import { corsHeaders, json, requireTeamLead } from "../_shared/adsOAuth.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  try {
    const { db, user } = await requireTeamLead(request);
    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    const provider = body.provider || new URL(request.url).searchParams.get("provider") || "meta";
    const { data: authorizations, error } = await db.from("ad_provider_authorizations")
      .select("id,provider,provider_user_id,provider_user_name,scopes,expires_at,status,last_verified_at,created_at,updated_at")
      .eq("user_id", user.id).eq("provider", provider).order("updated_at", { ascending: false });
    if (error) throw error;
    const ids = (authorizations ?? []).map((item) => item.id);
    const { data: accounts, error: accountError } = ids.length
      ? await db.from("ad_authorized_accounts").select("authorization_id,external_account_id,account_name,account_status,currency,timezone,business_id,discovered_at").in("authorization_id", ids).order("account_name")
      : { data: [], error: null };
    if (accountError) throw accountError;
    const now = Date.now();
    const safeAuthorizations = (authorizations ?? []).map((item) => ({
      ...item,
      status: item.expires_at && new Date(item.expires_at).getTime() <= now ? "expired" : item.status,
    }));
    return json(request, { authorizations: safeAuthorizations, accounts: accounts ?? [] });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OAUTH_STATUS_FAILED";
    return json(request, { error: code }, code === "AUTH_REQUIRED" ? 401 : code === "TEAM_LEAD_REQUIRED" ? 403 : 500);
  }
});
