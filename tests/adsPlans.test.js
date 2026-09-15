/* งบ/เป้ายอดขายรายเดือนจากหน้าตั้งค่า = ความจริงชุดเดียว
   บั๊กเดิม: ad_budgets/sales_targets ไม่มีตารางในฐาน → โหลดหน้าใหม่กลับเป็นค่า mock · และงบถูกหารให้แพลตฟอร์มที่ไม่มีค่าแอด */
import { describe, it, expect } from "vitest";
import { plansFromTargets } from "../src/modules/marketing/adsTargets.js";
import { adChannelsByBrand, adsByBrandChannel, adsCompanySummary } from "../src/modules/marketing/adsOverview.js";

const MONTH = "2026-09";
const seedBudgets = [
  { id: "adb_1", brand_id: "b_jt", channel: "Meta Ads", month: MONTH, amount: 30_000 },
  { id: "adb_2", brand_id: "b_jt", channel: "Shopee Ads", month: MONTH, amount: 8_000 },
  { id: "adb_3", brand_id: "b_jt", channel: "TikTok Ads", month: MONTH, amount: 10_000 },
  { id: "adb_4", brand_id: "b_td", channel: "Meta Ads", month: MONTH, amount: 24_000 },
  { id: "adb_old", brand_id: "b_jt", channel: "Meta Ads", month: "2026-08", amount: 99_000 },
];
const seedSales = [
  { id: "st_1", brand_id: "b_jt", channel: "Meta Ads", month: MONTH, amount: 200_000 },
  { id: "st_2", brand_id: "b_jt", channel: "Shopee Ads", month: MONTH, amount: 100_000 },
];

describe("plansFromTargets", () => {
  it("แบรนด์ที่ตั้งงบ: แทนแถวเดือนนี้ทั้งหมด แบ่งเฉพาะแพลตฟอร์มที่มีค่าแอดจริง ตามสัดส่วนเดิม · ผลรวมเท่าที่ตั้งเป๊ะ", () => {
    const { adBudgets } = plansFromTargets({
      targets: { b_jt: { budget: 50_000 } }, adBudgets: seedBudgets, salesTargets: [], month: MONTH,
      channelsByBrand: new Map([["b_jt", ["Meta Ads", "TikTok Ads"]]]),
    });
    const jt = adBudgets.filter((r) => r.brand_id === "b_jt" && r.month === MONTH);
    expect(jt.map((r) => [r.channel, r.amount])).toEqual([["Meta Ads", 37_500], ["TikTok Ads", 12_500]]);   // 30k:10k
    expect(jt.reduce((n, r) => n + r.amount, 0)).toBe(50_000);
    expect(adBudgets.find((r) => r.id === "adb_old").amount).toBe(99_000);     // เดือนอื่นไม่แตะ
    expect(adBudgets.find((r) => r.id === "adb_4").amount).toBe(24_000);       // แบรนด์ที่ไม่ได้ตั้งไม่แตะ
  });
  it("Meta Pilot: แพลตฟอร์มที่มีจริงมีแค่ Meta → งบทั้งก้อนอยู่ที่ Meta (บั๊กเดิมเหลือแค่ส่วนของ Meta)", () => {
    const { adBudgets, salesTargets } = plansFromTargets({
      targets: { b_jt: { budget: 50_000, revenue: 400_000 } }, adBudgets: seedBudgets, salesTargets: seedSales, month: MONTH,
      channelsByBrand: new Map([["b_jt", ["Meta Ads"]]]),
    });
    expect(adBudgets.filter((r) => r.brand_id === "b_jt" && r.month === MONTH)).toEqual([{ id: `budget_b_jt_metaads_${MONTH}`, brand_id: "b_jt", channel: "Meta Ads", month: MONTH, amount: 50_000 }]);
    expect(salesTargets.filter((r) => r.brand_id === "b_jt" && r.month === MONTH).map((r) => r.amount)).toEqual([400_000]);
  });
  it("ไม่มีแพลตฟอร์มที่มีค่าแอดเลย → ลงที่ Meta Ads · ไม่มีแถวเดิมเป็นน้ำหนัก → แบ่งเท่ากัน", () => {
    const none = plansFromTargets({ targets: { b_new: { budget: 9_000 } }, adBudgets: [], salesTargets: [], month: MONTH, channelsByBrand: new Map() });
    expect(none.adBudgets.map((r) => [r.channel, r.amount])).toEqual([["Meta Ads", 9_000]]);
    const equal = plansFromTargets({ targets: { b_new: { budget: 10_000 } }, adBudgets: [], salesTargets: [], month: MONTH, channelsByBrand: new Map([["b_new", ["Meta Ads", "Google Ads", "TikTok Ads"]]]) });
    expect(equal.adBudgets.map((r) => r.amount)).toEqual([3_333, 3_333, 3_334]);
  });
  it("ค่าว่าง/0/ติดลบ = ยังไม่ได้ตั้ง → ใช้แผนเดิม · ชื่อแพลตฟอร์มแบบเก่า (Facebook) นับเป็น Meta Ads", () => {
    const out = plansFromTargets({
      targets: { b_jt: { budget: 0, revenue: "" }, b_td: { budget: -5 } }, adBudgets: seedBudgets, salesTargets: seedSales, month: MONTH,
      channelsByBrand: new Map([["b_jt", ["Meta Ads"]]]),
    });
    expect(out.adBudgets).toEqual(seedBudgets);
    expect(out.salesTargets).toEqual(seedSales);
    const legacy = plansFromTargets({
      targets: { b_x: { budget: 1_000 } }, adBudgets: [{ id: "l", brand_id: "b_x", channel: "Facebook", month: MONTH, amount: 5 }], salesTargets: [], month: MONTH,
      channelsByBrand: new Map([["b_x", ["Meta Ads"]]]),
    });
    expect(legacy.adBudgets.map((r) => [r.channel, r.amount])).toEqual([["Meta Ads", 1_000]]);
  });
});

