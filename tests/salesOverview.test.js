/* Overview ใช้ยอดจริงและเป้าจากระบบขาย (pure) — ค่าแอดยังเป็นของ Meta · ไม่มีข้อมูล = null พร้อมเหตุผล */
import { describe, it, expect } from "vitest";
import {
  goalTargetsByBrand, combineGoalTargets, plansFromSalesGoals, salesFactsByBrand, applySalesToBrands, applySalesToSummary, salesPipeline, campaignSalesSummary, salesTrendValue,
} from "../src/modules/marketing/ads/salesOverview.js";

const goal = (brand_id, patch = {}) => ({ brand_id, month: "2026-09-01", version: 2, goal_source: "sale_goal", sales_target: 1000000, sales_new_target: 600000, ad_budget: 100000,
  platform_budgets: { meta: 80000, google: 20000 }, platform_pct: { meta: 80, google: 20 }, roas: 6, pct_ads_new: 0.16, cpl: 400, caps: { cpl: 420 }, cac: 5000,
  inquiry_target: 2000, leads_target: 300, deposits_target: 120, orders_target: 60, ...patch });
const legacy = (brand_id) => ({ brand_id, month: "2026-09-01", version: 0, goal_source: "sale_target", sales_target: 3300000, sales_new_target: 2000000, ad_budget: null, platform_budgets: {}, platform_pct: {}, roas: null, pct_ads_new: null, cpl: null, caps: {}, inquiry_target: 1173, leads_target: 344, deposits_target: 206, orders_target: 193 });

describe("goalTargetsByBrand — เป้าระบบขาย → เป้าที่เส้นเทียบเป้าใช้", () => {
  it("หน้าเป้าหมายแบบใหม่: ROAS · %Ads ต่อยอดใหม่ · CPL ใช้เพดานก่อน · จำนวน funnel", () => {
    expect(goalTargetsByBrand([goal("b_td")], "2026-09-01").get("b_td")).toEqual({ roas: 6, pctAds: 0.16, cpl: 420, inquiries: 2000, qualified: 300, deposits: 120, closed: 60 });
  });
  it("เป้าแบบเก่า: อัตราส่วนยังไม่ตั้ง (null) · จำนวนมีครบ · เดือนอื่นไม่เอา", () => {
    expect(goalTargetsByBrand([legacy("b_ta")], "2026-09-01").get("b_ta")).toEqual({ roas: null, pctAds: null, cpl: null, inquiries: 1173, qualified: 344, deposits: 206, closed: 193 });
    expect(goalTargetsByBrand([legacy("b_ta")], "2026-08-01").has("b_ta")).toBe(false);
  });
});

describe("combineGoalTargets — เป้าภาพรวม", () => {
  it("จำนวนรวมกัน · อัตราส่วนถ่วงน้ำหนัก · แบรนด์ไหนไม่มี = ภาพรวมตัวนั้น null", () => {
    const a = { roas: 6, pctAds: 0.1, cpl: 400, inquiries: 1000, qualified: 100, deposits: 50, closed: 20 };
    const b = { roas: 4, pctAds: 0.2, cpl: 200, inquiries: 3000, qualified: 300, deposits: 150, closed: 60 };
    const out = combineGoalTargets([{ targets: a, weights: { budget: 100, revenue: 100, inquiries: 1000 } }, { targets: b, weights: { budget: 300, revenue: 300, inquiries: 3000 } }]);
    expect(out).toMatchObject({ inquiries: 4000, qualified: 400, deposits: 200, closed: 80 });
    expect(out.roas).toBeCloseTo(4.5); expect(out.pctAds).toBeCloseTo(0.175); expect(out.cpl).toBeCloseTo(250);
    expect(combineGoalTargets([{ targets: a, weights: {} }, { targets: { ...b, roas: null }, weights: {} }]).roas).toBe(null);
    expect(combineGoalTargets([])).toMatchObject({ roas: null, inquiries: null });
  });
});

