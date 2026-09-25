/* Pace Engine กลาง — สูตรเดียวใช้ทั้งยอดขาย งบ และผลลัพธ์ (สเปก docs/superpowers/specs/2026-09-21-overview-redesign.md)
     pace = ทำได้ ÷ (เป้า × สัดส่วนวันที่ผ่านไป)     100% = ตามแผนพอดี

   กติกาเหล็ก 2 ข้อ
     1) ไม่รู้ ≠ ศูนย์ — ไม่มีเป้า/ไม่มียอด/ข้อมูลเก่า ต้องคืน state "unknown" พร้อม reason ห้ามเดาเป็นเขียวหรือแดง
     2) ข้อมูลเก่าห้ามตัดสิน — ค่าแอดจาก Meta มาช้ากว่ายอดขาย 1 วันเสมอ ถ้าปล่อยให้ตัดสิน
        ทุกเช้าจะอ่านว่า "งบช้ากว่าแผน" แล้วแนะนำให้เพิ่มงบผิด (สเปกหัวข้อ 2 ข้อ 8) */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const finite = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));
const dayMs = 86_400_000;

/** สัดส่วนของเดือนที่ผ่านไป ณ วันนั้น — วันสุดท้ายของเดือน = 1 เสมอ (ไม่ว่าเดือนจะ 28 หรือ 31 วัน) */
export function monthClock(today) {
  const text = String(today ?? "");
  if (!ISO.test(text)) return { daysElapsed: null, daysTotal: null, daysLeft: null, elapsed: null, today: null };
  const year = Number(text.slice(0, 4)), month = Number(text.slice(5, 7)), day = Number(text.slice(8, 10));
  const daysTotal = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysElapsed = Math.min(Math.max(day, 1), daysTotal);
  // พก today ไปด้วยเพื่อให้ด่าน "ข้อมูลเก่า" ของ paceOf ทำงานเองโดยผู้เรียกไม่ต้องส่งซ้ำ
  // (ถ้าต้องส่งเอง วันไหนลืมส่ง ด่านจะเงียบและกลับไปตัดสินจากข้อมูลค้างโดยไม่มีใครรู้)
  return { daysElapsed, daysTotal, daysLeft: daysTotal - daysElapsed, elapsed: daysElapsed / daysTotal, today: text };
}

/* เกณฑ์สถานะ — แยกตามทิศทางของตัวชี้วัด
   higher: ยอดขาย ออเดอร์ ลีด คนทัก ROAS — ยิ่งมากยิ่งดี
   spend : งบ — "เร็วกว่าแผน" ยังไม่ใช่ความผิดในตัวเอง ต้องดูคู่กับผลลัพธ์ (ตารางตัดสินใจ 2×2)
           แต่ "ใช้เกินงบทั้งเดือนไปแล้ว" = แดง ระดับเดียวกับยอดช้า (อาร์ตเคาะ 21 ก.ย. 69) */
const SPEND_WARN = 1.1;
/* ใช้ช้ากว่าแผนชัดเจน — ไม่ใช่ความผิด (ไม่มีป้ายเตือน สีกลาง) แต่ห้ามเรียก "ตามแผน"
   เดิมทุกอย่างที่ ≤110% เป็น "ตามแผน" → งบใช้ไป 30% ของที่ควรใช้ก็ขึ้นว่าตามแผน (รีวิว UX 25 ก.ย.)
   ขอบล่าง 85% สมมาตรกับเกณฑ์เตือนฝั่งยอด */
const SPEND_UNDER = 0.85;

function spendState(value, overTarget) {
  if (overTarget) return "bad";
  if (value > SPEND_WARN) return "warn";
  return value < SPEND_UNDER ? "under" : "ontrack";
}

function stateOf(value, direction, overTarget) {
  if (direction === "spend") return spendState(value, overTarget);
  if (value >= 1) return "ontrack";
  return value >= 0.85 ? "warn" : "bad";
}

/**
 * @param actual        ทำได้ถึงวันนี้
 * @param target        เป้า/งบ ของทั้งเดือน
 * @param clock         ผลจาก monthClock (ใช้แค่ elapsed กับ daysLeft)
 * @param direction     "higher" (ค่าเริ่มต้น) | "spend"
 * @param freshThrough  ข้อมูลมีถึงวันไหน (YYYY-MM-DD) — ใส่คู่กับ staleAfterDays เพื่อเปิดด่านข้อมูลเก่า
 * @param staleAfterDays เก่ากว่ากี่วันถือว่าตัดสินไม่ได้ · today = วันอ้างอิง (ไม่ใส่ = ใช้ clock ไม่ได้ ต้องส่งมา)
 */
