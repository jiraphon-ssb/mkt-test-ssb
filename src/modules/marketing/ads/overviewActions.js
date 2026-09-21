/* ตารางตัดสินใจของหน้า Overview (สเปก docs/superpowers/specs/2026-09-21-overview-redesign.md หัวข้อ 5, 7)
   คำถามเดียวที่ตอบ: วันนี้ต้องลงมือกับใครก่อน — ไม่ใช่ "ตัวเลขเป็นเท่าไร" ซึ่งการ์ดอื่นตอบอยู่แล้ว */
import { fmtNum } from "../dash/charts/theme.js";
import { paceBucket, paceReason } from "./paceEngine.js";

const pct = (value) => (value == null ? "—" : `${fmtNum(value * 100, 2)}%`);

/* ตาราง 2×2 · ผลลัพธ์ (ยอดขาย) × งบ
     ช้า × เร็ว  = จ่ายเงินเร็วแต่ไม่ได้ของ — ด่วนที่สุด
     เร็ว × เร็ว = ได้ของแต่จ่ายเร็ว — ตามใกล้ชิด ยังไม่ต้องแตะ
     ช้า × ช้า   = เงินไม่ออก ของก็ไม่มา — มักเป็นเรื่อง delivery/ปริมาณงาน ไม่ใช่คุณภาพแอด
     เร็ว × ช้า  = ได้ของโดยยังใช้เงินไม่ถึงแผน — โอกาสเติมงบ
   "ใช้เกินงบทั้งเดือนไปแล้ว" ดันอันดับขึ้นเสมอ (อาร์ตเคาะ 21 ก.ย. 69 ว่าแดงระดับเดียวกับยอดช้า) */
const MATRIX = {
  slow_fast: { action: "ตรวจแคมเปญ/ครีเอทีฟทันที", tone: "rose", rank: 5, level: "bad" },
  slow_slow: { action: "ตรวจ delivery และปริมาณงาน", tone: "amber", rank: 3, level: "warn" },
  fast_fast: { action: "ตามผลใกล้ชิด", tone: "amber", rank: 2, level: "warn" },
  fast_slow: { action: "มีโอกาสเพิ่มงบ", tone: "emerald", rank: 1, level: "wait" },
};

export function brandAdvice({ revPace, budgetPace } = {}) {
  const result = paceBucket(revPace), budget = paceBucket(budgetPace);
  if (!result || !budget) {
    const missing = [revPace, budgetPace].map((pace) => paceReason(pace?.reason)).filter(Boolean);
    return { key: "unknown", action: "ยังตัดสินใจไม่ได้", tone: "zinc", rank: 0, level: "wait",
      why: missing.length ? [...new Set(missing)].join(" · ") : "ข้อมูลไม่ครบ", overBudget: Boolean(budgetPace?.overTarget) };
  }
  const key = `${result === "fast" ? "fast" : "slow"}_${budget === "fast" ? "fast" : "slow"}`;
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
