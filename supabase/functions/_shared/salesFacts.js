/* ยอดขายจริงจากระบบขาย (ssbgroup-platform) → หน้า ads — pure · เทสใน tests/salesFacts.test.js
   นิยามรายได้ = วันจ่ายงวดแรก (revenue_recognized_date) + correction ตามวันที่แก้ — ตรงกับ P&L
   กติกา: ยอดจริงมาถึงระดับ "แบรนด์ × วัน" เท่านั้น แยกรายโฆษณาไม่ได้ · ไม่มีข้อมูล = null ไม่ใช่ 0 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** รหัสแบรนด์ฝั่งระบบขาย → brand id ฝั่ง marketing (ดู orgConfig ของ ssbgroup-platform: JD = JK Design, JK = JUNTAKARN) */
export const SALE_BRAND_BY_CODE = { TD: "b_td", JD: "b_jk", TA: "b_ta", JK: "b_jt" };   // SF (SAIFAH) ยังไม่มีในระบบ ads

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** แถวจาก mkt_revenue_daily → แถวของ business_daily_facts (พร้อม upsert ทับด้วย external_record_id) */
export function salesRowsToFacts(rows = []) {
  const byKey = new Map();
  for (const row of rows ?? []) {
    const brandId = SALE_BRAND_BY_CODE[row?.brand];
    const day = typeof row?.day === "string" && ISO.test(row.day) ? row.day : null;
    const revenue = num(row?.revenue);
    if (!brandId || !day || revenue === null) continue;
    byKey.set(`${row.brand}|${day}`, {
      brand_id: brandId,
      fact_date: day,
      source: "crm",
      external_record_id: `${row.brand}|${day}`,
      // ยอดรวมของวันติดลบได้เมื่อยกเลิกออเดอร์ย้อนหลัง — เก็บเป็นคืนเงิน ไม่ให้รายได้ติดลบ
      orders: Math.max(0, Math.trunc(num(row?.orders) ?? 0)),
      gross_revenue: revenue > 0 ? revenue : 0,
      refunds: revenue < 0 ? Math.abs(revenue) : 0,
      inquiries: 0,
      qualified_leads: 0,
      deposits: 0,
    });
  }
  return [...byKey.values()];
}

/** รวมยอดจริงต่อแบรนด์ในช่วงที่หน้าจอกำลังดู — แบรนด์ที่ไม่มีข้อมูลจะไม่มีคีย์ (ไม่ใช่ 0) */
export function salesRevenueByBrand(facts = [], { from, to } = {}) {
  const out = new Map();
  for (const fact of facts ?? []) {
    const day = fact?.fact_date ?? fact?.factDate;
    if (typeof day !== "string" || !ISO.test(day)) continue;
    if ((from && day < from) || (to && day > to)) continue;
    const brandId = fact.brand_id ?? fact.brandId;
    if (!brandId) continue;
    const current = out.get(brandId) ?? { revenue: 0, orders: 0, days: 0 };
    current.revenue += (num(fact.gross_revenue ?? fact.grossRevenue) ?? 0) - (num(fact.refunds) ?? 0);
    current.orders += Math.trunc(num(fact.orders) ?? 0);
    current.days += 1;
    out.set(brandId, current);
  }
  return out;
}

/** ผูกค่าแอดของแบรนด์กับยอดขายจริง → ROAS · AOV · CAC (ขาดข้างใดข้างหนึ่ง = null) */
export function realRoasRows(brandSpend = [], salesByBrand = new Map()) {
  return (brandSpend ?? []).map((entry) => {
    const sales = salesByBrand.get(entry.brandId) ?? null;
    const spend = num(entry.spend);
    const revenue = sales ? sales.revenue : null;
    const orders = sales ? sales.orders : null;
    const usable = spend !== null && spend > 0;
    return {
      ...entry,
      spend,
      revenue,
      orders,
      roas: usable && revenue !== null ? revenue / spend : null,
      aov: orders ? revenue / orders : null,
      cac: usable && orders ? spend / orders : null,
      hasSales: Boolean(sales),
    };
  });
}

/* ── เฟส 2: funnel จากระบบขาย (mkt_funnel_daily) ─────────────────────────── */

/** แถวจาก mkt_funnel_daily → แถวของ business_daily_facts (จำนวนล้วน ไม่มียอดเงิน) */
export function funnelRowsToFacts(rows = []) {
  const byKey = new Map();
  for (const row of rows ?? []) {
    const brandId = SALE_BRAND_BY_CODE[row?.brand];
    const day = typeof row?.day === "string" && ISO.test(row.day) ? row.day : null;
    if (!brandId || !day) continue;
    const int = (value) => Math.max(0, Math.trunc(num(value) ?? 0));
    byKey.set(`${row.brand}|${day}`, {
      brand_id: brandId, fact_date: day, source: "crm", external_record_id: `${row.brand}|${day}`,
      inquiries: int(row.inquiries), qualified_leads: int(row.leads), deposits: int(row.deposits), orders: int(row.orders),
    });
  }
  return [...byKey.values()];
}

