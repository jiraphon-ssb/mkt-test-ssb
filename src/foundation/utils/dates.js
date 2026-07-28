/* วันที่ระดับสัปดาห์ — แทน date-fns (แพลตฟอร์มไม่มี date lib)
   สัปดาห์เริ่มวันจันทร์ตามที่ระบบใช้ทุกที่ · คืน Date ใหม่เสมอ ไม่กลายพันธุ์ input */

export function startOfWeekMon(input) {
  const d = input instanceof Date ? new Date(input) : new Date(input);
  const dow = (d.getDay() + 6) % 7; // 0 = จันทร์
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(input, n) {
  const d = input instanceof Date ? new Date(input) : new Date(input);
  d.setDate(d.getDate() + n);
  return d;
}

export function addWeeks(input, n) {
  return addDays(input, n * 7);
}

export function startOfMonth(input) {
  const d = input instanceof Date ? new Date(input) : new Date(input);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** YYYY-MM-DD ตามเวลาเครื่อง (ไม่ผ่าน toISOString ที่เลื่อน timezone) */
export function ymd(input) {
  const d = input instanceof Date ? input : new Date(input);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** parse "YYYY-MM-DD" เป็น local midnight — กันปัญหา timezone shift */
export function parseYMD(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
