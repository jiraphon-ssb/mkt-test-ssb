/* ads-oauth-status — สมาชิกเห็นการเชื่อม Meta ของตัวเอง · team_lead เห็นเพิ่ม "บัญชีของทีม" ไว้ผูกกับแบรนด์
   ไม่มี token ในผลลัพธ์ · ชื่อผู้เชื่อมมาจาก mkt_profile.display_name */
import { activeMemberUserIds, corsHeaders, json, publicErrorCode, requireMember } from "../_shared/adsOAuth.ts";
import { liveTeamAccounts } from "../_shared/adsConnections.js";

const ACCOUNT_FIELDS = "authorization_id,external_account_id,account_name,account_status,currency,timezone,business_id,discovered_at";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  try {
    const { db, user, isLead } = await requireMember(request);
    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    const provider = body.provider || new URL(request.url).searchParams.get("provider") || "meta";
    const { data: authorizations, error } = await db.from("ad_provider_authorizations")
      .select("id,user_id,provider,provider_user_id,provider_user_name,scopes,expires_at,status,last_verified_at,created_at,updated_at")
      .eq("provider", provider).order("updated_at", { ascending: false });
    if (error) throw error;
    const now = Date.now();
    const withStatus = (authorizations ?? []).map((item) => ({
      ...item, status: item.expires_at && new Date(item.expires_at).getTime() <= now ? "expired" : item.status,
    }));
    const mine = withStatus.filter((item) => item.user_id === user.id);
    const visible = isLead ? withStatus : mine;
    const ids = visible.map((item) => item.id);
    const { data: accounts, error: accountError } = ids.length
      ? await db.from("ad_authorized_accounts").select(ACCOUNT_FIELDS).in("authorization_id", ids).order("account_name")
      : { data: [], error: null };
    if (accountError) throw accountError;
    const mineIds = new Set(mine.map((item) => item.id));
    const strip = ({ user_id: _u, ...rest }: Record<string, unknown>) => rest;

    let teamAccounts: unknown[] = [];
    if (isLead) {
      const userIds = [...new Set(withStatus.map((item) => item.user_id))];
      const { data: profiles } = userIds.length
        ? await db.from("mkt_profile").select("auth_user_id,display_name").in("auth_user_id", userIds)
        : { data: [] };
      const nameByUser = new Map((profiles ?? []).map((p) => [p.auth_user_id, p.display_name]));
      const authById = new Map(withStatus.map((item) => [item.id, item]));
      teamAccounts = liveTeamAccounts(accounts ?? [], authorizations ?? [], { callerUserId: user.id, now, activeUserIds: await activeMemberUserIds(db) }).map((account) => {
        const auth = authById.get(account.authorization_id);
        return { ...account, connected_by: nameByUser.get(auth?.user_id) ?? auth?.provider_user_name ?? "" };
      });
    }
    return json(request, {
      authorizations: mine.map(strip),
      accounts: (accounts ?? []).filter((account) => mineIds.has(account.authorization_id)),
      teamAccounts,
      isLead,
    });
  } catch (error) {
    console.error("[ads-oauth-status]", error instanceof Error ? error.message : error);
    const code = publicErrorCode(error, "OAUTH_STATUS_FAILED");
    return json(request, { error: code }, code === "AUTH_REQUIRED" ? 401 : code === "TEAM_LEAD_REQUIRED" || code === "MEMBER_REQUIRED" ? 403 : 500);
  }
});
