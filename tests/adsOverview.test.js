import { describe, it, expect } from "vitest";
import {
  adsByBrandChannel, adsByChannel, adsChannelList, adsDecisionRows, adsFunnel, adsKpis, adsWeekly,
  adsCreativeRows, adsDailyRevenue, adsDailySeries, adsSalesPace, decideAction, adsSalesVsTarget, budgetOf, deliveryOf, revenuePace, budgetPace, change, filterByChannel, normalizeAdPlatform, paceGroup, paceStatus, roasOf, salesTargetOf, share,
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
  it("แบรนด์ที่ยังไม่ใช้เงินก็ต้องอยู่ในผล (ค่าแอด 0)", () => {
    const rows = adsByBrandChannel(cards, RANGE, [
      { id: "b_td", name: "TEAMDEE" }, { id: "b_ta", name: "t around" },
    ], budgets, "2026-07-15");
    const ta = rows.find((r) => r.id === "b_ta");
    expect(ta).toBeTruthy();
    expect(ta.spend).toBe(0);
    expect(ta.channels).toEqual([]);
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
  it("ข้อมูลเก่าใช้ค่าจำลองต่อจากคนทักและติดธง estimated", () => {
    const f = adsFunnel([card({ metrics: metrics({ leads: 100, spend: 5000 }) })], RANGE);
    expect(f.stages.map((s) => s.value)).toEqual([100, 65, 10, 8]);
    expect(f.estimated).toBe(true);
  });
  it("ไม่มีงานยิงแอดเลย ทุกขั้นเป็น null", () => {
    expect(adsFunnel([], RANGE).stages.every((s) => s.value === null)).toBe(true);
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
  it("CTR ครึ่งหลังตกแรง = ติดธงเริ่มล้า แล้วสั่ง Fix", () => {
    const rows = adsCreativeRows([
      shot("early", "วิดีโอ B", 5),                                   // CTR 2%
      shot("late", "วิดีโอ B", 25, { clicks: 500 }),                  // CTR 0.5%
    ], RANGE_M, brands);
    expect(rows[0].fatigue).toBe(true);
    expect(rows[0].ctrDrop).toBeGreaterThan(0.25);
    expect(rows[0].action).toBe("Fix");
  });
  it("เรียงเรื่องด่วนก่อน (Stop > Fix > Scale > ติดตาม)", () => {
    const rows = adsCreativeRows([
      shot("good", "ตัวแรง", 5, { revenue: 20_000 }),                 // ROAS 10 → Scale
      shot("bad", "ตัวแย่", 6, { revenue: 500, leads: 1 }),           // ROAS 0.25 → Stop
    ], RANGE_M, brands);
    expect(rows.map((r) => r.action)).toEqual(["Stop", "Scale"]);
  });
});