describe("plansFromSalesGoals — งบ Meta จริงจากเป้า (ไม่หารเฉลี่ย) · เป้ายอดตามฐานที่เลือก", () => {
  it("งบ Meta = งบแพลตฟอร์ม meta ในเป้า · เป้ายอดรวม/ยอดใหม่ตามฐาน", () => {
    const total = plansFromSalesGoals({ goals: [goal("b_td")], month: "2026-09", basis: "total" });
    expect(total.adBudgets).toEqual([{ brand_id: "b_td", channel: "Meta Ads", month: "2026-09", amount: 80000 }]);
    expect(total.salesTargets).toEqual([{ brand_id: "b_td", month: "2026-09", amount: 1000000 }]);
    expect(plansFromSalesGoals({ goals: [goal("b_td")], month: "2026-09", basis: "new" }).salesTargets[0].amount).toBe(600000);
  });
  it("ไม่มีงบรายแพลตฟอร์ม แต่มีงบรวม + % = คิดจาก % · ไม่มีทั้งคู่ = ไม่มีงบ (ยังไม่ตั้งเป้า)", () => {
    expect(plansFromSalesGoals({ goals: [goal("b_td", { platform_budgets: {} })], month: "2026-09" }).adBudgets[0].amount).toBe(80000);
    expect(plansFromSalesGoals({ goals: [legacy("b_ta")], month: "2026-09" }).adBudgets).toEqual([]);
  });
});

const fact = (brand_id, fact_date, patch = {}) => ({ brand_id, fact_date, inquiries: 0, inquiry_filled: false, qualified_leads: 0, leads_new: 0, deposits: 0, orders: 0, orders_new: 0, gross_revenue: 0, revenue_new: 0, cash_received: 0, ...patch });

describe("salesFactsByBrand", () => {
  it("รวมเฉพาะวันในช่วง · นับวันที่ทีมกรอกคนทัก · ไม่มีแถวของแบรนด์ = ไม่มีคีย์ (ไม่ใช่ 0)", () => {
    const out = salesFactsByBrand([
      fact("b_td", "2026-09-01", { gross_revenue: 1000, revenue_new: 600, orders: 2, orders_new: 1, qualified_leads: 10, inquiries: 50, inquiry_filled: true, deposits: 3 }),
      fact("b_td", "2026-09-02", { gross_revenue: 500, orders: 1, qualified_leads: 5 }),
      fact("b_td", "2026-08-31", { gross_revenue: 99999 }),
    ], { from: "2026-09-01", to: "2026-09-02" });
    expect(out.get("b_td")).toMatchObject({ revenue: 1500, revenueNew: 600, orders: 3, ordersNew: 1, leads: 15, inquiries: 50, inquiryFilledDays: 1, days: 2, deposits: 3 });
    expect(out.has("b_ta")).toBe(false);
  });
  it("วันนี้ที่ทีมยังไม่กรอก ไม่นับเป็นวันในตัวหาร (ทีมกรอก 45/48 ไม่ใช่ 45/51) · กรอกแล้วนับตามปกติ", () => {
    const rows = [fact("b_td", "2026-09-16", { inquiry_filled: true }), fact("b_td", "2026-09-17", { inquiry_filled: false })];
    expect(salesFactsByBrand(rows, { from: "2026-09-16", to: "2026-09-17", today: "2026-09-17" }).get("b_td")).toMatchObject({ inquiryFilledDays: 1, days: 1 });
    const filledToday = [fact("b_td", "2026-09-17", { inquiry_filled: true })];
    expect(salesFactsByBrand(filledToday, { from: "2026-09-17", to: "2026-09-17", today: "2026-09-17" }).get("b_td")).toMatchObject({ inquiryFilledDays: 1, days: 1 });
  });
});

describe("applySalesToBrands — ทับตัวเลขระดับแบรนด์ด้วยยอดจริง", () => {
  const row = (id, patch = {}) => ({ id, name: id, spend: 10000, revenue: 55555, revTarget: 1000000, pace: { expected: 0.5 }, channels: [], ...patch });
  const sales = new Map([["b_td", { revenue: 400000, revenueNew: 200000, orders: 20, ordersNew: 10, leads: 50 }]]);
  const prev = new Map([["b_td", { revenue: 320000, revenueNew: 100000 }]]);
  it("ยอด ROAS %Ads(ต่อยอดใหม่) CPL CAC จากยอดจริง · จังหวะเทียบเป้า", () => {
    const [td] = applySalesToBrands([row("b_td")], { sales, prevSales: prev, basis: "total", sourceBrandIds: ["b_td"] });
    expect(td).toMatchObject({ salesSource: "sales", revenue: 400000, prevRevenue: 320000, revPct: 0.4, roas: 40, roasNew: 20, pctAds: 0.05, cpl: 200, cac: 1000 });
    expect(td.revChangePct).toBeCloseTo(25);
    expect(td.revPace.expectedToDate).toBe(500000);
  });
  it("ฐานยอดใหม่ = ใช้ยอดลูกค้าใหม่เป็นยอดหลัก", () => {
    const [td] = applySalesToBrands([row("b_td")], { sales, prevSales: prev, basis: "new", sourceBrandIds: ["b_td"] });
    expect(td).toMatchObject({ revenue: 200000, prevRevenue: 100000, roas: 20 });
  });
  it("แบรนด์ที่ยังไม่มีแหล่ง = waiting · มีแหล่งแต่ไม่มีข้อมูลช่วงนี้ = none · ยอด Meta attribute ไม่หลงเหลือ", () => {
    const [jk, ta] = applySalesToBrands([row("b_jt"), row("b_ta")], { sales, prevSales: prev, basis: "total", sourceBrandIds: ["b_td", "b_ta"] });
    expect(jk).toMatchObject({ salesSource: "waiting", revenue: null, roas: null, pctAds: null, revPct: null });
    expect(ta).toMatchObject({ salesSource: "none", revenue: null });
  });
});

