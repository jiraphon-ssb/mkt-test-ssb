/* เป้าที่ใช้จริงบนหน้าจอ = ค่าจากระบบขาย ทับด้วยค่าที่คนแก้ในหน้าตั้งค่าเป้า (pure · เทสใน tests/goalOverrides.test.js)
   ข้อตกลง 18 ก.ย. 2569: "อะไรชนะ — ในหน้าตั้งค่าเราชนะ" · ชนะ **ทีละช่อง** ไม่ใช่ทั้งแถว
   แก้แค่งบแอด ช่องอื่นยังตามระบบขายอยู่ · เก็บค่าต้นทางไว้ใน synced เสมอ เพื่อให้หน้าจอ
   บอกได้ว่าทับอะไรไว้ กดคืนค่าได้ และเตือนได้เมื่อต้นทางเปลี่ยนทีหลัง

   ที่มาของเป้าที่เป็นไปได้: sale_goal / sale_target (ระบบขายพี่ทัช) · tmk_month (ระบบ TMK ของ JUNTAKARN) · manual (ตั้งเอง)
   กติกาค่า: null ในตาราง override = "ไม่ได้แก้ช่องนี้" (ตกไปใช้ค่าต้นทาง) · 0 = ตั้งใจให้เป็นศูนย์ */

export const GOAL_EDIT_FIELDS = [
  { key: "sales_target", label: "เป้ายอดขาย", unit: "money", hint: "ยอดขายที่ต้องทำให้ได้ทั้งเดือน" },
  { key: "ad_budget", label: "งบแอด", unit: "money", hint: "งบค่าแอด Meta ของเดือนนี้" },
  { key: "orders_target", label: "เป้ายืนยันออเดอร์", unit: "count", hint: "จำนวนออเดอร์ที่รับรู้ยอด" },
  { key: "deposits_target", label: "เป้าได้ออเดอร์", unit: "count", hint: "เข้าสเตจออกแบบครั้งแรก" },
  { key: "leads_target", label: "เป้า Lead", unit: "count", hint: "คนทักที่กลายเป็น Lead" },
  { key: "inquiry_target", label: "เป้าคนทัก", unit: "count", hint: "จำนวนคนทักที่ทีมต้องได้" },
  { key: "cpl", label: "CPL ที่ตั้งไว้", unit: "money", hint: "ค่าแอดต่อ 1 Lead ที่ยอมรับได้" },
  { key: "cac", label: "CAC ที่ตั้งไว้", unit: "money", hint: "ค่าแอดต่อ 1 ออเดอร์ลูกค้าใหม่" },
  { key: "cpi", label: "ต้นทุนต่อคนทัก", unit: "money", hint: "ค่าแอดต่อ 1 คนทัก" },
  { key: "roas", label: "ROAS เป้า", unit: "ratio", hint: "ยอดขาย ÷ ค่าแอด" },
  { key: "pct_ads_new", label: "%Ads เป้า", unit: "pct", hint: "ค่าแอด ÷ ยอดลูกค้าใหม่" },
];

/* กลุ่มสำหรับหน้าตั้งค่า — เรียงตามเส้นทางลูกค้า (คนทัก → Lead → ได้ออเดอร์ → ยืนยันออเดอร์)
   44 ช่องเรียงติดกันเป็นตารางเดียวอ่านไม่ออกว่าอะไรเกี่ยวกับอะไร */
export const GOAL_FIELD_GROUPS = [
  { key: "money", label: "ยอดและงบ", fields: ["sales_target", "ad_budget"] },
  { key: "funnel", label: "เส้นทางลูกค้า (จำนวนคน)", fields: ["inquiry_target", "leads_target", "deposits_target", "orders_target"] },
  { key: "efficiency", label: "ประสิทธิภาพที่ต้องคุม", fields: ["cpi", "cpl", "cac", "roas", "pct_ads_new"] },
];

