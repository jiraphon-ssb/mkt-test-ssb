/* adsScope — ช่วงเวลาของหน้า ads (Overview · แคมเปญ · Creative ใช้ร่วมกัน) ทุกฟังก์ชัน pure มีเทสใน tests/adsCampaigns.test.js */

export const isoDay = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const atMidnight = (s) => new Date(`${s}T00:00:00`).toISOString();
const addDaysLocal = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayOf = (iso) => new Date(`${iso}T00:00:00`);

const mondayOf = (d) => addDaysLocal(d, -((d.getDay() + 6) % 7));

/** ช่วงเวลา [start, end) เป็น ISO string · key: today · yesterday · wtd · lastWeek · 7d · 14d · 30d · mtd · lastMonth · custom(from,to รวมหัวท้าย)
    สัปดาห์เริ่มวันจันทร์ (ตรงกับปฏิทินในแอพ) */
export function periodRange(key, from, to, now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = day, end = addDaysLocal(day, 1);
  if (key === "yesterday") { start = addDaysLocal(day, -1); end = day; }
  if (key === "wtd") start = mondayOf(day);
  if (key === "lastWeek") { end = mondayOf(day); start = addDaysLocal(end, -7); }
  if (key === "7d") start = addDaysLocal(day, -6);
  if (key === "14d") start = addDaysLocal(day, -13);
  if (key === "30d") start = addDaysLocal(day, -29);
  if (key === "mtd") start = new Date(day.getFullYear(), day.getMonth(), 1);
  if (key === "lastMonth") { start = new Date(day.getFullYear(), day.getMonth() - 1, 1); end = new Date(day.getFullYear(), day.getMonth(), 1); }
  if (key === "custom" && from && to) return { start: atMidnight(from), end: atMidnight(isoDay(addDaysLocal(dayOf(to), 1))) };
  return { start: start.toISOString(), end: end.toISOString() };
}
export function sameDatesLastMonth(range) {
  const start = new Date(range.start), end = new Date(range.end);
  start.setMonth(start.getMonth() - 1); end.setMonth(end.getMonth() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
/** ช่วงเทียบ: เดือนก่อน = วันเดียวกันของเดือนก่อน · ช่วงก่อน = ช่วงยาวเท่ากันก่อนหน้า
    ยกเว้นสัปดาห์นี้ (จ.–วันนี้) เทียบวันเดียวกันของสัปดาห์ก่อน ไม่ใช่ "ปลายสัปดาห์ก่อน" ที่ยาวเท่ากัน */
export function compareRange(period, range, compare) {
  if (compare === "lastMonth") return sameDatesLastMonth(range);
  const start = new Date(range.start), end = new Date(range.end);
  if (period === "wtd") return { start: addDaysLocal(start, -7).toISOString(), end: addDaysLocal(end, -7).toISOString() };
  return { start: new Date(start.getTime() - (end - start)).toISOString(), end: range.start };
}
/** ฐานเทียบที่ใช้จริง: "เดือนนี้" เทียบวันเดียวกันของเดือนก่อนเสมอ (ยอด/เป้า/จังหวะคิดแบบเดือน · ทุกตัวบนหน้าต้องฐานเดียวกัน) */
export const effectiveCompare = (period, compare) => (period === "mtd" ? "lastMonth" : compare);
export const PERIOD_PRESETS = [
  ["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["wtd", "สัปดาห์นี้"], ["lastWeek", "สัปดาห์ก่อน"], ["7d", "7 วันล่าสุด"], ["14d", "14 วันล่าสุด"],
  ["30d", "30 วันล่าสุด"], ["mtd", "เดือนนี้"], ["lastMonth", "เดือนก่อน"],
];

export const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const MONTHS_TH_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
export const WEEKDAYS_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** ตารางเดือนสำหรับปฏิทิน: แถวละ 7 ช่อง (อา→ส) ช่องนอกเดือนเป็น null · month = 0–11 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const count = new Date(year, month + 1, 0).getDate();
  const cells = Array(first.getDay()).fill(null);
  for (let d = 1; d <= count; d += 1) cells.push(isoDay(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** ป้ายช่วงวันแบบสั้น: "1 – 14 ก.ย. 2026" · ข้ามเดือน "28 ส.ค. – 14 ก.ย. 2026" · ข้ามปีใส่ปีทั้งคู่ · วันเดียวโชว์วันเดียว */
export function rangeLabel(from, to) {
  const a = dayOf(from), b = dayOf(to);
  const d = (x) => x.getDate(), m = (x) => MONTHS_TH[x.getMonth()], y = (x) => x.getFullYear();
  if (from === to) return `${d(a)} ${m(a)} ${y(a)}`;
  if (y(a) !== y(b)) return `${d(a)} ${m(a)} ${y(a)} – ${d(b)} ${m(b)} ${y(b)}`;
  if (a.getMonth() !== b.getMonth()) return `${d(a)} ${m(a)} – ${d(b)} ${m(b)} ${y(b)}`;
  return `${d(a)} – ${d(b)} ${m(b)} ${y(b)}`;
}
export const daysInclusive = (from, to) => Math.round((dayOf(to) - dayOf(from)) / 86_400_000) + 1;
export const shiftDay = (iso, n) => isoDay(addDaysLocal(dayOf(iso), n));
