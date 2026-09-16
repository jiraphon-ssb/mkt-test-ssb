import { describe, it, expect } from "vitest";
import { adsSourceAccess, factsToAdCards, adsCardsForSource, pilotSummary, factsLoadRange, normalizeAdsSource, ADS_SOURCE_OPTIONS } from "../src/modules/marketing/ads/adsFacts.js";
import { adFactRows } from "../src/modules/marketing/adsOverview.js";
import { adsRollup } from "../src/modules/marketing/mktAnalytics.js";

const conn = (patch = {}) => ({ id: "conn-1", provider: "meta", brand_id: "teamdee", external_account_id: "act_111", account_name: "TEAMDEE", status: "connected", last_success_at: "2026-09-14T03:00:00Z", ...patch });
const fact = (patch = {}) => ({
  connection_id: "conn-1", fact_date: "2026-09-10", level: "ad",
  campaign_id: "c1", campaign_name: "Sofa Sale", ad_group_id: "s1", ad_group_name: "BKK", ad_id: "a1", ad_name: "Video A",
  spend: 1500.5, impressions: 40000, reach: 30000, clicks: 800, link_clicks: 600, leads: 30,
  attributed_conversions: null, attributed_value: null, attribution_window: "platform_default", ...patch,
});

describe("factsToAdCards", () => {
  it("แถว fact → การ์ดแอดรูปเดียวกับ mock ที่ตัวคำนวณเดิมอ่านได้", () => {
    const [card] = factsToAdCards([fact()], [conn()], { today: "2026-09-14" });
    expect(card).toMatchObject({
      id: "mf_conn-1_2026-09-10_a1", source: "meta", track: "project", status: "measured", brand_id: "teamdee",
      campaign: "Sofa Sale", creative: "Video A", ad_platform: "Meta Ads", provisional: false,
      brief: { channels: ["Meta Ads"], publish_at: null },
      metrics: { spend: 1500.5, impressions: 40000, reach: 30000, clicks: 800, link_clicks: 600, leads: 30, conversions: 30, revenue: null, new_revenue: null },
    });
    const at = new Date(card.metrics.measured_at);
    expect([at.getFullYear(), at.getMonth() + 1, at.getDate()]).toEqual([2026, 9, 10]);   // เที่ยงวันตามเวลาเครื่อง → ตกวันเดียวกันเสมอ
    expect(card.metrics.cpl).toBeCloseTo(50.0167, 3);
  });
  it("ตัวคำนวณเดิมนับการ์ดจริงได้ (ช่องทาง Meta Ads · ยอดรวมถูก)", () => {
    const cards = factsToAdCards([fact(), fact({ ad_id: "a2", spend: 499.5, leads: 10 })], [conn()], { today: "2026-09-14" });
    const range = { start: new Date(2026, 8, 1).toISOString(), end: new Date(2026, 9, 1).toISOString() };
    expect(adFactRows(cards, range).length).toBe(2);
    expect(adsRollup(cards, range)).toMatchObject({ spend: 2000, leads: 40 });
  });
  it("ยอดขาย: บัญชีที่มี purchase value อย่างน้อยหนึ่งแถว → แถวที่ไม่มี = 0 · บัญชีที่ไม่เคยมี = null ทั้งหมด", () => {
    const cards = factsToAdCards([
      fact({ attributed_value: 12000 }), fact({ ad_id: "a2" }),
      fact({ connection_id: "conn-2", ad_id: "b1" }),
    ], [conn(), conn({ id: "conn-2", brand_id: "jk", external_account_id: "act_222" })], { today: "2026-09-14" });
    expect(cards.map((c) => c.metrics.revenue)).toEqual([12000, 0, null]);
  });
  it("วันนี้ = provisional · connection ที่ปิด/ไม่รู้จัก ไม่แสดง · ชื่อว่างใช้ id แทน", () => {
    const cards = factsToAdCards([
      fact({ fact_date: "2026-09-14", campaign_name: "", ad_name: "" }),
      fact({ connection_id: "conn-off" }), fact({ connection_id: "ghost" }),
    ], [conn(), conn({ id: "conn-off", status: "disabled" })], { today: "2026-09-14" });
    expect(cards.length).toBe(1);
    expect(cards[0]).toMatchObject({ provisional: true, campaign: "c1", creative: "a1" });
  });
  it("ตัวเลขที่มาเป็น string (numeric จาก PostgREST) แปลงเป็น number · null คงเป็น null", () => {
    const [card] = factsToAdCards([fact({ spend: "10.25", reach: null })], [conn()], { today: "2026-09-14" });
    expect(card.metrics.spend).toBe(10.25);
    expect(card.metrics.reach).toBeNull();
  });
});

