/* ads-reconcile — ตรวจยอด: เทียบค่าแอด 7/30 วัน (จบเมื่อวาน) ระหว่าง ad_daily_facts กับ Meta ระดับบัญชี
   สิทธิ์ team_lead · token ถอดรหัสฝั่ง server · ผลเก็บเป็น ad_sync_runs โหมด reconcile (summary.kind = "reconcile")
   ไม่แตะยอดใน ad_daily_facts — อ่านอย่างเดียวทั้งสองฝั่ง */
import { activeMemberUserIds, adminClient, corsHeaders, decryptToken, graphVersion, isServiceRole, json, requireTeamLead } from "../_shared/adsOAuth.ts";
import { publicSyncCode } from "../_shared/adsSyncJob.js";
import { syncError, todayInTimeZone } from "../_shared/metaInsights.js";
import { buildAccountSpendUrl, buildReconcileSummary, compareSpend, fetchRemoteSpend, reconcileWindows, sumLocalSpend, RECONCILE_WINDOW_KEYS } from "../_shared/adsReconcile.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    // คนกดปุ่ม "ตรวจยอด" = team_lead · ตัวตรวจอัตโนมัติจาก ads-cron = service role (ไม่มี user ผูกกับผลตรวจ)
    const { db, user } = isServiceRole(request) ? { db: adminClient(), user: null } : await requireTeamLead(request);
    const body = await request.json().catch(() => ({}));
    const onlyId = typeof body.connectionId === "string" && UUID.test(body.connectionId) ? body.connectionId : null;

    let listQuery = db.from("ad_connections")
      .select("id,provider,brand_id,external_account_id,timezone,status,config,authorization_id")
      .eq("provider", "meta").neq("status", "disabled");
    if (onlyId) listQuery = listQuery.eq("id", onlyId);
    const { data: connections, error: listError } = await listQuery;
    if (listError) throw listError;
    if (!connections?.length) throw syncError("CONNECTION_NOT_FOUND");

    // tolerance จากกฎในหน้าตั้งค่า (settings.ads_control.rules) — ไม่มีค่า = 1%
    const { data: settings } = await db.from("mkt_settings").select("ads_control").eq("id", 1).maybeSingle();
    const raw = Number(settings?.ads_control?.rules?.reconciliationTolerance);
    const tolerance = Number.isFinite(raw) && raw >= 0 ? raw : 1;   // 0 = ต้องตรงเป๊ะ ก็เป็นค่าที่ตั้งได้
    const activeUsers = await activeMemberUserIds(db);

    const results: Record<string, unknown>[] = [];
    for (const connection of connections) {
      const fail = (code: string) => results.push({ connectionId: connection.id, brandId: connection.brand_id, ok: false, code });
      try {
        if (!connection.authorization_id) { fail("CONNECTION_NOT_READY"); continue; }
        const { data: authorization } = await db.from("ad_provider_authorizations")
          .select("id,user_id,token_ciphertext,token_iv,status,expires_at").eq("id", connection.authorization_id).maybeSingle();
        if (!authorization || authorization.status !== "connected" || !activeUsers.has(authorization.user_id)
          || (authorization.expires_at && new Date(authorization.expires_at).getTime() <= Date.now())) { fail("AUTHORIZATION_NOT_READY"); continue; }
        // กำลัง sync อยู่ = ยอดฝั่งเรากำลังเปลี่ยน เทียบตอนนี้จะเพี้ยน
        const { data: active } = await db.from("ad_sync_runs").select("id").eq("connection_id", connection.id).in("status", ["queued", "running"]).limit(1);
        if (active?.length) { fail("SYNC_ALREADY_RUNNING"); continue; }

        const token = await decryptToken(authorization.token_ciphertext, authorization.token_iv);
        const windows = reconcileWindows(todayInTimeZone(new Date(), connection.timezone));
        const attribution = connection.config?.attribution ?? "platform_default";
        const perWindow: Record<string, ReturnType<typeof compareSpend>> = {};
        for (const key of RECONCILE_WINDOW_KEYS) {
          const { from, to } = windows[key];
          const remote = await fetchRemoteSpend(
            buildAccountSpendUrl({ version: graphVersion(), accountId: connection.external_account_id, from, to, attribution }),
            { fetch, token, sleep },
          );
          const local = await sumLocalSpend(async (offset, limit) => {
            const { data, error } = await db.from("ad_daily_facts").select("spend")
              .eq("connection_id", connection.id).eq("level", "ad").gte("fact_date", from).lte("fact_date", to)
              .range(offset, offset + limit - 1);
            if (error) throw error;
            return data ?? [];
          });
          perWindow[key] = compareSpend(local, remote, tolerance);
        }
        const summary = buildReconcileSummary({ windows, tolerance, results: perWindow });
        const { error: runError } = await db.from("ad_sync_runs").insert({
          connection_id: connection.id, mode: "reconcile", range_from: windows["30d"].from, range_to: windows["30d"].to,
          status: summary.passed ? "success" : "partial", rows_read: RECONCILE_WINDOW_KEYS.length, rows_written: 0,
          triggered_by: user?.id ?? null, summary, finished_at: new Date().toISOString(),
        });
        if (runError) throw runError;
        results.push({ connectionId: connection.id, brandId: connection.brand_id, ok: true, summary });
      } catch (error) {
        console.error("[ads-reconcile]", connection.id, error instanceof Error ? error.message : error, (error as { detail?: string })?.detail ?? "");
        fail(publicSyncCode(error, "RECONCILE_FAILED"));
      }
    }
    return json(request, { tolerance, results });
  } catch (error) {
    const code = publicSyncCode(error, "RECONCILE_FAILED");
    console.error("[ads-reconcile]", code, error instanceof Error ? error.message : error);
    return json(request, { error: code }, code === "AUTH_REQUIRED" ? 401 : code === "TEAM_LEAD_REQUIRED" ? 403 : code === "CONNECTION_NOT_FOUND" ? 404 : 502);
  }
});
