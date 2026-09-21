/* Overview/แคมเปญ ช่วง "เดือนนี้": ทุกตัวเลขต้องเทียบฐานเดียวกัน (วันเดียวกันของเดือนก่อน)
   เดิมยอดขาย/ค่าแอดเทียบวันเดียวกันเดือนก่อน แต่ funnel/ROAS/แคมเปญเทียบช่วงก่อนหน้า → % เปลี่ยนคนละฐานบนหน้าเดียว */
import { describe, expect, it } from "vitest";
import { buildOverviewModel } from "../src/modules/marketing/ads/overviewModel.js";
import { buildCampaignsModel } from "../src/modules/marketing/campaigns/campaignsModel.js";
import { periodRange, sameDatesLastMonth, compareRange } from "../src/modules/marketing/adsScope.js";

const data = { brands: [{ id: "b_td", name: "TEAMDEE" }], settings: {}, cards: [] };
const ads = { cards: [], source: "mock", sales: [], salesGoals: [], mockFallback: false };
const base = { from: "2026-09-01", to: "2026-09-17", channel: "all", basis: "total", brand: "all" };
const args = (filters) => ({ data, ads, inBrandScope: () => true, brandFilter: "all", filters: { ...base, ...filters } });

describe("ฐานเทียบของเดือนนี้", () => {
  it("Overview: เลือกช่วงก่อนก็ตาม เดือนนี้เทียบวันเดียวกันเดือนก่อนทั้งหน้า", () => {
    const v = buildOverviewModel(args({ period: "mtd", compare: "previous" }));
    expect(v.before).toEqual(sameDatesLastMonth(periodRange("mtd", null, null)));
    expect(v.compareLabel).toBe("วันเดียวกันเดือนก่อน");
  });
  it("แคมเปญ: เดือนนี้เทียบวันเดียวกันเดือนก่อนเหมือนกัน", () => {
    expect(buildCampaignsModel(args({ period: "mtd", compare: "previous" })).compareLabel).toBe("วันเดียวกันเดือนก่อน");
  });
  it("เลือกช่วงอื่นแล้วใช้ช่วงนั้นจริง และไม่เปิดโหมดเป้า/จังหวะรายเดือน", () => {
    const month = buildOverviewModel(args({ period: "mtd", compare: "lastMonth" }));
    const week = buildOverviewModel(args({ period: "7d", compare: "previous" }));
    expect(week.range).not.toEqual(month.range);
    expect(week.range).toEqual(periodRange("7d"));
    expect(week.monthView).toBe(false);
    expect(week.compareLabel).toBe("ช่วงก่อนหน้า");
    expect(week.overallPace).toBe(null);
  });

  it("ช่วงกำหนดเองใช้วันจากตัวกรองครบทั้งหัวและท้าย", () => {
    const custom = buildOverviewModel(args({ period: "custom", from: "2026-09-05", to: "2026-09-09", compare: "previous" }));
    expect(custom.range).toEqual(periodRange("custom", "2026-09-05", "2026-09-09"));
    expect(custom.rangeLabel).toContain("5 – 9 ก.ย.");
    expect(custom.monthView).toBe(false);
  });
});

/* 18 ก.ย. 69: เปิด JUNTAKARN (b_jt) เป็นแหล่งยอดขายจริงจากระบบ TMK
   ระบบขายของแบรนด์นี้มี 2 ขั้น (คนทัก → ยืนยันออเดอร์) และเขียน qualified_leads = 0 ลงฐาน
   ถ้าเอามารวม funnel ภาพรวม: คนทักของ JK เข้าตัวหารแต่ Lead เป็น 0 → %Lead ภาพรวมต่ำกว่าความจริง */
