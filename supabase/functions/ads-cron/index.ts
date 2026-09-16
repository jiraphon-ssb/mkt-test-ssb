/* ads-cron — pg_cron ยิงเข้ามาทุกชั่วโมง แล้วสั่ง ads-sync เท่าที่ถึงคิวในรอบนั้น
   สิทธิ์: service role เท่านั้น (คนทั่วไปเรียกไม่ได้) · ไม่แตะ token เอง ปล่อยให้ ads-sync ถอดรหัสตามเดิม
   ทำทีละน้อยต่อรอบ (ค่าเริ่ม 4 ก้อน) เพราะ Edge Function มีเพดานเวลา — ที่เหลือรอบหน้าค่อยเติม */
import { adminClient, corsHeaders, env, isServiceRole, json } from "../_shared/adsOAuth.ts";
import { DEFAULT_SYNC_EVERY_HOURS, planCronJobs } from "../_shared/adsCron.js";
import { todayInTimeZone } from "../_shared/metaInsights.js";

const MAX_JOBS = 4;
const JOB_TIMEOUT_MS = 110_000;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isServiceRole(request)) return json(request, { error: "SERVICE_ROLE_REQUIRED" }, 401);

  const db = adminClient();
  const [connectionsResult, runsResult, settingsResult] = await Promise.all([
    db.from("ad_connections").select("id,status,timezone,config,authorization_id,last_success_at").eq("provider", "meta"),
    db.from("ad_sync_runs").select("connection_id,mode,status,range_from,range_to,started_at,finished_at")
      .gte("started_at", new Date(Date.now() - 200 * 86_400_000).toISOString()),
    db.from("mkt_settings").select("ads_control").limit(1).maybeSingle(),
  ]);
  const failure = connectionsResult.error ?? runsResult.error ?? settingsResult.error;
  if (failure) {
    console.error("[ads-cron] load", failure.message);
    return json(request, { error: "CRON_LOAD_FAILED" }, 502);
  }

  const now = new Date().toISOString();
  const meta = (settingsResult.data?.ads_control as { sources?: Record<string, { syncEveryHours?: number }> } | null)?.sources?.meta;
  const syncEveryHours = Number(meta?.syncEveryHours) || DEFAULT_SYNC_EVERY_HOURS;
  const jobs = planCronJobs({
    connections: connectionsResult.data ?? [], runs: runsResult.data ?? [], now, syncEveryHours, maxJobs: MAX_JOBS,
    todayOf: (timezone: string) => todayInTimeZone(new Date(now), timezone),
  });

  const url = `${env("SUPABASE_URL")}/functions/v1/ads-sync`;
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const results: Array<Record<string, unknown>> = [];
  for (const job of jobs) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(job),
        signal: AbortSignal.timeout(JOB_TIMEOUT_MS),
      });
      const payload = await response.json().catch(() => ({}));
      results.push({ ...job, ok: response.ok, code: response.ok ? null : payload?.error ?? response.status, rows: payload?.rowsWritten ?? null, ms: Date.now() - started });
      // ก้อนแรกพังด้วยเหตุที่ไม่ใช่รายก้อน (token หมดอายุ/บัญชีถูกปิด) → หยุดรอบนี้ ไม่ต้องยิงซ้ำให้ Meta rate limit
      if (!response.ok && ["META_TOKEN_INVALID", "AUTHORIZATION_NOT_READY", "CONNECTION_NOT_READY"].includes(String(payload?.error))) break;
    } catch (error) {
      results.push({ ...job, ok: false, code: error instanceof Error ? error.name : "FETCH_FAILED", ms: Date.now() - started });
      break;
    }
  }

  const done = results.filter((row) => row.ok).length;
  console.log(`[ads-cron] planned=${jobs.length} ok=${done} every=${syncEveryHours}h`);
  return json(request, { at: now, syncEveryHours, planned: jobs.length, ok: done, results });
});
