import { describe, it, expect } from "vitest";
import {
  adsByBrandChannel, adsByChannel, adsChannelList, adsCompanyPaceChart, adsCompanySummary, adsSpendShareByBrand, adsDecisionRows, adsFunnel, adsKpis, adsWeekly,
  adsCreativeRows, adsDailyRevenue, adsDailySeries, fillDailySeries, adsMetricBoard, adsSalePipeline, adsSalesPace, decideAction, adsSalesVsTarget, budgetOf, deliveryOf, revenuePace, budgetPace, change, filterByChannel, normalizeAdPlatform, paceGroup, paceStatus, revenueBasisCards, roasOf, salesTargetOf, share,
} from "../src/modules/marketing/adsOverview.js";

/* ศุกร์ 24 ก.ค. 2026 — สัปดาห์เริ่มจันทร์ 20 ก.ค. (ชุดเดียวกับ mktAnalytics.test.js) */
const brief = (over = {}) => ({
  who_action: "HR → ทัก LINE", hook: "hook", key_message: "km", cta: "ทัก LINE",
  fact_checked: true, format: "video", size: "9:16", deadline_review: "2026-07-18",
  channels: ["TikTok"], publish_at: "2026-07-22T12:00:00.000Z",
  layout_note: "l", mood: "m", ref_note: "r", ci_link: "https://x.co/ci",
  ...over,
});
const check = { visual: true, logo: true, text_ratio: true, no_forbidden: true, data_verified: true, cta_clear: true };
const metrics = (over = {}) => ({
  reach: 10_000, engagement: 200, leads: 5, spend: null, cpl: null, revenue: null,
  measured_at: "2026-07-23T09:00:00.000Z", ...over,
});
function card(over = {}) {
  return {
    id: "c1", track: "project", status: "measured", brand_id: "b_td", owner_id: "u_arm",
    title: "t", pillar: "knowledge", is_realtime: false, plan_confirmed: true,
    brief: brief(), draft_link: "https://d", self_check: check,
    first_pass: true, entered_review_at: null, archived: true,
    created_at: "2026-07-10T00:00:00.000Z", updated_at: "2026-07-24T09:00:00.000Z",
    metrics: metrics(),
    ...over,
  };
}
const RANGE = { start: "2026-07-20T00:00:00.000Z", end: "2026-07-27T00:00:00.000Z" };
const PREV = { start: "2026-07-13T00:00:00.000Z", end: "2026-07-20T00:00:00.000Z" };

describe("ตัวช่วยอัตราส่วน", () => {
  it("สลับฐานยอดใหม่โดยไม่ใช้ยอดรวมแทนเมื่อข้อมูลขาด", () => {
    const rows = revenueBasisCards([
      card({ id: "known", metrics: metrics({ revenue: 10_000, new_revenue: 6_000 }) }),
      card({ id: "missing", metrics: metrics({ revenue: 5_000 }) }),
    ], "new");
    expect(rows[0].metrics.revenue).toBe(6_000);
    expect(rows[1].metrics.revenue).toBeNull();
    expect(revenueBasisCards(rows, "total")).toBe(rows);
    expect(revenueBasisCards([card({ metrics: metrics({ revenue: 5_000 }) })], "new", { mockFallback: true })[0].metrics.revenue).toBe(3_100);
  });
  it("ตัวหารศูนย์หรือค่าว่างคืน null ไม่ใช่ 0", () => {
    expect(share(5, 0)).toBeNull();
    expect(share(null, 10)).toBeNull();
    expect(share(5, 10)).toBe(0.5);
  });
  it("ROAS = รายได้ ÷ ค่าแอด · ค่าแอด 0 คืน null", () => {
    expect(roasOf(10_000, 2500)).toBe(4);
    expect(roasOf(10_000, 0)).toBeNull();
    expect(roasOf(null, 2500)).toBeNull();
  });
  it("เทียบช่วงก่อนที่ฐานเป็นศูนย์คืน null", () => {
    expect(change(10, 0)).toBeNull();
    expect(change(15, 10)).toBeCloseTo(50);
    expect(change(5, 10)).toBeCloseTo(-50);
  });
});

describe("KPI ค่าแอด — %Ads · ROAS · Spend · Conversions", () => {
  const cards = [
    card({ id: "a1", metrics: metrics({ spend: 6000, leads: 20, revenue: 24_000 }) }),
    card({ id: "a2", metrics: metrics({ spend: 4000, leads: 5, revenue: 6000 }) }),
    card({
      id: "old", metrics: metrics({ spend: 5000, leads: 10, revenue: 10_000, measured_at: "2026-07-16T09:00:00.000Z" }),
      brief: brief({ publish_at: "2026-07-15T12:00:00.000Z" }),
    }),
  ];
  it("Spend และ Conversions (=leads) รวมเฉพาะช่วงที่เลือก", () => {
    const k = adsKpis(cards, RANGE, PREV);
    expect(k.spend.value).toBe(10_000);
    expect(k.conversions.value).toBe(25);
    expect(k.spend.before).toBe(5000);
  });
  it("ROAS = รายได้รวม ÷ ค่าแอดรวม ของช่วง", () => {
    const k = adsKpis(cards, RANGE, PREV);
    expect(k.roas.value).toBe(3); // 30000 / 10000
    expect(k.roas.lower).toBe(false); // ROAS สูง = ดี
  });
  it("%Ads = ค่าแอด ÷ รายได้ · ยิ่งต่ำยิ่งดี", () => {
    const k = adsKpis(cards, RANGE, PREV);
    expect(k.pctAds.value).toBeCloseTo(1 / 3); // 10000 / 30000
    expect(k.pctAds.lower).toBe(true);
  });
  it("ไม่มีงานยิงแอดในช่วงนั้น ROAS/%Ads เป็น null ไม่ใช่ศูนย์", () => {
    const k = adsKpis([], RANGE, PREV);
    expect(k.roas.value).toBeNull();
    expect(k.pctAds.value).toBeNull();
    expect(k.spend.value).toBe(0);
  });
  it("มีรายการแต่ข้อมูลผลลัพธ์ขาด ต้องคืน null แทนการนับเป็นศูนย์", () => {
    const incomplete = [card({ metrics: metrics({ spend: 1000, leads: null, revenue: null }) })];
    const k = adsKpis(incomplete, RANGE, PREV);
    expect(k.spend.value).toBe(1000);
    expect(k.conversions.value).toBeNull();
    expect(k.roas.value).toBeNull();
    expect(k.quality.leads).toBe(0);
    expect(k.quality.revenue).toBe(0);
  });
  it("คำนวณ delivery จาก impressions/reach/clicks ที่ครบ", () => {
    const cards = [card({ metrics: metrics({ spend: 2000, leads: 10, revenue: 8000, impressions: 20_000, reach: 10_000, clicks: 400 }) })];
    const d = adsKpis(cards, RANGE, PREV).delivery;
    expect(d.frequency).toBe(2);
    expect(d.cpm).toBe(100);
    expect(d.ctr).toBe(0.02);
    expect(d.cpc).toBe(5);
  });
});

describe("รายการที่ควรตรวจ", () => {
  it("ดันรายการใช้เงินแล้วไม่มีลีดขึ้นก่อน", () => {
    const cards = [
      card({ id: "ok", title: "ทำผลได้", metrics: metrics({ spend: 3000, leads: 10, revenue: 9000 }) }),
      card({ id: "waste", title: "ยังไม่มีลีด", metrics: metrics({ spend: 1000, leads: 0, revenue: 0 }) }),
    ];
    const rows = adsDecisionRows(cards, RANGE, [{ id: "b_td", name: "TEAMDEE" }]);
    expect(rows[0].id).toBe("waste");
    expect(rows[0].reason).toContain("ยังไม่มีลีด");
  });
});

describe("รายสัปดาห์", () => {
  it("สัปดาห์ที่ใช้เงินแต่ยังไม่มีลีด คืน cpl = null", () => {
    const cards = [card({ id: "a1", metrics: metrics({ spend: 3000, leads: 0 }) })];
    const weeks = [{ label: "20 ก.ค.", start: RANGE.start, end: RANGE.end }];
    const [w] = adsWeekly(cards, weeks);
    expect(w.spend).toBe(3000);
    expect(w.cpl).toBeNull();
  });
});

