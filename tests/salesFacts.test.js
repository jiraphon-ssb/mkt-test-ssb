import { describe, it, expect } from "vitest";
import { SALE_BRAND_BY_CODE, SALES_SOURCE_BRANDS, factWindows, factsToDailyRows, funnelCompareRows, goalRowsToSalesGoals, goalSource, goalsFromSales, metricCoverage, realRoasRows, salesRevenueByBrand } from "../src/modules/marketing/ads/salesFacts.js";

/* แถวจาก sale_dashboard_facts ของระบบพี่ทัช (ขอแค่ 7 คอลัมน์) — ดู supabase/functions/_shared/salesBridge.js */
const fact = (kind, patch = {}) => ({ kind, day: "2026-09-10", brand: "TD", channel: "FB", n: 1, amount: 0, is_new: null, ...patch });
const WINDOW = { from: "2026-09-10", to: "2026-09-11" };

describe("แบรนด์และแหล่งข้อมูล", () => {
  it("รหัสแบรนด์ตรงกับที่ระบบขายนิยาม (JD = JK Design, JK = JUNTAKARN)", () => {
    expect(SALE_BRAND_BY_CODE).toEqual({ TD: "b_td", JD: "b_jk", TA: "b_ta", JK: "b_jt" });
  });
  it("ระบบพี่ทัชเป็นแหล่งของ TD · JD · TA เท่านั้น — JK ข้อมูลจริงอยู่อีกโปรเจกต์ ห้ามดึงจากที่นี่ไม่งั้นนับซ้ำ", () => {
    expect(SALES_SOURCE_BRANDS).toEqual(["TD", "JD", "TA"]);
  });
});

describe("factWindows — แบ่งช่วงวันเป็นก้อนเล็ก (PostgREST คืนไม่เกิน 1,000 แถวต่อครั้ง)", () => {
  it("แบ่งต่อเนื่อง ไม่ซ้อน ไม่ขาด · ก้อนสุดท้ายสั้นได้", () => {
    expect(factWindows("2026-09-01", "2026-09-07", 3)).toEqual([
      { from: "2026-09-01", to: "2026-09-03" }, { from: "2026-09-04", to: "2026-09-06" }, { from: "2026-09-07", to: "2026-09-07" },
    ]);
  });
  it("ข้ามเดือนได้ · วันเดียว = ก้อนเดียว", () => {
    expect(factWindows("2026-08-31", "2026-09-01", 3)).toEqual([{ from: "2026-08-31", to: "2026-09-01" }]);
    expect(factWindows("2026-09-01", "2026-09-01", 3)).toEqual([{ from: "2026-09-01", to: "2026-09-01" }]);
  });
  it("ช่วงกลับหัว / วันที่เสีย / ขนาดเพี้ยน = ไม่มีก้อน หรือใช้ขนาด 1", () => {
    expect(factWindows("2026-09-05", "2026-09-01", 3)).toEqual([]);
    expect(factWindows("xx", "2026-09-01", 3)).toEqual([]);
    expect(factWindows("2026-09-01", "2026-09-02", 0)).toHaveLength(2);
  });
});

