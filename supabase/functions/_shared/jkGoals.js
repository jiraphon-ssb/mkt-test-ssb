/* เป้าเดือนของ JUNTAKARN (ระบบ TMK Operation) → ad_sales_goals ของ b_jt
   ข้อตกลง 18 ก.ย. 2569:
     · เป้ายอด = ผลรวมเป้า "ช่องแชท" (RPC ตัด Shopee · Lazada · POS ให้แล้ว) — ฐานเดียวกับยอดที่เรานับ
     · งบแอด = Facebook + Instagram = ค่าแอด Meta (RPC คัดให้แล้ว) → ใส่ platform_budgets.meta ด้วย
     · ROAS คิดเองจากสองตัวนี้ ไม่ลอกของ TMK (ของเขาหารด้วยงบแอดรวมทุกแพลตฟอร์ม)
     · ระบบ TMK ไม่มีเป้าออเดอร์ · คนทัก · CPL · CAC → ปล่อยว่าง ให้ไปเติมในหน้าตั้งค่าเป้า
   กติกาที่ห้ามพลาด: เดือนที่ทีมยังไม่ตั้งเป้า (has_row = false หรือไม่มีทั้งเป้าและงบ) = ไม่เขียนอะไร
   ไม่งั้นรอบดึงจะเขียนศูนย์ทับเป้าที่คนตั้งไว้เอง */
import { JK_BRAND_ID } from "./jkFacts.js";

const MONTH_START = /^\d{4}-\d{2}-01$/;

/** คอลัมน์ที่ขอจาก RPC — ขอเท่านี้เสมอ (ข้อมูลลูกค้าไม่ข้ามระบบ ตัดตั้งแต่ฝั่งขอ ไม่ใช่ดึงมาแล้วทิ้ง) */
export const JK_GOAL_COLUMNS = ["month", "sales_target", "ad_budget", "sales_target_all", "ad_budget_all", "has_row"];

/** ค่าที่ใช้ได้ต้องเป็นตัวเลขบวก — 0 / ติดลบ / พัง = "ไม่ได้ตั้ง" (null) ไม่ใช่ศูนย์จริง */
const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const ROAS_MAX = 99_999_999;
const roasOf = (salesTarget, adBudget) => {
  if (salesTarget === null || adBudget === null) return null;
  const value = salesTarget / adBudget;
  return Number.isFinite(value) && value <= ROAS_MAX ? value : null;
};

export function jkGoalRows(rows = []) {
  const out = [];
  for (const row of rows ?? []) {
    const month = String(row?.month ?? "").slice(0, 10);
    if (!MONTH_START.test(month)) continue;
    if (row?.has_row === false) continue;
    const salesTarget = positive(row?.sales_target);
    const adBudget = positive(row?.ad_budget);
    if (salesTarget === null && adBudget === null) continue;
    out.push({
      brand_id: JK_BRAND_ID,
      month,
      version: 0,                       // ระบบ TMK ไม่มีเวอร์ชันเป้าเหมือน sale_goal ของพี่ทัช
      goal_source: "tmk_month",
      sales_target: salesTarget,
      ad_budget: adBudget,
      // numeric(12,4) รับได้ราว 1e8 — งบแอดที่พิมพ์ผิดเป็น 0.01 จะทำให้ ROAS ล้นและรอบล้มทั้งรอบ (22003)
      roas: roasOf(salesTarget, adBudget),
      platform_budgets: adBudget !== null ? { meta: adBudget } : {},
    });
  }
  return out;
}

/** คอลัมน์ที่ไม่ได้ขอแต่กลับมา — ใช้หยุดก่อนเขียนลงฐาน (ด่านที่สองของกติกาข้อมูลไม่ข้ามระบบ) */
export function jkGoalExtraColumns(rows = []) {
  const extra = new Set();
  for (const row of rows ?? []) {
    for (const column of Object.keys(row ?? {})) if (!JK_GOAL_COLUMNS.includes(column)) extra.add(column);
  }
  return [...extra].sort();
}