describe("adsCardsForSource", () => {
  const mockAd = { id: "ma_1", track: "project", brief: { channels: ["Facebook"] }, metrics: {} };
  const content = { id: "c_1", track: "content", brief: { channels: ["Facebook"] }, metrics: {} };
  const real = { id: "mf_x", track: "project", brief: { channels: ["Meta Ads"] }, metrics: {} };
  it("mock = การ์ดเดิมทั้งหมด · Meta Pilot = ตัดการ์ดแอดจำลองทุกใบออกก่อนใส่ข้อมูลจริง (ไม่ผสม)", () => {
    expect(adsCardsForSource([mockAd, content], "mock", [real])).toEqual([mockAd, content]);
    expect(adsCardsForSource([mockAd, content], "meta_pilot", [real])).toEqual([content, real]);
    expect(adsCardsForSource([mockAd], "meta_pilot", [])).toEqual([]);
    const projectNoChannel = { id: "ma_2", track: "project", brief: { channels: [] }, metrics: { spend: 5 } };   // adsRollup นับใบนี้ด้วย
    expect(adsCardsForSource([projectNoChannel, content], "meta_pilot", [])).toEqual([content]);
  });
  it("ค่าที่ไม่รู้จัก → mock · ตัวเลือกมีแค่ข้อมูลจำลองกับ Meta Pilot", () => {
    expect(normalizeAdsSource("live")).toBe("mock");
    expect(normalizeAdsSource("meta_pilot")).toBe("meta_pilot");
    expect(ADS_SOURCE_OPTIONS.map(([k]) => k)).toEqual(["mock", "meta_pilot"]);
  });
});

describe("pilotSummary / factsLoadRange", () => {
  it("นับบัญชีที่เปิดใช้ · อัปเดตล่าสุด · ช่วงข้อมูล · มีวันนี้ที่ยังไม่จบไหม", () => {
    const summary = pilotSummary([conn(), conn({ id: "c2", last_success_at: "2026-09-14T05:00:00Z" }), conn({ id: "c3", status: "disabled", last_success_at: "2026-09-14T09:00:00Z" })],
      [fact({ fact_date: "2026-09-01" }), fact({ fact_date: "2026-09-14" })], { today: "2026-09-14" });
    expect(summary).toEqual({ accounts: 2, lastSuccessAt: "2026-09-14T05:00:00Z", from: "2026-09-01", to: "2026-09-14", rows: 2, provisionalToday: true, empty: false });
    expect(pilotSummary([], [], { today: "2026-09-14" })).toMatchObject({ accounts: 0, lastSuccessAt: null, empty: true, provisionalToday: false });
  });
  it("โหลดย้อนหลังพอสำหรับเทียบเดือนก่อน + backfill (200 วัน)", () => {
    expect(factsLoadRange("2026-09-14")).toEqual({ from: "2026-02-27", to: "2026-09-14" });
  });
});

describe("adsSourceAccess — ใครเห็นยอดจริง ใครสลับได้", () => {
  it("สมาชิกทั่วไปเห็นยอดจริงเป็นค่าเริ่ม และสลับกลับไปข้อมูลจำลองไม่ได้", () => {
    expect(adsSourceAccess({ demo: false, role: "creator", stored: "mock" })).toEqual({ source: "meta_pilot", canSwitch: false, canPreview: false });
  });
  it("team_lead สลับได้ และระบบจำค่าที่เลือกไว้", () => {
    expect(adsSourceAccess({ demo: false, role: "team_lead", stored: "mock" })).toEqual({ source: "mock", canSwitch: true, canPreview: true });
    expect(adsSourceAccess({ demo: false, role: "team_lead", stored: null })).toEqual({ source: "meta_pilot", canSwitch: true, canPreview: true });
  });
  it("โหมดเดโม/ยังไม่ล็อกอิน = ข้อมูลจำลองเท่านั้น (ไม่มีทางเห็นยอดจริงหลุดออกไป)", () => {
    expect(adsSourceAccess({ demo: true, role: "team_lead", stored: "meta_pilot" })).toEqual({ source: "mock", canSwitch: false, canPreview: false });
    expect(adsSourceAccess({ demo: false, role: null, stored: "meta_pilot" })).toEqual({ source: "mock", canSwitch: false, canPreview: false });
  });
});