describe("ต่อเข้าตัวคำนวณหน้าภาพรวม", () => {
  const card = (id, brand, channel, spend) => ({
    id, track: "project", status: "measured", brand_id: brand, archived: true,
    brief: { channels: [channel], publish_at: null }, metrics: { spend, leads: 1, revenue: spend * 3, measured_at: "2026-09-10T05:00:00.000Z" },
  });
  const range = { start: "2026-09-01T00:00:00.000Z", end: "2026-10-01T00:00:00.000Z" };
  it("adChannelsByBrand: แพลตฟอร์มที่มีค่าแอดในช่วง ต่อแบรนด์ (เรียงชื่อ)", () => {
    const cards = [card("a", "b_jt", "TikTok", 10), card("b", "b_jt", "Meta Ads", 5), card("c", "b_td", "Facebook", 1)];
    expect(adChannelsByBrand(cards, range)).toEqual(new Map([["b_jt", ["Meta Ads", "TikTok Ads"]], ["b_td", ["Meta Ads"]]]));
  });
  it("งบ/เป้าแบรนด์บนหน้าภาพรวม = ค่าที่ตั้งเป๊ะ ทั้งแบรนด์และภาพรวม", () => {
    const cards = [card("a", "b_jt", "Meta Ads", 1_000)];
    const channelsByBrand = adChannelsByBrand(cards, range);
    const { adBudgets, salesTargets } = plansFromTargets({ targets: { b_jt: { budget: 50_000, revenue: 400_000 } }, adBudgets: seedBudgets, salesTargets: seedSales, month: MONTH, channelsByBrand });
    const [jt] = adsByBrandChannel(cards, range, [{ id: "b_jt", name: "JUNTAKARN" }], adBudgets, "2026-09-16", salesTargets);
    expect(jt.budget).toBe(50_000);
    expect(jt.revTarget).toBe(400_000);
    expect(adsCompanySummary([jt], "2026-09-16")).toMatchObject({ budget: 50_000, revTarget: 400_000 });
  });
});
