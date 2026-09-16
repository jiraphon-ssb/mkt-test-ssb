/* ads-cron — pg_cron ยิงเข้ามาทุกชั่วโมง แล้วสั่งดึง/ตรวจยอดเท่าที่ถึงคิวในรอบนั้น
   สิทธิ์: service role เท่านั้น · ไม่แตะ token เอง ปล่อยให้ ads-sync / ads-reconcile ถอดรหัสตามเดิม
   ทำทีละน้อยต่อรอบ (ดึง ≤4 ก้อน · ตรวจยอด ≤4 บัญชี) เพราะ Edge Function มีเพดานเวลา — ที่เหลือรอบหน้าค่อยทำ
   ทุกรอบบันทึกลง ad_cron_ticks แม้ไม่มีอะไรต้องทำ เพื่อให้ตอบได้ว่าระบบยังวิ่งอยู่จริง */
import { adminClient, corsHeaders, env, isServiceRole, json } from "../_shared/adsOAuth.ts";
import { DEFAULT_SYNC_EVERY_HOURS, planCreativeTargets, planCronJobs, planReconcileTargets, salesDue, summarizeTick, tokenWarning } from "../_shared/adsCron.js";
import { hourInTimeZone, todayInTimeZone } from "../_shared/metaInsights.js";

const MAX_SYNC_JOBS = 4;
const MAX_RECONCILE = 4;
const MAX_CREATIVE = 1;      // ads-creatives ใช้เวลาได้ถึง 90 วิ/บัญชี — เกินหนึ่งต่อรอบเสี่ยงชนเพดานเวลา
const JOB_TIMEOUT_MS = 110_000;
const KEEP_TICK_DAYS = 90;

type JobResult = Record<string, unknown> & { ok: boolean };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isServiceRole(request)) return json(request, { error: "SERVICE_ROLE_REQUIRED" }, 401);

  const db = adminClient();
  const crashed = { tickId: null as string | null };
  return await runTick(request, db, crashed).catch(async (error) => {
    console.error("[ads-cron] crash", error instanceof Error ? error.message : error);
    // ปิดเฉพาะ tick ของรอบนี้ — ห้ามเหมารวม tick อื่นที่อาจกำลังวิ่งอยู่จริง
    if (crashed.tickId) {
      await db.from("ad_cron_ticks")
        .update({ status: "failed", error_code: "CRON_CRASHED", finished_at: new Date().toISOString() })
        .eq("id", crashed.tickId);
    }
    return json(request, { error: "CRON_CRASHED" }, 500);
  });
});