describe("factsToDailyRows — facts ของระบบขาย → แถว business_daily_facts ต่อวัน×แบรนด์", () => {
  const rows = factsToDailyRows([
    fact("inq", { channel: "FB", n: 30 }), fact("inq", { channel: "Line", n: 12 }),
    fact("lead", { is_new: true }), fact("lead", { is_new: true }), fact("lead", { is_new: false }),
    fact("won", { amount: 25000.5, is_new: true }), fact("won", { amount: 8000, is_new: false }),
    fact("book", { amount: 40000, is_new: true }), fact("book", { amount: 15000.25, is_new: false }),
    fact("pay", { amount: 20000 }), fact("pay", { amount: -3000 }),
    fact("canc", { amount: 9000 }), fact("lost"), fact("nosale"),
  ], WINDOW);
  const td10 = rows.find((r) => r.external_record_id === "TD|2026-09-10");

  it("ครบทุกวัน×แบรนด์ในช่วง แม้วันนั้นไม่มีเหตุการณ์ (ทับค่าเก่าที่ถูกยกเลิกย้อนหลังได้)", () => {
    expect(rows).toHaveLength(2 * 3);
    expect(rows.map((r) => r.external_record_id).sort()).toEqual(["JD|2026-09-10", "JD|2026-09-11", "TA|2026-09-10", "TA|2026-09-11", "TD|2026-09-10", "TD|2026-09-11"]);
  });
  it("คนทัก: รวม + แยกช่องทาง + บอกว่าทีมกรอกวันนั้นหรือยัง", () => {
    expect(td10).toMatchObject({ inquiries: 42, inquiries_by_channel: { FB: 30, Line: 12 }, inquiry_filled: true });
    expect(rows.find((r) => r.external_record_id === "TD|2026-09-11")).toMatchObject({ inquiries: 0, inquiries_by_channel: {}, inquiry_filled: false });
  });
  it("ลีด · ได้ออเดอร์ (เริ่มออกแบบ) · ยืนยันออเดอร์ แยกลูกค้าใหม่", () => {
    expect(td10).toMatchObject({ qualified_leads: 3, leads_new: 2, deposits: 2, deposit_value: 33000.5, orders: 2, orders_new: 1 });
  });
  it("ยอดขาย = ยอดยืนยันออเดอร์ (ไม่หักยกเลิก — ตรงกับที่เป้าของพี่ทัชใช้วัด) · แยกยอดลูกค้าใหม่", () => {
    expect(td10).toMatchObject({ gross_revenue: 55000.25, revenue_new: 40000, refunds: 0 });
  });
  it("เงินเข้าสุทธิ (คืนเงินติดลบแล้ว) · ยกเลิกเก็บแยก", () => {
    expect(td10).toMatchObject({ cash_received: 17000, cancelled: 1, cancelled_value: 9000 });
  });
  it("แถวเป็นรูปที่เขียนลงฐานได้ทันที", () => {
    expect(td10).toMatchObject({ brand_id: "b_td", fact_date: "2026-09-10", source: "crm" });
  });
  it("ไม่รับ: แบรนด์นอกแหล่งนี้ (JK/SF) · วันนอกช่วง · วันที่เสีย · ชนิดที่ไม่รู้จัก · ค่า n เพี้ยน", () => {
    const out = factsToDailyRows([
      fact("book", { brand: "JK", amount: 999 }), fact("book", { brand: "SF", amount: 999 }),
      fact("book", { day: "2026-09-09", amount: 999 }), fact("book", { day: "10/09/2026", amount: 999 }),
      fact("mystery", { n: 5 }), fact("lead", { n: "abc" }), null,
    ], WINDOW);
    expect(out.every((r) => r.gross_revenue === 0 && r.orders === 0)).toBe(true);
    expect(out.some((r) => r.brand_id === "b_jt")).toBe(false);
  });
  it("ชื่อช่องทางต้องเป็นรหัสสั้นๆ (FB/Line) — ข้อความแปลกรวมเป็น other ไม่คัดลอกข้อความอิสระข้ามระบบ", () => {
    const [r] = factsToDailyRows([
      fact("inq", { channel: "FB", n: 3 }), fact("inq", { channel: "คุณสมชาย 081-234-5678", n: 2 }),
      fact("inq", { channel: "", n: 1 }), fact("inq", { channel: "x".repeat(40), n: 1 }),
    ], { from: "2026-09-10", to: "2026-09-10" });
    expect(r.inquiries_by_channel).toEqual({ FB: 3, other: 4 });
    expect(r.inquiries).toBe(7);
  });
  it("funnel แยกช่องทาง: คนทัก → ลีด → ได้ออเดอร์ → ยืนยัน ต่อ FB/Line (ช่องแปลกรวมเป็น other · เงินเข้าไม่มีช่องทาง)", () => {
    const [r] = factsToDailyRows([
      fact("inq", { channel: "FB", n: 30 }), fact("inq", { channel: "Line", n: 10 }),
      fact("lead", { channel: "FB" }), fact("lead", { channel: "FB" }), fact("lead", { channel: "Line" }),
      fact("won", { channel: "FB", amount: 1000 }), fact("book", { channel: "Line", amount: 5000 }),
      fact("lead", { channel: "ชื่อคน" }), fact("pay", { channel: null, amount: 100 }),
    ], { from: "2026-09-10", to: "2026-09-10" });
    expect(r.channel_funnel).toEqual({
      FB: { inquiries: 30, leads: 2, deposits: 1, orders: 0 },
      Line: { inquiries: 10, leads: 1, deposits: 0, orders: 1 },
      other: { inquiries: 0, leads: 1, deposits: 0, orders: 0 },
    });
  });
  it("วันไม่มีเหตุการณ์ = funnel ว่าง {} ไม่ใช่ศูนย์ทุกช่องทาง", () => {
    expect(factsToDailyRows([], { from: "2026-09-10", to: "2026-09-10" })[0].channel_funnel).toEqual({});
  });
  it("ปัดเศษเงินเป็นสตางค์ ไม่สะสมทศนิยมลอย", () => {
    const [r] = factsToDailyRows([fact("pay", { amount: 0.1 }), fact("pay", { amount: 0.2 })], { from: "2026-09-10", to: "2026-09-10" });
    expect(r.cash_received).toBe(0.3);
  });
});