describe("applySalesToSummary — ภาพรวมรวมเฉพาะแบรนด์ที่มีข้อมูล และบอกว่าไม่รวมใคร", () => {
  it("ยอด/เป้า/งบรวมเฉพาะแบรนด์ที่มี · excluded บอกชื่อ", () => {
    const rows = [
      { id: "b_td", name: "TEAMDEE", salesSource: "sales", revenue: 400000, prevRevenue: 300000, revTarget: 1000000, spend: 10000, budget: 80000 },
      { id: "b_jt", name: "JUNTAKARN", salesSource: "waiting", revenue: null, prevRevenue: null, revTarget: null, spend: 5000, budget: null },
    ];
    const out = applySalesToSummary({ spend: 15000, revenue: null, revTarget: null, budget: null }, rows, "2026-09-15");
    expect(out).toMatchObject({ revenue: 400000, revTarget: 1000000, budget: 80000, spend: 15000, excluded: ["JUNTAKARN"] });
    expect(out.revPct).toBe(0.4);
    expect(out.revPace.expectedSpend).toBe(500000);
    // กล่องงบ Meta: ค่าแอดทุกแบรนด์ (อาร์ตยืนยัน 17 ก.ย.) · งบคงเหลือ/เฉลี่ย/คาดใช้ คิดจากยอดเดียวกับตัวเลขหัวกล่อง
    expect(out.budgetSpend).toBeUndefined();
    expect(out.pace.remaining).toBe(65000);   // 80,000 − 15,000 (ไม่ใช่ − 10,000)
  });

  it("%Ads ภาพรวม = ค่าแอดของแบรนด์ที่มียอด ÷ ยอดลูกค้าใหม่รวม (ไม่เอาค่าแอดแบรนด์รอเชื่อม และไม่หารยอดรวม)", () => {
    const rows = [
      { id: "b_td", name: "TEAMDEE", salesSource: "sales", revenue: 400000, revenueNew: 100000, spend: 10000 },
      { id: "b_jt", name: "JUNTAKARN", salesSource: "waiting", revenue: null, revenueNew: null, spend: 5000 },
    ];
    expect(applySalesToSummary({ spend: 15000 }, rows, "2026-09-15").pctAds).toBeCloseTo(0.1);
  });

  it("แยกเหตุผลที่ไม่รวม: รอเชื่อมแหล่ง กับ ช่วงนี้ไม่มีข้อมูล (กันข้อความ 'รอเชื่อม' ผิดตอนข้อมูลยังโหลดไม่เสร็จ)", () => {
    const rows = [
      { id: "b_td", name: "TEAMDEE", salesSource: "none", revenue: null, spend: 0 },
      { id: "b_jt", name: "JUNTAKARN", salesSource: "waiting", revenue: null, spend: 0 },
    ];
    const out = applySalesToSummary({}, rows, "2026-09-15");
    expect(out).toMatchObject({ revenue: null, excludedWaiting: ["JUNTAKARN"], excludedNoData: ["TEAMDEE"] });
  });
});

