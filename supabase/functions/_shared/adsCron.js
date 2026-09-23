/* รอบดึงอัตโนมัติ (pure · Deno + vitest ใช้ไฟล์เดียวกัน · เทสใน tests/adsCron.test.js)
   pg_cron ยิง ads-cron ช่วงเช้า 05:00–05:50 ไทย (ดู dailySchedule.js) → ไฟล์นี้ตัดสินว่ารอบนี้บัญชีไหนถึงคิว และดึงช่วงไหน
   กติกา: แต่ละแหล่งวันละครั้งตามวันที่ไทย · บัญชีที่ค้างนานสุดได้ก่อน · ทำทีละน้อยต่อรอบ (Edge Function มีเพดานเวลา)
   รอบเก็บตกหยิบงานที่เหลือ · ไม่ยิงซ้อน run ที่กำลังวิ่ง */
import { missingDaysOf, planSyncJobs } from "./adsBackfill.js";
import { DAILY_RUN_HOUR, DAILY_TZ, dayIn, doneToday } from "./dailySchedule.js";

export const STALE_RUN_MINUTES = 8;      // ตรงกับ ads-sync — run ที่เกินนี้ถือว่าตายแล้ว
const HOUR = 3_600_000;

const time = (value) => {
  const t = Date.parse(String(value ?? ""));
  return Number.isFinite(t) ? t : NaN;
};

const entryRuns = (runs) => runs.map((r) => ({ ...r, connection_id: r.connection_id ?? r.connectionId }));

/** @param {{connections?:any[], runs?:any[], now?:any, todayOf?:Function, maxPerConnection?:number, maxJobs?:number, staleMinutes?:number}} [opts] */
export function planCronJobs({
  connections = [], runs = [], now, todayOf, maxPerConnection = 1, maxJobs = 4, staleMinutes = STALE_RUN_MINUTES,
} = {}) {
  const current = time(now);
  if (!Number.isFinite(current)) return [];
  const staleBefore = current - staleMinutes * 60_000;

  const ready = [];
  for (const connection of connections) {
    // expired = token หมดอายุ/ถูกถอน — วางแผนต่อไปก็ล้มทุกครั้ง และเพราะเรียงจาก "ค้างนานสุดก่อน"
    // มันจะอยู่หัวคิวถาวรจนบัญชีอื่นไม่ได้คิว (ต้องแก้ที่ต้นทางในหน้าตั้งค่า)
    if (!connection?.id || ["disabled", "expired"].includes(connection.status) || !connection.authorization_id) continue;
    const own = runs.filter((r) => (r.connection_id ?? r.connectionId) === connection.id);
    // run ที่ยังวิ่งอยู่จริง (ยังไม่ค้างเกินเพดาน) → รอบนี้ข้ามไปก่อน ไม่งั้นชน unique index
    if (own.some((r) => ["queued", "running"].includes(r.status) && time(r.started_at) >= staleBefore)) continue;
    // นับเฉพาะรอบที่ดึงข้อมูลจริง — รอบตรวจยอด (reconcile) ไม่เขียนยอด ถ้านับด้วย ตรวจยอดตอนเช้าแล้ววันนั้นจะไม่ได้ดึง
    const lastSuccess = own.filter((r) => r.status === "success" && (r.mode === "incremental" || r.mode === "backfill"))
      .reduce((latest, r) => Math.max(latest, time(r.finished_at) || 0), 0) || null;
    // ดึงไปแล้ววันนี้ก็ยอมทำต่อ ถ้าบัญชีนั้นมีวันที่ขาดอยู่ — ช่องว่างค้างไว้เสียหายกว่า (รอบเก็บตกเติมให้)
    const today = todayOf(connection.timezone);
    const missing = missingDaysOf(entryRuns(own), today, connection.config?.backfillDays);
    const due = !doneToday(lastSuccess ? new Date(lastSuccess).toISOString() : null, today, connection.timezone);
    if (!missing && !due) continue;
    ready.push({ connection, lastSuccess: lastSuccess ?? 0, own, due });
  }

  const jobs = [];
  for (const entry of ready.sort((a, b) => a.lastSuccess - b.lastSuccess)) {   // ค้างนานสุดก่อน
    const planned = planSyncJobs({ connections: [entry.connection], runs: entry.own, todayOf })
      // ดึงไปแล้ววันนี้ (มาเพราะช่องว่าง) → ข้ามก้อน 3 วันล่าสุด ไม่งั้นทุก tick จะดึงซ้ำจนช่องว่างไม่ถูกเติมสักที
      .filter((job) => entry.due || job.mode === "backfill");
    for (const job of planned.slice(0, Math.max(1, maxPerConnection))) {
      if (jobs.length >= maxJobs) return jobs;
      jobs.push({ connectionId: job.connectionId, mode: job.mode, from: job.from, to: job.to });
    }
  }
  return jobs;
}

