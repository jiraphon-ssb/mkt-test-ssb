import { describe, it, expect } from "vitest";
import { audienceRows, campaignRows, NO_ADSET, NO_CAMPAIGN, openKeyFor } from "../src/modules/marketing/adsCampaigns.js";
import { campaignDecision, SAVED_VIEWS, applyView, campaignTotals, sortCampaigns, campaignsByBrand, withSpendShare } from "../src/modules/marketing/adsCampaigns.js";
import { brandCplIndex, cplKey } from "../src/modules/marketing/adsOverview.js";
import { periodRange, sameDatesLastMonth, compareRange, isoDay, PERIOD_PRESETS, monthGrid, rangeLabel, daysInclusive } from "../src/modules/marketing/adsScope.js";

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
  it("series รายวันครบทุกวันในช่วง (วันไม่มีการ์ด = null) · days นับเฉพาะวันที่มีค่าแอด · พก creatives", () => {
    const [a] = campaignRows(cards, RANGE, opts);
    expect(a.series.days[0]).toBe("2026-07-01");
    expect(a.series.days).toContain("2026-07-03");
    expect(a.series.spend[a.series.days.indexOf("2026-07-02")]).toBeNull();
    expect(a.series.spend[a.series.days.indexOf("2026-07-03")]).toBeGreaterThan(0);
    expect(a.days).toBe(2);
    expect(a.creatives[0].creative).toBe("ชิ้น A");
  });
  it("พก Creative metadata จาก connector ไปถึงรายละเอียดแคมเปญ", () => {
    const enriched = card("creative-1", 3, { creative_data: { id: "ad1", creative: { id: "cr1", thumbnail_url: "https://cdn.example/creative.jpg", object_story_spec: { link_data: { message: "ข้อความโฆษณา", link: "https://example.com" } } } } });
    const [campaign] = campaignRows([enriched], RANGE, opts);
    expect(campaign.creatives[0].asset).toMatchObject({ provider: "meta", creativeId: "cr1", destinationUrl: "https://example.com" });
    expect(campaign.creatives[0].asset.media[0].thumbnailUrl).toBe("https://cdn.example/creative.jpg");
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
  it("จังหวะงบใช้ค่าแอด 'เดือนนี้' เสมอ ไม่ใช่ค่าแอดของช่วงที่เลือก (F1)", () => {
    const monthCards = [card("m1", 3, {}), card("m2", 5, {}), card("m3", 12, {})];
    const narrowRange = { start: "2026-07-10T00:00:00.000Z", end: "2026-07-16T00:00:00.000Z" };
    const [a] = campaignRows(monthCards, narrowRange, opts);
    expect(a.spend).toBe(1000);        // เฉพาะการ์ดวันที่ 12 อยู่ในช่วงที่เลือก
    expect(a.monthSpend).toBe(3000);   // รวมทั้งเดือนจนถึงวันนี้ (15 ก.ค.)
    expect(a.pace.used).toBeCloseTo(3000 / 6000);
  });
  it("monthSpend เป็น null เมื่อไม่มีการ์ดของแคมเปญนั้นในเดือนนี้", () => {
    const outOfMonth = [card("o1", 20, { metrics: { ...card("x", 20).metrics, measured_at: "2026-05-20T09:00:00.000Z" } })];
    const wideRange = { start: "2026-05-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" };
    const [a] = campaignRows(outOfMonth, wideRange, opts);
    expect(a.monthSpend).toBeNull();
    expect(a.pace.used).toBeNull();
    expect(a.pace.remaining).toBeNull();
  });
  it("การ์ดที่ขาดตัวชี้วัดบางตัว → complete:false และป้ายตัดสินใจเป็นรอข้อมูล (F10a)", () => {
    const incomplete = card("i1", 3, { metrics: { ...card("x", 3).metrics, spend: null } });
    const [row] = campaignRows([incomplete], RANGE, opts);
    expect(row.complete).toBe(false);
    expect(campaignDecision(row).tag).toBe("wait");
  });
  it("งบแคมเปญคำนวณได้ ≤ 0 → budget เป็น null เหมือนไม่มีงบ (F9)", () => {
    const zeroShareCb = [{ ...cb[0], share: 0 }, cb[1]];
    const [a] = campaignRows(cards, RANGE, { ...opts, campaignBudgets: zeroShareCb });
    expect(a.budget).toBeNull();
    expect(a.pace.used).toBeNull();
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
  it("ล้าทั้งแคมเปญเมื่อครีเอทีฟที่ล้ากินค่าแอดเกินครึ่ง · ชิ้นเล็กล้าชิ้นเดียวไม่ลากทั้งแคมเปญ", () => {
    const small = [{ fatigue: true, spend: 100 }, { fatigue: false, spend: 2900 }];
    expect(campaignDecision({ ...base, creatives: small }).tag).not.toBe("fix");
    const big = [{ fatigue: true, spend: 2000 }, { fatigue: false, spend: 1000 }];
    const d = campaignDecision({ ...base, creatives: big });
    expect(d.tag).toBe("fix");
    expect(d.why).toContain("66.66%");   // 2/3 ตัดทิ้ง ไม่ปัดเป็น 67
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

describe("campaignDecision — ข้อมูลจริง: ไม่ตัดสินด้วย ROAS ที่ Meta เห็น", () => {
  const real = { roasFromMeta: false };
  // แคมเปญทักแชทจริง: CPL ถูกมาก แต่ Meta เห็นยอดซื้อแทบศูนย์ → ROAS 0.1x
  const inbox = { ...base, roas: 0.1, cpl: 60 };

  it("ROAS ต่ำจาก Meta ไม่ทำให้ขึ้น พิจารณาหยุด/ตรวจแก้ · CPL ดี = ติดตาม พร้อมบอกว่าทำไมไม่แนะนำสเกล", () => {
    expect(campaignDecision(inbox).tag).toBe("stop");            // โหมดเดิม (ข้อมูลจำลอง) ยังเหมือนเดิม
    const d = campaignDecision(inbox, null, undefined, real);
    expect(d.tag).toBe("watch");
    expect(d.why).toContain("ยอดขายรายแคมเปญ");
  });

  it("ROAS สูงจาก Meta ก็ไม่ทำให้ขึ้น สเกล", () => {
    expect(campaignDecision({ ...base, roas: 5, cpl: 60 }, null, undefined, real).tag).toBe("watch");
  });

  it("กฎที่ไม่ใช้ ROAS ยังทำงาน: ใช้เงินไม่มีผล → หยุด · ล้า → ตรวจแก้ · CPL เกินเพดานระบบขาย / เกณฑ์กลาง → ตรวจแก้", () => {
    expect(campaignDecision({ ...base, leads: 0, spend: 800, days: 4 }, null, undefined, real).tag).toBe("stop");
    expect(campaignDecision({ ...inbox, creatives: [{ fatigue: true }] }, null, undefined, real).tag).toBe("fix");
    expect(campaignDecision({ ...inbox, cpl: 450 }, { cpl: 400 }, undefined, real).tag).toBe("fix");
    expect(campaignDecision({ ...inbox, cpl: 650 }, null, undefined, real).tag).toBe("fix");
  });

  it("ข้อมูลไม่พอ → รอข้อมูล เหมือนเดิม", () => {
    expect(campaignDecision({ ...inbox, days: 2 }, null, undefined, real).tag).toBe("wait");
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
    expect(applyView(rows, "stop").map((r) => r.key)).toEqual(["b"]);
    // "ควรหยุด" รวมทั้งใช้เงินไม่มีผล และ CPL แพงเกิน 2.5 เท่า (ทดสอบแบบใช้งานจริง 27 ก.ย.) · เรียงตามความเร่ง
    expect(SAVED_VIEWS.map((v) => v.key)).toEqual(["all", "stop", "fix", "scale", "fatigue", "good", "wait", "gate", "sells", "idle"]);
  });
  it("campaignTotals คิดจาก Σ · งบ = Σ ของแถวที่มีงบ (ไม่ต้องครบทุกแถว) · reviewSpend = เงินในแถว fix/stop · waiting = จำนวนรอข้อมูล (F2)", () => {
    const t = campaignTotals(rows);
    expect(t.count).toBe(3);
    expect(t.spend).toBe(5000);
    expect(t.budget).toBe(7000);       // Σ ของแถว a (5000) + c (2000) — แถว b ไม่มีงบ
    expect(t.budgetRows).toBe(2);
    expect(t.cpl).toBeCloseTo(5000 / 12);
    expect(t.roas).toBeCloseTo(11_400 / 5000);
    expect(t.reviewSpend).toBe(800);
    expect(t.waiting).toBe(1);
    expect(campaignTotals([{ ...base, key: "x", spend: 100, leads: 1, revenue: 0, budget: null }]).budget).toBeNull();
    expect(campaignTotals([{ ...base, key: "x", spend: 100, leads: 1, revenue: 0, budget: null }]).budgetRows).toBe(0);
    expect(campaignTotals([]).cpl).toBeNull();
  });
  it("sortCampaigns: null ท้ายเสมอทั้งสองทิศ", () => {
    expect(sortCampaigns(rows, "cpl", "asc").map((r) => r.key)).toEqual(["a", "c", "b"]);
    expect(sortCampaigns(rows, "cpl", "desc").map((r) => r.key)).toEqual(["c", "a", "b"]);
  });
  it("sortCampaigns: คอลัมน์ชื่อ (string) เรียงด้วย localeCompare ได้ทั้งขึ้น/ลง (F10b)", () => {
    const named = [{ name: "Banana" }, { name: "Apple" }, { name: "Cherry" }];
    expect(sortCampaigns(named, "name", "asc").map((r) => r.name)).toEqual(["Apple", "Banana", "Cherry"]);
    expect(sortCampaigns(named, "name", "desc").map((r) => r.name)).toEqual(["Cherry", "Banana", "Apple"]);
  });
  it("applyView: ตรวจแก้ / เสี่ยงล้า / ติด Gate (F10c)", () => {
    const rows2 = [
      { key: "f1", decision: { tag: "fix" }, creatives: [] },
      { key: "f2", decision: { tag: "watch" }, creatives: [{ fatigue: true }] },
      { key: "f3", decision: { tag: "gate" }, creatives: [] },
      { key: "f4", decision: { tag: "scale" }, creatives: [] },
    ];
    expect(applyView(rows2, "fix").map((r) => r.key)).toEqual(["f1"]);
    expect(applyView(rows2, "fatigue").map((r) => r.key)).toEqual(["f2"]);
    expect(applyView(rows2, "gate").map((r) => r.key)).toEqual(["f3"]);
  });
  it("campaignTotals.pctAds = Σspend ÷ Σrevenue · revenue รวม 0 = null (F10d)", () => {
    expect(campaignTotals(rows).pctAds).toBeCloseTo(5000 / 11_400);
    const zeroRevenue = rows.map((r) => ({ ...r, revenue: 0 }));
    expect(campaignTotals(zeroRevenue).pctAds).toBeNull();
  });
});

describe("campaignsByBrand (F8)", () => {
  it("รวมค่าแอด/จำนวนแคมเปญ ทั้งรวมและแยกตามแบรนด์", () => {
    const rows = [
      { brandId: "b_td", spend: 1000 },
      { brandId: "b_td", spend: 500 },
      { brandId: "b_jt", spend: 300 },
    ];
    const r = campaignsByBrand(rows);
    expect(r.total).toEqual({ spend: 1800, count: 3 });
    expect(r.byBrand.b_td).toEqual({ spend: 1500, count: 2 });
    expect(r.byBrand.b_jt).toEqual({ spend: 300, count: 1 });
  });
});

describe("withSpendShare (F11)", () => {
  it("คิดสัดส่วนใหม่จากผลรวมของแถวที่ส่งเข้ามาเท่านั้น", () => {
    const rows = [{ spend: 300 }, { spend: 100 }];
    const out = withSpendShare(rows);
    expect(out[0].spendShare).toBeCloseTo(0.75);
    expect(out[1].spendShare).toBeCloseTo(0.25);
  });
  it("ผลรวมเป็น 0 → spendShare เป็น null ทุกแถว", () => {
    const out = withSpendShare([{ spend: 0 }, { spend: 0 }]);
    expect(out.every((r) => r.spendShare === null)).toBe(true);
  });
});

describe("adsScope", () => {
  const NOW = new Date(2026, 8, 12, 10, 0, 0);            // 12 ก.ย. 2026 local
  it("mtd = ต้นเดือนถึงพรุ่งนี้ (end exclusive) · 7d ย้อน 6 วัน · custom ใช้วันที่ที่ส่ง", () => {
    const m = periodRange("mtd", null, null, NOW);
    expect(isoDay(new Date(m.start))).toBe("2026-09-01");
    expect(isoDay(new Date(m.end))).toBe("2026-09-13");
    expect(isoDay(new Date(periodRange("7d", null, null, NOW).start))).toBe("2026-09-06");
    const c = periodRange("custom", "2026-09-03", "2026-09-05", NOW);
    expect(isoDay(new Date(c.end))).toBe("2026-09-06");
  });
  it("sameDatesLastMonth เลื่อนทั้งช่วงไป 1 เดือน", () => {
    const r = sameDatesLastMonth(periodRange("mtd", null, null, NOW));
    expect(isoDay(new Date(r.start))).toBe("2026-08-01");
  });
  it("preset ครบชุดแบบ Ads Manager และ periodRange รองรับทุก key", () => {
    expect(PERIOD_PRESETS.map((p) => p[0])).toEqual(["today", "yesterday", "wtd", "lastWeek", "7d", "14d", "30d", "mtd", "lastMonth"]);
    expect(isoDay(new Date(periodRange("14d", null, null, NOW).start))).toBe("2026-08-30");
    expect(isoDay(new Date(periodRange("30d", null, null, NOW).start))).toBe("2026-08-14");
    const y = periodRange("yesterday", null, null, NOW);
    expect([isoDay(new Date(y.start)), isoDay(new Date(y.end))]).toEqual(["2026-09-11", "2026-09-12"]);
    const lm = periodRange("lastMonth", null, null, NOW);
    expect([isoDay(new Date(lm.start)), isoDay(new Date(lm.end))]).toEqual(["2026-08-01", "2026-09-01"]);
  });
  it("สัปดาห์นี้ = จันทร์ถึงวันนี้ · สัปดาห์ก่อน = จันทร์–อาทิตย์เต็มสัปดาห์ (ประชุมรายสัปดาห์)", () => {
    const days = (r) => [isoDay(new Date(r.start)), isoDay(new Date(r.end))];
    expect(days(periodRange("wtd", null, null, NOW))).toEqual(["2026-09-07", "2026-09-13"]);          // 12 ก.ย. = วันเสาร์
    expect(days(periodRange("lastWeek", null, null, NOW))).toEqual(["2026-08-31", "2026-09-07"]);
    const sunday = new Date(2026, 8, 13, 10);
    expect(days(periodRange("wtd", null, null, sunday))).toEqual(["2026-09-07", "2026-09-14"]);
  });
  it("compareRange: สัปดาห์นี้เทียบวันเดียวกันของสัปดาห์ก่อน · เดือนก่อนเลื่อน 1 เดือน · อื่นๆ ช่วงยาวเท่ากันก่อนหน้า", () => {
    const days = (r) => [isoDay(new Date(r.start)), isoDay(new Date(r.end))];
    expect(days(compareRange("wtd", periodRange("wtd", null, null, NOW), "previous"))).toEqual(["2026-08-31", "2026-09-06"]);
    expect(days(compareRange("7d", periodRange("7d", null, null, NOW), "previous"))).toEqual(["2026-08-30", "2026-09-06"]);
    expect(days(compareRange("mtd", periodRange("mtd", null, null, NOW), "lastMonth"))).toEqual(["2026-08-01", "2026-08-13"]);
  });
  it("monthGrid: ก.ย. 2026 เริ่มวันอังคาร · 7 คอลัมน์ · เติม null หัว/ท้าย", () => {
    const g = monthGrid(2026, 8);
    expect(g[0]).toEqual([null, null, "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g.at(-1).slice(0, 3)).toEqual(["2026-09-27", "2026-09-28", "2026-09-29"]);
    expect(g.flat().filter(Boolean).length).toBe(30);
  });
  it("rangeLabel ย่อเดือน/ปีที่ซ้ำ · daysInclusive นับรวมหัวท้าย", () => {
    // พ.ศ. ให้ตรงกับกราฟและหน้าบิล (รีวิว UX 25 ก.ย.: เดิมตัวเลือกช่วงวันตัวเดียวที่เป็น ค.ศ.)
    expect(rangeLabel("2026-09-01", "2026-09-14")).toBe("1 – 14 ก.ย. 2569");
    expect(rangeLabel("2026-08-28", "2026-09-14")).toBe("28 ส.ค. – 14 ก.ย. 2569");
    expect(rangeLabel("2025-12-28", "2026-01-03")).toBe("28 ธ.ค. 2568 – 3 ม.ค. 2569");
    expect(rangeLabel("2026-09-14", "2026-09-14")).toBe("14 ก.ย. 2569");
    expect(daysInclusive("2026-09-01", "2026-09-14")).toBe(14);
  });
});

describe("ยอดขายไม่รู้ (ข้อมูลจริงจาก Meta ที่ไม่มี purchase)", () => {
  it("revenue null ต้องเป็น null ทั้งแถวแคมเปญและยอดรวม ไม่ใช่ ฿0 · ROAS/%Ads = null", () => {
    const unknown = [card("u1", 3, { metrics: { ...card("x", 3).metrics, revenue: null } }), card("u2", 5, { metrics: { ...card("x", 5).metrics, revenue: null } })];
    const [row] = campaignRows(unknown, RANGE, opts);
    expect(row.spend).toBe(2000);
    expect(row.revenue).toBeNull();
    expect(row.roas).toBeNull();
    expect(row.pctAds).toBeNull();
    const totals = campaignTotals([row, campaignRows(cards, RANGE, opts)[0]]);
    expect(totals.revenue).toBeNull();
    expect(totals.roas).toBeNull();
  });
});

/* ลิงก์จากหน้าต่างครีเอทีฟ → /mkt/campaigns?open=<ชื่อแคมเปญ> เปิดแผงของแคมเปญนั้น (สเปก 2026-09-25) */
describe("openKeyFor", () => {
  const rows = [{ key: "k1", name: "C1" }, { key: "k2", name: "C2" }];
  it("ชื่อตรง = key ของแถวนั้น · ไม่เจอ/ว่าง = null", () => {
    expect(openKeyFor(rows, "C2")).toBe("k2");
    expect(openKeyFor(rows, "ไม่มี")).toBeNull();
    expect(openKeyFor(rows, "")).toBeNull();
  });
});

/* 26 ก.ย. อาร์ตเคาะ: ยังไม่ตั้งเป้า CPL → ตัดสินจากค่าเฉลี่ยของแบรนด์เดียวกัน (เดิมขึ้น "CPL อยู่ในเกณฑ์" ทั้งที่แพงกว่าเฉลี่ย 2.24 เท่า)
   แพง ≥ 1.5 เท่า = ตรวจแก้ · ถูก ≤ 0.8 เท่า = ต้นทุนดี · ตั้งเป้า CPL แล้ว = ใช้เป้า ไม่ใช้ค่าเฉลี่ย */
describe("CPL เทียบค่าเฉลี่ยแบรนด์", () => {
  it("campaignRows: brandCpl = Σค่าแอด ÷ Σผลลัพธ์ของแบรนด์ · cplRatio = CPL ÷ ค่าเฉลี่ย · ไม่มีผลลัพธ์ = null · แยกแบรนด์", () => {
    const jk = card("j1", 4, { brand_id: "b_jk", campaign: "JK — ทักแชท", metrics: { ...card("x", 4).metrics, spend: 900, leads: 3 } });
    const rows = campaignRows([...cards, jk], RANGE, opts);
    const always = rows.find((r) => r.name === "Always-on — คนเคยทัก");
    const prospect = rows.find((r) => r.name === "Prospecting — กลุ่มใหม่");
    expect(always.brandCpl).toBe(500);          // TEAMDEE 4,000 ÷ 8
    expect(always.cplRatio).toBe(0.5);          // 250 ÷ 500
    expect(prospect.cplRatio).toBeNull();       // ไม่มีผลลัพธ์ = ไม่มี CPL ให้เทียบ
    expect(rows.find((r) => r.name === "JK — ทักแชท")).toMatchObject({ brandCpl: 300, cplRatio: 1 });
  });

  const real = { roasFromMeta: false };
  const row = (cpl, brandCpl = 70.85) => ({ ...base, roas: 0.1, cpl, brandCpl, cplRatio: cpl / brandCpl });

  it("แพงกว่าเฉลี่ย 1.5–2.5 เท่า → ตรวจแก้ พร้อมเหตุผลเป็นตัวเลขตัดไม่ปัด", () => {
    const d = campaignDecision(row(159.2), null, undefined, real);
    expect(d.tag).toBe("fix");
    expect(d.why).toBe("CPL ฿159.20 แพงกว่าเฉลี่ยแบรนด์ ฿70.85 อยู่ 124.70%");
    expect(d.basis).toBe("average");
  });
  it("ถูกกว่าเฉลี่ย ≤ 0.8 เท่า → ต้นทุนดี (ไม่ใช่สเกล — ยังไม่มียอดขายรายแคมเปญ)", () => {
    const d = campaignDecision(row(43.67), null, undefined, real);
    expect(d).toMatchObject({ tag: "good", label: "ต้นทุนดี", tone: "emerald", basis: "average" });
    expect(d.why).toBe("CPL ฿43.67 ถูกกว่าเฉลี่ยแบรนด์ ฿70.85 อยู่ 38.36%");
  });
  it("อยู่ระหว่างกลาง → ติดตามเหมือนเดิม", () => {
    expect(campaignDecision(row(86.99), null, undefined, real).tag).toBe("watch");
  });
  it("ข้อมูลตัวอย่าง: ตั้งเป้า CPL ในหน้าตั้งค่าแล้ว = ใช้เป้าอย่างเดียว ไม่ใช้ค่าเฉลี่ย", () => {
    const demo = (cpl) => ({ ...row(cpl), roas: 2 });   // ROAS กลางๆ ไม่ให้กฎ ROAS ตัดสินแทน
    expect(campaignDecision(demo(159.2), { cpl: 200 }).tag).not.toBe("fix");
    expect(campaignDecision(demo(43.67), { cpl: 200 }).tag).not.toBe("good");
    expect(campaignDecision(demo(250), { cpl: 200 }).tag).toBe("fix");
  });
  /* ข้อมูลจริง: เพดาน CPL จากระบบขาย (เช่น ≤ ฿790) เป็นเพดานบน ไม่ใช่เป้า — ทุกแคมเปญต่ำกว่าอยู่แล้ว
     จึงเช็กเพดานก่อน แล้วยังเทียบค่าเฉลี่ยแบรนด์ต่อ (เห็นจริง 26 ก.ย.: ช่องควรทำต่อว่างทั้งตาราง) */
  it("ข้อมูลจริง: เกินเพดานระบบขาย → ตรวจแก้ตามเพดาน · ต่ำกว่าเพดานยังเทียบค่าเฉลี่ย", () => {
    const over = campaignDecision(row(450, 400), { cpl: 400 }, undefined, real);   // ต่ำกว่ากฎกลาง ฿500 แต่เกินเพดาน
    expect(over.tag).toBe("fix");
    expect(over.why).toContain("฿400.00");
    expect(campaignDecision(row(159.2), { cpl: 790 }, undefined, real)).toMatchObject({ tag: "fix", basis: "average" });
    expect(campaignDecision(row(43.67), { cpl: 790 }, undefined, real).tag).toBe("good");
  });
  it("กฎที่สำคัญกว่ายังมาก่อน: รอข้อมูล / ใช้เงินไม่มีผล", () => {
    expect(campaignDecision({ ...row(159.2), days: 2 }, null, undefined, real).tag).toBe("wait");
  });
  it("มุมมอง 'ต้นทุนดี' กรองแถว good", () => {
    const rows = [{ decision: { tag: "good" } }, { decision: { tag: "watch" } }];
    expect(SAVED_VIEWS.find((v) => v.key === "good").label).toBe("ต้นทุนดี");
    expect(applyView(rows, "good")).toHaveLength(1);
  });
});

/* 26 ก.ย. (สเปก campaign-page-audience): ตัวเลขชุดเดียวกับหน้า Creative */
describe("campaignRows — CTR ลิงก์ · ROAS ไม่หลอกตา · ความถี่ช่วงก่อน", () => {
  const withLink = (id, day, link, over = {}) => card(id, day, { metrics: { ...card("x", day).metrics, link_clicks: link, ...over } });
  it("CTR ลิงก์ · CPC ลิงก์ จาก link_clicks · ไม่มี link_clicks = null", () => {
    const [row] = campaignRows([withLink("a", 3, 100), withLink("b", 5, 60)], RANGE, opts);
    expect(row).toMatchObject({ linkClicks: 160, linkCtr: 0.004, linkCpc: 12.5 });   // 160 ÷ 40,000 · 2,000 ÷ 160
    const [none] = campaignRows([card("c", 3)], RANGE, opts);
    expect(none).toMatchObject({ linkClicks: null, linkCtr: null, linkCpc: null });
  });
  it("Meta ไม่เห็นยอด (รายได้ 0) → ROAS null ไม่ใช่ 0.00x", () => {
    const [row] = campaignRows([card("a", 3, { metrics: { ...card("x", 3).metrics, revenue: 0 } })], RANGE, opts);
    expect(row.roas).toBeNull();
  });
  it("ความถี่เทียบช่วงก่อน (ช่วงก่อน = การแสดงผล ÷ เข้าถึง ของช่วงก่อน)", () => {
    const now = card("n", 5, { metrics: { ...card("x", 5).metrics, impressions: 30_000, reach: 10_000 } });   // 3.00x
    const before = card("b", 20, { metrics: { ...card("x", 20).metrics, measured_at: "2026-06-20T09:00:00.000Z" } }); // 2.00x
    const [row] = campaignRows([now, before], RANGE, opts);
    expect(row.frequency).toBe(3);
    expect(row.delta.frequency).toBe(50);                                                      // +50% (หน่วยเดียวกับ delta อื่น)
  });
});

/* 26 ก.ย. (สเปก campaign-page-audience): ชุดโฆษณา = กลุ่มเป้าหมายที่ทีมใช้ซ้ำข้ามแคมเปญ → รวมข้ามแคมเปญ */
describe("audienceRows — รวมตามกลุ่มเป้าหมาย", () => {
  const ad = (id, campaign, adGroup, spend, leads, over = {}) => card(id, 5, { campaign, ad_group: adGroup, metrics: { ...card("x", 5).metrics, spend, leads, link_clicks: 50, ...over } });
  const cardsA = [
    ad("1", "JD1 | NEW | หว่าน | VDO", "หว่าน | 30-55", 3000, 60),    // CPL 50
    ad("2", "JD1 | NEW | หว่าน | PIC", "หว่าน | 30-55", 2000, 20),    // CPL 100
    ad("3", "JD1 | RE | VDO", "JD 1 | RETARGET", 4000, 10),            // CPL 400
    ad("4", "JD1 | ไม่มีชุด", null, 1000, 10),
  ];
  const rows = audienceRows(cardsA, RANGE, { brands: BRANDS });
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));

  it("ชื่อชุดเดียวกันข้ามแคมเปญ = แถวเดียว รวมตัวเลข · รายชื่อแคมเปญข้างในเรียงค่าแอด", () => {
    expect(by["หว่าน | 30-55"]).toMatchObject({ spend: 5000, leads: 80, cpl: 62.5, brand: "TEAMDEE", platform: "Meta Ads" });
    expect(by["หว่าน | 30-55"].campaigns.map((c) => [c.name, c.spend, c.cpl])).toEqual([["JD1 | NEW | หว่าน | VDO", 3000, 50], ["JD1 | NEW | หว่าน | PIC", 2000, 100]]);
    expect(rows.map((r) => r.name)).toEqual(["หว่าน | 30-55", "JD 1 | RETARGET", NO_ADSET]);          // ค่าแอดมากก่อน
  });
  it("ไม่มีชื่อชุด = กลุ่ม 'ไม่ระบุชุดโฆษณา' · สัดส่วนค่าแอดรวม = 1 · CTR ลิงก์ ความถี่", () => {
    expect(by[NO_ADSET].spend).toBe(1000);
    expect(rows.reduce((n, r) => n + r.spendShare, 0)).toBeCloseTo(1);
    expect(by["หว่าน | 30-55"]).toMatchObject({ linkClicks: 100, linkCtr: 0.0025, frequency: 2 });   // 100 ÷ 40,000 · 40,000 ÷ 20,000
  });
  it("แคมเปญเดียวสองชุด = ตัวเลขแบ่งตามชุดจริง", () => {
    const two = audienceRows([ad("a", "C1", "ชุด A", 1000, 10), ad("b", "C1", "ชุด B", 3000, 10)], RANGE, { brands: BRANDS });
    expect(two.map((r) => [r.name, r.spend])).toEqual([["ชุด B", 3000], ["ชุด A", 1000]]);
  });
  it("กลุ่มที่ไม่มีค่าแอดในช่วงนี้ไม่ขึ้น (เห็นจริง 26 ก.ย.: ฿0.00 ผลลัพธ์ตกค้าง 1 → 'CPL ฿0.00 ถูกกว่าเฉลี่ย 100%')", () => {
    const list = audienceRows([ad("z", "C0", "ค้างจากเดือนก่อน", 0, 1), ad("y", "C1", "จริง", 1000, 10)], RANGE, { brands: BRANDS });
    expect(list.map((r) => r.name)).toEqual(["จริง"]);
  });
  /* ชุดเดียวกันแต่รัน 3 วัน (ยอดรวมเท่าเดิม) — คำแนะนำต้องผ่านเกณฑ์วันขั้นต่ำเดียวกับแคมเปญก่อน */
  const ad3 = (id, campaign, adGroup, spend, leads) => [5, 6, 7].map((d, i) => card(`${id}-${d}`, d, { campaign, ad_group: adGroup,
    metrics: { ...card("x", d).metrics, spend: i === 0 ? spend - 2 : 1, leads: i === 0 ? leads : 0, revenue: 0, link_clicks: 50 } }));   // ทักแชท: Meta ไม่เห็นยอด
  const by3 = Object.fromEntries(audienceRows([
    ...ad3("1", "JD1 | NEW | หว่าน | VDO", "หว่าน | 30-55", 3000, 60), ...ad3("2", "JD1 | NEW | หว่าน | PIC", "หว่าน | 30-55", 2000, 20),
    ...ad3("3", "JD1 | RE | VDO", "JD 1 | RETARGET", 4000, 10), ...ad3("4", "JD1 | ไม่มีชุด", null, 1000, 10),
  ], RANGE, { brands: BRANDS }).map((r) => [r.name, r]));
  it("คำแนะนำ: เทียบ CPL เฉลี่ยแบรนด์ · ผลลัพธ์ < 5 = รอข้อมูล", () => {
    // เฉลี่ยแบรนด์ = 10,000 ÷ 100 = ฿100
    expect(by3["หว่าน | 30-55"].decision).toMatchObject({ tag: "good", label: "ต้นทุนดี" });   // 62.5 = 0.62 เท่า
    expect(by3["JD 1 | RETARGET"].decision.tag).toBe("stop");                                  // 400 = 4 เท่า ≥ 2.5 → ควรหยุด (27 ก.ย.)
    expect(by3["JD 1 | RETARGET"].decision.why).toBe("CPL ฿400.00 แพงกว่าเฉลี่ยแบรนด์ ฿100.00 อยู่ 300.00%");
    expect(by3[NO_ADSET].decision.tag).toBe("watch");                                          // 100 = 1 เท่า
    const few = audienceRows([...ad3("f", "C", "น้อย", 500, 3), ...ad3("g", "D", "มาก", 5000, 50)], RANGE, { brands: BRANDS });
    expect(few.find((r) => r.name === "น้อย").decision.tag).toBe("wait");
  });
  /* ทดสอบละเอียด 27 ก.ย.: มุมกลุ่มเป้าหมายไม่มีเกณฑ์วันขั้นต่ำ — แคมเปญรัน 1 วันขึ้น "รอข้อมูล" แต่กลุ่มของมันขึ้น "ควรแก้ 4 เท่า" */
  it("รันไม่ถึง 3 วัน = รอข้อมูล เหมือนแคมเปญ (รวมกรณีใช้เงินไม่มีผล)", () => {
    expect(by["JD 1 | RETARGET"].decision).toMatchObject({ tag: "wait" });
    expect(by["JD 1 | RETARGET"].decision.why).toMatch(/1 วัน/);
    // ใช้เงินไม่มีผลแต่ยังไม่ครบวัน = รอข้อมูลเหมือนแคมเปญ (ทดสอบละเอียดรอบ 2: เดิมกลุ่มขึ้นควรหยุด แคมเปญขึ้นรอข้อมูล)
    const wasted = audienceRows([ad("w", "W", "เผา", 5000, 0)], RANGE, { brands: BRANDS })[0];
    expect(wasted.decision.tag).toBe("wait");
  });
});

/* ชุด A ข้อ 2 (ตรวจรอบละเอียด 26 ก.ย.): รายได้ไม่รู้ ≠ ข้อมูลไม่ครบ — แค่ทำให้ ROAS เป็น "—"
   เดิมบัญชีที่ไม่วัดมูลค่าการซื้อ และตอนเลือก "คิดจากยอดใหม่" ทุกแคมเปญขึ้น "รอข้อมูล" ถาวร */
describe("ความครบของข้อมูลดูแค่ค่าแอดกับผลลัพธ์", () => {
  it("รายได้ไม่รู้ทุกวัน → complete:true · ROAS null · ยังตัดสินจาก CPL ได้", () => {
    const noRevenue = [card("r1", 3), card("r2", 5), card("r3", 8)].map((c) => ({ ...c, metrics: { ...c.metrics, revenue: null } }));
    const [row] = campaignRows(noRevenue, RANGE, opts);
    expect(row.complete).toBe(true);
    expect(row.roas).toBeNull();
    expect(campaignDecision(row, null, undefined, { roasFromMeta: false }).tag).not.toBe("wait");
  });
  it("ผลลัพธ์ไม่รู้ → ยังเป็น complete:false (ห้ามเดาเป็น 0)", () => {
    const [row] = campaignRows([card("l1", 3, { metrics: { ...card("x", 3).metrics, leads: null } })], RANGE, opts);
    expect(row.complete).toBe(false);
  });
});

/* ชุด A ข้อ 6: ค่าเฉลี่ยแบรนด์นับเฉพาะวันที่รู้ผลลัพธ์ และทุกหน้าใช้ค่าเดียวกัน
   (เดิม: ค่าแอดของวันที่ไม่รู้ผลลัพธ์ถูกนับ → เฉลี่ยจริง ฿133 กลายเป็น ฿466 · ป้าย "ตรวจแก้" กลายเป็น "ต้นทุนดี") */
describe("ค่าเฉลี่ยแบรนด์ชุดเดียวทั้งระบบ", () => {
  const c = (id, campaign, spend, leads, day = 5, adGroup = null) => card(id, day, { campaign, ad_group: adGroup, metrics: { ...card("x", day).metrics, spend, leads } });
  // ดี CPL 100 (1,000/10) · กลาง CPL 200 (2,000/10) · ไม่รู้ผลลัพธ์ 25,000
  const mixed = [c("g", "ดี", 1000, 10), c("m", "กลาง", 2000, 10), c("u", "ไม่รู้ผล", 25000, null)];

  it("brandCplIndex ไม่นับค่าแอดของวันที่ไม่รู้ผลลัพธ์", () => {
    expect(brandCplIndex(mixed, RANGE).get(cplKey("b_td", "Meta Ads"))).toBeCloseTo(3000 / 20, 6);
  });
  it("campaignRows: CPL เฉลี่ย ฿150 → แคมเปญ CPL ฿200 = 1.33 เท่า (ไม่ใช่ถูกกว่าเฉลี่ย) · แคมเปญที่ไม่รู้ผลลัพธ์ไม่มีอัตราเทียบ", () => {
    const rows = campaignRows(mixed, RANGE, { ...opts, campaignBudgets: [] });
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(by["กลาง"].brandCpl).toBeCloseTo(150, 6);
    expect(by["กลาง"].cplRatio).toBeCloseTo(4 / 3, 6);
    expect(by["ไม่รู้ผล"].cplRatio).toBeNull();
  });
  it("การ์ดครีเอทีฟในแผงแคมเปญเทียบกับค่าเฉลี่ยแบรนด์ ไม่ใช่เฉพาะแคมเปญนั้น", () => {
    const rows = campaignRows([...mixed, c("g2", "ดี", 1000, 10, 6), c("g3", "ดี", 1000, 10, 7)], RANGE, { ...opts, campaignBudgets: [], roasFromMeta: false });
    const good = rows.find((r) => r.name === "ดี");
    // เฉลี่ยแบรนด์ = 5,000 ÷ 40 = ฿125 · ครีเอทีฟในแคมเปญ "ดี" CPL ฿100 = 0.8 เท่า → ต้นทุนดี
    expect(good.creatives[0].action).toBe("Good");
  });
  it("audienceRows: ใช้ค่าเฉลี่ยที่ส่งมา · กลุ่มที่ไม่รู้ผลลัพธ์ = รอข้อมูล ไม่ใช่ 'พิจารณาหยุด'", () => {
    const list = audienceRows([c("a", "C1", 2000, null, 5, "ไม่รู้ผล"), c("b", "C2", 2000, null, 6, "ไม่รู้ผล"), c("d", "C3", 3000, 20, 5, "ปกติ")], RANGE, { brands: BRANDS, brandCpl: new Map([[cplKey("b_td", "Meta Ads"), 150]]) });
    const unknown = list.find((r) => r.name === "ไม่รู้ผล");
    expect(unknown.decision.tag).toBe("wait");
    expect(unknown.cplRatio).toBeNull();
    expect(list.find((r) => r.name === "ปกติ").brandCpl).toBe(150);
  });
});

/* ชุด A ข้อ 15: CTR/CPC ลิงก์หารเฉพาะวันที่มีข้อมูลคลิกลิงก์ — เดิมเอาการแสดงผลทุกวันมาหาร ได้ 0.125% ทั้งที่จริง 0.5% */
describe("CTR ลิงก์ เมื่อบางวันไม่มีข้อมูลคลิกลิงก์", () => {
  const day = (id, d, link) => card(id, d, { metrics: { ...card("x", d).metrics, spend: 1000, impressions: 20_000, ...(link == null ? {} : { link_clicks: link }) } });
  const cardsL = [day("a", 3, 100), day("b", 4), day("c", 5), day("d", 6)];
  it("campaignRows / audienceRows: 100 ÷ 20,000 = 0.5% · CPC ลิงก์ 1,000 ÷ 100 = ฿10", () => {
    const [row] = campaignRows(cardsL, RANGE, opts);
    expect(row.linkCtr).toBeCloseTo(0.005, 10);
    expect(row.linkCpc).toBeCloseTo(10, 10);
    const [aud] = audienceRows(cardsL, RANGE, { brands: BRANDS });
    expect(aud.linkCtr).toBeCloseTo(0.005, 10);
  });
});

/* ทดสอบละเอียด 27 ก.ย.: หัวแคมเปญบอก ROAS (Meta) "—" (Meta ไม่เห็นยอด) แต่กราฟรายวันแท็บ ROAS ลากเส้นที่ 0.00× */
it("กราฟรายวัน: วันที่ Meta ไม่เห็นยอด = ไม่มีจุด (null) ไม่ใช่ 0", () => {
  const RANGE7 = { start: "2026-07-01T00:00:00.000Z", end: "2026-07-10T00:00:00.000Z" };
  const noRev = card("n1", 3, { metrics: { ...card("x", 3).metrics, revenue: 0 } });
  const [row] = campaignRows([noRev], RANGE7, { brands: BRANDS, today: "2026-07-09" });
  expect(row.series.roas.filter((v) => v === 0)).toEqual([]);
});


/* อาร์ตเคาะ 27 ก.ย.: "เฉลี่ยแบรนด์" = แบรนด์เดียวกัน + แพลตฟอร์มเดียวกัน — ผลลัพธ์ต่างแพลตฟอร์มคนละชนิด เฉลี่ยรวมกันจะเพี้ยน
   และเดิมหน้าแคมเปญคิดตามตัวกรองช่องทาง แต่หน้า Creative คิดทุกช่องทาง → ตัวเลขไม่ตรงกัน */
describe("เฉลี่ยแบรนด์แยกตามแพลตฟอร์ม", () => {
  const p = (id, platform, spend, leads) => card(id, 3, { campaign: `C-${id}`, ad_platform: platform, metrics: { ...card("x", 3).metrics, spend, leads } });
  const cards2 = [p("m1", "Meta Ads", 1000, 10), p("m2", "Meta Ads", 3000, 10), p("t1", "TikTok Ads", 5000, 10)];
  it("ค่าเฉลี่ยแยกแบรนด์ × แพลตฟอร์ม", () => {
    const idx = brandCplIndex(cards2, RANGE);
    expect(idx.get(cplKey("b_td", "Meta Ads"))).toBe(200);        // 4,000 ÷ 20
    expect(idx.get(cplKey("b_td", "TikTok Ads"))).toBe(500);
  });
  it("แคมเปญเทียบกับค่าเฉลี่ยของแพลตฟอร์มตัวเอง ไม่ปนแพลตฟอร์มอื่น", () => {
    const rows = campaignRows(cards2, RANGE, { brands: BRANDS, today: "2026-07-15" });
    expect(rows.find((r) => r.name === "C-m2").brandCpl).toBe(200);
    expect(rows.find((r) => r.name === "C-t1").brandCpl).toBe(500);
  });
});

/* ทดสอบละเอียดรอบ 2 (agent) */
describe("กลุ่มเป้าหมาย — กติกาเดียวกับแคมเปญ", () => {
  const one = (spend, leads, extra = {}) => card("a1", 5, { campaign: "C", ad_group: "G", metrics: { ...card("x", 5).metrics, spend, leads }, ...extra });
  it("รัน 1 วันใช้เงิน 5,000 ไม่มีผล = รอข้อมูล (แคมเปญก็ขึ้นรอข้อมูล) ไม่ใช่ควรหยุด", () => {
    const [row] = audienceRows([one(5000, 0)], RANGE, { brands: BRANDS });
    expect(row.decision.tag).toBe("wait");
  });
  it("ไม่มีค่าเฉลี่ยแบรนด์ = ไม่ตัดสินจากค่าเฉลี่ย (เดิม null <= 0.8 เป็นจริง → 'ถูกกว่าเฉลี่ย 100%')", () => {
    const cards3 = [5, 6, 7].map((d) => card(`b${d}`, d, { campaign: "C", ad_group: "G", metrics: { ...card("x", d).metrics, spend: 1000, leads: 10 } }));
    const [row] = audienceRows(cards3, RANGE, { brands: BRANDS, brandCpl: new Map() });
    expect(row.decision.tag).not.toBe("good");
    expect(row.decision.why).not.toMatch(/ถูกกว่าเฉลี่ย|แพงกว่าเฉลี่ย/);
  });
});
it("เพดาน CPL: ตัวเลขที่แสดงเท่าเพดาน (฿50.00) ต้องไม่ขึ้นว่าเกิน", () => {
  const row = { complete: true, days: 5, spend: 250.03, leads: 5, cpl: 250.03 / 5, roas: null, creatives: [], cplRatio: null, brandCpl: null };
  expect(campaignDecision(row, { cpl: 50 }, undefined, { roasFromMeta: false }).why ?? "").not.toMatch(/เกินเป้าแบรนด์ ฿50\.00/);
});

/* ทดสอบแบบใช้งานจริง 27 ก.ย. (อาร์ต "แก้เลยตามนี้"):
   - แพงกว่าเฉลี่ย ≥ 2.5 เท่า = ควรหยุด (ปิดแล้วย้ายงบ) · 1.5–2.5 เท่า = ควรแก้ โดยบอกว่าแก้อะไรตามสาเหตุ
   - แคมเปญที่ไม่มีค่าแอด 3 วันล่าสุด = หยุดใช้เงินแล้ว ไม่ใช่ "ควรแก้" (เดิมแคมเปญที่ปิดไปแล้วขึ้นให้แก้) */
describe("ควรหยุด / ควรแก้ ตามสาเหตุ · แคมเปญที่หยุดใช้เงินแล้ว", () => {
  const real = { roasFromMeta: false };
  const row = (ratio, over = {}) => ({ ...base, roas: 0.1, cpl: 100 * ratio, brandCpl: 100, cplRatio: ratio, frequency: 1.4, linkCtr: 0.02, ...over });
  it("≥ 2.5 เท่า → ควรหยุด ทำต่อ = ปิดแล้วย้ายงบ", () => {
    const d = campaignDecision(row(2.5), null, undefined, real);
    expect(d).toMatchObject({ tag: "stop", label: "ควรหยุด", basis: "average" });
    expect(d.next).toBe("ปิดแคมเปญนี้ แล้วย้ายงบไปแคมเปญที่ CPL ต่ำกว่า");
  });
  it("1.5–2.5 เท่า: ความถี่สูง → เปลี่ยนชิ้นงาน", () => {
    const d = campaignDecision(row(2, { frequency: 3.1 }), null, undefined, real);
    expect(d.tag).toBe("fix");
    expect(d.next).toBe("เปลี่ยนชิ้นงาน — คนกลุ่มเดิมเห็นซ้ำเฉลี่ย 3.10 ครั้ง");
  });
  it("1.5–2.5 เท่า: CTR ลิงก์ต่ำ → ปรับชิ้นงาน/ข้อความ", () => {
    const d = campaignDecision(row(2, { linkCtr: 0.004 }), null, undefined, real);
    expect(d.next).toBe("ปรับชิ้นงาน/ข้อความ — CTR ลิงก์ 0.40% คนเห็นแต่ไม่ค่อยคลิก");
  });
  it("1.5–2.5 เท่า: ชิ้นงานยังมีคนคลิก → ปรับกลุ่มเป้าหมาย · ไม่รู้ CTR ลิงก์ = บอกทั้งสองทาง", () => {
    expect(campaignDecision(row(2), null, undefined, real).next).toBe("ปรับกลุ่มเป้าหมาย — ชิ้นงานยังมีคนคลิก แต่ได้ผลลัพธ์แพง");
    expect(campaignDecision(row(2, { linkCtr: null }), null, undefined, real).next).toBe("ปรับกลุ่มเป้าหมายหรือชิ้นงาน");
  });
  it("เกินเป้า/เพดานแบรนด์ก็บอกสาเหตุแบบเดียวกัน", () => {
    const d = campaignDecision(row(1.1, { cpl: 450, frequency: 2.8 }), { cpl: 400 }, undefined, real);
    expect(d.tag).toBe("fix");
    expect(d.next).toBe("เปลี่ยนชิ้นงาน — คนกลุ่มเดิมเห็นซ้ำเฉลี่ย 2.80 ครั้ง");
  });
  it("ไม่มีค่าแอด 3 วันล่าสุด: ควรแก้/ควรหยุด → หยุดใช้เงินแล้ว (เหตุผลเดิมยังอยู่)", () => {
    const idle = { lastSpendDay: "2026-09-22", idleDays: 4 };
    const d = campaignDecision(row(2, idle), null, undefined, real);
    expect(d).toMatchObject({ tag: "idle", label: "หยุดใช้เงินแล้ว", tone: "zinc" });
    expect(d.why).toBe("ใช้เงินล่าสุด 22 ก.ย. · ก่อนหยุด CPL ฿200.00 แพงกว่าเฉลี่ยแบรนด์ ฿100.00 อยู่ 100.00%");
    expect(d.next).toMatch(/^ถ้าจะเปิดใหม่: /);
    expect(campaignDecision(row(3, idle), null, undefined, real).tag).toBe("idle");
    // ไม่ถึง 3 วัน = ยังนับว่ากำลังรัน · ต้นทุนดีที่หยุดไปแล้วยังบอกต้นทุนดีเหมือนเดิม
    expect(campaignDecision(row(2, { lastSpendDay: "2026-09-24", idleDays: 2 }), null, undefined, real).tag).toBe("fix");
    expect(campaignDecision(row(0.5, idle), null, undefined, real).tag).toBe("good");
  });
  it("campaignRows: idleDays = วันจากค่าแอดล่าสุดของแคมเปญ ถึงวันล่าสุดที่มีค่าแอดในช่วง", () => {
    const rows = campaignRows(cards, RANGE, opts);   // ค่าแอดล่าสุดทั้งช่วง = 8 ก.ค.
    expect(rows.find((r) => r.name === "Always-on — คนเคยทัก")).toMatchObject({ lastSpendDay: "2026-07-05", idleDays: 3 });
    expect(rows.find((r) => r.name === "Prospecting — กลุ่มใหม่")).toMatchObject({ lastSpendDay: "2026-07-08", idleDays: 0 });
  });
  it("campaignTotals: เงินที่ต้องทบทวนไม่นับแคมเปญที่หยุดใช้เงินแล้ว · ตัวกรอง 'หยุดใช้เงินแล้ว'", () => {
    const rows = [{ ...base, key: "a", decision: { tag: "idle" } }, { ...base, key: "b", spend: 700, decision: { tag: "fix" } }];
    expect(campaignTotals(rows).reviewSpend).toBe(700);
    expect(applyView(rows, "idle").map((r) => r.key)).toEqual(["a"]);
  });
  it("audienceRows: ≥ 2.5 เท่า → ควรหยุด ทำต่อ = ปิดกลุ่มนี้ · 1.5–2.5 เท่า บอกสาเหตุ", () => {
    const ad3 = (id, adGroup, spend, leads, over = {}) => [5, 6, 7].map((d, i) => card(`${id}-${d}`, d, { campaign: `C-${id}`, ad_group: adGroup,
      metrics: { ...card("x", d).metrics, spend: i === 0 ? spend - 2 : 1, leads: i === 0 ? leads : 0, revenue: 0, link_clicks: 50, ...over } }));
    const list = audienceRows([...ad3("a", "ปกติ", 1000, 10), ...ad3("b", "แพงมาก", 3000, 10), ...ad3("c", "แพง", 2000, 10, { reach: 2000 })], RANGE,
      { brands: BRANDS, brandCpl: new Map([[cplKey("b_td", "Meta Ads"), 100]]) });
    const by = Object.fromEntries(list.map((r) => [r.name, r.decision]));
    expect(by["แพงมาก"]).toMatchObject({ tag: "stop", next: "ปิดกลุ่มนี้ แล้วย้ายงบไปกลุ่มที่ CPL ต่ำกว่า" });
    expect(by["แพง"].tag).toBe("fix");
    expect(by["แพง"].next).toBe("เปลี่ยนชิ้นงาน — คนกลุ่มเดิมเห็นซ้ำเฉลี่ย 10.00 ครั้ง");   // 60,000 ÷ 6,000
  });
});

/* ตรวจรอบ 27 ก.ย. ดึก: "JK1 | RE | IB | PICปัง" ROAS (Meta) 3.06× แต่ขึ้น "ควรหยุด" · JD1 RE ROAS 6.13× ขึ้น "ควรแก้"
   → ข้อมูลจริง: Meta เห็นยอดขายและ ROAS ≥ 2 = ห้ามตัดสินหยุด/แก้จาก CPL — ขึ้น "แพงแต่ขายได้" ให้ดูยอดขายประกอบ */
describe("แพงแต่ขายได้ — ROAS ที่ Meta เห็นกันป้ายหยุด/แก้จาก CPL", () => {
  const real = { roasFromMeta: false };
  const row = (ratio, roas, over = {}) => ({ ...base, roas, cpl: 100 * ratio, brandCpl: 100, cplRatio: ratio, frequency: 1.4, linkCtr: 0.02, ...over });
  it("แพงกว่าเฉลี่ย 2.69 เท่า แต่ ROAS 3.06× → แพงแต่ขายได้ ไม่ใช่ควรหยุด", () => {
    const d = campaignDecision(row(2.69, 3.06), null, undefined, real);
    expect(d).toMatchObject({ tag: "sells", label: "แพงแต่ขายได้", tone: "zinc" });
    expect(d.why).toBe("CPL ฿269.00 แพงกว่าเฉลี่ยแบรนด์ ฿100.00 อยู่ 169.00% แต่ Meta เห็นยอดขาย ROAS 3.06×");
    expect(d.next).toBe("อย่าเพิ่งปิด — เทียบยอดขายจริงของแบรนด์ในหน้าภาพรวมก่อน แล้วค่อยลดต้นทุน");
    expect(d.basis).toBeUndefined();   // ช่องในตารางต้องโชว์เหตุผล (มี ROAS) ไม่ใช่ทำต่อ
  });
  it("เกินเพดานแบรนด์ / เกินเกณฑ์ ฿500 แต่ขายได้ ก็เหมือนกัน", () => {
    expect(campaignDecision(row(1.1, 2.5, { cpl: 450 }), { cpl: 400 }, undefined, real).tag).toBe("sells");
    expect(campaignDecision(row(1.1, 2.5, { cpl: 650, brandCpl: 600, cplRatio: 650 / 600 }), null, undefined, real).tag).toBe("sells");
  });
  it("ROAS ต่ำกว่า 2 หรือ Meta ไม่เห็นยอด = กฎ CPL เดิม · ล้า = ยังควรแก้ (ปัญหาชิ้นงาน ไม่ใช่ต้นทุน)", () => {
    expect(campaignDecision(row(2.69, 1.9), null, undefined, real).tag).toBe("stop");
    expect(campaignDecision(row(2.69, null), null, undefined, real).tag).toBe("stop");
    expect(campaignDecision(row(1, 3, { creatives: [{ fatigue: true }] }), null, undefined, real).tag).toBe("fix");
  });
  /* เห็นบนหน้าจริง: Sale_Contents หยุดตั้งแต่ 15 ก.ย. แต่ขึ้น "แพงแต่ขายได้ · อย่าเพิ่งปิด" — ปิดไปแล้ว คำนี้ขัดกัน */
  it("ขายได้แต่หยุดใช้เงินแล้ว = หยุดใช้เงินแล้ว · ทำต่อบอกว่า Meta เห็นยอดขาย ถ้าจะเปิดใหม่", () => {
    const d = campaignDecision(row(2, 3, { lastSpendDay: "2026-09-15", idleDays: 11 }), null, undefined, real);
    expect(d.tag).toBe("idle");
    expect(d.why).toBe("ใช้เงินล่าสุด 15 ก.ย. · ก่อนหยุด CPL ฿200.00 แพงกว่าเฉลี่ยแบรนด์ ฿100.00 อยู่ 100.00% แต่ Meta เห็นยอดขาย ROAS 3.00×");
    expect(d.next).toBe("ถ้าจะเปิดใหม่: ตัวนี้ Meta เห็นยอดขาย — เทียบยอดขายจริงของแบรนด์ก่อนตัดสิน");
  });
  it("ตัวกรอง 'แพงแต่ขายได้'", () => {
    expect(applyView([{ decision: { tag: "sells" } }, { decision: { tag: "fix" } }], "sells")).toHaveLength(1);
  });
  it("audienceRows: กลุ่มที่ Meta เห็นยอดขาย ROAS ≥ 2 ไม่ขึ้นควรหยุด", () => {
    const ad3 = (id, adGroup, spend, leads, revenue) => [5, 6, 7].map((d, i) => card(`${id}-${d}`, d, { campaign: `C-${id}`, ad_group: adGroup,
      metrics: { ...card("x", d).metrics, spend: i === 0 ? spend - 2 : 1, leads: i === 0 ? leads : 0, revenue: i === 0 ? revenue : 0, link_clicks: 50 } }));
    const list = audienceRows([...ad3("a", "ขายได้", 3000, 10, 9000), ...ad3("b", "ขายไม่ได้", 3000, 10, 0)], RANGE,
      { brands: BRANDS, brandCpl: new Map([[cplKey("b_td", "Meta Ads"), 100]]) });
    const by = Object.fromEntries(list.map((r) => [r.name, r]));
    expect(by["ขายได้"].roas).toBe(3);
    expect(by["ขายได้"].decision.tag).toBe("sells");
    expect(by["ขายไม่ได้"].decision.tag).toBe("stop");
  });
});

/* ตรวจรอบ 27 ก.ย. ดึก: "หยุดใช้เงินแล้ว" ต้องหมายถึง "ตอนนี้หยุดอยู่" —
   (1) เทียบกับวันล่าสุดที่มีข้อมูลทั้งระบบ ไม่ใช่เฉพาะแถวที่กรองอยู่ (กรองเหลือแบรนด์ที่หยุดทั้งบัญชี = ไม่มีใครขึ้นป้าย)
   (2) ดูเดือนก่อน: แคมเปญที่กลับมาใช้เงินหลังช่วงนั้นแล้ว ไม่ใช่ "หยุดใช้เงินแล้ว" */
describe("หยุดใช้เงินแล้ว = สถานะตอนนี้", () => {
  it("dataThrough จากทั้งระบบ: แบรนด์เดียวที่หยุดทั้งบัญชียังขึ้นป้าย", () => {
    const rows = campaignRows([card("a", 3), card("b", 5, { campaign: "C2" })], RANGE, { ...opts, dataThrough: "2026-07-15" });
    expect(rows.find((r) => r.name === "C2")).toMatchObject({ lastSpendDay: "2026-07-05", idleDays: 10 });
  });
  it("ช่วงเดือนก่อน: แคมเปญที่กลับมาใช้เงินหลังช่วง ไม่นับว่าหยุด · ที่หยุดจริงบอกวันล่าสุดจริง", () => {
    const later = card("z", 20, { metrics: { ...card("x", 20).metrics, measured_at: "2026-08-02T09:00:00.000Z" } });   // กลับมาใช้ 2 ส.ค.
    const stopped = card("s", 3, { campaign: "หยุดจริง" });
    const rows = campaignRows([card("a", 3), later, stopped], RANGE, { ...opts, dataThrough: "2026-08-02" });
    expect(rows.find((r) => r.name === "Always-on — คนเคยทัก")).toMatchObject({ lastSpendDay: "2026-08-02", idleDays: 0 });
    expect(rows.find((r) => r.name === "หยุดจริง")).toMatchObject({ lastSpendDay: "2026-07-03", idleDays: 30 });
  });
  it("audienceRows ใช้หลักเดียวกัน", () => {
    const g = (id, day, adGroup) => card(id, day, { ad_group: adGroup, campaign: `C-${adGroup}` });
    const list = audienceRows([g("a", 3, "หยุดแล้ว"), g("b", 3, "ยังรัน"), { ...g("c", 3, "ยังรัน"), metrics: { ...card("x", 3).metrics, measured_at: "2026-08-01T09:00:00.000Z" } }], RANGE,
      { brands: BRANDS, dataThrough: "2026-08-01" });
    const by = Object.fromEntries(list.map((r) => [r.name, r]));
    expect(by["หยุดแล้ว"].idleDays).toBe(29);
    expect(by["ยังรัน"].idleDays).toBe(0);
  });
});
it("latestSpendDay: วันล่าสุดที่มีค่าแอด (ไม่มีค่าแอด = null)", async () => {
  const { latestSpendDay } = await import("../src/modules/marketing/adsCampaigns.js");
  expect(latestSpendDay(cards)).toBe("2026-07-08");
  expect(latestSpendDay([])).toBeNull();
});

/* รีวิวโค้ด 28 ก.ย.: ROAS 8.2 เทียบเป้า 8.2 เคยตัดเป็น 8.19 → "ต่ำกว่าเป้าแบรนด์" */
it("ROAS เท่าเป้าพอดี (8.20) ไม่ขึ้นควรแก้", () => {
  expect(campaignDecision({ complete: true, days: 5, spend: 5000, leads: 20, cpl: 250, roas: 8.2, creatives: [] }, { roas: 8.2 }).tag).not.toBe("fix");
});
