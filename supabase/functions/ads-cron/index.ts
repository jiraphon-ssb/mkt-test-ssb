/* ads-cron — pg_cron ยิงเข้ามาทุกชั่วโมง แล้วสั่งดึง/ตรวจยอดเท่าที่ถึงคิวในรอบนั้น
   สิทธิ์: service role เท่านั้น · ไม่แตะ token เอง ปล่อยให้ ads-sync / ads-reconcile ถอดรหัสตามเดิม
   ทำทีละน้อยต่อรอบ (ดึง ≤4 ก้อน · ตรวจยอด ≤4 บัญชี) เพราะ Edge Function มีเพดานเวลา — ที่เหลือรอบหน้าค่อยทำ
   ทุกรอบบันทึกลง ad_cron_ticks แม้ไม่มีอะไรต้องทำ เพื่อให้ตอบได้ว่าระบบยังวิ่งอยู่จริง */
import { adminClient, corsHeaders, env, isServiceRole, json } from "../_shared/adsOAuth.ts";
import { DEFAULT_SYNC_EVERY_HOURS, planCronJobs, planReconcileTargets, salesDue, summarizeTick } from "../_shared/adsCron.js";
import { hourInTimeZone, todayInTimeZone } from "../_shared/metaInsights.js";

const MAX_SYNC_JOBS = 4;
const MAX_RECONCILE = 4;
const JOB_TIMEOUT_MS = 110_000;
const KEEP_TICK_DAYS = 90;

type JobResult = Record<string, unknown> & { ok: boolean };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isServiceRole(request)) return json(request, { error: "SERVICE_ROLE_REQUIRED" }, 401);

  const db = adminClient();
  const body = await request.json().catch(() => ({}));
  const source = body?.source === "manual" ? "manual" : "pg_cron";
  const now = new Date().toISOString();
  const { data: tick } = await db.from("ad_cron_ticks").insert({ source, started_at: now }).select("id").single();
  const tickId = tick?.id ?? null;

  const finish = async (patch: Record<string, unknown>) => {
    if (tickId) await db.from("ad_cron_ticks").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", tickId);
    // เก็บประวัติ 90 วันพอ — ตารางนี้โตวันละ 24 แถว
    await db.from("ad_cron_ticks").delete().lt("started_at", new Date(Date.now() - KEEP_TICK_DAYS * 86_400_000).toISOString());
  };

  const [connectionsResult, runsResult, settingsResult] = await Promise.all([
    db.from("ad_connections").select("id,status,timezone,config,authorization_id,last_success_at").eq("provider", "meta"),
    db.from("ad_sync_runs").select("connection_id,mode,status,range_from,range_to,started_at,finished_at")
      .gte("started_at", new Date(Date.now() - 200 * 86_400_000).toISOString()),
    db.from("mkt_settings").select("ads_control").limit(1).maybeSingle(),
  ]);
  const loadError = connectionsResult.error ?? runsResult.error ?? settingsResult.error;
  if (loadError) {
    console.error("[ads-cron] load", loadError.message);
    await finish({ status: "failed", error_code: "CRON_LOAD_FAILED" });
    return json(request, { error: "CRON_LOAD_FAILED" }, 502);
  }

  const connections = connectionsResult.data ?? [];
  const runs = runsResult.data ?? [];
  const meta = (settingsResult.data?.ads_control as { sources?: Record<string, { syncEveryHours?: number }> } | null)?.sources?.meta;
  const syncEveryHours = Number(meta?.syncEveryHours) || DEFAULT_SYNC_EVERY_HOURS;
  const todayOf = (timezone: string) => todayInTimeZone(new Date(now), timezone);
  const hourOf = (timezone: string) => hourInTimeZone(new Date(now), timezone);

  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const base = `${env("SUPABASE_URL")}/functions/v1`;
  const call = async (fn: string, payload: unknown): Promise<JobResult> => {
    const started = Date.now();
    try {
      const response = await fetch(`${base}/${fn}`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(JOB_TIMEOUT_MS),
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, code: response.ok ? null : data?.error ?? String(response.status), rows: data?.rowsWritten ?? null, ms: Date.now() - started };
    } catch (error) {
      return { ok: false, code: error instanceof Error ? error.name : "FETCH_FAILED", ms: Date.now() - started };
    }
  };

  const jobs = planCronJobs({ connections, runs, now, syncEveryHours, maxJobs: MAX_SYNC_JOBS, todayOf });
  const sync: JobResult[] = [];
  for (const job of jobs) {
    const result = { ...job, ...(await call("ads-sync", job)) };
    sync.push(result);
    // token หมดอายุ/บัญชีถูกปิด = ปัญหาระดับบัญชี ไม่ใช่ก้อนนี้ก้อนเดียว → หยุดรอบนี้ ไม่ยิงซ้ำให้ Meta rate limit
    if (!result.ok && ["META_TOKEN_INVALID", "AUTHORIZATION_NOT_READY", "CONNECTION_NOT_READY"].includes(String(result.code))) break;
  }

  // ตรวจยอดหลังดึง: ใช้ประวัติ run ที่รวมผลของรอบนี้แล้ว ไม่งั้นบัญชีที่เพิ่งเติมช่องว่างครบจะถูกมองว่ายังขาด
  const { data: freshRuns } = await db.from("ad_sync_runs").select("connection_id,mode,status,range_from,range_to,started_at,finished_at")
    .gte("started_at", new Date(Date.now() - 200 * 86_400_000).toISOString());
  const targets = planReconcileTargets({ connections, runs: freshRuns ?? runs, now, todayOf, hourOf, max: MAX_RECONCILE });
  const reconcile: JobResult[] = [];
  for (const connectionId of targets) reconcile.push({ connectionId, ...(await call("ads-reconcile", { connectionId })) });

  // ยอดขายจริงจากระบบขาย — วันละครั้ง หลัง 9 โมงตามเวลาไทย (ใช้รอบก่อนหน้าจาก ad_cron_ticks เป็นตัวจำ)
  const { data: lastSales } = await db.from("ad_cron_ticks").select("started_at")
    .not("detail->sales", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
  let sales: Record<string, unknown> | null = null;
  if (salesDue({ lastAt: lastSales?.started_at ?? null, now, hour: hourOf("Asia/Bangkok"), today: todayOf("Asia/Bangkok") })) {
    sales = await call("sales-sync", {});
  }

  const summary = summarizeTick({ planned: jobs.length + targets.length, sync, reconcile });
  await finish({
    status: summary.status, planned: summary.planned, synced: summary.synced, reconciled: summary.reconciled,
    failed: summary.failed, rows_written: summary.rowsWritten, sync_every_hours: syncEveryHours,
    detail: { sync, reconcile, ...(sales ? { sales } : {}) },
  });
  console.log(`[ads-cron] planned=${summary.planned} synced=${summary.synced} reconciled=${summary.reconciled} failed=${summary.failed}`);
  return json(request, { at: now, tickId, syncEveryHours, ...summary, sync, reconcile, sales });
});
