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