export function paceOf({ actual, target, clock = {}, direction = "higher", freshThrough = null, staleAfterDays = null, today = null } = {}) {
  const a = finite(actual), t = finite(target), elapsed = finite(clock.elapsed), daysLeft = finite(clock.daysLeft);
  const blank = { value: null, expectedToDate: null, gap: null, forecast: null, forecastGap: null, requiredDaily: null,
    remaining: null, overTarget: null, direction, daysLeft, state: "unknown" };
  if (t === null || t <= 0) return { ...blank, reason: "no_target" };
  if (a === null) return { ...blank, reason: "no_data" };
  if (elapsed === null || elapsed <= 0) return { ...blank, reason: "too_early" };

  /* คูณด้วยจำนวนวันก่อนค่อยหาร — ห้ามคูณด้วย elapsed ที่เป็นทศนิยมลอย
     5,780,000 × 0.7 = 4,045,999.9999999995 ซึ่งกฎ "ตัดทศนิยมไม่ปัด" จะแสดงเป็น ฿4,045,999.99
     แต่ 5,780,000 × 21 ÷ 30 = 4,046,000 พอดี (เจอตอนเขียนเทส 21 ก.ย. 69) */
  const days = finite(clock.daysElapsed), total = finite(clock.daysTotal);
  const exact = days !== null && total !== null && total > 0;
  const expectedToDate = exact ? (t * days) / total : t * elapsed;
  const value = a / expectedToDate;
  const forecast = exact ? (a * total) / days : a / elapsed;
  const remaining = t - a;
  const full = {
    value, expectedToDate,
    gap: a - expectedToDate,                       // ติดลบ = ช้ากว่าแผน · บวก = เหนือแผน
    forecast, forecastGap: forecast - t,
    remaining,
    requiredDaily: daysLeft !== null && daysLeft > 0 ? Math.max(0, remaining) / daysLeft : null,
    overTarget: a > t,
    direction, daysLeft,
  };
  /* ด่านข้อมูลเก่า — คำนวณค่าไว้ให้ดูได้ แต่ไม่ตัดสินสถานะ */
  const asOf = today ?? clock.today ?? null;
  if (freshThrough && staleAfterDays !== null && ISO.test(String(freshThrough)) && ISO.test(String(asOf))) {
    const lag = Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${freshThrough}T00:00:00Z`)) / dayMs);
    if (lag > Number(staleAfterDays)) return { ...full, state: "unknown", reason: "stale", lagDays: lag };
  }
  return { ...full, state: stateOf(value, direction, full.overTarget), reason: null };
}

/* ตัวชี้วัดที่เป็น "อัตรา" (ROAS · %Ads · CPL · CAC) ไม่มีมิติเวลา — เทียบกับเพดาน/พื้นตรงๆ ไม่ใช่จังหวะรายวัน
   แยกฟังก์ชันไว้เพื่อให้ทั้งหน้าใช้เกณฑ์และคำเดียวกับ paceOf (เดิมแต่ละที่ตัดสินเอง คำไม่ตรงกัน) */
export function thresholdOf(actual, target, { direction = "higher" } = {}) {
  const a = finite(actual), t = finite(target);
  if (t === null || t <= 0) return { value: null, state: "unknown", reason: "no_target", direction };
  if (a === null) return { value: null, state: "unknown", reason: "no_data", direction };
  const value = a / t;
  const state = direction === "lower"
    ? (value <= 1 ? "ontrack" : value <= 1.1 ? "warn" : "bad")
    : (value >= 1 ? "ontrack" : value >= 0.85 ? "warn" : "bad");
  return { value, state, reason: null, direction, over: direction === "lower" ? a > t : a < t };
}

const LABEL = {
  higher: { ontrack: "เหนือแผน", warn: "ใกล้เป้า", bad: "ช้ากว่าแผน", unknown: "ยังตัดสินใจไม่ได้" },
  spend: { ontrack: "ตามแผน", under: "ใช้ช้ากว่าแผน", warn: "ใช้เร็วกว่าแผน", bad: "เกินงบ", unknown: "ยังตัดสินใจไม่ได้" },
  rate_higher: { ontrack: "ถึงเป้า", warn: "ใกล้เป้า", bad: "ต่ำกว่าเป้า", unknown: "ยังตัดสินใจไม่ได้" },
  rate_lower: { ontrack: "อยู่ในเป้า", warn: "เกินเป้าเล็กน้อย", bad: "เกินเป้า", unknown: "ยังตัดสินใจไม่ได้" },
};
export const paceLabel = (state, direction = "higher") => (LABEL[direction] ?? LABEL.higher)[state] ?? LABEL.higher.unknown;

const TONE = { ontrack: "emerald", under: "zinc", warn: "amber", bad: "rose", unknown: "zinc" };
export const paceTone = (state) => TONE[state] ?? "zinc";

/* ป้ายมุมการ์ด (ตระกูลเดียวกับ "หล่นแรงสุด" ของ funnel — อาร์ตขอ 21 ก.ย. ค่ำ)
   คำป้าย = สิ่งที่ต้องทำ ไม่ใช่คำสถานะ (คำสถานะอยู่ในหน้าปัด/ประโยคอยู่แล้ว ป้ายซ้ำ = ขยะ)
   ontrack/unknown = null → การ์ดปกติเงียบ ตามกติกา exception-based ของฝั่งซ้าย */
/** สถานะจากอัตราส่วนที่คิดมาแล้ว (current ÷ expected) — หัวกราฟแนวโน้มใช้ เพราะจังหวะคำนวณจาก series ไม่ใช่ clock
    เกณฑ์ต้องตรงกับ paceOf: ยอด ≥100% ตามแผน ≥85% เตือน · งบเขตปลอดภัย ≤110% และเกินงบจริงเท่านั้นที่แดง */
export function trendPaceState({ ratio, direction = "higher", overTarget = false }) {
  if (ratio == null || !Number.isFinite(ratio)) return "unknown";
  if (direction === "spend") return spendState(ratio, overTarget);
  return ratio >= 1 ? "ontrack" : ratio >= 0.85 ? "warn" : "bad";
}

const FLAG_BAD = { higher: "ต้องเร่ง", spend: "ต้องคุมงบ", rate_higher: "ต้องแก้", rate_lower: "ต้องแก้" };
export const paceFlag = (state, kind = "higher") =>
  state === "bad" ? { text: FLAG_BAD[kind] ?? FLAG_BAD.higher, tone: "rose" }
  : state === "warn" ? { text: "เฝ้าระวัง", tone: "amber" } : null;

/** ป้อนตารางตัดสินใจ — ยอด: fast/slow · งบ: fast/onplan/slow · ตัดสินไม่ได้ = null (ห้ามเดาเป็นช้า)
    (25 ก.ย.: เดิมงบมีแค่ 2 ช่อง "ตามแผน" ถูกนับเป็น "ช้า" → ยอดช้าทุกแบรนด์ได้ "ตรวจ delivery" เหมือนกันหมด)
    ฝั่งงบต้องมี "เขตปลอดภัย" ไม่ใช่ตัดที่ 100% เป๊ะ — ใช้เกินแผน 2.57% (TEAMDEE 21 ก.ย.) คือตามแผน
    ถ้าตัดที่ 100% แบรนด์ปกติจะเด้งขึ้นช่อง "ตรวจแคมเปญทันที" ทุกวัน จนคนเลิกเชื่อรายการเตือน
    จึงใช้สถานะของ pace (งบ: ≤110% = ตามแผน) แทนการเทียบค่าดิบ */
export function paceBucket(pace) {
  if (!pace || pace.state === "unknown" || pace.value == null) return null;
  if (pace.direction === "spend") return pace.state === "under" ? "slow" : pace.state === "ontrack" ? "onplan" : "fast";
  return pace.value >= 1 ? "fast" : "slow";
}

/** เหตุผลที่ยังตัดสินไม่ได้ เป็นคำไทยสำหรับขึ้นจอ */
const REASON = { no_target: "ยังไม่ตั้งเป้าเดือนนี้", no_data: "ยังไม่มีข้อมูล", too_early: "เดือนยังไม่เริ่ม", stale: "ข้อมูลยังมาไม่ถึงวันนี้" };
export const paceReason = (reason) => REASON[reason] ?? null;

/** ตำแหน่งบนหน้าปัด 0–200% — เกินสเกลตรึงปลาย แต่ผู้เรียกยังได้รู้ว่าทะลุ (ไว้โชว์ ») */
export const GAUGE_MAX = 2;
export function gaugeFraction(value) {
  const n = finite(value);
  if (n === null) return { fraction: null, over: false };
  return { fraction: Math.min(1, Math.max(0, n / GAUGE_MAX)), over: n > GAUGE_MAX };
}
