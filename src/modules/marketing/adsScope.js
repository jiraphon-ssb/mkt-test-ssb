/* adsScope — ช่วงเวลาของหน้า ads (คัดลอกจาก AdsView.jsx เพราะหน้า Overview ถูกล็อกห้ามแก้
   TODO(หลังได้รับอนุญาต): ให้ AdsView import จากไฟล์นี้แทนเพื่อไม่ให้มีสองสำเนา) */

export const isoDay = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const atMidnight = (s) => new Date(`${s}T00:00:00`).toISOString();
const addDaysLocal = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export function periodRange(key, from, to, now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = day, end = addDaysLocal(day, 1);
  if (key === "yesterday") { start = addDaysLocal(day, -1); end = day; }
  if (key === "7d") start = addDaysLocal(day, -6);
  if (key === "mtd") start = new Date(day.getFullYear(), day.getMonth(), 1);
  if (key === "lastMonth") { start = new Date(day.getFullYear(), day.getMonth() - 1, 1); end = new Date(day.getFullYear(), day.getMonth(), 1); }
  if (key === "custom" && from && to) return { start: atMidnight(from), end: atMidnight(isoDay(addDaysLocal(new Date(`${to}T00:00:00`), 1))) };
  return { start: start.toISOString(), end: end.toISOString() };
}
export function sameDatesLastMonth(range) {
  const start = new Date(range.start), end = new Date(range.end);
  start.setMonth(start.getMonth() - 1); end.setMonth(end.getMonth() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
export const PERIOD_PRESETS = [["today", "วันนี้"], ["7d", "7 วัน"], ["mtd", "เดือนนี้"]];