/** รวมแถวรายได้กับแถว funnel ของวันเดียวกันให้เป็นแถวเดียวก่อนเขียนลงฐาน (upsert ทับทั้งแถว) */
export function mergeDailyFacts(revenueFacts = [], funnelFacts = []) {
  const base = { source: "crm", inquiries: 0, qualified_leads: 0, deposits: 0, orders: 0, gross_revenue: 0, refunds: 0 };
  const byKey = new Map();
  for (const fact of [...(revenueFacts ?? []), ...(funnelFacts ?? [])]) {
    if (!fact?.external_record_id) continue;
    byKey.set(fact.external_record_id, { ...base, ...(byKey.get(fact.external_record_id) ?? {}), ...fact });
  }
  return [...byKey.values()];
}

/** เทียบ funnel: คนทักที่ Meta นับ กับคนที่เข้าระบบขายจริง — ขาดข้างใดข้างหนึ่ง = null ไม่เดาแทน */
export function funnelCompareRows(brands = [], facts = [], range = {}) {
  const byBrand = new Map();
  for (const fact of facts ?? []) {
    const day = fact?.fact_date ?? fact?.factDate;
    if (typeof day !== "string" || !ISO.test(day)) continue;
    if ((range.from && day < range.from) || (range.to && day > range.to)) continue;
    const brandId = fact.brand_id ?? fact.brandId;
    if (!brandId) continue;
    const current = byBrand.get(brandId) ?? { inquiries: 0, leads: 0, deposits: 0, orders: 0, revenue: 0 };
    current.inquiries += Math.trunc(num(fact.inquiries) ?? 0);
    current.leads += Math.trunc(num(fact.qualified_leads ?? fact.qualifiedLeads) ?? 0);
    current.deposits += Math.trunc(num(fact.deposits) ?? 0);
    current.orders += Math.trunc(num(fact.orders) ?? 0);
    current.revenue += (num(fact.gross_revenue ?? fact.grossRevenue) ?? 0) - (num(fact.refunds) ?? 0);
    byBrand.set(brandId, current);
  }
  return (brands ?? []).map((entry) => {
    const crm = byBrand.get(entry.brandId) ?? null;
    const spend = num(entry.spend);
    const metaLeads = num(entry.metaLeads);
    return {
      ...entry,
      metaLeads,
      inquiries: crm ? crm.inquiries : null,
      leads: crm ? crm.leads : null,
      deposits: crm ? crm.deposits : null,
      orders: crm ? crm.orders : null,
      revenue: crm ? crm.revenue : null,
      reachedSystem: crm && metaLeads ? crm.inquiries / metaLeads : null,      // คนทักที่ Meta นับ → เข้าระบบขายกี่ %
      cpl: spend && crm?.leads ? spend / crm.leads : null,                     // ค่าต่อ "ลีดจริง" ไม่ใช่ลีดที่ Meta นับ
      cac: spend && crm?.orders ? spend / crm.orders : null,
    };
  });
}

/* ── เฟส 3: เป้าจากระบบขาย (mkt_goal_current) ────────────────────────────── */

/** แถวเป้าจากระบบขาย → Map brandId → เป้าเวอร์ชันล่าสุด */
export function goalsFromSales(rows = []) {
  const out = new Map();
  for (const row of rows ?? []) {
    const brandId = SALE_BRAND_BY_CODE[row?.brand];
    if (!brandId) continue;
    const version = Math.trunc(num(row.version) ?? 0);
    if ((out.get(brandId)?.version ?? -1) > version) continue;
    out.set(brandId, {
      month: typeof row.month === "string" ? row.month.slice(0, 10) : null,
      version,
      salesTarget: num(row.sales_target ?? row.salesTarget),
      adBudget: num(row.ad_budget ?? row.adBudget),
      cpl: num(row.cpl),
      cac: num(row.cac),
      roas: num(row.roas),
      leadsTarget: num(row.leads_target ?? row.leadsTarget),
      ordersTarget: num(row.orders_target ?? row.ordersTarget),
    });
  }
  return out;
}

/** เป้าที่จะใช้แสดง: ระบบขายมาก่อนเสมอ · ไม่มีก็ใช้ที่ตั้งในหน้านี้ · ไม่มีทั้งคู่ = ไม่มีเป้า (ไม่ใช่ 0) */
export function goalSource(brandId, salesGoals = new Map(), settingsGoal = null) {
  const goal = salesGoals?.get?.(brandId) ?? null;
  if (goal) {
    return {
      source: "sales", month: goal.month, version: goal.version,
      revenue: goal.salesTarget, budget: goal.adBudget, roas: goal.roas, cpl: goal.cpl, cac: goal.cac,
      leads: goal.leadsTarget, orders: goal.ordersTarget,
    };
  }
  if (settingsGoal && (settingsGoal.revenue != null || settingsGoal.budget != null)) {
    return { source: "settings", month: null, version: null, revenue: settingsGoal.revenue ?? null, budget: settingsGoal.budget ?? null, roas: settingsGoal.roas ?? null, cpl: settingsGoal.cpl ?? null, cac: null, leads: settingsGoal.leads ?? null, orders: null };
  }
  return { source: "none", month: null, version: null, revenue: null, budget: null, roas: null, cpl: null, cac: null, leads: null, orders: null };
}