const FIELD_KEYS = GOAL_EDIT_FIELDS.map((field) => field.key);
const LABEL_OF = Object.fromEntries(GOAL_EDIT_FIELDS.map((field) => [field.key, field.label]));
const ENDED_SOURCES = ["sale_goal", "sale_target", "tmk_month"];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const monthOf = (value) => String(value ?? "").slice(0, 10);
const keyOf = (brandId, month) => `${brandId}|${monthOf(month)}`;
/** ค่าที่ใช้ได้ต้องเป็นตัวเลขจริง — null/ว่าง/พัง = "ไม่ได้ตั้ง" (0 ใช้ได้ ถือว่าตั้งใจ) */
const numOf = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const blankRow = (brandId, month) => ({
  brand_id: brandId, month, goal_source: null, version: null,
  note: null, updated_at: null, updated_by: null,
  sources: {},
  synced: Object.fromEntries(FIELD_KEYS.map((key) => [key, null])),
  ...Object.fromEntries(FIELD_KEYS.map((key) => [key, null])),
});

/** goals = แถวจาก ad_sales_goals · overrides = แถวจาก ad_sales_goal_overrides
    คืน Map คีย์ "<brand_id>|<YYYY-MM-DD>" → แถวเป้าที่ใช้จริง (ไม่แก้ของเดิม) */
export function mergeGoals(goals = [], overrides = []) {
  const out = new Map();
  for (const goal of goals ?? []) {
    const month = monthOf(goal?.month);
    if (!goal?.brand_id || !ISO_DAY.test(month)) continue;
    const row = out.get(keyOf(goal.brand_id, month)) ?? blankRow(goal.brand_id, month);
    const source = ENDED_SOURCES.includes(goal.goal_source) ? goal.goal_source : "sale_goal";
    row.goal_source = goal.goal_source ?? row.goal_source;
    row.version = goal.version ?? null;
    for (const key of FIELD_KEYS) {
      const value = numOf(goal[key]);
      row.synced[key] = value;
      if (value === null) continue;
      row[key] = value;
      row.sources[key] = source;
    }
    out.set(keyOf(goal.brand_id, month), row);
  }
  for (const override of overrides ?? []) {
    const month = monthOf(override?.month);
    if (!override?.brand_id || !ISO_DAY.test(month)) continue;
    const row = out.get(keyOf(override.brand_id, month)) ?? blankRow(override.brand_id, month);
    let touched = false;
    for (const key of FIELD_KEYS) {
      const value = numOf(override[key]);
      if (value === null) continue;      // null = ไม่ได้แก้ช่องนี้ ไม่ใช่ "ตั้งเป็นว่าง"
      row[key] = value;
      row.sources[key] = "manual";
      touched = true;
    }
    row.note = override.note ?? null;
    row.updated_at = override.updated_at ?? null;
    row.updated_by = override.updated_by ?? null;
    if (touched && !row.goal_source) row.goal_source = "manual";
    out.set(keyOf(override.brand_id, month), row);
  }
  return out;
}

export const mergedGoalRows = (merged) => [...(merged?.values?.() ?? [])];
export const goalRowFor = (merged, brandId, month) => merged?.get?.(keyOf(brandId, month)) ?? null;

/** ช่องที่ยังไม่มีค่าเลย (ทั้งต้นทางและที่ตั้งเอง) — ใช้บอกว่า "เดือนนี้ยังขาดอะไร" */
export const missingGoalFields = (row) => GOAL_EDIT_FIELDS.filter((field) => row?.[field.key] == null);

/** ช่องที่ตั้งเองไว้และต้นทางเปลี่ยนไปแล้ว — ยังใช้ค่าที่ตั้งเอง แต่ต้องบอกว่าต่างกัน */
export const changedFromSource = (row) => GOAL_EDIT_FIELDS
  .filter((field) => row?.sources?.[field.key] === "manual"
    && row.synced?.[field.key] != null && row.synced[field.key] !== row[field.key])
  .map((field) => ({ key: field.key, label: field.label, value: row[field.key], source: row.synced[field.key] }));

export const goalFieldLabel = (key) => LABEL_OF[key] ?? key;

/** "1,300,000" · "฿90,000.50" · "6.5x" · "12%" → ตัวเลข
    เว้นว่าง → null (ล้างค่า) · พิมพ์ผิด/ติดลบ/เกินพิสัย → undefined (ห้ามบันทึก) */
export function parseGoalInput(text, unit = "money") {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const pct = /%\s*$/.test(raw);
  const cleaned = raw.replace(/[฿,\s]/g, "").replace(/[x×]$/i, "").replace(/%$/, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return undefined;
  if (unit !== "pct") return n;
  const ratio = pct || n > 1 ? n / 100 : n;
  return ratio > 1 ? undefined : ratio;
}