describe("funnel ภาพรวมกับแบรนด์ที่ระบบขายไม่มีครบทุกขั้น", () => {
  const brands = [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jt", name: "JUNTAKARN" }];
  const fact = (brand_id, patch) => ({
    brand_id, fact_date: "2026-09-01", source: brand_id === "b_jt" ? "tmk" : "crm",
    inquiries: 0, inquiry_filled: true, qualified_leads: 0, leads_new: 0, deposits: 0, deposit_value: 0,
    orders: 0, orders_new: 0, gross_revenue: 0, revenue_new: 0, refunds: 0, cash_received: 0, cancelled: 0, cancelled_value: 0, ...patch,
  });
  const sales = [
    fact("b_td", { inquiries: 1000, qualified_leads: 300, deposits: 200, orders: 100, gross_revenue: 500000, revenue_new: 200000 }),
    fact("b_jt", { inquiries: 500, orders: 50, gross_revenue: 120000, revenue_new: 60000 }),
  ];
  const realArgs = {
    data: { brands, settings: {}, cards: [] },
    ads: { cards: [], source: "meta_pilot", sales, salesGoals: [], mockFallback: false },
    inBrandScope: () => true, brandFilter: "all",
    filters: { ...base, period: "custom", from: "2026-09-01", to: "2026-09-01", compare: "previous" },
  };
  const v = buildOverviewModel(realArgs);
  const stage = (key) => v.overallPipeline.items.find((item) => item.key === key);

  it("คนทักและ Lead ภาพรวมนับเฉพาะแบรนด์ที่เก็บครบทุกขั้น (%Lead ไม่ถูกเจือจาง)", () => {
    expect(stage("inquiries").value).toBe(1000);
    expect(stage("qualified").value).toBe(300);
    expect(stage("qualified").conv).toBeCloseTo(0.3);
    expect(v.overallPipeline.excluded).toEqual(["JUNTAKARN"]);
  });

  it("ยอดขายภาพรวมยังรวม JUNTAKARN (ยอด · ROAS · %Ads ไม่ได้ตัดแบรนด์นี้ออก)", () => {
    expect(v.summary.revenue).toBe(620000);
    expect(v.summary.excluded).toEqual([]);
  });

  it("หน้าแบรนด์ JUNTAKARN: มีข้อมูลแล้ว (ไม่ใช่รอเชื่อม) และขั้นที่ไม่มีบอกว่าระบบขายไม่มีขั้นนี้", () => {
    const jk = v.pipelines.b_jt;
    expect(jk.items.find((item) => item.key === "inquiries").value).toBe(500);
    expect(jk.items.find((item) => item.key === "closed").value).toBe(50);
    expect(jk.items.find((item) => item.key === "qualified").value).toBe(null);
    expect(jk.items.find((item) => item.key === "qualified").sub).toBe("ระบบขายของแบรนด์นี้ไม่มีขั้นนี้");
  });
});

/* เป้าภาพรวมต้องเทียบกับชุดแบรนด์เดียวกับตัวเลขจริง
   บั๊กที่เจอบนหน้าจริง 18 ก.ย. 69: เป้าคนทักภาพรวม 6,566 (รวม JUNTAKARN) เทียบกับของจริง 2,769 (ไม่รวม)
   และเป้า Lead หายทั้งแถว เพราะระบบ TMK ไม่มีเป้า Lead แล้วโดนกติกา all-or-null ล้างทิ้ง */
describe("เป้าภาพรวมกับแบรนด์ที่ funnel ไม่ครบ", () => {
  const brands2 = [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jt", name: "JUNTAKARN" }];
  const factOf = (brand_id, patch) => ({
    brand_id, fact_date: "2026-09-01", source: brand_id === "b_jt" ? "tmk" : "crm",
    inquiries: 0, inquiry_filled: true, qualified_leads: 0, leads_new: 0, deposits: 0, deposit_value: 0,
    orders: 0, orders_new: 0, gross_revenue: 0, revenue_new: 0, refunds: 0, cash_received: 0, cancelled: 0, cancelled_value: 0, ...patch,
  });
  const goalOf = (brand_id, patch) => ({ brand_id, month: "2026-09-01", goal_source: "sale_goal", version: 1, ...patch });
  const v = buildOverviewModel({
    data: { brands: brands2, settings: {}, cards: [] },
    ads: {
      cards: [], source: "meta_pilot", mockFallback: false,
      sales: [
        factOf("b_td", { inquiries: 1000, qualified_leads: 300, deposits: 200, orders: 100, gross_revenue: 500000, revenue_new: 200000 }),
        factOf("b_jt", { inquiries: 500, orders: 50, gross_revenue: 120000, revenue_new: 60000 }),
      ],
      salesGoals: [
        goalOf("b_td", { sales_target: 1000000, ad_budget: 100000, inquiry_target: 2000, leads_target: 600, deposits_target: 400, orders_target: 200, roas: 10, pct_ads_new: 0.1, cpl: 200 }),
        goalOf("b_jt", { goal_source: "tmk_month", version: 0, sales_target: 540000, ad_budget: 95000, roas: 5.68, inquiry_target: 2300 }),
      ],
    },
    inBrandScope: () => true, brandFilter: "all",
    filters: { ...base, period: "custom", from: "2026-09-01", to: "2026-09-01", compare: "previous" },
  });
  const stage = (key) => v.overallPipeline.items.find((item) => item.key === key);

  it("เป้าคนทักภาพรวม = ของ 3 แบรนด์ที่เก็บครบ ไม่รวมเป้าของ JUNTAKARN", () => {
    expect(stage("inquiries").value).toBe(1000);
    expect(v.goals.overall.inquiries?.monthTarget).toBe(2000);   // ไม่ใช่ 2000 + 2300
  });
  it("เป้า Lead ไม่หาย เพราะแบรนด์ที่ไม่มีขั้นนี้ไม่ถูกนับเป็นตัวถ่วง", () => {
    expect(v.goals.overall.qualified?.monthTarget).toBe(600);
  });
  it("เป้าของ JUNTAKARN ยังอยู่ครบในหน้าแบรนด์ตัวเอง", () => {
    expect(v.goals.byBrand.b_jt?.inquiries?.monthTarget).toBe(2300);
  });
});

/* บนหน้าเดียวกันต้องมี ROAS ค่าเดียว — แผงประสิทธิภาพเคยนับ 3 แบรนด์ (9.05×)
   ส่วน %Ads กับกราฟแนวโน้มนับ 4 แบรนด์ (8.04×) เพราะ overallPipeline ถูกใช้ทั้งงาน funnel และงานอัตราส่วน
   กติกาที่เขียนไว้ใน README: ยอดขาย · ROAS · %Ads · CAC ภาพรวมรวม JUNTAKARN · ขั้น funnel ไม่รวม */
describe("อัตราส่วนภาพรวมนับทุกแบรนด์ที่มีแหล่ง", () => {
  const brands2 = [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jt", name: "JUNTAKARN" }];
  const card = (brand_id, spend) => ({ id: `${brand_id}-c`, track: "project", status: "measured", brand_id, archived: true, campaign: "c",
    brief: { channels: ["Facebook"] }, metrics: { spend, impressions: 1000, clicks: 10, reach: 900, leads: 0, revenue: 0, measured_at: "2026-09-01T12:00:00Z" } });
  const factOf = (brand_id, patch) => ({
    brand_id, fact_date: "2026-09-01", source: brand_id === "b_jt" ? "tmk" : "crm",
    inquiries: 0, inquiry_filled: true, qualified_leads: 0, leads_new: 0, deposits: 0, deposit_value: 0,
    orders: 0, orders_new: 0, gross_revenue: 0, revenue_new: 0, refunds: 0, cash_received: 0, cancelled: 0, cancelled_value: 0, ...patch,
  });
  const v = buildOverviewModel({
    data: { brands: brands2, settings: {}, cards: [] },
    ads: {
      cards: [card("b_td", 100000), card("b_jt", 50000)], source: "meta_pilot", mockFallback: false, salesGoals: [],
      sales: [
        factOf("b_td", { inquiries: 1000, qualified_leads: 300, deposits: 200, orders: 100, orders_new: 60, gross_revenue: 1000000, revenue_new: 400000 }),
        factOf("b_jt", { inquiries: 500, orders: 50, orders_new: 40, gross_revenue: 200000, revenue_new: 100000 }),
      ],
    },
    inBrandScope: () => true, brandFilter: "all",
    filters: { ...base, period: "custom", from: "2026-09-01", to: "2026-09-01", compare: "previous" },
  });
  const item = (key) => v.overallPipeline.items.find((x) => x.key === key)?.value;

  it("ROAS · %Ads · CAC ภาพรวม = ทุกแบรนด์ (รวม JUNTAKARN)", () => {
    expect(item("roas")).toBeCloseTo(1200000 / 150000, 4);        // ไม่ใช่ 1,000,000 ÷ 100,000
    expect(item("pctAds")).toBeCloseTo(150000 / 500000, 4);
    expect(item("cac")).toBeCloseTo(150000 / 100, 4);             // ออเดอร์ลูกค้าใหม่ 60 + 40
  });
  it("ขั้น funnel ยังนับเฉพาะแบรนด์ที่เก็บครบ · CPL ใช้ฐานเดียวกับ Lead", () => {
    expect(item("inquiries")).toBe(1000);
    expect(item("qualified")).toBe(300);
    expect(item("cpl")).toBeCloseTo(100000 / 300, 4);             // ค่าแอดของแบรนด์ที่มี Lead เท่านั้น
    expect(v.overallPipeline.excluded).toEqual(["JUNTAKARN"]);
  });
});

/* เป้าบนการ์ดภาพรวมมีสองฐาน — ต้องตรงกับตัวเลขจริงที่มันเทียบ
   ขั้น funnel + CPL = แบรนด์ที่เก็บครบ · ROAS + %Ads = ทุกแบรนด์ที่มีแหล่ง */
describe("ฐานของเป้าภาพรวมตรงกับฐานของตัวเลขจริง", () => {
  const brands2 = [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jt", name: "JUNTAKARN" }];
  const card = (brand_id, spend) => ({ id: `${brand_id}-c`, track: "project", status: "measured", brand_id, archived: true, campaign: "c",
    brief: { channels: ["Facebook"] }, metrics: { spend, impressions: 1000, clicks: 10, reach: 900, leads: 0, revenue: 0, measured_at: "2026-09-01T12:00:00Z" } });
  const factOf = (brand_id, patch) => ({
    brand_id, fact_date: "2026-09-01", source: brand_id === "b_jt" ? "tmk" : "crm",
    inquiries: 0, inquiry_filled: true, qualified_leads: 0, leads_new: 0, deposits: 0, deposit_value: 0,
    orders: 0, orders_new: 0, gross_revenue: 0, revenue_new: 0, refunds: 0, cash_received: 0, cancelled: 0, cancelled_value: 0, ...patch,
  });
  const v = buildOverviewModel({
    data: { brands: brands2, settings: {}, cards: [] },
    ads: {
      cards: [card("b_td", 100000), card("b_jt", 50000)], source: "meta_pilot", mockFallback: false,
      sales: [
        factOf("b_td", { inquiries: 1000, qualified_leads: 300, deposits: 200, orders: 100, orders_new: 60, gross_revenue: 1000000, revenue_new: 400000 }),
        factOf("b_jt", { inquiries: 500, orders: 50, orders_new: 40, gross_revenue: 200000, revenue_new: 100000 }),
      ],
      salesGoals: [
        { brand_id: "b_td", month: "2026-09-01", goal_source: "sale_goal", version: 1, sales_target: 2000000, ad_budget: 200000, roas: 10, pct_ads_new: 0.1, inquiry_target: 2000, leads_target: 600, deposits_target: 400, orders_target: 200, cpl: 200 },
        { brand_id: "b_jt", month: "2026-09-01", goal_source: "tmk_month", version: 0, sales_target: 500000, ad_budget: 100000, roas: 5 },
      ],
    },
    inBrandScope: () => true, brandFilter: "all",
    filters: { ...base, period: "custom", from: "2026-09-01", to: "2026-09-01", compare: "previous" },
  });

  it("เป้า ROAS ถ่วงด้วยงบของทุกแบรนด์ (ฐานเดียวกับ ROAS จริง)", () => {
    // (10 × 200,000 + 5 × 100,000) ÷ 300,000
    expect(v.goals.overall.roas?.target).toBeCloseTo((10 * 200000 + 5 * 100000) / 300000, 4);
  });
  it("เป้าขั้น funnel ยังเป็นของแบรนด์ที่เก็บครบ", () => {
    expect(v.goals.overall.inquiries?.monthTarget).toBe(2000);
    expect(v.goals.overall.qualified?.monthTarget).toBe(600);
  });
});