export const RECONCILE_AFTER_HOUR = DAILY_RUN_HOUR;   // ตรวจในรอบเช้าตี 5 หลังดึงเสร็จ — ก่อนหน้านี้ไม่มีรอบให้ตรวจแล้ว
export const RECONCILE_RETRY_HOURS = 4;  // ตรวจแล้วไม่ผ่าน → ไม่ตรวจซ้ำในรอบเก็บตกเช้านั้น (ยอดไม่ตรงไม่หายใน 10 นาที) · พรุ่งนี้ตรวจใหม่
export const RECONCILE_MAX_TRIES = 3;    // ต่อบัญชีต่อวัน — ไม่ให้บัญชีที่ยอดไม่ตรงเรื้อรังกิน quota Meta ทั้งวัน

/** บัญชีที่ควรตรวจยอดในรอบนี้: ข้อมูลครบ · สายพอตามเวลาบัญชี · วันนี้ยังไม่ผ่าน และยังอยู่ในโควตา/พ้นช่วงพักแล้ว
    ผลตรวจที่ไม่ผ่านถูกบันทึกเป็น status partial — ถ้านับแค่ success ว่า "ตรวจแล้ว" บัญชีที่ยอดไม่ตรงจะถูกตรวจซ้ำทุกชั่วโมง */
/** @param {{connections?:any[], runs?:any[], now?:any, todayOf?:Function, hourOf?:Function, afterHour?:number, max?:number, retryHours?:number, maxTries?:number}} [opts] */
export function planReconcileTargets({
  connections = [], runs = [], now, todayOf, hourOf, afterHour = RECONCILE_AFTER_HOUR, max = 4,
  retryHours = RECONCILE_RETRY_HOURS, maxTries = RECONCILE_MAX_TRIES,
} = {}) {
  const current = time(now);
  if (!Number.isFinite(current)) return [];
  const targets = [];
  for (const connection of connections) {
    if (!connection?.id || ["disabled", "expired"].includes(connection.status) || !connection.authorization_id) continue;
    const own = entryRuns(runs.filter((r) => (r.connection_id ?? r.connectionId) === connection.id));
    const today = todayOf(connection.timezone);
    if (hourOf(connection.timezone) < afterHour) continue;
    if (missingDaysOf(own, today, connection.config?.backfillDays)) continue;
    const triesToday = own.filter((r) => r.mode === "reconcile" && String(r.started_at ?? "").slice(0, 10) === today);
    if (triesToday.some((r) => r.status === "success")) continue;          // ผ่านแล้ววันนี้ จบ
    if (triesToday.length >= maxTries) continue;                          // ลองครบโควตาของวันแล้ว
    const lastTry = triesToday.reduce((latest, r) => Math.max(latest, time(r.started_at) || 0), 0);
    if (lastTry && current - lastTry < retryHours * HOUR) continue;       // ยังอยู่ในช่วงพัก
    targets.push(connection.id);
    if (targets.length >= max) break;
  }
  return targets;
}

/** บัญชีที่ควรรีเฟรช creative ในรอบนี้ — วันละครั้งตามวันที่ไทย (รูป/ข้อความเปลี่ยนไม่บ่อย และ URL สื่อจาก Meta หมดอายุได้)
    refreshedAt = เวลาที่รีเฟรชล่าสุดของแต่ละบัญชี (media_refreshed_at ล่าสุด)
    ค้างนานสุดได้ก่อน · ทำทีละบัญชีต่อรอบ เพราะ ads-creatives ใช้เวลาได้ถึง 90 วินาที (รอบเก็บตกช่วงเช้าทำบัญชีถัดไป) */
