import { describe, it, expect } from "vitest";
import { SALE_BRAND_BY_CODE, salesRowsToFacts, salesRevenueByBrand, realRoasRows } from "../src/modules/marketing/ads/salesFacts.js";

const row = (patch = {}) => ({ brand: "TD", day: "2026-09-10", revenue: "12000.50", orders: 3, ...patch });

describe("salesRowsToFacts — แถวจากระบบขาย → business_daily_facts", () => {
  it("แปลงรหัสแบรนด์ · id ซ้ำวันเดิมไม่บวกเพิ่ม (ทับด้วย external_record_id)", () => {
    expect(salesRowsToFacts([row()])).toEqual([{
      brand_id: "b_td", fact_date: "2026-09-10", source: "crm", external_record_id: "TD|2026-09-10",
      orders: 3, gross_revenue: 12000.5, refunds: 0, inquiries: 0, qualified_leads: 0, deposits: 0,
    }]);
  });
  it("ยอดติดลบ (ยกเลิกออเดอร์ทั้งวัน) เก็บเป็น refunds ไม่ใช่รายได้ติดลบ", () => {
    const [fact] = salesRowsToFacts([row({ revenue: -4500, orders: 0 })]);
    expect(fact).toMatchObject({ gross_revenue: 0, refunds: 4500, orders: 0 });
  });
  it("แบรนด์ที่ยังไม่มีในระบบ ads (SF) และแถวเสีย = ข้าม ไม่ทำให้ทั้งชุดล้ม", () => {
    expect(salesRowsToFacts([row({ brand: "SF" }), row({ brand: "XX" }), { brand: "TD" }, null, row({ day: "10/09/2026" })])).toEqual([]);
  });
  it("วันซ้ำในชุดเดียวกัน = เอาแถวหลังสุด (ระบบขายส่งซ้ำก็ไม่เพี้ยน)", () => {
    const facts = salesRowsToFacts([row({ revenue: 100 }), row({ revenue: 250 })]);
    expect(facts).toHaveLength(1);
    expect(facts[0].gross_revenue).toBe(250);
  });
  it("รหัสแบรนด์ตรงกับที่ระบบขายนิยาม (JD = JK Design, JK = JUNTAKARN)", () => {
    expect(SALE_BRAND_BY_CODE).toEqual({ TD: "b_td", JD: "b_jk", TA: "b_ta", JK: "b_jt" });
  });
});

describe("salesRevenueByBrand — รวมยอดจริงตามช่วงที่ดูอยู่", () => {
  const facts = [
    { brand_id: "b_td", fact_date: "2026-09-10", gross_revenue: 12000, refunds: 0, orders: 3 },
    { brand_id: "b_td", fact_date: "2026-09-11", gross_revenue: 8000, refunds: 1000, orders: 2 },
    { brand_id: "b_jk", fact_date: "2026-09-11", gross_revenue: 5000, refunds: 0, orders: 1 },
  ];
  it("รวมเฉพาะวันในช่วง · หักคืนเงิน · นับออเดอร์", () => {
    const out = salesRevenueByBrand(facts, { from: "2026-09-10", to: "2026-09-11" });
    expect(out.get("b_td")).toEqual({ revenue: 19000, orders: 5, days: 2 });
    expect(out.get("b_jk")).toEqual({ revenue: 5000, orders: 1, days: 1 });
  });
  it("นอกช่วง = ไม่นับ · ไม่มีข้อมูลเลย = ไม่มีคีย์ (ไม่ใช่ 0)", () => {
    const out = salesRevenueByBrand(facts, { from: "2026-09-12", to: "2026-09-13" });
    expect(out.size).toBe(0);
  });
});

describe("realRoasRows — ROAS จากยอดขายจริง", () => {
  const sales = new Map([["b_td", { revenue: 19000, orders: 5, days: 2 }]]);
  it("มีทั้งค่าแอดและยอดจริง = คิด ROAS · AOV · CAC", () => {
    const [row] = realRoasRows([{ brandId: "b_td", brand: "TEAMDEE", spend: 9500 }], sales);
    expect(row).toEqual({ brandId: "b_td", brand: "TEAMDEE", spend: 9500, revenue: 19000, orders: 5, roas: 2, aov: 3800, cac: 1900, hasSales: true });
  });
  it("แบรนด์ที่ยังไม่มียอดจริง = null ทุกช่อง ไม่ใช่ 0 (แยกจาก 'ขายไม่ได้เลย' ไม่ออกจึงห้ามเดา)", () => {
    const [row] = realRoasRows([{ brandId: "b_jt", brand: "JUNTAKARN", spend: 4000 }], sales);
    expect(row).toMatchObject({ revenue: null, orders: null, roas: null, aov: null, cac: null, hasSales: false });
  });
  it("ค่าแอด 0 หรือไม่มี = ROAS/CAC เป็น null (หารศูนย์ไม่ได้)", () => {
    const rows = realRoasRows([{ brandId: "b_td", brand: "TEAMDEE", spend: 0 }, { brandId: "b_td", brand: "TEAMDEE", spend: null }], sales);
    expect(rows.map((r) => r.roas)).toEqual([null, null]);
    expect(rows[0].revenue).toBe(19000);
  });
});
