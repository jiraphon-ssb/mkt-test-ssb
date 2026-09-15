/* backfill แบบแบ่งช่วง + เติมช่องว่างจากประวัติ run (pure · Deno + vitest ใช้ไฟล์เดียวกัน · เทสใน tests/adsBackfill.test.js)
   ปัญหาเดิม: backfill 90 วันใน Edge Function เดียวชนเพดาน (HTTP 546) → ตอนนี้ client สั่งทีละก้อน ≤10 วัน
   ความครอบคลุมดูจาก ad_sync_runs ที่สำเร็จ (range_from/range_to) — ก้อนที่พังเติมเองรอบถัดไป */
import { syncError } from "./metaInsights.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;
const toTime = (iso) => {
  if (typeof iso !== "string" || !ISO.test(iso)) return NaN;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso ? t : NaN;
};
const fromTime = (t) => new Date(t).toISOString().slice(0, 10);

export const MAX_HISTORY_DAYS = 180;
export const RECONCILE_MIN_DAYS = 31;      // ตรวจยอด 30 วันจบเมื่อวาน + วันนี้
export const REFRESH_DAYS = 3;             // Meta แก้ยอดย้อนหลังได้ → ดึงซ้ำทุกครั้ง
export const CHUNK_DAYS = 10;              // ก้อนละ ≤10 วัน อยู่ใต้เพดาน Edge Function สบาย (30 วัน ≈ 60 วินาที)
export const MAX_EXPLICIT_SPAN = 14;       // เพดานฝั่ง server ต่อหนึ่งคำขอ
const SYNC_MODES = new Set(["backfill", "incremental"]);

export function coverageWindow(today, backfillDays) {
  const end = toTime(today);
  if (!Number.isFinite(end)) throw syncError("SYNC_RANGE_INVALID");
  const days = Math.min(MAX_HISTORY_DAYS, Math.max(RECONCILE_MIN_DAYS, Math.floor(Number(backfillDays) || 0)));
  return { from: fromTime(end - (days - 1) * DAY), to: today };
}

/** วันที่ในช่วง [from,to] ที่ไม่มี run สำเร็จครอบคลุม → ช่วงต่อเนื่อง เรียงเก่าไปใหม่ */
export function coverageGaps(runs = [], from, to) {
  const start = toTime(from), end = toTime(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
  const covered = runs
    .filter((r) => r?.status === "success" && SYNC_MODES.has(r.mode))
    .map((r) => [toTime(r.range_from), toTime(r.range_to)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a <= b && b >= start && a <= end)
    .map(([a, b]) => [Math.max(a, start), Math.min(b, end)])
    .sort((x, y) => x[0] - y[0]);
  const gaps = [];
  let cursor = start;
  for (const [a, b] of covered) {
    if (a > cursor) gaps.push({ from: fromTime(cursor), to: fromTime(a - DAY) });
    cursor = Math.max(cursor, b + DAY);
    if (cursor > end) break;
  }
  if (cursor <= end) gaps.push({ from: fromTime(cursor), to: fromTime(end) });
  return gaps;
}

const spanDays = (range) => (toTime(range.to) - toTime(range.from)) / DAY + 1;

/** จำนวนวันที่ขาดจริง (ไม่นับ 3 วันล่าสุดที่ยอดยังขยับ) — ใช้แสดง "ช่องว่าง" */
export function missingDaysOf(runs, today, backfillDays) {
  const window = coverageWindow(today, backfillDays);
  const stableEnd = fromTime(toTime(today) - REFRESH_DAYS * DAY);
  if (toTime(stableEnd) < toTime(window.from)) return 0;
  return coverageGaps(runs, window.from, stableEnd).reduce((n, gap) => n + spanDays(gap), 0);
}

/** งานที่ต้องดึง: ช่องว่างในหน้าต่าง + 3 วันล่าสุดเสมอ · แบ่งก้อน ≤10 วัน · ใหม่ไปเก่า · ครบบัญชีหนึ่งก่อนไปบัญชีถัดไป */
export function planSyncJobs({ connections = [], runs = [], todayOf, chunkDays = CHUNK_DAYS }) {
  const jobs = [];
  for (const connection of connections) {
    const today = todayOf(connection.timezone);
    const window = coverageWindow(today, connection.config?.backfillDays);
    const own = runs.filter((r) => (r.connection_id ?? r.connectionId) === connection.id);
    const refreshFrom = fromTime(toTime(today) - (REFRESH_DAYS - 1) * DAY);
    const stableEnd = fromTime(toTime(refreshFrom) - DAY);
    const needed = toTime(stableEnd) >= toTime(window.from) ? coverageGaps(own, window.from, stableEnd) : [];
    // รวมช่วง refresh เข้ากับช่องว่างที่ติดกัน (จะได้ไม่แตกก้อนเล็กโดยไม่จำเป็น)
    const last = needed.at(-1);
    if (last && toTime(last.to) + DAY === toTime(refreshFrom)) last.to = today;
    else needed.push({ from: refreshFrom, to: today });

    for (const range of needed.reverse()) {
      for (let end = toTime(range.to); end >= toTime(range.from); end -= chunkDays * DAY) {
        const from = fromTime(Math.max(toTime(range.from), end - (chunkDays - 1) * DAY));
        const to = fromTime(end);
        const isRefreshOnly = from === refreshFrom && to === today;
        jobs.push({ connectionId: connection.id, mode: isRefreshOnly ? "incremental" : "backfill", from, to });
      }
    }
  }
  return jobs;
}

/** ช่วงวันที่ client ส่งมากับ ads-sync — ไม่ส่ง = null · ส่งมาต้องอยู่ในเพดาน ไม่งั้น throw */
export function validateExplicitRange(body = {}, today) {
  if (body.from == null && body.to == null) return null;
  const from = toTime(body.from), to = toTime(body.to), now = toTime(today);
  const oldest = now - (MAX_HISTORY_DAYS - 1) * DAY;
  if (![from, to, now].every(Number.isFinite) || from > to || to > now || from < oldest || (to - from) / DAY + 1 > MAX_EXPLICIT_SPAN) {
    throw syncError("SYNC_RANGE_INVALID");
  }
  return { from: body.from, to: body.to };
}