describe("salesPipeline — funnel จริง + คนทักคู่กัน + เหตุผลเมื่อไม่มีข้อมูล", () => {
  const sales = { inquiries: 400, inquiryFilledDays: 5, days: 7, leads: 60, deposits: 20, orders: 10, revenue: 300000, revenueNew: 150000, ordersNew: 5 };
  it("4 ขั้น + อัตราแปลง + คอขวด · คนทักบอกทั้งทีมกรอกและจาก Meta", () => {
    const p = salesPipeline({ sales, metaInquiries: 520, spend: 30000, basis: "total", depositsSince: "2026-09-01", from: "2026-09-10" });
    const byKey = Object.fromEntries(p.items.map((it) => [it.key, it]));
    expect(byKey.inquiries).toMatchObject({ value: 400, label: "คนทัก (ทีมกรอก)" });
    expect(byKey.inquiries.sub).toContain("จากแอด Meta 520");
    expect(byKey.inquiries.sub).toContain("ทีมกรอก 5/7 วัน");
    expect(byKey.qualified).toMatchObject({ value: 60, conv: 0.15 });
    expect(byKey.deposits.conv).toBeCloseTo(1 / 3);
    expect(byKey.closed).toMatchObject({ value: 10, conv: 0.5 });
    expect(p.worstKey).toBe("qualified");
    expect(byKey.roas.value).toBe(10);
    expect(byKey.pctAds.value).toBeCloseTo(0.2);
    expect(byKey.cpl.value).toBe(500);
    expect(p.estimated).toBe(false);
  });
  it("ทีมไม่กรอกคนทักเลย = null + ทีมยังไม่กรอก (ไม่ใช่ 0) · อัตราแปลงลีดคิดไม่ได้", () => {
    const p = salesPipeline({ sales: { ...sales, inquiries: 0, inquiryFilledDays: 0 }, metaInquiries: 520, spend: 30000, depositsSince: "2026-09-01", from: "2026-09-10" });
    const inq = p.items.find((it) => it.key === "inquiries");
    expect(inq.value).toBe(null);
    expect(inq.sub).toContain("ทีมยังไม่กรอก");
    expect(p.items.find((it) => it.key === "qualified").conv).toBe(null);
  });
  it("ช่วงก่อนวันแรกที่มีข้อมูลได้ออเดอร์ = null + ยังไม่มีข้อมูล", () => {
    const p = salesPipeline({ sales, metaInquiries: 520, spend: 30000, depositsSince: "2026-09-01", from: "2026-08-01", to: "2026-08-31" });
    const dep = p.items.find((it) => it.key === "deposits");
    expect(dep.value).toBe(null);
    expect(dep.sub).toContain("ยังไม่มีข้อมูล");
  });
  it("ไม่มียอดขายเลย (แบรนด์รอเชื่อม) = ทุกขั้น null พร้อมเหตุผล", () => {
    const p = salesPipeline({ sales: null, metaInquiries: 100, spend: 5000, waiting: true });
    expect(p.items.filter((it) => ["qualified", "deposits", "closed", "roas"].includes(it.key)).every((it) => it.value === null)).toBe(true);
    expect(p.items.find((it) => it.key === "qualified").sub).toContain("รอเชื่อมแหล่งข้อมูล");
  });
});

