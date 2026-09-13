import { describe, it, expect } from "vitest";
import { campaignRows, NO_CAMPAIGN } from "../src/modules/marketing/adsCampaigns.js";
import { campaignDecision, SAVED_VIEWS, applyView, campaignTotals, sortCampaigns } from "../src/modules/marketing/adsCampaigns.js";

const RANGE = { start: "2026-07-01T00:00:00.000Z", end: "2026-07-16T00:00:00.000Z" };
const PREV = { start: "2026-06-16T00:00:00.000Z", end: "2026-07-01T00:00:00.000Z" };
const BRANDS = [{ id: "b_td", name: "TEAMDEE" }];
const card = (id, day, over = {}) => ({
  id, track: "project", status: "measured", brand_id: "b_td", archived: true,
  campaign: "Always-on — คนเคยทัก", creative: "ชิ้น A",
  brief: { channels: ["Facebook"], publish_at: null },
  metrics: { spend: 1000, leads: 4, revenue: 3000, impressions: 20_000, clicks: 300, reach: 10_000,
    measured_at: `2026-07-${String(day).padStart(2, "0")}T09:00:00.000Z` },
  ...over,
});
const cards = [
  card("a1", 3), card("a2", 5), card("a3", 8, { campaign: "Prospecting — กลุ่มใหม่", metrics: { ...card("x", 8).metrics, spend: 2000, leads: 0 } }),
  card("p1", 20, { metrics: { ...card("x", 20).metrics, measured_at: "2026-06-20T09:00:00.000Z" } }),
];
const budgets = [{ brand_id: "b_td", channel: "Facebook", month: "2026-07", amount: 10_000 }];
const cb = [
  { brand_id: "b_td", channel: "Meta Ads", campaign: "Always-on — คนเคยทัก", month: "2026-07", share: 0.6, objective: "messages", status: "active" },
  { brand_id: "b_td", channel: "Meta Ads", campaign: "Prospecting — กลุ่มใหม่", month: "2026-07", share: 0.4, objective: "leads", status: "active" },
];
const opts = { brands: BRANDS, adBudgets: budgets, campaignBudgets: cb, today: "2026-07-15", prevRange: PREV };

describe("campaignRows", () => {
  it("รวมการ์ดเป็นแถวต่อ แบรนด์×แพลตฟอร์ม×แคมเปญ เรียงค่าแอด และคิดอัตราส่วนจากผลรวม", () => {
    const rows = campaignRows(cards, RANGE, opts);
    expect(rows.map((r) => r.name)).toEqual(["Always-on — คนเคยทัก", "Prospecting — กลุ่มใหม่"]);
    const a = rows[0];
    expect(a.platform).toBe("Meta Ads");
    expect(a.spend).toBe(2000);
    expect(a.leads).toBe(8);
    expect(a.cpl).toBe(250);
    expect(a.roas).toBe(3);                     // 6000/2000
    expect(a.pctAds).toBeCloseTo(1 / 3);
    expect(a.ctr).toBeCloseTo(600 / 40_000);
    expect(a.frequency).toBeCloseTo(2);
    expect(a.spendShare).toBeCloseTo(0.5);      // 2000 / 4000 ในขอบเขต
  });
  it("งบแคมเปญ = งบแพลตฟอร์ม × สัดส่วน · จังหวะงบคิดถึงระดับแคมเปญ · objective/status มาจาก mock", () => {
    const [a] = campaignRows(cards, RANGE, opts);
    expect(a.budget).toBe(6000);
    expect(a.pace.used).toBeCloseTo(2000 / 6000);
    expect(a.objective).toBe("messages");
    expect(a.status).toBe("active");
  });
  it("แคมเปญที่ไม่มีลีด: CPL/ROAS ไม่ใช่ศูนย์ — CPL null · ROAS จาก revenue จริง", () => {
    const p = campaignRows(cards, RANGE, opts)[1];
    expect(p.leads).toBe(0);
    expect(p.cpl).toBeNull();
  });
  it("เทียบช่วงก่อนจากผลรวมช่วงก่อน · delta เป็น % · ไม่มีช่วงก่อน = null", () => {
    const [a] = campaignRows(cards, RANGE, opts);
    expect(a.prev.spend).toBe(1000);
    expect(a.delta.spend).toBeCloseTo(100);     // 2000 vs 1000
    const [noPrev] = campaignRows(cards, RANGE, { ...opts, prevRange: null });
    expect(noPrev.delta.spend).toBeNull();
  });
  it("การ์ดที่ไม่มีชื่อแคมเปญไปอยู่แถว NO_CAMPAIGN งบ null สถานะ unknown", () => {
    const rows = campaignRows([card("z", 4, { campaign: undefined })], RANGE, opts);
    expect(rows[0].name).toBe(NO_CAMPAIGN);
    expect(rows[0].budget).toBeNull();
    expect(rows[0].status).toBe("unknown");
  });
  it("series รายวันมีเฉพาะวันที่มีการ์ด และพก creatives", () => {
    const [a] = campaignRows(cards, RANGE, opts);
    expect(a.series.days).toEqual(["2026-07-03", "2026-07-05"]);
    expect(a.days).toBe(2);
    expect(a.creatives[0].creative).toBe("ชิ้น A");
  });
  it("แถวงบแคมเปญ (mock) เก็บ channel แบบไม่ normalize เช่น \"Facebook\" ก็ต้องจับคู่กับแพลตฟอร์ม Meta Ads ได้", () => {
    const cbRaw = [
      { brand_id: "b_td", channel: "Facebook", campaign: "Always-on — คนเคยทัก", month: "2026-07", share: 0.6, objective: "messages", status: "active" },
      cb[1],
    ];
    const [a] = campaignRows(cards, RANGE, { ...opts, campaignBudgets: cbRaw });
    expect(a.budget).toBe(6000);
    expect(a.objective).toBe("messages");
    expect(a.status).toBe("active");
  });
});