/** @param {{connections?:any[], refreshedAt?:Record<string,any>, now?:any, max?:number}} [opts] */
export function planCreativeTargets({ connections = [], refreshedAt = {}, now, max = 1 } = {}) {
  if (!Number.isFinite(time(now))) return [];
  const today = dayIn(now, DAILY_TZ);
  const due = [];
  for (const connection of connections) {
    if (!connection?.id || ["disabled", "expired"].includes(connection.status) || !connection.authorization_id) continue;
    const last = time(refreshedAt?.[connection.id]);
    if (doneToday(Number.isFinite(last) ? new Date(last).toISOString() : null, today, DAILY_TZ)) continue;
    due.push({ id: connection.id, last: Number.isFinite(last) ? last : 0 });
  }
  return due.sort((a, b) => a.last - b.last).slice(0, Math.max(1, max)).map((entry) => entry.id);
}

/** สรุปผลรอบหนึ่งลงตาราง ad_cron_ticks — ไม่มีงานให้ทำ ไม่ใช่ความผิดพลาด */
export function summarizeTick({ planned = 0, sync = [], reconcile = [], extra = [] } = {}) {
  const ok = sync.filter((r) => r?.ok);
  // extra = งานอื่นของรอบนั้น (ดึงยอดขาย · รีเฟรช creative) — ไม่ใช่การดึง insight แต่พังแล้วต้องเห็นในสถานะรอบ
  const failed = [...sync, ...reconcile, ...extra].filter((r) => r && !r.ok).length;
  const reconciled = reconcile.filter((r) => r?.ok).length;
  const rowsWritten = ok.reduce((sum, r) => sum + (Number(r.rows) || 0), 0);
  const done = ok.length + reconciled + extra.filter((r) => r?.ok).length;
  return {
    planned, synced: ok.length, failed, rowsWritten, reconciled,
    status: !failed ? "success" : done ? "partial" : "failed",
  };
}

export const SALES_MAX_TRIES = 2;   // ระบบขายล่ม = ลองซ้ำได้อีกครั้งเดียวในรอบเก็บตก · ไม่หนักเครื่องฝั่งระบบขาย (SSB/TMK)

/** ถึงเวลาดึงยอดขายจริงหรือยัง — วันละครั้ง ตี 5 (ยอดของเมื่อวานปิดแล้ว · ยอดแก้ย้อนหลังถูกเก็บในรอบถัดไปเพราะดึงย้อนทั้งเดือน)
    lastAt = เวลาที่ดึง "สำเร็จ" ครั้งล่าสุด (เก็บใน ad_cron_ticks.detail) · tries = จำนวนครั้งที่ลองไปแล้ววันนี้
    ที่ต้องแยกสำเร็จ/ล้มเหลว: ถ้านับการลองที่ล้มเหลวว่าทำแล้ว วันที่ระบบขายล่มจะไม่มีใครดึงยอดวันนั้นอีกเลย */
/** @param {{lastAt?:any, now?:any, hour?:number, today?:string, afterHour?:number, tries?:number, maxTries?:number}} [opts] */
export function salesDue({ lastAt = null, now, hour = 0, today, afterHour = RECONCILE_AFTER_HOUR, tries = 0, maxTries = SALES_MAX_TRIES } = {}) {
  if (!Number.isFinite(time(now)) || hour < afterHour) return false;
  if (Number(tries) >= maxTries) return false;
  if (!lastAt) return true;
  const last = time(lastAt);
  if (!Number.isFinite(last)) return true;
  return new Date(last).toISOString().slice(0, 10) < String(today ?? "");
}

export const TOKEN_WARN_DAYS = 7;

/** token ใกล้หมดอายุหรือหมดแล้ว — คืน code ที่เอาไปเขียนลง ad_connections.last_error_code ให้หน้าจอเห็นก่อนพัง
    ไม่มีวันหมดอายุหรือค่าเสีย = ไม่เตือน (เดาไม่ได้ว่าจะพังเมื่อไร) */
export function tokenWarning(expiresAt, now = Date.now()) {
  const exp = time(expiresAt);
  if (!Number.isFinite(exp)) return null;
  const msLeft = exp - now;
  if (msLeft <= 0) return { code: "META_TOKEN_INVALID", daysLeft: 0 };
  const daysLeft = Math.floor(msLeft / 86_400_000);
  return daysLeft <= TOKEN_WARN_DAYS ? { code: "META_TOKEN_EXPIRING", daysLeft } : null;
}
