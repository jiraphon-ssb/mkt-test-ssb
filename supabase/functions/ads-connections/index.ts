/* ads-connections — team_lead บันทึก mapping แบรนด์ ↔ บัญชี Meta แล้วสร้าง/อัปเดต/ปิด ad_connections
   client เขียน ad_connections ตรงไม่ได้ (migration 0010) · ยอมเฉพาะบัญชีที่ผู้เรียกเชื่อม OAuth ไว้เอง */
import { corsHeaders, json, publicErrorCode, requireTeamLead } from "../_shared/adsOAuth.ts";
import { planConnections } from "../_shared/adsConnections.js";

const CONNECTION_FIELDS = "id,provider,brand_id,external_account_id,account_name,currency,timezone,status,config,last_success_at,last_error_code,last_error_at";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { db, user } = await requireTeamLead(request);
    const body = await request.json().catch(() => ({}));
    const mappings = body?.mappings && typeof body.mappings === "object" && !Array.isArray(body.mappings) ? body.mappings : null;
    if (!mappings || Object.keys(mappings).length > 200) return json(request, { error: "MAPPINGS_INVALID" }, 400);

    const { data: authorizations, error: authError } = await db.from("ad_provider_authorizations")
      .select("id,expires_at").eq("user_id", user.id).eq("provider", "meta").eq("status", "connected");
    if (authError) throw authError;
    const liveIds = (authorizations ?? []).filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > Date.now()).map((a) => a.id);
    const { data: accounts, error: accountError } = liveIds.length
      ? await db.from("ad_authorized_accounts").select("authorization_id,external_account_id,account_name,account_status,currency,timezone").in("authorization_id", liveIds)
      : { data: [], error: null };
    if (accountError) throw accountError;
    const { data: existing, error: existingError } = await db.from("ad_connections").select("id,provider,brand_id,external_account_id,status").eq("provider", "meta");
    if (existingError) throw existingError;

    const plan = planConnections({ mappings, source: body.source ?? {}, authorizedAccounts: accounts ?? [], existing: existing ?? [] });
    if (plan.upserts.length) {
      const { error } = await db.from("ad_connections").upsert(plan.upserts, { onConflict: "provider,external_account_id" });
      if (error) throw error;
    }
    if (plan.disable.length) {
      const { error } = await db.from("ad_connections").update({ status: "disabled" }).in("id", plan.disable);
      if (error) throw error;
    }
    const { data: connections, error: listError } = await db.from("ad_connections").select(CONNECTION_FIELDS).eq("provider", "meta").neq("status", "disabled");
    if (listError) throw listError;
    return json(request, { connections: connections ?? [], errors: plan.errors, disabled: plan.disable });
  } catch (error) {
    console.error("[ads-connections]", error instanceof Error ? error.message : error);
    const code = publicErrorCode(error, "CONNECTIONS_SAVE_FAILED");
    return json(request, { error: code }, code === "AUTH_REQUIRED" ? 401 : code === "TEAM_LEAD_REQUIRED" ? 403 : 500);
  }
});
