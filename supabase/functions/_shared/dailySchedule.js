/* ตารางดึงอัตโนมัติ "วันละครั้ง เริ่ม 07:30 เวลาไทย" — ที่เดียวที่กำหนดเวลา (Deno + vitest + หน้าจอใช้ไฟล์เดียวกัน)
   8 ต.ค. อาร์ตสั่ง: ข้อมูลทุกแหล่งต้องดึงเสร็จก่อน 08:30 เพราะ 09:00 ต้องส่งรายงาน
   เลือก 07:30 เพราะเป็นเวลาเริ่มที่ช้าที่สุดที่รอบเก็บตกสุดท้าย (08:20) ยังจบก่อน 08:30
   — ยิ่งเริ่มช้ายิ่งดีต่อเหตุผลเดิมของวันที่ 28 ก.ย.: แอดเปิด 07:00–07:30 (ดึงก่อนนั้นสถานะโฆษณาเป็น "ปิดอยู่")
     และทีมขายกรอกยอดของเมื่อวานตอนเช้า
   ประวัติ: ตี 5 → 09:00 (28 ก.ย.) → 07:30 (8 ต.ค.)
   เทสใน tests/dailySchedule.test.js · migration pg_cron ต้องใช้ DAILY_CRON_EXPRS ชุดนี้ (tests/adsMigrations.test.js ตรวจ)

   ทำไมยิงหลายครั้ง ทั้งที่ตั้งใจ "วันละครั้ง":
   งานทั้งวัน (ดึงทุกบัญชี · ตรวจยอด · ยอดขาย · creative · snapshot) ไม่จบในรอบเดียว เพราะ Edge Function ถูกตัดที่ 400 วิ
   → รอบแรกทำก่อน รอบถัดไปเก็บตกเฉพาะงานที่ยังค้าง · แต่ละแหล่งถูกดึงได้ "วันละครั้งตามวันที่ไทย" (doneToday)
   รอบเก็บตกที่ไม่มีงานเหลือ อ่านแค่ฐานข้อมูลเรา ไม่ยิงออกไปหา Meta / ระบบขายเลย
   ประเทศไทยไม่มี daylight saving → เลื่อน UTC คงที่ +7 ได้ */

export const DAILY_TZ = "Asia/Bangkok";
export const DAILY_RUN_HOUR = 7;
export const DAILY_RUN_MINUTE = 30;
/** นาทีนับจากรอบแรก — รอบสุดท้าย (+50) คือ 08:20 */
export const DAILY_TICK_OFFSETS = [0, 10, 20, 30, 40, 50];
/** ทุกแหล่งต้องเสร็จก่อนเวลานี้ (รายงาน 09:00 และระบบอื่นที่มาดึงต่อ อ้างเวลานี้) */
export const DAILY_DEADLINE_LABEL = "08:30";
const hh = (h, m = 0) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const START_MINUTE = DAILY_RUN_HOUR * 60 + DAILY_RUN_MINUTE;            // นาทีของวัน เวลาไทย
const thaiClock = (minuteOfDay) => hh(Math.floor(minuteOfDay / 60) % 24, minuteOfDay % 60);
/** ป้ายเวลาสำหรับหน้าจอ — ห้ามพิมพ์เวลาเองในหน้า (เปลี่ยนเวลาแล้วข้อความต้องตามมาเอง) */
export const DAILY_RUN_LABEL = thaiClock(START_MINUTE);
export const DAILY_WINDOW_LABEL = `${thaiClock(START_MINUTE + DAILY_TICK_OFFSETS[1])}–${thaiClock(START_MINUTE + DAILY_TICK_OFFSETS.at(-1))}`;
const UTC_OFFSET_MINUTES = 7 * 60;
/** นาทีของวันแบบ UTC ของแต่ละรอบ */
const TICK_UTC_MINUTES = DAILY_TICK_OFFSETS.map((offset) => (START_MINUTE + offset - UTC_OFFSET_MINUTES + 1440) % 1440);
/** pg_cron ใช้เวลา UTC และหนึ่งนิพจน์ครอบได้ชั่วโมงเดียว — รอบที่คร่อมชั่วโมง (07:30–08:20) จึงเป็นหลายนิพจน์ หนึ่งชั่วโมงต่อหนึ่ง job */
export const DAILY_CRON_EXPRS = [...TICK_UTC_MINUTES.reduce((byHour, minute) => {
  const hour = Math.floor(minute / 60);
  return byHour.set(hour, [...(byHour.get(hour) ?? []), minute % 60]);
}, new Map()).entries()].map(([hour, minutes]) => `${minutes.join(",")} ${hour} * * *`);

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

/** รอบ (tick) ถัดไปหลัง now — ในช่วงเช้าคือรอบเก็บตกถัดไป · นอกช่วงคือรอบแรกของวันถัดไป */
export function nextDailyTickAt(now = Date.now()) {
  const base = startOfUtcDay(now);
  for (const dayOffset of [0, 1, 2]) {
    for (const minute of TICK_UTC_MINUTES) {
      const at = base + dayOffset * 86_400_000 + minute * 60_000;
      if (at > now) return new Date(at).toISOString();
    }
  }
  return new Date(base + 3 * 86_400_000 + TICK_UTC_MINUTES[0] * 60_000).toISOString();
}

/** รอบแรกของวัน รอบถัดไป */
export function nextDailyRunAt(now = Date.now()) {
  const base = startOfUtcDay(now) + TICK_UTC_MINUTES[0] * 60_000;
  return new Date(base > now ? base : base + 86_400_000).toISOString();
}
