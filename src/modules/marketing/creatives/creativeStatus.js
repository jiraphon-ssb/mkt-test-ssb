/* สถานะเปิด/ปิดของโฆษณาและแคมเปญ (pure · เทสใน tests/creativeStatus.test.js)
   ที่มา: effective_status ของโฆษณาใน Meta — ดึงพร้อมรอบรีเฟรชครีเอทีฟ (วันละครั้ง 09:00) จึงเป็นสถานะ ณ เวลานั้น
   ป้าย "ควรหยุด/น่าขยาย" เป็นคำแนะนำของระบบ คนละเรื่องกับสถานะนี้ */

import { DECISION_LABEL, FATIGUE_LABEL } from "../ads/glossary.js";
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

/** สถานะแคมเปญจากทุกชิ้นในแคมเปญเดียวกัน (row.perCampaign[].status) → Map<ชื่อแคมเปญ, สถานะ> */
export function campaignStatusIndex(rows = []) {
  const byCampaign = new Map();
  for (const row of rows) for (const p of row?.perCampaign ?? []) {
    byCampaign.set(p.campaign, [...(byCampaign.get(p.campaign) ?? []), { asset: { status: p.status } }]);
  }
  return new Map([...byCampaign].map(([name, ads]) => [name, campaignStatusOf(ads)]));
}

/** สถานะแคมเปญที่ขึ้นในรายการ — รู้จากโฆษณาข้างใน (สด ณ รอบรีเฟรชครีเอทีฟ) ก่อน · ไม่รู้ค่อยใช้ status ที่ติดมากับข้อมูลแคมเปญ */
export function campaignDeliveryOf(row) {
  const fromAds = campaignStatusOf(row?.creatives ?? []);
  if (fromAds.key !== "unknown") return fromAds;
  const key = row?.status === "active" ? "active" : row?.status === "paused" ? "paused" : "unknown";
  if (key !== "unknown") return { key, ...CAMPAIGN[key] };
  /* ท้ายชื่อที่ทีมตั้งเอง "… | เปิด" / "… | CLS" (อาร์ตยืนยัน 26 ก.ย.) — ใช้เมื่อ Meta ยังไม่บอก และบอกว่าอ่านจากชื่อ */
  const tail = String(row?.name ?? "").split("|").slice(1).pop()?.trim().toLowerCase();
  const byName = tail === "เปิด" ? "active" : tail === "cls" || tail === "ปิด" ? "paused" : null;
  if (byName) return { key: byName, ...CAMPAIGN[byName], label: `${CAMPAIGN[byName].label} (ตามชื่อ)`, fromName: true };
  return { key, ...CAMPAIGN[key] };
}

/* คำแนะนำของระบบ (ไม่ใช่สถานะ) เป็นภาษาไทย — ใช้ทั้งการ์ดและตารางครีเอทีฟ */
const ACTION_TEXT = { Scale: DECISION_LABEL.scale, Good: DECISION_LABEL.good, Fix: DECISION_LABEL.fix, Stop: DECISION_LABEL.stop, Sells: DECISION_LABEL.sells, "ติดตาม": DECISION_LABEL.watch, "รอข้อมูล": DECISION_LABEL.wait };
export const actionLabel = (row) => (row?.fatigue ? FATIGUE_LABEL : ACTION_TEXT[row?.action] ?? row?.action ?? "—");
export const actionTone = (row) => (row?.fatigue ? "amber" : row?.tone ?? "zinc");

/** สถานะเปิด/ปิดดึงจาก Meta วันละครั้งตอนเช้า — ถ้าตอนดึงไม่มีโฆษณาไหนเปิดเลย แต่เมื่อวานยังใช้เงิน
    = สถานะนั้นน่าจะเป็นช่วงที่ทีมตั้งปิดชั่วคราว (เช่นกลางคืน) ไม่ใช่ "ปิดทั้งวัน" → หน้าต้องบอกว่าสถานะเป็นของเวลาไหน
    (ทดสอบแบบผู้ใช้จริง 27 ก.ย.: 855 ชิ้นไม่มีตัวไหน ACTIVE แต่เมื่อวานใช้ ฿14,168.89 — ทุกแถวขึ้น "ปิดอยู่")
    rows = แถวที่มี asset.status/statusAt · cards = การ์ดรายวัน · today = YYYY-MM-DD → { at, spend } | null */
export function statusSnapshotNote(rows = [], cards = [], today) {
  const assets = rows.map((row) => row?.asset).filter((asset) => asset?.status);
  if (!assets.length || assets.some((asset) => adStatusOf(asset.status).on === true)) return null;
  const [y, m, d] = String(today).split("-").map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  const spend = cards.reduce((n, c) => {
    const day = String(c?.fact_date ?? c?.metrics?.measured_at ?? "").slice(0, 10);
    return day === yesterday ? n + (Number(c?.metrics?.spend) || 0) : n;
  }, 0);
  if (!(spend > 0)) return null;
  const at = assets.map((asset) => asset.statusAt).filter(Boolean).sort().at(-1) ?? null;
  return { at, spend: Math.round(spend * 1e6) / 1e6 };
}
