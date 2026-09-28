/* ตารางดึงอัตโนมัติ "วันละครั้ง 09:00 เวลาไทย" — ที่เดียวที่กำหนดเวลา (Deno + vitest + หน้าจอใช้ไฟล์เดียวกัน)
   28 ก.ย. อาร์ตย้ายจากตี 5 เป็น 09:00: แอดเปิด 07:00–07:30 — ดึงตี 5 สถานะโฆษณาเป็น "ปิดอยู่" ทุกแถว
   และทีมขายกรอกยอดของเมื่อวานตอนเช้า ดึง 9 โมงได้ข้อมูลครบกว่า
   เทสใน tests/dailySchedule.test.js · migration pg_cron ต้องใช้ DAILY_CRON_EXPR ตัวนี้ (tests/adsMigrations.test.js ตรวจ)

   ทำไมยิงหลายครั้งในช่วงเช้า ทั้งที่ตั้งใจ "วันละครั้ง":
   งานทั้งวัน (ดึงทุกบัญชี · ตรวจยอด · ยอดขาย · creative · snapshot) ไม่จบในรอบเดียว เพราะ Edge Function ถูกตัดที่ 400 วิ
   → รอบ 09:00 ทำก่อน รอบ 09:10–09:50 เก็บตกเฉพาะงานที่ยังค้าง · แต่ละแหล่งถูกดึงได้ "วันละครั้งตามวันที่ไทย" (doneToday)
   รอบเก็บตกที่ไม่มีงานเหลือ อ่านแค่ฐานข้อมูลเรา ไม่ยิงออกไปหา Meta / ระบบขายเลย
   ประเทศไทยไม่มี daylight saving → เลื่อน UTC คงที่ +7 ได้ */

export const DAILY_TZ = "Asia/Bangkok";
export const DAILY_RUN_HOUR = 9;
export const DAILY_TICK_MINUTES = [0, 10, 20, 30, 40, 50];
const hh = (h, m = 0) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
/** ป้ายเวลาสำหรับหน้าจอ — ห้ามพิมพ์เวลาเองในหน้า (เปลี่ยนเวลาแล้วข้อความต้องตามมาเอง) */
export const DAILY_RUN_LABEL = hh(DAILY_RUN_HOUR);
export const DAILY_WINDOW_LABEL = `${hh(DAILY_RUN_HOUR, DAILY_TICK_MINUTES[1])}–${hh(DAILY_RUN_HOUR, DAILY_TICK_MINUTES.at(-1))}`;
const UTC_OFFSET_HOURS = 7;
const UTC_HOUR = (DAILY_RUN_HOUR - UTC_OFFSET_HOURS + 24) % 24;
/** pg_cron ใช้เวลา UTC — 02:00–02:50 UTC = 09:00–09:50 ไทย */
export const DAILY_CRON_EXPR = `${DAILY_TICK_MINUTES.join(",")} ${UTC_HOUR} * * *`;

/** รับได้ทั้ง ISO string · Date · ms (หน้าจอส่ง Date.now() มา) — ค่าเสียคืน NaN */
const time = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const t = Date.parse(String(value ?? ""));
  return Number.isFinite(t) ? t : NaN;
};

/** วันที่ (YYYY-MM-DD) ตามโซนเวลา — ค่าเสียคืน null */
export function dayIn(value, timeZone = DAILY_TZ) {
  const t = time(value);
  if (!Number.isFinite(t)) return null;
  const format = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  try { return format(timeZone || DAILY_TZ); } catch { return format(DAILY_TZ); }
}

/** ทำไปแล้ว "วันนี้" หรือยัง — นับตามวันที่ ไม่ใช่ครบ 24 ชม. (รอบเมื่อวานจบ 09:47 วันนี้รอบ 09:00 ก็ถึงคิว)
    ไม่เคยทำ / เวลาเสีย = ยังไม่ทำ (ค้างไว้แย่กว่าดึงเกิน) */
export function doneToday(lastAt, today, timeZone = DAILY_TZ) {
  if (!today) return false;
  const day = dayIn(lastAt, timeZone);
  return day !== null && day >= String(today);
}

const startOfUtcDay = (t) => { const d = new Date(t); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };

/** รอบ (tick) ถัดไปหลัง now — ในช่วงเช้าคือรอบเก็บตกถัดไป · นอกช่วงคือ 09:00 รอบหน้า */
export function nextDailyTickAt(now = Date.now()) {
  const base = startOfUtcDay(now);
  for (const dayOffset of [0, 1]) {
    for (const minute of DAILY_TICK_MINUTES) {
      const at = base + dayOffset * 86_400_000 + UTC_HOUR * 3_600_000 + minute * 60_000;
      if (at > now) return new Date(at).toISOString();
    }
  }
  return new Date(base + 2 * 86_400_000 + UTC_HOUR * 3_600_000).toISOString();
}

/** 09:00 รอบถัดไป (รอบแรกของวัน) */
export function nextDailyRunAt(now = Date.now()) {
  const base = startOfUtcDay(now) + UTC_HOUR * 3_600_000;
  return new Date(base > now ? base : base + 86_400_000).toISOString();
}