describe("สัดส่วนรายช่องทาง (โดนัท)", () => {
  it("นับเฉพาะช่องทางที่มีค่าแอด และสัดส่วนรวมได้ 100%", () => {
    const cards = [
      card({ id: "a1", brief: brief({ channels: ["TikTok"] }), metrics: metrics({ spend: 7500, leads: 15 }) }),
      card({ id: "a2", brief: brief({ channels: ["Facebook"] }), metrics: metrics({ spend: 2500, leads: 5 }) }),
    ];
    const out = adsByChannel(cards, cards, RANGE, []);
    expect(out.total).toBe(10_000);
    expect(out.rows.map((r) => r.key)).toEqual(["TikTok Ads", "Meta Ads"]);
    expect(out.rows[0].share).toBeCloseTo(0.75);
    expect(out.rows.reduce((n, r) => n + r.share, 0)).toBeCloseTo(1);
  });
});

describe("ตัวกรองช่องทาง", () => {
  const cards = [
    card({ id: "a1", brief: brief({ channels: ["TikTok"] }), metrics: metrics({ spend: 8000, leads: 20 }) }),
    card({ id: "a2", brief: brief({ channels: ["Facebook"] }), metrics: metrics({ spend: 2000, leads: 4 }) }),
    card({ id: "a3", brief: brief({ channels: ["Facebook"] }), metrics: metrics({ spend: 5000, leads: 10 }) }),
  ];
  it("filterByChannel: 'all' ไม่กรอง · ระบุช่องทาง = เฉพาะใบนั้น", () => {
    expect(filterByChannel(cards, "all")).toHaveLength(3);
    expect(filterByChannel(cards, "Meta Ads").map((c) => c.id)).toEqual(["a2", "a3"]);
    expect(filterByChannel(cards, "TikTok Ads").map((c) => c.id)).toEqual(["a1"]);
  });
  it("adsChannelList: ช่องทางที่มี ads จริง เรียงตามค่าแอดรวมมาก→น้อย", () => {
    // TikTok 8000 > Facebook 7000 (2000+5000)
    expect(adsChannelList(cards)).toEqual(["TikTok Ads", "Meta Ads"]);
  });
  it("จัด Facebook/Reels ใต้ Meta และไม่เอา LINE OA มาปนเป็นแพลตฟอร์มโฆษณา", () => {
    expect(normalizeAdPlatform("Facebook")).toBe("Meta Ads");
    expect(normalizeAdPlatform("Reels")).toBe("Meta Ads");
    expect(normalizeAdPlatform("LINE OA")).toBeNull();
    const mixed = [...cards, card({ id: "line", brief: brief({ channels: ["LINE OA"] }), metrics: metrics({ spend: 99_000, leads: 99 }) })];
    expect(adsChannelList(mixed)).toEqual(["TikTok Ads", "Meta Ads"]);
    expect(adsKpis(mixed, RANGE, PREV).spend.value).toBe(15_000);
  });
});

