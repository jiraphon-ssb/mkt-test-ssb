/* ads-sync — ดึง Meta Insights รายวันของ connection เดียว แล้วแทนที่ยอดช่วงนั้นใน ad_daily_facts
   สิทธิ์: team_lead (verify_jwt) · token ถอดรหัสฝั่ง server เท่านั้น · ข้อมูลไม่ครบ = run failed และไม่เขียนยอด */
import { activeMemberUserIds, corsHeaders, decryptToken, graphVersion, json, requireTeamLead } from "../_shared/adsOAuth.ts";
import { collectMetaFacts, pickSyncMode, publicSyncCode, syncFailureStatus } from "../_shared/adsSyncJob.js";
import { syncError, syncRange, todayInTimeZone } from "../_shared/metaInsights.js";
import { validateExplicitRange } from "../_shared/adsBackfill.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE_RUN_MINUTES = 8;   // Edge Function ถูกตัดที่ ~150–400 วินาที · run ที่เกิน 8 นาทีตายแน่แล้ว
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const statusFor = (code: string) => ({
  AUTH_REQUIRED: 401, TEAM_LEAD_REQUIRED: 403, METHOD_NOT_ALLOWED: 405, CONNECTION_NOT_FOUND: 404,
  CONNECTION_ID_REQUIRED: 400, SYNC_MODE_INVALID: 400, CONNECTION_NOT_READY: 409, AUTHORIZATION_NOT_READY: 409,
  PROVIDER_NOT_SUPPORTED: 409, SYNC_ALREADY_RUNNING: 409,
} as Record<string, number>)[code] ?? 502;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  let db: Awaited<ReturnType<typeof requireTeamLead>>["db"] | null = null;
  let runId: string | null = null;
  let connectionId: string | null = null;
  try {
    const auth = await requireTeamLead(request);
    db = auth.db;
    const body = await request.json().catch(() => ({}));
    connectionId = typeof body.connectionId === "string" && UUID.test(body.connectionId) ? body.connectionId : null;
    if (!connectionId) throw syncError("CONNECTION_ID_REQUIRED");

    const { data: connection, error: connectionError } = await db.from("ad_connections")
      .select("id,provider,external_account_id,timezone,status,config,authorization_id,last_success_at")
      .eq("id", connectionId).maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) throw syncError("CONNECTION_NOT_FOUND");
    if (connection.provider !== "meta") throw syncError("PROVIDER_NOT_SUPPORTED");
    if (connection.status === "disabled" || !connection.authorization_id) throw syncError("CONNECTION_NOT_READY");

    const { data: authorization } = await db.from("ad_provider_authorizations")
      .select("id,user_id,token_ciphertext,token_iv,status,expires_at").eq("id", connection.authorization_id).maybeSingle();
    if (!authorization || authorization.status !== "connected") throw syncError("AUTHORIZATION_NOT_READY");
    // เจ้าของ token ต้องยังเป็นสมาชิกที่ active — คนออกจากทีมแล้ว token ไม่ถูกใช้ต่อ
    if (!(await activeMemberUserIds(db)).has(authorization.user_id)) throw syncError("AUTHORIZATION_NOT_READY");
    if (authorization.expires_at && new Date(authorization.expires_at).getTime() <= Date.now()) throw syncError("META_TOKEN_INVALID");

    const mode = pickSyncMode(body.mode, connection);
    const config = connection.config ?? {};
    const today = todayInTimeZone(new Date(), connection.timezone);
    // client สั่งเป็นก้อน ≤14 วัน (planSyncJobs) → ไม่ชนเพดาน 546 · ไม่ส่งช่วงมา = โหมดเดิม
    const range = validateExplicitRange(body, today) ?? syncRange(mode, today, config.backfillDays ?? 30);

    // run ที่ค้าง (function ตายกลางทาง) ปิดเป็น failed ก่อน ไม่งั้น unique index กันรันใหม่ตลอดไป
    await db.from("ad_sync_runs").update({ status: "failed", error_code: "STALE_RUN", finished_at: new Date().toISOString() })
      .eq("connection_id", connection.id).in("status", ["queued", "running"])
      .lt("started_at", new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString());
    const { data: run, error: runError } = await db.from("ad_sync_runs").insert({
      connection_id: connection.id, mode, range_from: range.from, range_to: range.to, status: "running", triggered_by: auth.user.id,
    }).select("id").single();
    if (runError) throw runError.code === "23505" ? syncError("SYNC_ALREADY_RUNNING") : runError;
    runId = run.id;

    const token = await decryptToken(authorization.token_ciphertext, authorization.token_iv);
    const { facts, summary } = await collectMetaFacts({
      accountId: connection.external_account_id, from: range.from, to: range.to, config,
      version: graphVersion(), token, fetch, sleep,
    });
    await db.from("ad_sync_runs").update({ rows_read: summary.rowsRead }).eq("id", runId);
    const { data: written, error: writeError } = await db.rpc("ads_replace_daily_facts", {
      p_run_id: runId, p_connection_id: connection.id, p_level: "ad", p_from: range.from, p_to: range.to, p_rows: facts, p_summary: summary,
    });
    if (writeError) { console.error("[ads-sync] write", writeError.message); throw syncError("SYNC_WRITE_FAILED"); }
    return json(request, { runId, mode, from: range.from, to: range.to, rowsWritten: written, summary });
  } catch (error) {
    const code = publicSyncCode(error);
    console.error("[ads-sync]", code, error instanceof Error ? error.message : error, (error as { detail?: string })?.detail ?? "");
    if (db && runId) {
      await db.from("ad_sync_runs").update({ status: "failed", error_code: code, error_detail: code, finished_at: new Date().toISOString() }).eq("id", runId);
    }
    if (db && connectionId && (runId || code.startsWith("META_"))) {
      await db.from("ad_connections").update({ status: syncFailureStatus(code), last_error_code: code, last_error_at: new Date().toISOString() }).eq("id", connectionId);
    }
    return json(request, { error: code, runId }, statusFor(code));
  }
});