/** เนื้องานของหนึ่งรอบ — แยกออกมาเพื่อให้ตัวเรียกดักพังได้ทุกกรณี ไม่ทิ้ง tick ค้างสถานะ running */
async function runTick(request: Request, db: ReturnType<typeof adminClient>, crashed: { tickId: string | null }) {
  const body = await request.json().catch(() => ({}));
  const source = body?.source === "manual" ? "manual" : "pg_cron";
  const now = new Date().toISOString();
  const { data: tick } = await db.from("ad_cron_ticks").insert({ source, started_at: now }).select("id").single();
  const tickId = tick?.id ?? null;
  crashed.tickId = tickId;

  const finish = async (patch: Record<string, unknown>) => {
    if (tickId) await db.from("ad_cron_ticks").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", tickId);
    // เก็บประวัติ 90 วันพอ — ตารางนี้โตวันละ 24 แถว
    await db.from("ad_cron_ticks").delete().lt("started_at", new Date(Date.now() - KEEP_TICK_DAYS * 86_400_000).toISOString());
  };

  /** ประวัติ run — PostgREST คืนทีละ ≤1000 แถว ต้องไล่หน้าเอง ไม่งั้นความครอบคลุมจะคำนวณผิดเมื่อประวัติโต
      (ตารางนี้โตได้ถึง ~96 แถว/วันจาก cron) */
  const loadRuns = async () => {
    const rows: Record<string, unknown>[] = [];
    const since = new Date(Date.now() - 200 * 86_400_000).toISOString();
    for (let page = 0; page < 20; page += 1) {
      const { data, error } = await db.from("ad_sync_runs")
        .select("connection_id,mode,status,range_from,range_to,started_at,finished_at")
        .gte("started_at", since).order("started_at", { ascending: false })
        .range(page * 1000, page * 1000 + 999);
      if (error) return { data: null, error };
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return { data: rows, error: null };
  };

  const [connectionsResult, runsResult, settingsResult] = await Promise.all([
    db.from("ad_connections").select("id,status,timezone,config,authorization_id,last_success_at").eq("provider", "meta"),
    loadRuns(),
    db.from("mkt_settings").select("ads_control").eq("id", 1).maybeSingle(),
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
      // note = ปัญหาที่ไม่ถึงขั้นล้มงาน (เช่น ขอภาพจาก hash ไม่ได้ / ดึงภาพจากโพสต์ไม่ทัน) — ต้องเห็นในประวัติ ไม่งั้นเงียบหาย
      const note = data?.hashImages?.reason ?? data?.postMedia?.reason ?? data?.goals?.error ?? null;
      return { ok: response.ok, code: response.ok ? null : data?.error ?? String(response.status), rows: data?.rowsWritten ?? data?.saved ?? data?.written ?? null, ms: Date.now() - started, ...(note ? { note } : {}) };
    } catch (error) {
      return { ok: false, code: error instanceof Error ? error.name : "FETCH_FAILED", ms: Date.now() - started };
    }
  };

  /* เตือนเรื่อง token ก่อนที่มันจะพัง — เขียน code ลง ad_connections ให้หน้าสถานะ Sync ขึ้นสีทันที
     (ไม่มีเส้นทางต่ออายุอัตโนมัติ ผู้ใช้ต้องกดเชื่อมใหม่เอง จึงต้องรู้ล่วงหน้าอย่างน้อย 7 วัน) */
  const { data: auths } = await db.from("ad_provider_authorizations").select("id,expires_at,status");
  const warnByAuth = new Map((auths ?? []).map((a) => [a.id, tokenWarning(a.expires_at, Date.parse(now))]));
  const tokenWarnings: Record<string, string> = {};
  for (const connection of connections) {
    const warn = warnByAuth.get(connection.authorization_id);
    if (!warn) continue;
    tokenWarnings[connection.id] = warn.code;
    await db.from("ad_connections")
      .update({ last_error_code: warn.code, last_error_at: new Date().toISOString(), ...(warn.daysLeft === 0 ? { status: "expired" } : {}) })
      .eq("id", connection.id);
  }

  const jobs = planCronJobs({ connections, runs, now, syncEveryHours, maxJobs: MAX_SYNC_JOBS, todayOf });
  const sync: JobResult[] = [];
  const stopped = new Set<string>();
  for (const job of jobs) {
    // ปัญหาระดับบัญชี (token หมดอายุ/บัญชีถูกปิด) → ข้ามเฉพาะบัญชีนั้นในรอบนี้
    // ห้าม break ทั้งรอบ ไม่งั้นบัญชีเดียวที่พังจะลากบัญชีที่ดีหยุดตามไปด้วยทุกชั่วโมง
    if (stopped.has(job.connectionId)) continue;
    const result = { ...job, ...(await call("ads-sync", job)) };
    sync.push(result);
    if (!result.ok && ["META_TOKEN_INVALID", "AUTHORIZATION_NOT_READY", "CONNECTION_NOT_READY", "META_RATE_LIMIT"].includes(String(result.code))) {
      stopped.add(job.connectionId);
    }
  }

  // ตรวจยอดหลังดึง: ใช้ประวัติ run ที่รวมผลของรอบนี้แล้ว ไม่งั้นบัญชีที่เพิ่งเติมช่องว่างครบจะถูกมองว่ายังขาด
  const { data: freshRuns } = await loadRuns();
  const targets = planReconcileTargets({ connections, runs: freshRuns ?? runs, now, todayOf, hourOf, max: MAX_RECONCILE });
  const reconcile: JobResult[] = [];
  for (const connectionId of targets) reconcile.push({ connectionId, ...(await call("ads-reconcile", { connectionId })) });

  /* ยอดขายจริงจากระบบขาย — วันละครั้ง หลัง 9 โมงตามเวลาไทย (ใช้รอบก่อนหน้าจาก ad_cron_ticks เป็นตัวจำ)
     นับเฉพาะรอบที่ "สำเร็จ" ว่าทำแล้ว — ไม่งั้นวันที่ระบบขายล่ม ยอดของวันนั้นจะไม่มีใครดึงอีกเลย
     จำนวนครั้งที่ลองวันนี้ใช้จำกัดการยิงซ้ำ ไม่ให้ระบบขายที่ล่มยาวโดนยิงทุกชั่วโมง
     อ่านประวัติ 3 วันแล้วคัดในโค้ด ไม่พึ่ง json filter ของ PostgREST — ถ้า syntax เพี้ยนมันจะคืนว่างเงียบๆ
     แล้วกลายเป็นยิงทุกชั่วโมงโดยไม่มีใครรู้ */
  const { data: salesTicks } = await db.from("ad_cron_ticks")
    .select("started_at,detail").order("started_at", { ascending: false }).limit(72);
  const salesOf = (row: { detail?: unknown }) => (row?.detail as { sales?: { ok?: boolean } } | null)?.sales ?? null;
  const salesToday = todayOf("Asia/Bangkok");
  const lastSalesOk = (salesTicks ?? []).find((row) => salesOf(row)?.ok === true)?.started_at ?? null;
  // นับเป็นวันตามเวลาไทยให้ตรงกับตัวตัดสิน — ถ้านับเป็นวัน UTC โควตาจะรีเซ็ตเหลื่อมไป 7 ชั่วโมง
  const salesTries = (salesTicks ?? [])
    .filter((row) => salesOf(row) && todayInTimeZone(new Date(String(row.started_at)), "Asia/Bangkok") === salesToday).length;
  let sales: Record<string, unknown> | null = null;
  if (salesDue({ lastAt: lastSalesOk, now, hour: hourOf("Asia/Bangkok"), today: salesToday, tries: salesTries })) {
    sales = await call("sales-sync", {});
  }

  /* รูป/ข้อความโฆษณา — Meta เปลี่ยนได้ตลอดและ URL สื่อหมดอายุ ถ้าไม่รีเฟรชเองหน้า Creative จะค้างที่ครั้งที่กดมือล่าสุด
     media_refreshed_at ล่าสุดของแต่ละบัญชี = เวลาที่รีเฟรชครั้งก่อน (บัญชีน้อย จึงถามทีละบัญชี แถวเดียว)
     ขอบเขต: ยิงครั้งเดียวต่อรอบ ไม่ไล่ nextCursor ต่อ — ads-creatives เรียงตามค่าแอดอยู่แล้ว ครั้งเดียวจึงได้ตัวที่คนดูจริง
     บัญชีใหญ่ที่ไม่จบใน 90 วิ ส่วนที่เหลือยังต้องกดปุ่มรีเฟรชในหน้า Creative เอง */
  const refreshedAt: Record<string, string | null> = {};
  for (const connection of connections) {
    const { data } = await db.from("ad_creatives").select("media_refreshed_at")
      .eq("connection_id", connection.id).not("media_refreshed_at", "is", null)
      .order("media_refreshed_at", { ascending: false }).limit(1).maybeSingle();
    refreshedAt[connection.id] = data?.media_refreshed_at ?? null;
  }
  const creativeTargets = planCreativeTargets({ connections, refreshedAt, now, max: MAX_CREATIVE })
    .filter((connectionId) => !stopped.has(connectionId));
  const creatives: JobResult[] = [];
  for (const connectionId of creativeTargets) creatives.push({ connectionId, ...(await call("ads-creatives", { connectionId })) });

  const summary = summarizeTick({
    planned: jobs.length + targets.length + creativeTargets.length, sync, reconcile,
    extra: [...(sales ? [sales as JobResult] : []), ...creatives],
  });
  await finish({
    status: summary.status, planned: summary.planned, synced: summary.synced, reconciled: summary.reconciled,
    failed: summary.failed, rows_written: summary.rowsWritten, sync_every_hours: syncEveryHours,
    detail: {
      sync, reconcile, ...(sales ? { sales } : {}), ...(creatives.length ? { creatives } : {}),
      ...(Object.keys(tokenWarnings).length ? { tokenWarnings } : {}),
    },
  });
  console.log(`[ads-cron] planned=${summary.planned} synced=${summary.synced} reconciled=${summary.reconciled} failed=${summary.failed}`);
  return json(request, { at: now, tickId, syncEveryHours, ...summary, sync, reconcile, sales, creatives });
}