describe("งบ + จังหวะใช้เงิน", () => {
  it("budgetOf หาเจอเฉพาะ แบรนด์×ช่องทาง×เดือน ที่ตรง · ไม่มี = null", () => {
    const b = [{ brand_id: "b_td", channel: "Facebook", month: "2026-07", amount: 24_000 }];
    expect(budgetOf("b_td", "Facebook", "2026-07", b)).toBe(24_000);
    expect(budgetOf("b_td", "TikTok", "2026-07", b)).toBeNull();
    expect(budgetOf("b_td", "Facebook", "2026-08", b)).toBeNull();
  });
  it("budgetPace: ใช้ไปแล้ว/เหลือ/ควรใช้ ณ วันนี้/คาดสิ้นเดือน (วันที่ 15 จาก 31)", () => {
    const p = budgetPace(10_000, 30_000, "2026-07-15");
    expect(p.used).toBeCloseTo(1 / 3);          // 10000/30000
    expect(p.remaining).toBe(20_000);
    expect(p.expected).toBeCloseTo(15 / 31);    // สัดส่วนวันที่ผ่านไป
    expect(p.forecast).toBeCloseTo((10_000 / 15) * 31); // run-rate เชิงเส้น
    expect(p.forecastOver).toBeCloseTo((10_000 / 15) * 31 - 30_000); // < 0 = ไม่เกินงบ
  });
  it("budgetPace: งบไม่มี → used/remaining/forecastOver = null แต่ยังคาด forecast ได้", () => {
    const p = budgetPace(5000, null, "2026-07-15");
    expect(p.used).toBeNull();
    expect(p.remaining).toBeNull();
    expect(p.forecastOver).toBeNull();
    expect(p.forecast).toBeGreaterThan(0);
  });
  it("budgetPace: ไม่มีข้อมูลค่าแอด → ไม่ตีความเป็นใช้ไปศูนย์", () => {
    const p = budgetPace(null, 30_000, "2026-07-15");
    expect(p.used).toBeNull();
    expect(p.remaining).toBeNull();
    expect(p.average).toBeNull();
    expect(p.forecast).toBeNull();
    expect(p.expectedSpend).toBeCloseTo(30_000 * 15 / 31);
  });
  it("งบรวมแบรนด์เป็น null ถ้ามีแม้หนึ่งช่องทางที่ยังไม่ตั้งงบ", () => {
    const cards = [
      card({ id: "meta", brief: brief({ channels: ["Facebook"] }), metrics: metrics({ spend: 1000, leads: 2, revenue: 4000 }) }),
      card({ id: "tiktok", brief: brief({ channels: ["TikTok"] }), metrics: metrics({ spend: 500, leads: 1, revenue: 1000 }) }),
    ];
    const budgets = [{ brand_id: "b_td", channel: "Meta Ads", month: "2026-07", amount: 5000 }];
    const [brand] = adsByBrandChannel(cards, RANGE, [{ id: "b_td", name: "TEAMDEE" }], budgets, "2026-07-24");
    expect(brand.spend).toBe(1500);
    expect(brand.budget).toBeNull();
    expect(paceStatus(brand.pace).text).toBe("ยังไม่ตั้งงบ");
  });
  it("โหมดช่วงที่เลือก: adsByBrandChannel/adsCompanySummary ให้ prevSpend + spendChangePct เทียบช่วงก่อน", () => {
    const cards = [
      card({ id: "now", brief: brief({ publish_at: null }), metrics: metrics({ spend: 2000, leads: 4, revenue: 8000, measured_at: "2026-07-23T09:00:00.000Z" }) }),
      card({ id: "prev", brief: brief({ publish_at: null }), metrics: metrics({ spend: 1000, leads: 2, revenue: 5000, measured_at: "2026-07-16T09:00:00.000Z" }) }),
    ];
    const PREV = { start: "2026-07-13T00:00:00.000Z", end: "2026-07-20T00:00:00.000Z" };
    const rows = adsByBrandChannel(cards, RANGE, [{ id: "b_td", name: "TEAMDEE" }], [], "2026-07-24", [], PREV);
    expect(rows[0].spend).toBe(2000);
    expect(rows[0].prevSpend).toBe(1000);
    expect(rows[0].spendChangePct).toBe(100);
    expect(rows[0].revChangePct).toBe(60);
    const s = adsCompanySummary(rows, "2026-07-24");
    expect(s.prevSpend).toBe(1000);
    expect(s.spendChangePct).toBe(100);
  });
  it("ยอดขายไม่รู้ (revenue null) ต้องเป็น null ทั้งช่องทาง/แคมเปญ/แบรนด์/ภาพรวม ไม่ใช่ ฿0 (ข้อมูลจริงจาก Meta ที่ไม่มี purchase)", () => {
    const cards = [
      card({ id: "a", campaign: "Sofa", brief: brief({ channels: ["Meta Ads"], publish_at: null }), metrics: metrics({ spend: 1000, leads: 10, revenue: null }) }),
      card({ id: "b", campaign: "Sofa", brief: brief({ channels: ["Meta Ads"], publish_at: null }), metrics: metrics({ spend: 500, leads: 5, revenue: null }) }),
    ];
    const rows = adsByBrandChannel(cards, RANGE, [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jk", name: "JK" }], [], "2026-07-24", [], PREV);
    const td = rows.find((r) => r.id === "b_td");
    expect(td.spend).toBe(1500);
    expect(td.channels[0].revenue).toBeNull();
    expect(td.channels[0].campaigns[0].revenue).toBeNull();
    expect(td.channels[0].roas).toBeNull();
    expect(td.revenue).toBeNull();
    expect(td.roas).toBeNull();
    expect(td.pctAds).toBeNull();
    expect(rows.find((r) => r.id === "b_jk").revenue).toBeNull();       // ไม่มีงานยิงแอดเลย = ไม่รู้ ไม่ใช่ 0 (แก้ 16 ก.ย. 2569)
    expect(adsCompanySummary(rows, "2026-07-24").revenue).toBeNull();
    const mixed = [cards[0], card({ id: "c", brief: brief({ channels: ["Meta Ads"], publish_at: null }), metrics: metrics({ spend: 100, leads: 1, revenue: 900 }) })];
    expect(adsByBrandChannel(mixed, RANGE, [{ id: "b_td", name: "TEAMDEE" }], [], "2026-07-24")[0].revenue).toBeNull();   // มีบางใบไม่รู้ = รวมไม่ได้
  });
  it("paceStatus: เกินงบ/ใช้เร็ว/ตามแผน/ใช้ช้า/ยังไม่ตั้งงบ — สีคู่กับคำ", () => {
    expect(paceStatus({ used: null, expected: 0.5 }).text).toBe("ยังไม่ตั้งงบ");
    expect(paceStatus({ used: 1.1, expected: 0.5, remaining: -1 }).text).toBe("เกินงบ");
    expect(paceStatus({ used: 0.7, expected: 0.5, remaining: 1 }).text).toBe("ใช้เร็วกว่าแผน");
    expect(paceStatus({ used: 0.2, expected: 0.5, remaining: 1 }).text).toBe("ใช้ช้ากว่าแผน");
    expect(paceStatus({ used: 0.5, expected: 0.5, remaining: 1 }).text).toBe("ตามแผน");
  });
  it("paceGroup: จัดกลุ่มไว้ทำตัวกรอง — over/onplan/under/unset", () => {
    expect(paceGroup({ used: null, expected: 0.5 })).toBe("unset");
    expect(paceGroup({ used: 1.1, expected: 0.5, remaining: -1 })).toBe("over"); // เกินงบ
    expect(paceGroup({ used: 0.7, expected: 0.5, remaining: 1 })).toBe("over");  // ใช้เร็ว
    expect(paceGroup({ used: 0.2, expected: 0.5, remaining: 1 })).toBe("under");
    expect(paceGroup({ used: 0.5, expected: 0.5, remaining: 1 })).toBe("onplan");
  });
});

describe("แบรนด์ × ช่องทาง (การ์ดเกจงบ)", () => {
  const budgets = [
    { brand_id: "b_td", channel: "TikTok", month: "2026-07", amount: 16_000 },
    { brand_id: "b_jk", channel: "Facebook", month: "2026-07", amount: 9_000 },
  ];
  const cards = [
    card({ id: "a1", brand_id: "b_td", brief: brief({ channels: ["TikTok"] }), metrics: metrics({ spend: 8000, leads: 20, revenue: 28_800 }) }),
    card({ id: "a2", brand_id: "b_jk", brief: brief({ channels: ["Facebook"] }), metrics: metrics({ spend: 2000, leads: 4, revenue: 3200 }) }),
  ];
  it("แยกค่าแอดรายแบรนด์ เรียงตามค่าแอด และให้เฉพาะช่องทางของแบรนด์นั้น", () => {
    const rows = adsByBrandChannel(cards, RANGE, [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jk", name: "JUNTAKARN" }], budgets, "2026-07-15");
    expect(rows.map((r) => r.name)).toEqual(["TEAMDEE", "JUNTAKARN"]);
    expect(rows[0].spend).toBe(8000);
    expect(rows[0].channels.map((c) => c.key)).toEqual(["TikTok Ads"]);
    expect(rows[1].channels.map((c) => c.key)).toEqual(["Meta Ads"]);
  });
  it("แต่ละช่องทางพก งบ · เหลือ · ROAS · จังหวะใช้เงิน", () => {
    const rows = adsByBrandChannel(cards, RANGE, [{ id: "b_td", name: "TEAMDEE" }], budgets, "2026-07-15");
    const ch = rows[0].channels[0];
    expect(ch.budget).toBe(16_000);
    expect(ch.pace.remaining).toBe(8000);          // 16000 - 8000
    expect(ch.pace.used).toBeCloseTo(0.5);          // 8000/16000
    expect(ch.roas).toBeCloseTo(3.6);               // 28800/8000
  });
  it("ระดับแบรนด์มี %Ads = ค่าแอดรวม ÷ ยอดขายรวมของแบรนด์ (ไม่ใช่เฉลี่ยรายช่องทาง)", () => {
    const rows = adsByBrandChannel(cards, RANGE, [{ id: "b_td", name: "TEAMDEE" }], budgets, "2026-07-15");
    expect(rows[0].pctAds).toBeCloseTo(8000 / 28_800);
    const none = adsByBrandChannel(cards, RANGE, [{ id: "b_zz", name: "ว่าง" }], budgets, "2026-07-15");
    expect(none[0].pctAds).toBeNull();               // ไม่มียอดขาย → null ไม่ใช่ 0
  });
  it("แบรนด์ที่ยังไม่ใช้เงินก็ต้องอยู่ในผล (ค่าแอด 0)", () => {
    const rows = adsByBrandChannel(cards, RANGE, [
      { id: "b_td", name: "TEAMDEE" }, { id: "b_ta", name: "t around" },
    ], budgets, "2026-07-15");
    const ta = rows.find((r) => r.id === "b_ta");
    expect(ta).toBeTruthy();
    expect(ta.spend).toBeNull();      // อยู่ในผลลัพธ์ แต่ค่าเป็น "ไม่รู้" จนกว่าจะมีข้อมูลจริง
    expect(ta.revenue).toBeNull();
    expect(ta.channels).toEqual([]);
  });
});

describe("แบรนด์ที่ยังไม่มีข้อมูลเลย", () => {
  it("ไม่มีการ์ดในช่วงนั้น = ยอด/ค่าแอด/ลีดเป็น null ไม่ใช่ 0 (แยกให้ออกจาก 'ขายไม่ได้เลย')", () => {
    const rows = adsByBrandChannel([], RANGE, [{ id: "b_td", name: "TEAMDEE" }], {});
    const td = rows.find((r) => r.id === "b_td");
    expect(td.channels).toEqual([]);
    expect(td.revenue).toBeNull();
    expect(td.spend).toBeNull();
    expect(td.leads).toBeNull();
  });
});

describe("กรวยผลจากค่าแอด", () => {
  const cards = [card({ id: "a1", metrics: metrics({ leads: 100, spend: 5000, qualified_leads: 40, deposits: 10, closed_orders: 8 }) })];
  it("ไล่ คนทัก → Lead → มัดจำ → ออเดอร์ พร้อม conversion และต้นทุนต่อขั้น", () => {
    const f = adsFunnel(cards, RANGE);
    expect(f.stages.map((s) => s.value)).toEqual([100, 40, 10, 8]);
    expect(f.stages[1].rate).toBeCloseTo(0.4);
    expect(f.stages[2].cost).toBe(500);
    expect(f.estimated).toBe(false);
  });
  it("ไม่มีข้อมูลขั้นถัดไปจริง = null ทุกขั้น ไม่เดาจากอัตราส่วนคงที่ (ตัดสินใจ 16 ก.ย. 2569)", () => {
    const f = adsFunnel([card({ metrics: metrics({ leads: 100, spend: 5000 }) })], RANGE);
    expect(f.stages.map((s) => s.value)).toEqual([100, null, null, null]);
    expect(f.estimated).toBe(true);          // ยังติดธงไว้ให้หน้าจอบอกว่ารอเชื่อมระบบขาย
    expect(f.worstKey).toBeNull();           // ไม่มีอัตราส่วนจริง = ไม่ชี้ว่า "หล่นแรงสุด" ตรงไหน
  });
  it("มีข้อมูลจริงบางขั้น = คิดเฉพาะขั้นที่มี", () => {
    const f = adsFunnel([card({ metrics: metrics({ leads: 100, spend: 5000, qualified_leads: 40 }) })], RANGE);
    expect(f.stages.map((s) => s.value)).toEqual([100, 40, null, null]);
  });
  it("ไม่มีงานยิงแอดเลย ทุกขั้นเป็น null", () => {
    expect(adsFunnel([], RANGE).stages.every((s) => s.value === null)).toBe(true);
  });
});

describe("กรวย — ขั้นหล่นแรงสุด", () => {
  it("worstKey = ขั้นที่อัตราแปลงต่ำสุด (ไม่นับขั้นแรก) — คิดจากข้อมูลจริงเท่านั้น", () => {
    const cards = [card({ metrics: metrics({ spend: 2000, leads: 20, qualified_leads: 13, deposits: 2, closed_orders: 2, revenue: 8000 }) })];
    expect(adsFunnel(cards, RANGE).worstKey).toBe("deposits");
  });
  it("ไม่มีข้อมูล → worstKey เป็น null", () => {
    expect(adsFunnel([], RANGE).worstKey).toBeNull();
  });
});

describe("ยอดขายเทียบเป้า", () => {
  const brands = [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jk", name: "JK Design" }];
  const targets = [
    { brand_id: "b_td", month: "2026-07", amount: 100_000 },
    { brand_id: "b_jk", month: "2026-07", amount: 50_000 },
  ];
  const cards = [
    card({ id: "s1", brand_id: "b_td", metrics: metrics({ spend: 6000, leads: 10, revenue: 30_000 }) }),
    card({ id: "s2", brand_id: "b_jk", brief: brief({ channels: ["Facebook"] }), metrics: metrics({ spend: 2000, leads: 4, revenue: 10_000 }) }),
  ];
  it("salesTargetOf: เจอเฉพาะแบรนด์+เดือนที่ตรง · ไม่มี = null", () => {
    expect(salesTargetOf("b_td", "2026-07", targets)).toBe(100_000);
    expect(salesTargetOf("b_td", "2026-08", targets)).toBeNull();
    expect(salesTargetOf("b_xx", "2026-07", targets)).toBeNull();
  });
  it("รวมยอดสะสมและเป้าของแบรนด์ในขอบเขต แล้วคิดจังหวะแบบเดียวกับงบ", () => {
    const out = adsSalesVsTarget(cards, RANGE, brands, targets, "2026-07-15");
    expect(out.revenue).toBe(40_000);
    expect(out.target).toBe(150_000);
    expect(out.pace.used).toBeCloseTo(40_000 / 150_000);
    expect(out.pace.remaining).toBe(110_000);          // ยอดที่ต้องทำอีก
    expect(out.pace.forecast).toBeCloseTo((40_000 / 15) * 31);  // คาดปิดเดือน
  });
  it("แบรนด์ไหนยังไม่ตั้งเป้า = รวมเป้าไม่ได้ (null ไม่ใช่ 0)", () => {
    const out = adsSalesVsTarget(cards, RANGE, brands, targets.slice(0, 1), "2026-07-15");
    expect(out.target).toBeNull();
    expect(out.pace.used).toBeNull();
    expect(out.pace.remaining).toBeNull();
  });
});

describe("ยอดสะสมรายวัน + จังหวะทำยอด", () => {
  const brands = [{ id: "b_td", name: "TEAMDEE" }];
  const targets = [{ brand_id: "b_td", month: "2026-07", amount: 300_000 }];
  const MONTH = { start: "2026-07-01T00:00:00.000Z", end: "2026-07-16T00:00:00.000Z" };
  const PREV_MONTH = { start: "2026-06-01T00:00:00.000Z", end: "2026-06-16T00:00:00.000Z" };
  const on = (day, revenue) => card({
    id: `d${day}`,
    brief: brief({ publish_at: null }),
    metrics: metrics({ spend: 1000, leads: 5, revenue, measured_at: `2026-07-${String(day).padStart(2, "0")}T09:00:00.000Z` }),
  });
  it("ไล่ครบทุกวันในช่วง แม้วันที่ไม่มียอด และสะสมต่อเนื่อง", () => {
    const rows = adsDailyRevenue([on(2, 10_000), on(5, 5_000)], MONTH);
    expect(rows).toHaveLength(15);                 // 1–15 ก.ค.
    expect(rows[0].revenue).toBe(0);               // วันที่ไม่มียอดต้องมีจุด ไม่ใช่เส้นขาด
    expect(rows[1].cumulative).toBe(10_000);
    expect(rows[4].cumulative).toBe(15_000);
    expect(rows.at(-1).cumulative).toBe(15_000);   // สะสมค้างไว้จนจบช่วง
  });
  it("เกจคิดจาก % ของที่ควรได้วันนี้ ไม่ใช่ % ของเป้าทั้งเดือน", () => {
    const out = adsSalesPace([on(2, 30_000)], MONTH, brands, targets, "2026-07-15", PREV_MONTH);
    // เป้า 300k · ผ่านไป 15/31 วัน → ควรได้ ~145,161 · ทำได้ 30,000
    expect(out.expectedToDate).toBeCloseTo(300_000 * (15 / 31), 0);
    expect(out.pctOfExpected).toBeCloseTo(30_000 / (300_000 * (15 / 31)), 3);
    expect(out.pctOfMonth).toBeCloseTo(0.1);       // % ของเป้าทั้งเดือน = คนละตัว
    expect(out.behind).toBeGreaterThan(0);         // ยังขาดอยู่
  });
  it("เทียบช่วงเดียวกันเดือนก่อน ณ วันเดียวกัน", () => {
    const out = adsSalesPace([on(2, 30_000)], MONTH, brands, targets, "2026-07-15", PREV_MONTH);
    expect(out.prev.total).toBe(0);                // เดือนก่อนไม่มีข้อมูลในชุดนี้
    expect(out.days).toBe(15);
    expect(out.avgPerDay).toBeCloseTo(2000);
  });
  it("ยังไม่ตั้งเป้า → เกจ/ช้ากว่าแผน เป็น null ไม่ใช่ 0", () => {
    const out = adsSalesPace([on(2, 30_000)], MONTH, brands, [], "2026-07-15", PREV_MONTH);
    expect(out.target).toBeNull();
    expect(out.pctOfExpected).toBeNull();
    expect(out.behind).toBeNull();
    expect(out.needPerDay).toBeNull();
  });
});

describe("เป้ารายได้ราย แบรนด์ × แพลตฟอร์ม", () => {
  const targets = [
    { brand_id: "b_td", channel: "Meta Ads", month: "2026-07", amount: 100_000 },
    { brand_id: "b_td", channel: "TikTok Ads", month: "2026-07", amount: 40_000 },
  ];
  it("ระบุช่องทาง = เป้าช่องนั้น · ไม่ระบุ = รวมทุกช่องทางของแบรนด์", () => {
    expect(salesTargetOf("b_td", "2026-07", targets, "Meta Ads")).toBe(100_000);
    expect(salesTargetOf("b_td", "2026-07", targets)).toBe(140_000);
    expect(salesTargetOf("b_td", "2026-07", targets, "Google Ads")).toBeNull();
  });
  it("การ์ดแบรนด์และช่องทางพกเป้ารายได้ + % ที่ทำได้", () => {
    const cards = [card({ id: "r1", brand_id: "b_td", brief: brief({ channels: ["Facebook"] }), metrics: metrics({ spend: 8000, leads: 20, revenue: 50_000 }) })];
    const rows = adsByBrandChannel(cards, RANGE, [{ id: "b_td", name: "TEAMDEE" }], [], "2026-07-15", targets);
    expect(rows[0].revTarget).toBe(140_000);
    expect(rows[0].revPct).toBeCloseTo(50_000 / 140_000);
    expect(rows[0].channels[0].revTarget).toBe(100_000);
    expect(rows[0].channels[0].revPct).toBeCloseTo(0.5);
  });
});

describe("จังหวะทำยอดรายแบรนด์", () => {
  it("revenuePace: เทียบกับที่ควรได้ ณ วันนี้ ไม่ใช่เป้าทั้งเดือน", () => {
    const p = revenuePace(60_000, 300_000, 0.5);   // ผ่านครึ่งเดือน ควรได้ 150,000
    expect(p.expectedToDate).toBe(150_000);
    expect(p.pctOfExpected).toBeCloseTo(0.4);
    expect(p.behind).toBe(90_000);
  });
  it("ไม่มีเป้า → null ทุกช่อง ไม่ใช่ 0", () => {
    const p = revenuePace(60_000, null, 0.5);
    expect(p.expectedToDate).toBeNull();
    expect(p.pctOfExpected).toBeNull();
    expect(p.behind).toBeNull();
  });
  it("การ์ดแบรนด์พก revPace มาให้เกจใช้", () => {
    const targets = [{ brand_id: "b_td", channel: "Meta Ads", month: "2026-07", amount: 100_000 }];
    const cards = [card({ id: "p1", brand_id: "b_td", brief: brief({ channels: ["Facebook"] }), metrics: metrics({ spend: 8000, leads: 20, revenue: 30_000 }) })];
    const [row] = adsByBrandChannel(cards, RANGE, [{ id: "b_td", name: "TEAMDEE" }], [], "2026-07-15", targets);
    expect(row.revPace.expectedToDate).toBeCloseTo(100_000 * (15 / 31), 0);
    expect(row.revPace.pctOfExpected).toBeGreaterThan(0);
  });
});

describe("ข้อมูลเฉพาะชั้นแพลตฟอร์ม (ไม่ซ้ำกับชั้นแบรนด์)", () => {
  it("deliveryOf: CTR/CPC/CPM/Frequency · ตัวหารศูนย์คืน null", () => {
    const d = deliveryOf({ spend: 2000, impressions: 20_000, clicks: 400, reach: 10_000 });
    expect(d.ctr).toBeCloseTo(0.02);
    expect(d.cpc).toBe(5);
    expect(d.cpm).toBe(100);
    expect(d.frequency).toBe(2);
    const empty = deliveryOf({ spend: 2000, impressions: 0, clicks: 0, reach: 0 });
    expect(empty.ctr).toBeNull();
    expect(empty.cpm).toBeNull();
    expect(empty.frequency).toBeNull();
  });
  it("adsDailySeries: วันที่ไม่มีลีดคืน cpl = null ไม่ใช่ 0", () => {
    const on = (day, over) => card({
      id: `s${day}`, brief: brief({ publish_at: null }),
      metrics: metrics({ spend: 1000, leads: 0, revenue: 0, measured_at: `2026-07-${String(day).padStart(2, "0")}T09:00:00.000Z`, ...over }),
    });
    const rows = adsDailySeries([on(2), on(4, { leads: 5, revenue: 4000 })], { start: "2026-07-01T00:00:00.000Z", end: "2026-07-16T00:00:00.000Z" });
    expect(rows).toHaveLength(2);          // เฉพาะวันที่มีข้อมูลจริง
    expect(rows[0].cpl).toBeNull();
    expect(rows[1].cpl).toBe(200);
    expect(rows[1].roas).toBe(4);
    const filled = fillDailySeries(rows, { start: "2026-07-01T00:00:00.000Z", end: "2026-07-06T00:00:00.000Z" });
    expect(filled.map((d) => d.day)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"]);
    expect(filled[0].spend).toBeNull();    // วันไม่มีข้อมูล = null ไม่ใช่ 0
    expect(filled[0].cpl).toBeNull();
    expect(filled[1].spend).toBe(1000);
    expect(filled[3].cpl).toBe(200);
  });
  it("การ์ดช่องทางพก delivery + แคมเปญย่อย · การ์ดแบรนด์พกเทียบเดือนก่อน", () => {
    const mk = (id, campaign, spend, revenue) => card({
      id, campaign, brand_id: "b_td", brief: brief({ channels: ["Facebook"] }),
      metrics: metrics({ spend, leads: 10, revenue, impressions: 20_000, clicks: 400, reach: 10_000 }),
    });
    const prev = card({
      id: "old", brand_id: "b_td", brief: brief({ channels: ["Facebook"], publish_at: "2026-06-10T00:00:00.000Z" }),
      metrics: metrics({ spend: 5000, leads: 10, revenue: 20_000, measured_at: "2026-06-10T09:00:00.000Z" }),
    });
    const [row] = adsByBrandChannel(
      [mk("c1", "A", 6000, 30_000), mk("c2", "B", 2000, 10_000), prev],
      RANGE, [{ id: "b_td", name: "TEAMDEE" }], [], "2026-07-15", [],
      { start: "2026-06-01T00:00:00.000Z", end: "2026-07-01T00:00:00.000Z" },
    );
    const ch = row.channels[0];
    expect(ch.delivery.ctr).toBeCloseTo(0.02);
    expect(ch.campaigns.map((c) => c.name)).toEqual(["A", "B"]);   // เรียงตามค่าแอด
    expect(ch.campaigns[0].spend).toBe(6000);
    expect(row.prevRevenue).toBe(20_000);
    expect(row.revChangePct).toBeCloseTo(100);                      // 40,000 vs 20,000
  });
});

describe("Scale / Fix / Stop", () => {
  const base = { spend: 5000, leads: 10, roas: 2.5, cpl: 300, fatigue: false, complete: true };
  it("ข้อมูลไม่ครบ = ยังไม่ตัดสิน", () => {
    const a = decideAction({ ...base, complete: false });
    expect(a.action).toBe("ข้อมูลไม่ครบ");
    expect(a.next).toContain("เติมข้อมูล");
  });
  it("ใช้เงินแล้วไม่มีผลลัพธ์ = Stop", () => {
    expect(decideAction({ ...base, leads: 0, roas: 0 }).action).toBe("Stop");
  });
  it("ROAS ต่ำกว่าจุดคุ้ม = Stop เมื่อ <1 · Fix เมื่อ <2", () => {
    expect(decideAction({ ...base, roas: 0.8 }).action).toBe("Stop");
    expect(decideAction({ ...base, roas: 1.5 }).action).toBe("Fix");
  });
  it("ครีเอทีฟล้า = Fix แม้ ROAS ยังดี", () => {
    const a = decideAction({ ...base, roas: 4, fatigue: true });
    expect(a.action).toBe("Fix");
    expect(a.next).toContain("เปลี่ยนชิ้นงาน");
  });
  it("ROAS ถึงเกณฑ์ = Scale พร้อมบอกวิธี", () => {
    const a = decideAction({ ...base, roas: 3.5 });
    expect(a.action).toBe("Scale");
    expect(a.next).toContain("เติมงบ");
  });
  it("ทุกคำสั่งมีทั้งเหตุผลและสิ่งที่ต้องทำ", () => {
    for (const r of [base, { ...base, roas: 0.5 }, { ...base, roas: 5 }, { ...base, complete: false }]) {
      const a = decideAction(r);
      expect(a.why.length).toBeGreaterThan(0);
      expect(a.next.length).toBeGreaterThan(0);
    }
  });
});

describe("ครีเอทีฟ — ตัวไหนเวิร์ค / เริ่มล้า", () => {
  const shot = (id, creative, day, over) => card({
    id, creative, brand_id: "b_td", brief: brief({ channels: ["Facebook"], publish_at: null }),
    metrics: metrics({ spend: 2000, leads: 10, revenue: 8000, impressions: 100_000, clicks: 2000, reach: 50_000,
      measured_at: `2026-07-${String(day).padStart(2, "0")}T09:00:00.000Z`, ...over }),
  });
  const RANGE_M = { start: "2026-07-01T00:00:00.000Z", end: "2026-07-31T00:00:00.000Z" };
  const brands = [{ id: "b_td", name: "TEAMDEE" }];
  it("รวมรายชิ้นงาน + คิด CTR/ความถี่/ROAS ให้", () => {
    const rows = adsCreativeRows([shot("a", "วิดีโอ A", 5), shot("b", "วิดีโอ A", 20)], RANGE_M, brands);
    expect(rows).toHaveLength(1);
    expect(rows[0].spend).toBe(4000);
    expect(rows[0].ctr).toBeCloseTo(0.02);
    expect(rows[0].frequency).toBeCloseTo(2);
    expect(rows[0].roas).toBe(4);
    expect(rows[0].brand).toBe("TEAMDEE");
  });
  it("จำนวนการซื้อรวมรายชิ้นงาน + ต้นทุนต่อการซื้อ · ไม่มีการซื้อ = CPA null · บัญชีไม่วัดการซื้อ = null ไม่ใช่ 0", () => {
    const [row] = adsCreativeRows([shot("a", "ซื้อ", 5, { purchases: 3 }), shot("b", "ซื้อ", 20, { purchases: 1 })], RANGE_M, brands);
    expect(row.purchases).toBe(4);
    expect(row.cpa).toBe(1000);
    const [zero] = adsCreativeRows([shot("z", "ศูนย์", 5, { purchases: 0 })], RANGE_M, brands);
    expect(zero.purchases).toBe(0);
    expect(zero.cpa).toBeNull();
    const [unknown] = adsCreativeRows([shot("u", "ไม่รู้", 5)], RANGE_M, brands);
    expect(unknown.purchases).toBeNull();
  });
  it("CTR ครึ่งหลังตกแรง = ติดธงเริ่มล้า แล้วสั่ง Fix", () => {
    const rows = adsCreativeRows([
      shot("early", "วิดีโอ B", 5),                                   // CTR 2%
      shot("late", "วิดีโอ B", 25, { clicks: 500 }),                  // CTR 0.5%
    ], RANGE_M, brands);
    expect(rows[0].fatigue).toBe(true);
    expect(rows[0].ctrDrop).toBeGreaterThan(0.25);
    expect(rows[0].action).toBe("Fix");
  });
  it("CTR ตกแต่การเห็นโฆษณาครึ่งใดครึ่งหนึ่งน้อยกว่า 1,000 ครั้ง = ยังไม่นับว่าล้า (ตัวเลขน้อยแกว่งง่าย)", () => {
    const rows = adsCreativeRows([
      shot("early", "ชิ้นเล็ก", 5, { impressions: 800, clicks: 40, reach: 700 }),     // CTR 5% · 800 ครั้ง
      shot("late", "ชิ้นเล็ก", 25, { impressions: 5000, clicks: 50, reach: 4000 }),   // CTR 1%
    ], RANGE_M, brands);
    expect(rows[0].ctrDrop).toBeGreaterThan(0.25);
    expect(rows[0].fatigue).toBe(false);
  });
  it("เรียงเรื่องด่วนก่อน (Stop > Fix > Scale > ติดตาม)", () => {
    const rows = adsCreativeRows([
      shot("good", "ตัวแรง", 5, { revenue: 20_000 }),                 // ROAS 10 → Scale
      shot("bad", "ตัวแย่", 6, { revenue: 500, leads: 1 }),           // ROAS 0.25 → Stop
    ], RANGE_M, brands);
    expect(rows.map((r) => r.action)).toEqual(["Stop", "Scale"]);
  });
});

describe("กระดานตัวชี้วัดและแนวโน้ม", () => {
  const shot = (id, over = {}, briefOver = {}) => card({
    id, brief: brief({ channels: ["Facebook"], publish_at: null, ...briefOver }),
    metrics: metrics({ spend: 2000, leads: 10, revenue: 8000, impressions: 100_000, clicks: 2000, reach: 50_000,
      measured_at: "2026-07-22T09:00:00.000Z", ...over }),
  });
  const by = (board, key) => board.find((c) => c.key === key);
  it("คำนวณค่าหลักครบ และ delta มีค่าช่วงก่อนให้เทียบ", () => {
    const prevCard = shot("p1", { measured_at: "2026-07-15T09:00:00.000Z", spend: 1000 }, { });
    const board = adsMetricBoard([shot("a1"), prevCard], RANGE, PREV);
    expect(by(board, "spend").value).toBe(2000);
    expect(by(board, "spend").before).toBe(1000);
    expect(by(board, "ctr").value).toBeCloseTo(0.02);
    expect(by(board, "cpm").value).toBe(20);
    expect(by(board, "frequency").value).toBe(2);
    expect(by(board, "roas").value).toBe(4);
  });
  it("Inquiry ไม่มีฟิลด์จริง = null พร้อมเหตุผลกันเลขซ้ำกับ Leads (ห้าม fallback)", () => {
    const board = adsMetricBoard([shot("a1")], RANGE, PREV);
    expect(by(board, "inquiry").value).toBeNull();
    expect(by(board, "inquiry").reason).toContain("ซ้ำกับ Leads");
    const withReal = adsMetricBoard([shot("a2", { inquiries: 40 })], RANGE, PREV);
    expect(by(withReal, "inquiry").value).toBe(40);
  });
  it("CPR เป็นลีดล้วน = null บอกว่าค่าเดียวกับ CPL · แพลตฟอร์มออเดอร์ = คำนวณจริง", () => {
    const board = adsMetricBoard([shot("a1")], RANGE, PREV);
    expect(by(board, "cpr").value).toBeNull();
    expect(by(board, "cpr").reason).toContain("CPL");
    const shopee = adsMetricBoard([shot("s1", { orders: 8 }, { channels: ["Shopee"] })], RANGE, PREV);
    expect(by(shopee, "cpr").value).toBe(250); // 2000 / 8 ออเดอร์
  });
  it("Reach/Frequency หลายแพลตฟอร์ม = null เพราะคนซ้ำกันข้ามแพลตฟอร์ม", () => {
    const board = adsMetricBoard([shot("m1"), shot("t1", {}, { channels: ["TikTok"] })], RANGE, PREV);
    expect(by(board, "reach").value).toBeNull();
    expect(by(board, "reach").reason).toContain("ช่องทางเดียว");
    expect(by(board, "frequency").value).toBeNull();
    expect(by(board, "spend").value).toBe(4000); // ตัวอื่นยังรวมได้ปกติ
  });
  it("series รายวันพกอัตราส่วนไว้วาดเส้น (ctr/cpc/cpm/frequency)", () => {
    const days = adsDailySeries([shot("a1")], RANGE);
    expect(days[0].ctr).toBeCloseTo(0.02);
    expect(days[0].cpc).toBe(1);
    expect(days[0].cpm).toBe(20);
    expect(days[0].frequency).toBe(2);
  });
});

describe("Sale pipeline แนวนอน", () => {
  const shot = (id, over = {}) => card({
    id, brief: brief({ channels: ["Facebook"], publish_at: null }),
    metrics: metrics({ spend: 2000, leads: 20, revenue: 8000, measured_at: "2026-07-22T09:00:00.000Z", ...over }),
  });
  const prevShot = shot("p1", { spend: 1000, leads: 5, revenue: 2000, measured_at: "2026-07-15T09:00:00.000Z" });
  it("4 ขั้นขาย + ROAS + %Ads พร้อมค่าช่วงก่อนไว้บอกดีขึ้น/แย่ลง", () => {
    const p = adsSalePipeline([shot("a1"), prevShot], RANGE, PREV);
    expect(p.items.map((i) => i.label)).toEqual(["คนทัก", "Lead", "มัดจำ", "ออเดอร์ปิดแล้ว", "ROAS", "%Ads"]);
    const roas = p.items.find((i) => i.key === "roas");
    expect(roas.value).toBe(4);
    expect(roas.before).toBe(2);         // ช่วงก่อน 2000/1000
    const pctAds = p.items.find((i) => i.key === "pctAds");
    expect(pctAds.value).toBeCloseTo(0.25);
    expect(pctAds.sense).toBe("lower");  // %Ads ต่ำลง = ดีขึ้น
    expect(p.items[0].value).toBe(20);   // คนทัก (ประมาณจากลีด)
    expect(p.estimated).toBe(true);      // mock ยังไม่เก็บมัดจำ/ออเดอร์จริง
  });
  it("ไม่ส่งช่วงเทียบ → before เป็น null ไม่ใช่ 0", () => {
    const p = adsSalePipeline([shot("a1")], RANGE);
    expect(p.items.every((i) => i.before == null)).toBe(true);
  });
  it("ขั้นขายพกอัตราแปลงจากขั้นก่อน และชี้ขั้นที่หล่นแรงสุด", () => {
    /* ใช้ตัวเลขจริงทุกขั้น: ทัก 20 → Lead 13 → มัดจำ 2 → ปิด 2 — มัดจำหล่นแรงสุด */
    const p = adsSalePipeline([shot("a1", { qualified_leads: 13, deposits: 2, closed_orders: 2 })], RANGE);
    const [inq, lead, dep, closed] = p.items;
    expect(inq.conv).toBeNull();
    expect(lead.conv).toBeCloseTo(13 / 20);
    expect(dep.conv).toBeCloseTo(2 / 13);
    expect(closed.conv).toBeCloseTo(1);
    expect(p.items.find((i) => i.key === "roas").conv).toBeUndefined();
    expect(p.worstKey).toBe("deposits");
  });
  it("ไม่มีข้อมูลในช่วง → conv เป็น null และไม่ชี้ขั้นหล่น", () => {
    const p = adsSalePipeline([], RANGE);
    expect(p.items.slice(0, 4).every((i) => i.conv == null)).toBe(true);
    expect(p.worstKey).toBeNull();
  });
});

describe("คาดปิดเดือนฝั่งยอดขาย (run-rate เชิงเส้น)", () => {
  it("forecast = ยอดสะสม ÷ สัดส่วนวันที่ผ่านไป · เทียบเป้าเป็นบาท", () => {
    const p = revenuePace(84_134, 240_000, 0.4);
    expect(p.forecast).toBeCloseTo(210_335);
    expect(p.forecastVsTarget).toBeCloseTo(210_335 - 240_000);  // ติดลบ = คาดว่าขาดเป้า
  });
  it("ไม่มีเป้าก็ยังคาดยอดได้ แต่เทียบเป้าไม่ได้", () => {
    const p = revenuePace(50_000, null, 0.5);
    expect(p.forecast).toBeCloseTo(100_000);
    expect(p.forecastVsTarget).toBeNull();
  });
  it("ยังไม่มีวันผ่านไปหรือยอดว่าง → null ไม่ใช่ Infinity", () => {
    expect(revenuePace(1000, 100, 0).forecast).toBeNull();
    expect(revenuePace(null, 100, 0.5).forecast).toBeNull();
  });
});

describe("เครื่องหมายแบรนด์", () => {
  it("ตัวย่อจากชื่อ — คงตัวพิมพ์เดิม และเคารพชื่อที่เป็นตัวย่ออยู่แล้ว", async () => {
    const { monogramOf, inkOn } = await import("../src/modules/marketing/ads/BrandMark.jsx");
    expect(monogramOf("TEAMDEE")).toBe("TE");
    expect(monogramOf("JUNTAKARN")).toBe("JU");
    expect(monogramOf("JK Design")).toBe("JK");   // ไม่ใช่ "JD"
    expect(monogramOf("t around")).toBe("ta");    // คงพิมพ์เล็กตามโลโก้
    expect(monogramOf("")).toBe("?");
  });
  it("สีตัวอักษรบนพื้นแบรนด์เลือกตามคอนทราสต์ ไม่ใช่ขาวเสมอ", async () => {
    const { inkOn } = await import("../src/modules/marketing/ads/BrandMark.jsx");
    expect(inkOn("#0D2B5E")).toBe("#FFFFFF");  // navy เข้ม → ตัวขาว
    expect(inkOn("#111111")).toBe("#FFFFFF");  // ดำ → ตัวขาว
    expect(inkOn("#F4700A")).toBe("#11181C");  // ส้ม → ตัวเข้ม (ขาวได้แค่ ~3:1 ไม่ผ่าน AA)
  });
});

describe("จุดอ้างอิงจังหวะใช้งบ", () => {
  it("บอกเป็นบาทว่าควรใช้เท่าไร และตอนนี้เร็ว/ช้ากว่าจังหวะกี่บาท", () => {
    // งบ 30,000 · ผ่านไป 15/31 วัน → ควรใช้ ~14,516 · ใช้จริง 19,500
    const p = budgetPace(19_500, 30_000, "2026-07-15");
    expect(p.expectedSpend).toBeCloseTo(30_000 * (15 / 31), 0);
    expect(p.vsPace).toBeCloseTo(19_500 - 30_000 * (15 / 31), 0);
    expect(p.vsPace).toBeGreaterThan(0);            // ใช้เร็วกว่าจังหวะ
  });
  it("ใช้ช้ากว่าจังหวะ → vsPace ติดลบ", () => {
    expect(budgetPace(3_000, 30_000, "2026-07-15").vsPace).toBeLessThan(0);
  });
  it("ยังไม่ตั้งงบ → null ไม่ใช่ NaN", () => {
    const p = budgetPace(5_000, null, "2026-07-15");
    expect(p.expectedSpend).toBeNull();
    expect(p.vsPace).toBeNull();
  });
});

describe("สรุประดับบริษัท (แถวบนสุด)", () => {
  const BRANDS = [
    { id: "b_td", name: "TEAMDEE", color: "#F4700A" },
    { id: "b_jk", name: "JK Design", color: "#123A6B" },
  ];
  const budgets = [
    { brand_id: "b_td", channel: "TikTok", month: "2026-07", amount: 16_000 },
    { brand_id: "b_jk", channel: "Facebook", month: "2026-07", amount: 9_000 },
  ];
  const targets = [
    { brand_id: "b_td", month: "2026-07", amount: 40_000 },
    { brand_id: "b_jk", month: "2026-07", amount: 20_000 },
  ];
  const JUNE = { start: "2026-06-20T00:00:00.000Z", end: "2026-06-27T00:00:00.000Z" };
  const cards = [
    card({ id: "a1", brand_id: "b_td", brief: brief({ channels: ["TikTok"] }), metrics: metrics({ spend: 8000, leads: 20, revenue: 28_800 }) }),
    card({ id: "a2", brand_id: "b_jk", brief: brief({ channels: ["Facebook"] }), metrics: metrics({ spend: 2000, leads: 4, revenue: 3200 }) }),
    /* เดือนก่อน — ไว้เทียบยอดรวม */
    card({ id: "p1", brand_id: "b_td", brief: brief({ channels: ["TikTok"], publish_at: "2026-06-22T12:00:00.000Z" }),
      metrics: metrics({ spend: 3000, leads: 10, revenue: 10_000, measured_at: "2026-06-23T09:00:00.000Z" }) }),
    card({ id: "p2", brand_id: "b_jk", brief: brief({ channels: ["Facebook"], publish_at: "2026-06-22T12:00:00.000Z" }),
      metrics: metrics({ spend: 1000, leads: 3, revenue: 5000, measured_at: "2026-06-23T09:00:00.000Z" }) }),
  ];
  const rows = (bs = BRANDS, tg = targets, bg = budgets) =>
    adsByBrandChannel(cards, RANGE, bs, bg, "2026-07-15", tg, JUNE);

  it("รวมยอดขาย/ค่าแอด/เป้า/งบทุกแบรนด์ + จังหวะคิดจากยอดรวม", () => {
    const s = adsCompanySummary(rows(), "2026-07-15");
    expect(s.brands).toBe(2);
    expect(s.revenue).toBe(32_000);
    expect(s.spend).toBe(10_000);
    expect(s.revTarget).toBe(60_000);
    expect(s.budget).toBe(25_000);
    expect(s.revPct).toBeCloseTo(32_000 / 60_000);
    expect(s.revPace.expectedSpend).toBeCloseTo(60_000 * (15 / 31));   // ควรได้ ณ วันนี้
    expect(s.revPace.vsPace).toBeCloseTo(32_000 - 60_000 * (15 / 31)); // ยอดนำ/ตามแผนกี่บาท
    expect(s.revPctOfExpected).toBeCloseTo(32_000 / (60_000 * (15 / 31))); // % ของที่ควรได้วันนี้
    expect(s.pace.used).toBeCloseTo(10_000 / 25_000);
    expect(s.pace.vsPace).toBeCloseTo(10_000 - 25_000 * (15 / 31));
    expect(s.pace.forecast).toBeCloseTo((10_000 / 15) * 31);
  });

  it("เทียบเดือนก่อนจากผลรวม", () => {
    const s = adsCompanySummary(rows(), "2026-07-15");
    expect(s.prevRevenue).toBe(15_000);
    expect(s.revChangePct).toBeCloseTo(((32_000 - 15_000) / 15_000) * 100);
  });

  it("เป้า/งบไม่ครบทุกแบรนด์ = รวมไม่ได้ (null ไม่เดา)", () => {
    const s = adsCompanySummary(rows(BRANDS, targets.slice(0, 1), budgets.slice(0, 1)), "2026-07-15");
    expect(s.revTarget).toBeNull();
    expect(s.revPct).toBeNull();
    expect(s.budget).toBeNull();
    expect(s.pace.used).toBeNull();
    expect(s.revenue).toBe(32_000);   // ยอดจริงยังรวมได้เสมอ
  });

  it("จัดกลุ่มสถานะแบรนด์ — ปัญหาก่อน · ข้ามกลุ่มว่าง · พกสีแบรนด์", () => {
    const s = adsCompanySummary(rows(), "2026-07-15");
    /* b_jk ได้ 3,200 จากที่ควรได้ ~9,677 → ช้ากว่าแผน · b_td 28,800 จาก ~19,355 → ตามแผน */
    expect(s.byStatus.map((g) => g.tone)).toEqual(["rose", "emerald"]);
    expect(s.byStatus[0].text).toBe("ช้ากว่าแผน");
    expect(s.byStatus[0].brands.map((b) => b.name)).toEqual(["JK Design"]);
    expect(s.byStatus[1].brands[0]).toMatchObject({ id: "b_td", name: "TEAMDEE", color: "#F4700A" });
  });

  it("แบรนด์ไม่มีเป้า → กลุ่ม ยังประเมินไม่ได้ (zinc) ท้ายสุด", () => {
    const s = adsCompanySummary(rows(BRANDS, targets.slice(0, 1)), "2026-07-15");
    const zinc = s.byStatus.find((g) => g.tone === "zinc");
    expect(zinc.brands.map((b) => b.id)).toEqual(["b_jk"]);
    expect(s.byStatus[s.byStatus.length - 1].tone).toBe("zinc");
  });

  it("ไม่มีแบรนด์ในขอบเขต → ค่าว่างทั้งชุด ไม่พัง", () => {
    const s = adsCompanySummary([], "2026-07-15");
    expect(s.brands).toBe(0);
    expect(s.revenue).toBe(0);
    expect(s.revTarget).toBeNull();
    expect(s.byStatus).toEqual([]);
  });
});

describe("กราฟจังหวะเดือน (สะสม vs เป้า/งบ + คาดการณ์)", () => {
  const MTD = { start: "2026-07-01T00:00:00.000Z", end: "2026-07-16T00:00:00.000Z" };
  const cards = [
    card({ id: "d1", brief: brief({ channels: ["Facebook"], publish_at: null }),
      metrics: metrics({ spend: 4000, leads: 8, revenue: 10_000, measured_at: "2026-07-05T09:00:00.000Z" }) }),
    card({ id: "d2", brief: brief({ channels: ["Facebook"], publish_at: null }),
      metrics: metrics({ spend: 2000, leads: 4, revenue: 5000, measured_at: "2026-07-10T09:00:00.000Z" }) }),
  ];
  it("สะสมจริงถึงวันนี้ หลังจากนั้นเป็น null · คาดการณ์ต่อจากจุดจริงด้วย run-rate", () => {
    const c = adsCompanyPaceChart(cards, MTD, "2026-07-15", 62_000, 12_000);
    expect(c.daysInMonth).toBe(31);
    expect(c.elapsed).toBe(15);
    expect(c.days).toHaveLength(31);
    expect(c.revCum[4]).toBe(10_000);      // 5 ก.ค.
    expect(c.revCum[14]).toBe(15_000);     // วันนี้
    expect(c.revCum[15]).toBeNull();       // อนาคตไม่มีข้อมูลจริง
    expect(c.revProj[13]).toBeNull();      // ก่อนวันนี้ไม่มีเส้นคาดการณ์
    expect(c.revProj[14]).toBe(15_000);    // ต่อจากจุดจริง
    expect(c.revProj[30]).toBeCloseTo(31_000); // 15000 + (15000/15)*16
  });
  it("เส้นเป้าไต่ตามจังหวะวัน · เส้นงบเป็นเส้นราบ", () => {
    const c = adsCompanyPaceChart(cards, MTD, "2026-07-15", 62_000, 12_000);
    expect(c.targetLine[30]).toBeCloseTo(62_000);
    expect(c.targetLine[14]).toBeCloseTo(62_000 * (15 / 31));
    expect(c.budgetLine[0]).toBe(12_000);
    expect(c.budgetLine[30]).toBe(12_000);
  });
  it("ชี้วันงบหมดจากเส้นคาดการณ์", () => {
    const c = adsCompanyPaceChart(cards, MTD, "2026-07-15", 62_000, 12_000);
    /* ใช้ไป 6,000 ใน 15 วัน (เฉลี่ย 400/วัน) → ถึง 12,000 วันที่ 30 */
    expect(c.exhaustDay).toBe(30);
  });
  it("ไม่มีเป้า/งบ → เส้นนั้นเป็น null ไม่ใช่ศูนย์", () => {
    const c = adsCompanyPaceChart(cards, MTD, "2026-07-15", null, null);
    expect(c.targetLine).toBeNull();
    expect(c.budgetLine).toBeNull();
    expect(c.exhaustDay).toBeNull();
  });
  it("ไม่มีข้อมูลเลย → เส้นคาดการณ์ไม่พัง", () => {
    const c = adsCompanyPaceChart([], MTD, "2026-07-15", 62_000, null);
    expect(c.revCum[14]).toBe(0);
    expect(c.revProj[30]).toBe(0);
  });
});

describe("สัดส่วนค่าแอดตามแบรนด์", () => {
  const rows = [
    { id: "b_td", name: "TEAMDEE", color: "#F4700A", spend: 6000 },
    { id: "b_jk", name: "JK Design", color: "#123A6B", spend: 2000 },
    { id: "b_ta", name: "t around", color: "#111111", spend: 0 },
  ];
  it("เรียงมาก→น้อย · ตัดแบรนด์ที่ไม่ใช้เงิน · สัดส่วนรวม 1", () => {
    const s = adsSpendShareByBrand(rows);
    expect(s.total).toBe(8000);
    expect(s.rows.map((r) => r.id)).toEqual(["b_td", "b_jk"]);
    expect(s.rows[0].share).toBeCloseTo(0.75);
    expect(s.rows.reduce((n, r) => n + r.share, 0)).toBeCloseTo(1);
    expect(s.rows[0].color).toBe("#F4700A");
  });
  it("ไม่มีใครใช้เงิน → ว่างเปล่า ไม่หารศูนย์", () => {
    const s = adsSpendShareByBrand([{ id: "x", name: "X", spend: 0 }]);
    expect(s.total).toBe(0);
    expect(s.rows).toEqual([]);
  });
});