describe("campaignSalesSummary — แถบยอดจริงบนหน้าแคมเปญ", () => {
  const sales = [
    { brand_id: "b_td", fact_date: "2026-09-01", gross_revenue: 60000, revenue_new: 40000, orders: 3 },
    { brand_id: "b_ta", fact_date: "2026-09-02", gross_revenue: 20000, revenue_new: 20000, orders: 1 },
    { brand_id: "b_td", fact_date: "2026-08-31", gross_revenue: 999999, revenue_new: 0, orders: 9 },
  ];
  const spendByBrand = { b_td: 10000, b_ta: 5000, b_jt: 7000 };
  const names = { b_td: "TEAMDEE", b_ta: "t around", b_jt: "JUNTAKARN" };

  it("รวมเฉพาะแบรนด์ที่มียอด · ROAS/%Ads หารค่าแอดของแบรนด์นั้นเท่านั้น · บอกแบรนด์ที่ไม่รวม", () => {
    const out = campaignSalesSummary({ sales, brandIds: ["b_td", "b_ta", "b_jt"], spendByBrand, names, from: "2026-09-01", to: "2026-09-17", sourceBrandIds: ["b_td", "b_ta", "b_jk"] });
    expect(out).toMatchObject({ revenue: 80000, revenueNew: 60000, orders: 4, spend: 15000, excludedWaiting: ["JUNTAKARN"], excludedNoData: [] });
    expect(out.roas).toBeCloseTo(80000 / 15000);
    expect(out.pctAds).toBeCloseTo(15000 / 60000);
  });

  it("basis new = การ์ดใช้ยอดลูกค้าใหม่ · ROAS คิดจากยอดใหม่ (ปุ่มยอดใหม่/ยอดรวมในหน้าแคมเปญต้องมีผล)", () => {
    const out = campaignSalesSummary({ sales, brandIds: ["b_td", "b_ta", "b_jt"], spendByBrand, names, from: "2026-09-01", to: "2026-09-17", sourceBrandIds: ["b_td", "b_ta", "b_jk"], basis: "new" });
    expect(out).toMatchObject({ basis: "new", revenue: 60000, revenueTotal: 80000, revenueNew: 60000 });
    expect(out.roas).toBeCloseTo(60000 / 15000);
    expect(out.pctAds).toBeCloseTo(15000 / 60000);
  });

  it("แบรนด์ที่เลือกยังไม่มีแหล่ง = revenue null + waiting (ไม่ขึ้น ฿0)", () => {
    const out = campaignSalesSummary({ sales, brandIds: ["b_jt"], spendByBrand, names, from: "2026-09-01", to: "2026-09-17", sourceBrandIds: ["b_td", "b_ta", "b_jk"] });
    expect(out).toMatchObject({ revenue: null, roas: null, pctAds: null, excludedWaiting: ["JUNTAKARN"] });
  });

  it("มีแหล่งแต่ช่วงนี้ไม่มีแถว = excludedNoData", () => {
    const out = campaignSalesSummary({ sales, brandIds: ["b_jk"], spendByBrand, names: { b_jk: "JK Design" }, from: "2026-09-01", to: "2026-09-17", sourceBrandIds: ["b_td", "b_ta", "b_jk"] });
    expect(out).toMatchObject({ revenue: null, excludedNoData: ["JK Design"] });
  });
});

