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
  it("ช่วงอื่นยังเลือกฐานเองได้", () => {
    const v = buildOverviewModel(args({ period: "7d", compare: "previous" }));
    expect(v.before).toEqual(compareRange("7d", periodRange("7d", null, null), "previous"));
    expect(v.compareLabel).toBe("ช่วงก่อนหน้า");
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
