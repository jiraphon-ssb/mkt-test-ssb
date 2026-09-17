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
