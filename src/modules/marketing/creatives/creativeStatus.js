/* สถานะเปิด/ปิดของโฆษณาและแคมเปญ (pure · เทสใน tests/creativeStatus.test.js)
   ที่มา: effective_status ของโฆษณาใน Meta — ดึงพร้อมรอบรีเฟรชครีเอทีฟ (วันละครั้ง ตี 5) จึงเป็นสถานะ ณ เวลานั้น
   ป้าย "ควรหยุด/น่าขยาย" เป็นคำแนะนำของระบบ คนละเรื่องกับสถานะนี้ */

const STATUS = {
  active: { label: "เปิด", tone: "emerald", on: true },
  paused: { label: "ปิด", tone: "zinc", on: false },
  campaign_paused: { label: "ปิด · แคมเปญหยุด", tone: "zinc", on: false },
  adset_paused: { label: "ปิด · ชุดโฆษณาหยุด", tone: "zinc", on: false },
  archived: { label: "เก็บแล้ว", tone: "zinc", on: false },
  review: { label: "รอ Meta ตรวจ", tone: "amber", on: false },
  issue: { label: "มีปัญหา", tone: "rose", on: false },
  unknown: { label: "ไม่ทราบสถานะ", tone: "zinc", on: null },
};

const KEY_OF = {
  ACTIVE: "active",
  PAUSED: "paused",
  CAMPAIGN_PAUSED: "campaign_paused",
  ADSET_PAUSED: "adset_paused",
  ARCHIVED: "archived",
  DELETED: "archived",
  IN_PROCESS: "review",
  PENDING_REVIEW: "review",
  PREAPPROVED: "review",
  DISAPPROVED: "issue",
  WITH_ISSUES: "issue",
  PENDING_BILLING_INFO: "issue",
};

/** effective_status ของ Meta → { key, label, tone, on } · on = true เปิด / false ปิด / null ไม่รู้ */
export function adStatusOf(effectiveStatus) {
  const key = KEY_OF[String(effectiveStatus ?? "").toUpperCase()] ?? "unknown";
  return { key, ...STATUS[key] };
}

const CAMPAIGN = {
  active: { label: "เปิดอยู่", tone: "emerald", on: true },
  paused: { label: "ปิดอยู่", tone: "zinc", on: false },
  idle: { label: "ไม่มีโฆษณาเปิด", tone: "zinc", on: false },
  unknown: { label: "ไม่ทราบสถานะ", tone: "zinc", on: null },
};

/** สถานะแคมเปญจากโฆษณาข้างใน — มีตัวเปิด = เปิดอยู่ · Meta บอกแคมเปญหยุด = ปิด
    รู้ครบทุกตัวแต่ไม่มีตัวเปิด = ไม่มีโฆษณาเปิด · ยังมีตัวที่ไม่รู้และไม่เห็นตัวเปิด = ไม่ทราบ (ห้ามเดา) */
export function campaignStatusOf(creatives = []) {
  const statuses = creatives.map((row) => adStatusOf(row?.asset?.status));
  const pick = (key) => ({ key, ...CAMPAIGN[key] });
  if (!statuses.length) return pick("unknown");
  if (statuses.some((s) => s.on === true)) return pick("active");
  if (statuses.some((s) => s.key === "campaign_paused")) return pick("paused");
  if (statuses.every((s) => s.key !== "unknown")) return pick("idle");
  return pick("unknown");
}

/** สถานะแคมเปญที่ขึ้นในรายการ — รู้จากโฆษณาข้างใน (สด ณ รอบรีเฟรชครีเอทีฟ) ก่อน · ไม่รู้ค่อยใช้ status ที่ติดมากับข้อมูลแคมเปญ */
export function campaignDeliveryOf(row) {
  const fromAds = campaignStatusOf(row?.creatives ?? []);
  if (fromAds.key !== "unknown") return fromAds;
  const key = row?.status === "active" ? "active" : row?.status === "paused" ? "paused" : "unknown";
  return { key, ...CAMPAIGN[key] };
}

/* คำแนะนำของระบบ (ไม่ใช่สถานะ) เป็นภาษาไทย — ใช้ทั้งการ์ดและตารางครีเอทีฟ */
const ACTION_TEXT = { Scale: "น่าขยาย", Fix: "ควรแก้", Stop: "ควรหยุด", "ติดตาม": "ติดตาม" };
export const actionLabel = (row) => (row?.fatigue ? "เริ่มล้า" : ACTION_TEXT[row?.action] ?? row?.action ?? "—");
export const actionTone = (row) => (row?.fatigue ? "amber" : row?.tone ?? "zinc");