const base = { spend: 3000, leads: 10, cpl: 300, roas: 3.5, complete: true, days: 5,
  pace: { remaining: 2000, used: 0.6, expected: 0.5 }, creatives: [{ fatigue: false }] };

describe("campaignDecision", () => {
  it("ข้อมูลไม่พอ → รอข้อมูล ก่อนกฎอื่นทั้งหมด", () => {
    expect(campaignDecision({ ...base, days: 2 }).tag).toBe("wait");
    expect(campaignDecision({ ...base, leads: 3, spend: 200 }).tag).toBe("wait");
    expect(campaignDecision({ ...base, complete: false }).tag).toBe("wait");
  });
  it("ใช้เงินมากไม่มีผล → หยุด · ROAS ต่ำกว่า stopRoas → หยุด", () => {
    expect(campaignDecision({ ...base, leads: 0, spend: 800, roas: null, days: 4 }).tag).toBe("stop");
    expect(campaignDecision({ ...base, roas: 0.8 }).tag).toBe("stop");
  });
  it("เกณฑ์แบรนด์จากหน้าตั้งค่า: CPL เกิน / ROAS ต่ำกว่าเป้า → ตรวจแก้ พร้อมเหตุผลระบุเป้า", () => {
    const d = campaignDecision({ ...base, cpl: 450 }, { cpl: 400, roas: 0 });
    expect(d.tag).toBe("fix");
    expect(d.why).toContain("400");
    expect(campaignDecision({ ...base, roas: 3.5 }, { cpl: 0, roas: 4 }).tag).toBe("fix");
  });
  it("ครีเอทีฟล้า → ตรวจแก้", () => {
    expect(campaignDecision({ ...base, creatives: [{ fatigue: true }] }).tag).toBe("fix");
  });
  it("ผลดีแต่งบเหลือ 0 หรือใช้เร็วกว่าจังหวะ → ติด Gate ไม่ใช่สเกล", () => {
    expect(campaignDecision({ ...base, pace: { remaining: 0, used: 1, expected: 0.5 } }).tag).toBe("gate");
    expect(campaignDecision({ ...base, pace: { remaining: 500, used: 0.9, expected: 0.5 } }).tag).toBe("gate");
    expect(campaignDecision({ ...base, pace: { remaining: 3000, used: 0.5, expected: 0.5 } }).tag).toBe("scale");
  });
  it("ไม่มีงบ (pace.used null) → สเกลได้ตามกฎเดิม (ไม่มี Gate ให้ติด)", () => {
    expect(campaignDecision({ ...base, pace: { remaining: null, used: null, expected: 0.5 } }).tag).toBe("scale");
  });
});

describe("saved views · ยอดรวม · เรียง", () => {
  const rows = [
    { ...base, key: "a", spend: 3000, leads: 10, revenue: 10_500, budget: 5000, decision: { tag: "scale" } },
    { ...base, key: "b", spend: 800, leads: 0, revenue: 0, budget: null, cpl: null, roas: null, decision: { tag: "stop" } },
    { ...base, key: "c", spend: 1200, leads: 2, revenue: 900, budget: 2000, cpl: 600, roas: 0.75, decision: { tag: "wait" } },
  ];
  it("applyView กรองด้วยป้าย · 'ทั้งหมด' คืนทุกแถว", () => {
    expect(applyView(rows, "all")).toHaveLength(3);
    expect(applyView(rows, "scale").map((r) => r.key)).toEqual(["a"]);
    expect(applyView(rows, "spendNoResult").map((r) => r.key)).toEqual(["b"]);
    expect(SAVED_VIEWS.map((v) => v.key)).toEqual(["all", "scale", "fix", "spendNoResult", "fatigue", "wait", "gate"]);
  });
  it("campaignTotals คิดจาก Σ · งบไม่ครบทุกแถว = null · reviewSpend = เงินในแถว fix/stop · waiting = จำนวนรอข้อมูล", () => {
    const t = campaignTotals(rows);
    expect(t.count).toBe(3);
    expect(t.spend).toBe(5000);
    expect(t.budget).toBeNull();
    expect(t.cpl).toBeCloseTo(5000 / 12);
    expect(t.roas).toBeCloseTo(11_400 / 5000);
    expect(t.reviewSpend).toBe(800);
    expect(t.waiting).toBe(1);
    expect(campaignTotals([]).cpl).toBeNull();
  });
  it("sortCampaigns: null ท้ายเสมอทั้งสองทิศ", () => {
    expect(sortCampaigns(rows, "cpl", "asc").map((r) => r.key)).toEqual(["a", "c", "b"]);
    expect(sortCampaigns(rows, "cpl", "desc").map((r) => r.key)).toEqual(["c", "a", "b"]);
  });
});
