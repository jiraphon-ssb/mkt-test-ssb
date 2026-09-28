/* ตารางตัดสินใจของหน้า Overview (สเปก docs/superpowers/specs/2026-09-21-overview-redesign.md หัวข้อ 5, 7)
   คำถามเดียวที่ตอบ: วันนี้ต้องลงมือกับใครก่อน — ไม่ใช่ "ตัวเลขเป็นเท่าไร" ซึ่งการ์ดอื่นตอบอยู่แล้ว */
import { fmtNum } from "../dash/charts/theme.js";
import { paceBucket, paceReason } from "./paceEngine.js";

const pct = (value) => (value == null ? "—" : `${fmtNum(value * 100, 2)}%`);

/* ตาราง ผลลัพธ์ (ยอดขาย: เร็ว/ช้า) × งบ (เร็ว/ตามแผน/ช้า)
     ช้า × เร็ว      = จ่ายเงินเร็วแต่ไม่ได้ของ — ด่วนที่สุด
     ช้า × ตามแผน   = เงินออกตามแผนแต่ยอดไม่มา — ปัญหาอยู่ที่แอด/การปิดขาย ไม่ใช่ delivery
     ช้า × ช้า       = เงินไม่ออก ของก็ไม่มา — มักเป็นเรื่อง delivery/ปริมาณงาน ไม่ใช่คุณภาพแอด
     เร็ว × เร็ว     = ได้ของแต่จ่ายเร็ว — ตามใกล้ชิด ยังไม่ต้องแตะ
     เร็ว × ตามแผน  = ดีทั้งคู่ — ไม่มีอะไรต้องทำ (สีกลาง ไม่แย่งความสนใจ)
     เร็ว × ช้า      = ได้ของโดยยังใช้เงินไม่ถึงแผน — โอกาสเติมงบ
   25 ก.ย.: เดิมงบมี 2 ช่อง "ตามแผน" ถูกนับเป็น "ช้า" → คอลัมน์ "ควรทำ" ขึ้น "ตรวจ delivery" ทุกแถว
   "ใช้เกินงบทั้งเดือนไปแล้ว" ดันอันดับขึ้นเสมอ (อาร์ตเคาะ 21 ก.ย. 69 ว่าแดงระดับเดียวกับยอดช้า) */
const MATRIX = {
  slow_fast: { action: "ตรวจแคมเปญ/ครีเอทีฟทันที", tone: "rose", rank: 5, level: "bad" },
  slow_onplan: { action: "ตรวจแอดและการปิดขาย", tone: "amber", rank: 3, level: "warn" },
  slow_slow: { action: "ตรวจ delivery และปริมาณงาน", tone: "amber", rank: 3, level: "warn" },
  fast_fast: { action: "ตามผลใกล้ชิด", tone: "amber", rank: 2, level: "warn" },
  fast_onplan: { action: "ไปต่อตามแผน", tone: "zinc", rank: 0, level: "wait" },
  fast_slow: { action: "มีโอกาสเพิ่มงบ", tone: "emerald", rank: 1, level: "wait" },
};

export function brandAdvice({ revPace, budgetPace } = {}) {
  const result = paceBucket(revPace), budget = paceBucket(budgetPace);
  if (!result || !budget) {
    const missing = [revPace, budgetPace].map((pace) => paceReason(pace?.reason)).filter(Boolean);
    return { key: "unknown", action: "ยังตัดสินใจไม่ได้", tone: "zinc", rank: 0, level: "wait",
      why: missing.length ? [...new Set(missing)].join(" · ") : "ข้อมูลไม่ครบ", overBudget: Boolean(budgetPace?.overTarget) };
  }
  const key = `${result === "fast" ? "fast" : "slow"}_${budget}`;
  const base = MATRIX[key];
  const overBudget = Boolean(budgetPace?.overTarget);
  return {
    key, ...base,
    // เกินงบแล้วแต่ยังไม่ใช่ช่องด่วนสุด → ดันขึ้นมาอยู่เหนือช่องอื่นที่ไม่เกินงบ
    rank: overBudget ? Math.max(base.rank, 4) : base.rank,
    tone: overBudget ? "rose" : base.tone,
    level: overBudget ? "bad" : base.level,
    overBudget,
    why: `ยอด ${pct(revPace.value)} · งบ ${pct(budgetPace.value)}${overBudget ? " (ใช้เกินงบทั้งเดือนแล้ว)" : ""}`,
  };
}

/* ทดสอบแบบใช้งานจริง 27 ก.ย. (อาร์ต "แก้เลยตามนี้"): ตารางแบรนด์เรียงตามความด่วน ไม่ใช่ลำดับชื่อ
   อันดับจากตารางตัดสินใจ (rank มาก = ด่วน) · เท่ากันเอาที่ขาดจากแผนมากกว่าก่อน · ตัดสินไม่ได้ (gap ไม่รู้) ไว้ท้าย */
const URGENT_RANK = 2;   // ตั้งแต่ "ตามผลใกล้ชิด" ขึ้นไป = มีเรื่องต้องดู · ต่ำกว่านี้ (ตามแผน/โอกาสเพิ่มงบ) ไม่ใช่เรื่องด่วน
export function byUrgency(brands = []) {
  const rank = (x) => x.pace2?.advice?.rank ?? 0;
  const gap = (x) => x.pace2?.rev?.gap;
  return [...brands].sort((x, y) => rank(y) - rank(x)
    || (gap(x) == null) - (gap(y) == null)
    || (gap(x) ?? 0) - (gap(y) ?? 0));
}

/** บรรทัดสรุปบนสุดของภาพรวม — คาดขาดเป้าเท่าไร · ค่าแอดเกินงบกี่แบรนด์ · เรื่องแรกคือแบรนด์ไหน
    shortfall บวก = คาดขาด · ติดลบ = คาดเกินเป้า · null = ยังคาดไม่ได้ (ไม่มีเป้า/ข้อมูล) */
export function overviewDigest({ overallPace, brands = [] } = {}) {
  if (!overallPace) return null;
  const forecastGap = overallPace.rev?.forecastGap;
  const top = byUrgency(brands)[0];
  return {
    shortfall: forecastGap == null || !Number.isFinite(forecastGap) ? null : -forecastGap,
    overBudget: brands.filter((x) => x.pace2?.advice?.overBudget).length,
    companyOver: Boolean(overallPace.budget?.overTarget),   // งบรวมทั้งบริษัทใช้เกินแล้ว (ตรวจรอบ 27 ก.ย. ดึก)
    first: top && (top.pace2?.advice?.rank ?? 0) >= URGENT_RANK ? { id: top.id, name: top.name, action: top.pace2.advice.action } : null,
  };
}
