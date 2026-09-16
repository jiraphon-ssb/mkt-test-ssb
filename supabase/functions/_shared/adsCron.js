/* รอบดึงอัตโนมัติ (pure · Deno + vitest ใช้ไฟล์เดียวกัน · เทสใน tests/adsCron.test.js)
   pg_cron ยิง ads-cron ทุกชั่วโมง → ไฟล์นี้ตัดสินว่ารอบนี้บัญชีไหนถึงคิว และดึงช่วงไหน
   กติกา: บัญชีที่ค้างนานสุดได้ก่อน · ทำทีละน้อยต่อรอบ (Edge Function มีเพดานเวลา) · ไม่ยิงซ้อน run ที่กำลังวิ่ง */
import { missingDaysOf, planSyncJobs } from "./adsBackfill.js";

export const DEFAULT_SYNC_EVERY_HOURS = 6;
export const STALE_RUN_MINUTES = 8;      // ตรงกับ ads-sync — run ที่เกินนี้ถือว่าตายแล้ว
const HOUR = 3_600_000;

const time = (value) => {
  const t = Date.parse(String(value ?? ""));
  return Number.isFinite(t) ? t : NaN;
};

/** ถึงรอบดึงหรือยัง — ไม่เคยสำเร็จ/เวลาเสีย = ถึงรอบ (ปล่อยค้างไว้แย่กว่าดึงเกิน) */
export function cronDue(lastSuccessAt, now, everyHours = DEFAULT_SYNC_EVERY_HOURS) {
  const current = time(now);
  const last = time(lastSuccessAt);
  if (!Number.isFinite(current)) return false;
  if (!Number.isFinite(last)) return true;
  const hours = Number(everyHours);
  const gap = Number.isFinite(hours) && hours > 0 ? Math.min(24, hours) : DEFAULT_SYNC_EVERY_HOURS;
  return current - last >= gap * HOUR;
}

const entryRuns = (runs) => runs.map((r) => ({ ...r, connection_id: r.connection_id ?? r.connectionId }));

export function planCronJobs({
  connections = [], runs = [], now, todayOf, syncEveryHours = DEFAULT_SYNC_EVERY_HOURS,
  maxPerConnection = 1, maxJobs = 4, staleMinutes = STALE_RUN_MINUTES,
} = {}) {
  const current = time(now);
  if (!Number.isFinite(current)) return [];
  const staleBefore = current - staleMinutes * 60_000;

  const ready = [];
  for (const connection of connections) {
    if (!connection?.id || connection.status === "disabled" || !connection.authorization_id) continue;
    const own = runs.filter((r) => (r.connection_id ?? r.connectionId) === connection.id);
    // run ที่ยังวิ่งอยู่จริง (ยังไม่ค้างเกินเพดาน) → รอบนี้ข้ามไปก่อน ไม่งั้นชน unique index
    if (own.some((r) => ["queued", "running"].includes(r.status) && time(r.started_at) >= staleBefore)) continue;
    const lastSuccess = own.filter((r) => r.status === "success")
      .reduce((latest, r) => Math.max(latest, time(r.finished_at) || 0), 0) || null;
    // ยังไม่ครบรอบก็ยอมทำ ถ้าบัญชีนั้นมีวันที่ขาดอยู่ — ช่องว่างค้างไว้เสียหายกว่าดึงถี่ไปหน่อย
    const today = todayOf(connection.timezone);
    const missing = missingDaysOf(entryRuns(own), today, connection.config?.backfillDays);
    if (!missing && !cronDue(lastSuccess ? new Date(lastSuccess).toISOString() : null, now, syncEveryHours)) continue;
    ready.push({ connection, lastSuccess: lastSuccess ?? 0, own });
  }

  const jobs = [];
  for (const entry of ready.sort((a, b) => a.lastSuccess - b.lastSuccess)) {   // ค้างนานสุดก่อน
    const planned = planSyncJobs({ connections: [entry.connection], runs: entry.own, todayOf });
    for (const job of planned.slice(0, Math.max(1, maxPerConnection))) {
      if (jobs.length >= maxJobs) return jobs;
      jobs.push({ connectionId: job.connectionId, mode: job.mode, from: job.from, to: job.to });
    }
  }
  return jobs;
}
