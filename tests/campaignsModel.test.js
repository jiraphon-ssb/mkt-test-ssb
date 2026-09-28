/* model หน้าแคมเปญ (สเปก 2026-09-26 campaign-page-audience): มุมกลุ่มเป้าหมาย · ตัวกรองสถานะใช้ตัวอ่านเดียวกับแถว · สถานะโหลด */
import { describe, expect, it } from "vitest";
import { buildCampaignsModel } from "../src/modules/marketing/campaigns/campaignsModel.js";

const card = (id, campaign, adGroup, spend, leads) => ({
  id, track: "project", status: "measured", archived: true, brand_id: "b_jk", campaign, creative: `ชิ้น ${id}`, ad_group: adGroup,
  source: "meta", ad_platform: "Meta Ads", brief: { channels: ["Meta Ads"], publish_at: null },
  metrics: { spend, leads, revenue: 0, impressions: 10_000, clicks: 100, reach: 5_000, measured_at: "2026-09-10T09:00:00.000Z" },
});
const cards = [
  card("a", "JD1 | หว่าน | VDO | เปิด", "หว่าน | 30-55", 3000, 60),
  card("b", "JD1 | หว่าน | PIC | CLS", "หว่าน | 30-55", 2000, 20),
  card("c", "JD1 | RE | VDO | เปิด", "RETARGET", 4000, 10),
];
const build = (filters = {}, ads = {}) => buildCampaignsModel({
  data: { brands: [{ id: "b_jk", name: "JK Design" }], settings: {}, ad_budgets: [] },
  ads: { cards, source: "mock", mockFallback: false, sales: [], salesGoals: [], pilot: { status: "ready" }, ...ads },
  inBrandScope: () => true, brandFilter: "all", todayLocal: "2026-09-26",
  filters: { period: "custom", from: "2026-09-01", to: "2026-09-26", compare: "none", channel: "all", brand: "all", status: "all", q: "", ...filters },
});

describe("buildCampaignsModel — กลุ่มเป้าหมาย / สถานะ / โหลด", () => {
  it("คืนแถวกลุ่มเป้าหมายจากแคมเปญชุดเดียวกัน", () => {
    const v = build();
    expect(v.audiences.map((a) => [a.name, a.spend, a.campaigns.length])).toEqual([["หว่าน | 30-55", 5000, 2], ["RETARGET", 4000, 1]]);
  });
  it("ตัวกรองสถานะใช้สถานะเดียวกับที่ขึ้นในแถว (รวมแบบตามชื่อ) · กลุ่มเป้าหมายตามแคมเปญที่ผ่านตัวกรอง", () => {
    const v = build({ status: "paused" });
    expect(v.rows.map((r) => r.name)).toEqual(["JD1 | หว่าน | PIC | CLS"]);
    expect(v.audiences.map((a) => [a.name, a.spend])).toEqual([["หว่าน | 30-55", 2000]]);
    expect(v.statuses).toEqual(["active", "paused"]);
  });
  it("ค้นหาชื่อแคมเปญ กรองทั้งสองมุม", () => {
    const v = build({ q: "RE |" });
    expect(v.rows).toHaveLength(1);
    expect(v.audiences.map((a) => a.name)).toEqual(["RETARGET"]);
  });
  /* ชุด A ข้อ 2: ปุ่ม "คิดจาก ยอดใหม่/ยอดรวม" อยู่หน้าภาพรวม แต่ค่าติดข้ามหน้ามาทาง URL/session — หน้าแคมเปญไม่มีปุ่มนี้ จึงต้องไม่รับ */
  it("เลือกคิดจากยอดใหม่มาจากหน้าอื่น → หน้าแคมเปญไม่เปลี่ยน (ไม่กลายเป็นรอข้อมูลทั้งหน้า)", () => {
    const total = build();
    const fromNew = build({ basis: "new" });
    expect(fromNew.rows.map((r) => [r.name, r.revenue, r.complete, r.decision.tag])).toEqual(total.rows.map((r) => [r.name, r.revenue, r.complete, r.decision.tag]));
  });
  it("ชุด A ข้อ 5: ข้อมูลจริงโหลดพัง = loadError", () => {
    expect(build({}, { source: "meta_pilot", pilot: { status: "error" }, cards: [] }).loadError).toBe(true);
    expect(build().loadError).toBe(false);
  });
  it("ข้อมูลจริงกำลังโหลด = loading", () => {
    expect(build({}, { source: "meta_pilot", pilot: { status: "loading" }, cards: [] }).loading).toBe(true);
    expect(build().loading).toBe(false);
  });
});

/* ทดสอบละเอียด 27 ก.ย.: แคมเปญที่โฆษณาปิดหมด (idle "ไม่มีโฆษณาเปิด") ขึ้นจุดปิดในแถว แต่ตัวกรอง "ปิดอยู่" หาไม่เจอ */
import { deliveryFilterKey } from "../src/modules/marketing/campaigns/campaignsModel.js";
describe("ตัวกรองสถานะ: ไม่มีโฆษณาเปิด = ปิดอยู่", () => {
  it("โฆษณาปิดหมด → กรองด้วย paused · มีตัวเปิด → active", () => {
    expect(deliveryFilterKey({ creatives: [{ asset: { status: "PAUSED" } }, { asset: { status: "PAUSED" } }] })).toBe("paused");
    expect(deliveryFilterKey({ creatives: [{ asset: { status: "ACTIVE" } }] })).toBe("active");
  });
});