describe("salesTrendValue — กราฟแนวโน้มใช้ตัวเลขชุดเดียวกับด้านบน (ระบบขาย)", () => {
  const sales = [
    { brand_id: "b_td", fact_date: "2026-09-01", gross_revenue: 50000, revenue_new: 20000, inquiries: 30, inquiry_filled: true, qualified_leads: 10 },
    { brand_id: "b_ta", fact_date: "2026-09-01", gross_revenue: 10000, revenue_new: 10000, inquiries: 0, inquiry_filled: false, qualified_leads: 5 },
    { brand_id: "b_td", fact_date: "2026-09-02", gross_revenue: 0, revenue_new: 0, inquiries: 0, inquiry_filled: false, qualified_leads: 0 },
  ];
  const day1 = { from: "2026-09-01", to: "2026-09-01" };
  const both = ["b_td", "b_ta"];

  it("ยอดขาย: รวมแบรนด์ที่มีแหล่ง · ยอดใหม่ใช้ revenue_new", () => {
    expect(salesTrendValue({ sales, key: "revenue", brandIds: both, ...day1 })).toBe(60000);
    expect(salesTrendValue({ sales, key: "revenue", brandIds: both, basis: "new", ...day1 })).toBe(30000);
  });

  it("ROAS = ยอดขาย ÷ ค่าแอด · CPL = ค่าแอด ÷ Lead ในระบบขาย · ค่าแอด 0 = null", () => {
    expect(salesTrendValue({ sales, key: "roas", brandIds: both, spend: 6000, ...day1 })).toBe(10);
    expect(salesTrendValue({ sales, key: "cpl", brandIds: both, spend: 6000, ...day1 })).toBe(400);
    expect(salesTrendValue({ sales, key: "roas", brandIds: both, spend: 0, ...day1 })).toBeNull();
  });

  it("คนทัก: นับเฉพาะแบรนด์/วันที่ทีมกรอก · ไม่มีใครกรอก = null ไม่ใช่ 0", () => {
    expect(salesTrendValue({ sales, key: "inquiry", brandIds: both, ...day1 })).toBe(30);
    expect(salesTrendValue({ sales, key: "inquiry", brandIds: ["b_td"], from: "2026-09-02", to: "2026-09-02" })).toBeNull();
  });

  it("วันที่ยังไม่มีแถว (เช่น วันนี้ยังไม่ sync) หรือไม่มีแบรนด์ที่มีแหล่ง = null", () => {
    expect(salesTrendValue({ sales, key: "revenue", brandIds: both, from: "2026-09-03", to: "2026-09-03" })).toBeNull();
    expect(salesTrendValue({ sales, key: "revenue", brandIds: [], ...day1 })).toBeNull();
  });

  it("Lead · ยืนยันออเดอร์ = จำนวนในระบบขาย · CAC = ค่าแอด ÷ ออเดอร์ลูกค้าใหม่ · %Ads = ค่าแอด ÷ ยอดใหม่", () => {
    const rows = [
      { brand_id: "b_td", fact_date: "2026-09-01", gross_revenue: 50000, revenue_new: 20000, qualified_leads: 10, orders: 3, orders_new: 2, deposits: 4 },
      { brand_id: "b_ta", fact_date: "2026-09-01", gross_revenue: 10000, revenue_new: 10000, qualified_leads: 5, orders: 1, orders_new: 1, deposits: 0 },
    ];
    expect(salesTrendValue({ sales: rows, key: "leads", brandIds: both, ...day1 })).toBe(15);
    expect(salesTrendValue({ sales: rows, key: "orders", brandIds: both, ...day1 })).toBe(4);
    expect(salesTrendValue({ sales: rows, key: "cac", brandIds: both, spend: 6000, ...day1 })).toBe(2000);
    expect(salesTrendValue({ sales: rows, key: "pctAds", brandIds: both, spend: 6000, ...day1 })).toBe(0.2);
    expect(salesTrendValue({ sales: rows, key: "cac", brandIds: both, spend: null, ...day1 })).toBeNull();
  });

  it("ได้ออเดอร์: ก่อนวันแรกที่ระบบขายมีข้อมูล = null ไม่ใช่ 0 · ภาพรวมต้องครบทุกแบรนด์ถึงจะนับ", () => {
    const rows = [
      { brand_id: "b_td", fact_date: "2026-08-31", deposits: 0 },
      { brand_id: "b_td", fact_date: "2026-09-01", deposits: 4 },
      { brand_id: "b_ta", fact_date: "2026-09-01", deposits: 0 },
      { brand_id: "b_ta", fact_date: "2026-09-02", deposits: 2 },
    ];
    expect(salesTrendValue({ sales: rows, key: "deposits", brandIds: ["b_td"], from: "2026-08-31", to: "2026-08-31" })).toBeNull();
    expect(salesTrendValue({ sales: rows, key: "deposits", brandIds: ["b_td"], from: "2026-08-31", to: "2026-09-01" })).toBe(4);
    expect(salesTrendValue({ sales: rows, key: "deposits", brandIds: both, ...day1 })).toBeNull();
    expect(salesTrendValue({ sales: rows, key: "deposits", brandIds: both, from: "2026-09-01", to: "2026-09-02" })).toBe(6);
  });

  it("key ที่ไม่ใช่ของระบบขาย = undefined (ให้กราฟใช้ของ Meta ต่อ)", () => {
    expect(salesTrendValue({ sales, key: "ctr", brandIds: both, ...day1 })).toBeUndefined();
  });
});