describe("goalRowsToSalesGoals — เป้าจากระบบพี่ทัช → ad_sales_goals", () => {
  const goal = (patch = {}) => ({
    brand: "TD", month: "2026-09-01", version: 1,
    targets: { sales_total: 900000, sales_new: 600000, sales_old: 300000, orders_new: 20, orders_old: 10, design_new: 30, design_old: 12,
               leads_new: 700, leads_old: 50, inquiry: 2400, ad_budget: 90000, cpl: 120, cac: 3000, roas: 10 },
    ads: { platforms: [{ key: "meta", budget: 70000, note: "โน้ต" }, { key: "google", budget: 20000 }] },
    ...patch,
  });
  it("sale_goal: เวอร์ชันล่าสุดต่อแบรนด์×เดือน · รวมใหม่+เก่า · งบรายแพลตฟอร์ม (ไม่เก็บโน้ต)", () => {
    const [row] = goalRowsToSalesGoals({ goals: [goal(), goal({ version: 2, targets: { ...goal().targets, sales_total: 1000000 } })] });
    expect(row).toEqual({
      brand_id: "b_td", month: "2026-09-01", version: 2, goal_source: "sale_goal",
      sales_target: 1000000, sales_new_target: 600000, sales_old_target: 300000,
      orders_target: 30, deposits_target: 42, leads_target: 750, inquiry_target: 2400,
      ad_budget: 90000, cpl: 120, cac: 3000, roas: 10,
      platform_budgets: { meta: 70000, google: 20000 },
      pct_ads_new: null, cpi: null, i2l: null, caps: {}, assumptions: {}, share_new: null, other_cost: null, platform_pct: {},
    });
  });
  it("sale_goal ครบช่อง: %Ads ต่อยอดใหม่ · ต้นทุนต่อทัก · ทัก→Lead · เพดาน · สมมติฐานอัตราแปลง · สัดส่วนลูกค้าใหม่ · ค่าการตลาดอื่น · % แพลตฟอร์ม", () => {
    const [row] = goalRowsToSalesGoals({ goals: [goal({
      targets: { ...goal().targets, pct_ads_new: 0.15, cpi: 38, i2l: 0.12, caps: { cpl: 400, cpi: 42, i2l: 11.4, note: "x" } },
      ads: { split: { meta: 80, google: 20, "Bad Key": 5 }, platforms: [{ key: "meta", budget: 72000, pct: 80 }], other_cost: 15000, other_note: "ถ่ายรูป" },
      inputs: { share_new: 0.6, sales_total: 900000, inq_per_day: 80, assumptions: { aovN: 18000, aovO: 25000, i2l: 0.12, l2dN: 0.3, l2dO: 0.5, d2oN: 0.6, d2oO: 0.8, junk: "abc" } },
    })] });
    expect(row).toMatchObject({
      pct_ads_new: 0.15, cpi: 38, i2l: 0.12, caps: { cpl: 400, cpi: 42, i2l: 11.4 },
      assumptions: { aov_new: 18000, aov_old: 25000, lead_to_deposit_new: 0.3, lead_to_deposit_old: 0.5, deposit_to_order_new: 0.6, deposit_to_order_old: 0.8 },
      share_new: 0.6, other_cost: 15000, platform_pct: { meta: 80, google: 20 },
    });
    expect(JSON.stringify(row)).not.toContain("ถ่ายรูป");
  });
  it("เดือนที่ยังตั้งเป้าแบบเก่า (sale_target) = ใช้แทน · ไม่มีงบแอด/CPL/ROAS · version 0", () => {
    const [row] = goalRowsToSalesGoals({ targets: [
      { month: "2026-09-01", brand: "JD", metric: "sales_new", amount: 400000 }, { month: "2026-09-01", brand: "JD", metric: "sales_old", amount: 100000 },
      { month: "2026-09-01", brand: "JD", metric: "orders", amount: 25 }, { month: "2026-09-01", brand: "JD", metric: "design", amount: 35 },
      { month: "2026-09-01", brand: "JD", metric: "leads", amount: 600 }, { month: "2026-09-01", brand: "JD", metric: "inquiry", amount: 2000 },
    ] });
    expect(row).toEqual({
      brand_id: "b_jk", month: "2026-09-01", version: 0, goal_source: "sale_target",
      sales_target: 500000, sales_new_target: 400000, sales_old_target: 100000,
      orders_target: 25, deposits_target: 35, leads_target: 600, inquiry_target: 2000,
      ad_budget: null, cpl: null, cac: null, roas: null, platform_budgets: {},
      pct_ads_new: null, cpi: null, i2l: null, caps: {}, assumptions: {}, share_new: null, other_cost: null, platform_pct: {},
    });
  });
  it("มีทั้งสองแบบในเดือนเดียวกัน = sale_goal ชนะ (ระบบพี่ทัชก็เลือกแบบนี้)", () => {
    const out = goalRowsToSalesGoals({ goals: [goal()], targets: [{ month: "2026-09-01", brand: "TD", metric: "sales_new", amount: 1 }] });
    expect(out).toHaveLength(1);
    expect(out[0].goal_source).toBe("sale_goal");
  });
  it("ไม่มีค่า = null ไม่ใช่ 0 · ไม่มีทั้งใหม่และเก่า = null", () => {
    const [row] = goalRowsToSalesGoals({ goals: [goal({ targets: { sales_new: 500 }, ads: {} })] });
    expect(row).toMatchObject({ sales_target: 500, sales_old_target: null, orders_target: null, ad_budget: null, platform_budgets: {} });
  });
  it("ข้าม: JK/SF · เดือนเสีย · ชื่อแพลตฟอร์มแปลก · งบไม่ใช่ตัวเลข", () => {
    const out = goalRowsToSalesGoals({ goals: [
      goal({ brand: "JK" }), goal({ brand: "SF" }), goal({ month: "2026-09" }),
      goal({ brand: "TA", ads: { platforms: [{ key: "Meta Ads!", budget: 1 }, { key: "tiktok", budget: "abc" }, { key: "meta", budget: 5 }] } }),
    ] });
    expect(out.map((r) => r.brand_id)).toEqual(["b_ta"]);
    expect(out[0].platform_budgets).toEqual({ meta: 5 });
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

describe("funnel — เทียบคนทักจาก Meta กับข้อมูลระบบขาย", () => {
  it("funnelCompareRows: เทียบคนทักจาก Meta กับที่เข้าระบบขาย · ไม่มีข้างใดข้างหนึ่ง = null ไม่เดา", () => {
    const facts = [{ brand_id: "b_td", fact_date: "2026-09-10", inquiries: 30, qualified_leads: 9, deposits: 4, orders: 2, gross_revenue: 5000, refunds: 0 }];
    const [row] = funnelCompareRows([{ brandId: "b_td", brand: "TEAMDEE", spend: 4500, metaLeads: 50 }], facts, { from: "2026-09-01", to: "2026-09-30" });
    expect(row).toMatchObject({ metaLeads: 50, inquiries: 30, reachedSystem: 0.6, leads: 9, orders: 2, cpl: 500, cac: 2250 });
    const [missing] = funnelCompareRows([{ brandId: "b_jk", brand: "JK Design", spend: 1000, metaLeads: null }], facts, {});
    expect(missing).toMatchObject({ inquiries: null, reachedSystem: null, cpl: null, cac: null });
  });
});

describe("เฟส 3 — เป้าจากระบบขาย", () => {
  it("goalsFromSales: เลือกเวอร์ชันล่าสุดต่อแบรนด์ · แปลงรหัสแบรนด์ · ค่าที่ไม่มี = null", () => {
    const goals = goalsFromSales([
      { brand: "TD", month: "2026-09-01", version: 1, sales_target: 900000, ad_budget: 90000, cpl: 120, cac: 3000, roas: 10, leads_target: 750, orders_target: 30 },
      { brand: "TD", month: "2026-09-01", version: 2, sales_target: 1000000, ad_budget: 95000, cpl: null, cac: null, roas: 10.5, leads_target: 800, orders_target: 32 },
      { brand: "SF", month: "2026-09-01", version: 1, sales_target: 1 },
    ]);
    expect(goals.get("b_td")).toEqual({ month: "2026-09-01", version: 2, salesTarget: 1000000, adBudget: 95000, cpl: null, cac: null, roas: 10.5, leadsTarget: 800, ordersTarget: 32 });
    expect(goals.has("b_ta")).toBe(false);
  });
  it("goalSource: มีเป้าจากระบบขาย = ใช้ของระบบขาย · ไม่มี = ใช้ที่ตั้งในหน้านี้", () => {
    const fromSales = new Map([["b_td", { salesTarget: 1000000, adBudget: 95000, roas: 10.5, cpl: null, cac: null, leadsTarget: 800, ordersTarget: 32, month: "2026-09-01", version: 2 }]]);
    expect(goalSource("b_td", fromSales, { revenue: 500000, budget: 50000 })).toMatchObject({ source: "sales", revenue: 1000000, budget: 95000, roas: 10.5 });
    expect(goalSource("b_jk", fromSales, { revenue: 500000, budget: 50000 })).toMatchObject({ source: "settings", revenue: 500000, budget: 50000 });
    expect(goalSource("b_jk", fromSales, null)).toMatchObject({ source: "none", revenue: null, budget: null });
  });
});

describe("metricCoverage — วันแรกที่แต่ละตัวชี้วัดมีข้อมูล (ก่อนหน้านั้น = ยังไม่มีข้อมูล ไม่ใช่ 0)", () => {
  const day = (brand_id, fact_date, patch = {}) => ({ brand_id, fact_date, inquiries: 0, inquiry_filled: false, qualified_leads: 0, deposits: 0, orders: 0, gross_revenue: 0, ...patch });
  it("ของจริง: ได้ออเดอร์เพิ่งมีตั้งแต่ ก.ย. · คนทักนับจากวันที่ทีมกรอก", () => {
    const out = metricCoverage([
      day("b_td", "2026-08-30", { qualified_leads: 3, orders: 2, gross_revenue: 5000 }),
      day("b_td", "2026-09-01", { deposits: 4, inquiry_filled: true, inquiries: 50 }),
      day("b_td", "2026-08-15", { inquiry_filled: true, inquiries: 0 }),
      day("b_ta", "2026-09-02", { orders: 1, gross_revenue: 100 }),
    ]);
    expect(out.get("b_td")).toEqual({ inquiries: "2026-08-15", qualified_leads: "2026-08-30", deposits: "2026-09-01", orders: "2026-08-30", gross_revenue: "2026-08-30" });
    expect(out.get("b_ta")).toEqual({ inquiries: null, qualified_leads: null, deposits: null, orders: "2026-09-02", gross_revenue: "2026-09-02" });
  });
  it("ไม่มีแถวของแบรนด์นั้น = ไม่มีคีย์", () => {
    expect(metricCoverage([]).has("b_td")).toBe(false);
  });
});