describe("Lead ก่อน 1 ก.ย. — ย้ายจาก sheet เข้าระบบขายทีหลัง เทียบกับหลังจากนั้นไม่ได้", () => {
  const rows = [
    { brand_id: "b_td", fact_date: "2026-08-31", qualified_leads: 180, orders: 5, gross_revenue: 1000 },
    { brand_id: "b_td", fact_date: "2026-09-01", qualified_leads: 20, orders: 3, gross_revenue: 900 },
  ];
  it("ช่วงที่มีวันก่อน 1 ก.ย. = Lead ไม่รู้ (null) · ตัวอื่นยังรวมปกติ · ช่วงหลัง 1 ก.ย. ปกติ", () => {
    const aug = salesFactsByBrand(rows, { from: "2026-08-31", to: "2026-09-01" }).get("b_td");
    expect(aug).toMatchObject({ leads: null, orders: 8, revenue: 1900 });
    expect(salesFactsByBrand(rows, { from: "2026-09-01", to: "2026-09-01" }).get("b_td").leads).toBe(20);
  });
  it("funnel: Lead และ CPL ช่วงก่อนหน้า = เทียบไม่ได้ · ช่วงที่เลือกเป็นเดือนก่อน บอกว่ามีข้อมูลตั้งแต่ 1 ก.ย.", () => {
    const sep = salesFactsByBrand(rows, { from: "2026-09-01", to: "2026-09-01" }).get("b_td");
    const aug = salesFactsByBrand(rows, { from: "2026-08-31", to: "2026-08-31" }).get("b_td");
    const items = salesPipeline({ sales: sep, prevSales: aug, spend: 1000, prevSpend: 900 }).items;
    expect(items.find((i) => i.key === "qualified")).toMatchObject({ value: 20, before: null });
    expect(items.find((i) => i.key === "cpl")).toMatchObject({ value: 50, before: null });
    const past = salesPipeline({ sales: aug, spend: 900 }).items.find((i) => i.key === "qualified");
    expect(past).toMatchObject({ value: null, sub: "มีข้อมูลตั้งแต่ 1 ก.ย. (ก่อนหน้านั้นกรอกใน sheet)" });
  });
  it("กราฟแนวโน้ม: วันก่อน 1 ก.ย. Lead/CPL = null (ไม่ขึ้นยอดพุ่ง 180 ของวันที่ย้ายข้อมูล)", () => {
    const day = { from: "2026-08-31", to: "2026-08-31" };
    expect(salesTrendValue({ sales: rows, key: "leads", brandIds: ["b_td"], ...day })).toBeNull();
    expect(salesTrendValue({ sales: rows, key: "cpl", brandIds: ["b_td"], spend: 500, ...day })).toBeNull();
    expect(salesTrendValue({ sales: rows, key: "orders", brandIds: ["b_td"], ...day })).toBe(5);
  });
});

import { channelFunnel } from "../src/modules/marketing/ads/salesOverview.js";

describe("channelFunnel — คนทัก → Lead → ได้ออเดอร์ → ยืนยันออเดอร์ แยกช่องทางที่ลูกค้าทัก", () => {
  const f = (brand_id, fact_date, channel_funnel, inquiry_filled = true) => ({ brand_id, fact_date, inquiry_filled, channel_funnel });
  const rows = [
    f("b_td", "2026-09-01", { FB: { inquiries: 40, leads: 8, deposits: 6, orders: 3 }, Line: { inquiries: 10, leads: 5, deposits: 4, orders: 3 } }),
    f("b_td", "2026-09-02", { FB: { inquiries: 0, leads: 2, deposits: 1, orders: 1 }, other: { inquiries: 0, leads: 0, deposits: 0, orders: 1 } }, false),
    f("b_jk", "2026-09-01", { FB: { inquiries: 20, leads: 4, deposits: 2, orders: 2 } }),
  ];
  const range = { from: "2026-09-01", to: "2026-09-02", depositsSince: "2026-09-01" };

  it("รวมรายช่องทาง · อัตราผ่านแต่ละขั้น · สัดส่วนออเดอร์ · เรียงออเดอร์มากก่อน · คนทักนับเฉพาะวันที่ทีมกรอก", () => {
    const out = channelFunnel(rows, { brandIds: ["b_td", "b_jk"], ...range });
    expect(out.map((c) => c.channel)).toEqual(["FB", "Line", "other"]);
    expect(out[0]).toMatchObject({ label: "Facebook", inquiries: 60, leads: 14, deposits: 9, orders: 6, orderShare: 0.6 });
    expect(out[0].leadRate).toBeCloseTo(14 / 60);
    expect(out[0].closeRate).toBeCloseTo(6 / 14);
    expect(out[1]).toMatchObject({ label: "LINE", inquiries: 10, leads: 5, orders: 3, leadRate: 0.5 });
    expect(out[2]).toMatchObject({ label: "อื่นๆ", inquiries: null, orders: 1 });
  });

  it("แบรนด์ที่เลือก · Lead ก่อน 1 ก.ย. = null · ได้ออเดอร์ก่อนวันเริ่มเก็บ = null", () => {
    const aug = [f("b_td", "2026-08-31", { FB: { inquiries: 5, leads: 90, deposits: 0, orders: 2 } }), ...rows];
    const [fb] = channelFunnel(aug, { brandIds: ["b_td"], from: "2026-08-31", to: "2026-09-01", depositsSince: "2026-09-01" });
    expect(fb).toMatchObject({ channel: "FB", inquiries: 45, leads: null, deposits: null, orders: 5, leadRate: null, closeRate: null });
  });

  it("ไม่มีข้อมูลช่องทาง = []", () => {
    expect(channelFunnel([], { brandIds: ["b_td"], ...range })).toEqual([]);
  });
});
