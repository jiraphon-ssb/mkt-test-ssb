import { describe, it, expect } from "vitest";
import { analyticsCards, lastNWeeks, weeksRange, previousRange, inRange, cardAnchorISO, kpiSummary, pctDelta, weeklySeries, weeklySeriesBy, rollupBy, stageFlows, ideaToPublishedCycle, publishHeatmap, adsRollup, } from "../src/modules/marketing/mktAnalytics.js";
/** ศุกร์ 24 ก.ค. 2026 เวลา 16:00 ไทย (09:00 UTC) — สัปดาห์เริ่มจันทร์ 20 ก.ค. */
const NOW = "2026-07-24T09:00:00.000Z";
const brief = (over = {}) => ({
  who_action: "HR → ทัก LINE", hook: "hook", key_message: "km", cta: "ทัก LINE",
  fact_checked: true, format: "video", size: "9:16", deadline_review: "2026-07-18",
  channels: ["TikTok"], publish_at: "2026-07-22T12:00:00.000Z",
  layout_note: "l", mood: "m", ref_note: "r", ci_link: "https://x.co/ci",
  ...over,
});
const check = {
  visual: true, logo: true, text_ratio: true, no_forbidden: true, data_verified: true, cta_clear: true,
};
const metrics = (over = {}) => ({
  reach: 10_000, engagement: 200, leads: 5, spend: null, cpl: null,
  measured_at: "2026-07-23T09:00:00.000Z", ...over,
});
function card(over) {
  return {
    id: "c1", track: "content", status: "measured", brand_id: "b_td", owner_id: "u_arm",
    title: "t", pillar: "knowledge", is_realtime: false, plan_confirmed: true,
    brief: brief(), draft_link: "https://d", self_check: check,
    first_pass: true, entered_review_at: null, archived: true,
    created_at: "2026-07-10T00:00:00.000Z", updated_at: NOW,
    metrics: metrics(),
    ...over,
  };
}
const hist = (card_id, from, to, moved_at) => ({ id: `h_${card_id}_${to}_${moved_at}`, card_id, from_status: from, to_status: to, moved_by: "u_arm", moved_at });
/* ============================================================ */
describe("ฐานการ์ด — ตัด phantom", () => {
  it("การ์ด hist_* ไม่เข้าการคำนวณ", () => {
    const cards = [card({ id: "CT-001" }), card({ id: "hist_u_arm_3" })];
    expect(analyticsCards(cards).map((c) => c.id)).toEqual(["CT-001"]);
  });
  it("phantom ไม่ถูกนับใน KPI แม้จะมี metrics ติดมา", () => {
    const r = { start: "2026-07-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" };
    const k = kpiSummary([card({ id: "hist_x_1" })], r);
    expect(k.produced).toBe(0);
  });
});
describe("ช่วงเวลารายสัปดาห์", () => {
  it("lastNWeeks เรียงเก่า→ใหม่ และสัปดาห์สุดท้ายครอบ now", () => {
    const weeks = lastNWeeks(4, NOW);
    expect(weeks).toHaveLength(4);
    expect(new Date(weeks[0].start).getTime()).toBeLessThan(new Date(weeks[3].start).getTime());
    expect(inRange(NOW, weeks[3])).toBe(true);
  });
  it("สัปดาห์เริ่มวันจันทร์", () => {
    const weeks = lastNWeeks(2, NOW);
    // getDay(): 1 = จันทร์
    expect(new Date(weeks[0].start).getDay()).toBe(1);
  });
  it("การ์ดที่โพสต์เที่ยงคืนวันจันทร์เข้าสัปดาห์ใหม่ ไม่ใช่สัปดาห์ก่อน", () => {
    const weeks = lastNWeeks(2, NOW);
    const monday = weeks[1].start;
    expect(inRange(monday, weeks[0])).toBe(false);
    expect(inRange(monday, weeks[1])).toBe(true);
  });
  it("previousRange ยาวเท่าเดิมและจบตรงจุดเริ่มของช่วงหลัก", () => {
    const r = weeksRange(lastNWeeks(4, NOW));
    const p = previousRange(r);
    expect(p.end).toBe(r.start);
    const span = (x) => new Date(x.end).getTime() - new Date(x.start).getTime();
    expect(span(p)).toBe(span(r));
  });
});
describe("KPI", () => {
  const r = { start: "2026-07-20T00:00:00.000Z", end: "2026-07-27T00:00:00.000Z" };
  it("ER เป็น weighted (Σeng/Σreach) ไม่ใช่เฉลี่ยรายใบ", () => {
    const cards = [
      card({ id: "a", metrics: metrics({ reach: 100_000, engagement: 1_000 }) }), // 1%
      card({ id: "b", metrics: metrics({ reach: 1_000, engagement: 100 }) }), // 10%
    ];
    const k = kpiSummary(cards, r);
    // weighted = 1100/101000 ≈ 1.09% · ถ้าเฉลี่ยรายใบจะได้ 5.5%
    expect(k.er * 100).toBeCloseTo(1.089, 2);
    expect(k.produced).toBe(2);
  });
  it("การ์ดไม่มี metrics ไม่ถูกนับว่าผลิตเสร็จ", () => {
    const k = kpiSummary([card({ id: "x", metrics: undefined })], r);
    expect(k.produced).toBe(0);
    expect(k.er).toBeNull();
  });
  it("CPL คิดจากงาน ads เท่านั้น", () => {
    const cards = [
      card({ id: "ads", track: "project", metrics: metrics({ spend: 3_000, leads: 10 }) }),
      card({ id: "organic", metrics: metrics({ leads: 90 }) }),
    ];
    const k = kpiSummary(cards, r);
    expect(k.spend).toBe(3_000);
    expect(k.cpl).toBe(300); // 3000/10 ไม่ใช่ 3000/100
  });
  it("pctDelta ฐาน 0 หรือไม่มีข้อมูล = null", () => {
    expect(pctDelta(5, 0)).toBeNull();
    expect(pctDelta(5, null)).toBeNull();
    expect(pctDelta(6, 4)).toBeCloseTo(0.5, 5);
  });
  it("anchor ใช้วันโพสต์ก่อน ถ้าไม่มีใช้วันวัดผล (งาน ads)", () => {
    expect(cardAnchorISO(card({}))).toBe("2026-07-22T12:00:00.000Z");
    const ads = card({ brief: brief({ publish_at: null }) });
    expect(cardAnchorISO(ads)).toBe("2026-07-23T09:00:00.000Z");
  });
});
describe("trend รายสัปดาห์", () => {
  it("การ์ดถูกจัดเข้าสัปดาห์ตามวันโพสต์", () => {
    const weeks = lastNWeeks(3, NOW);
    const cards = [
      card({ id: "old", brief: brief({ publish_at: weeks[0].start }) }),
      card({ id: "new1", brief: brief({ publish_at: weeks[2].start }) }),
      card({ id: "new2", brief: brief({ publish_at: weeks[2].start }) }),
    ];
    const s = weeklySeries(cards, weeks);
    expect(s.map((p) => p.produced)).toEqual([1, 0, 2]);
  });
  it("weeklySeriesBy แยกกลุ่มได้ และข้ามการ์ดที่กลุ่มเป็น null", () => {
    const weeks = lastNWeeks(2, NOW);
    const cards = [
      card({ id: "a", brand_id: "b_td", brief: brief({ publish_at: weeks[1].start }) }),
      card({ id: "b", brand_id: "b_jk", brief: brief({ publish_at: weeks[1].start }) }),
      card({ id: "c", brand_id: "b_jk", pillar: null, brief: brief({ publish_at: weeks[1].start }) }),
    ];
    const byBrand = weeklySeriesBy(cards, weeks, (c) => c.brand_id);
    expect([...byBrand.keys()].sort()).toEqual(["b_jk", "b_td"]);
    const byPillar = weeklySeriesBy(cards, weeks, (c) => c.pillar);
    expect([...byPillar.keys()]).toEqual(["knowledge"]); // การ์ด pillar null ตกไป
  });
});
describe("rollupBy", () => {
  const r = { start: "2026-07-20T00:00:00.000Z", end: "2026-07-27T00:00:00.000Z" };
  it("มิติ channel ห้ามนับยอดซ้ำ — งานเก่าที่มีแต่ยอดรวมให้เฉลี่ยลงแต่ละช่อง", () => {
    const cards = [card({ id: "multi", brief: brief({ channels: ["Facebook", "TikTok"] }) })];
    const rows = rollupBy(cards, cards, "channel", r);
    expect(rows.map((x) => x.key).sort()).toEqual(["Facebook", "TikTok"]);
    expect(rows.every((x) => x.n === 1)).toBe(true);
    /* metrics ของการ์ด reach 10,000 → 2 ช่องทางได้ช่องละ 5,000 ไม่ใช่ช่องละ 10,000 */
    expect(rows.reduce((a, x) => a + x.reach, 0)).toBe(10_000);
  });

  it("มิติ channel อ่านตัวเลขรายช่องทางจริงถ้ากรอกไว้ — คนละชนิดช่องทางแปลงถูก", () => {
    const channels = [
      { id: "c1", name: "Facebook", kind: "feed" },
      { id: "c2", name: "TikTok", kind: "short_video" },
    ];
    const runsCard = card({
      id: "runs", brief: brief({ channels: ["Facebook", "TikTok"] }),
      channel_runs: [
        { channel: "Facebook", metrics: { reach: 100, engagement: 10, leads: 1 } },
        { channel: "TikTok", metrics: { views: 400, engagement: 40, leads: 3 } },
      ],
    });
    const rows = rollupBy([runsCard], [runsCard], "channel", r, channels);
    const fb = rows.find((x) => x.key === "Facebook");
    const tt = rows.find((x) => x.key === "TikTok");
    expect(fb.reach).toBe(100);
    expect(tt.reach).toBe(400);      /* short video ใช้ยอดดูเป็น reach */
    expect(tt.leads).toBe(3);
  });
  it("มิติ brand รวมตัวเลขและคิด ER แบบ weighted", () => {
    const cards = [
      card({ id: "a", brand_id: "b_td", metrics: metrics({ reach: 10_000, engagement: 300 }) }),
      card({ id: "b", brand_id: "b_td", metrics: metrics({ reach: 10_000, engagement: 100 }) }),
      card({ id: "c", brand_id: "b_jk", metrics: metrics({ reach: 5_000, engagement: 50 }) }),
    ];
    const rows = rollupBy(cards, cards, "brand", r);
    const td = rows.find((x) => x.key === "b_td");
    expect(td.n).toBe(2);
    expect(td.er * 100).toBeCloseTo(2.0, 5);
  });
  it("นับป้ายผลจากค่าเฉลี่ย brand (เขียว/แดง)", () => {
    const cards = [
      card({ id: "hi", metrics: metrics({ reach: 10_000, engagement: 600 }) }), // 6%
      card({ id: "mid", metrics: metrics({ reach: 10_000, engagement: 300 }) }), // 3%
      card({ id: "lo", metrics: metrics({ reach: 10_000, engagement: 30 }) }), // 0.3%
    ];
    const rows = rollupBy(cards, cards, "brand", r);
    const td = rows[0];
    expect(td.labels.green).toBeGreaterThanOrEqual(1);
    expect(td.labels.red).toBeGreaterThanOrEqual(1);
  });
});
describe("funnel + cycle time จาก status_history", () => {
  const r = { start: "2026-07-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" };
  const c = card({ id: "CT-900" });
  const history = [
    hist("CT-900", null, "idea", "2026-07-01T00:00:00.000Z"),
    hist("CT-900", "idea", "brief", "2026-07-03T00:00:00.000Z"),
    hist("CT-900", "brief", "draft", "2026-07-04T00:00:00.000Z"),
    hist("CT-900", "draft", "review", "2026-07-07T00:00:00.000Z"),
    hist("CT-900", "review", "scheduled", "2026-07-08T00:00:00.000Z"),
    hist("CT-900", "scheduled", "published", "2026-07-11T00:00:00.000Z"),
    hist("CT-900", "published", "measured", "2026-07-18T00:00:00.000Z"),
    // audit ปิดงาน — from === to ต้องถูกข้าม
    hist("CT-900", "measured", "measured", "2026-07-19T00:00:00.000Z"),
  ];
  it("นับการ์ดเข้าแต่ละขั้น และเวลาอยู่ในขั้น", () => {
    const flows = stageFlows([c], history, r);
    const draft = flows.find((f) => f.status === "draft");
    expect(draft.entered).toBe(1);
    expect(draft.avgDays).toBeCloseTo(3, 5); // 4 ก.ค. → 7 ก.ค.
  });
  it("ข้าม audit ปิดงาน (from===to) ไม่นับเป็นเวลาในขั้น measured", () => {
    const flows = stageFlows([c], history, r);
    const measured = flows.find((f) => f.status === "measured");
    expect(measured.entered).toBe(1);
    expect(measured.avgDays).toBeNull(); // ไม่มี move ถัดไปที่ถูกนับ
  });
  it("cycle idea→published = 10 วัน", () => {
    const cy = ideaToPublishedCycle([c], history, r);
    expect(cy.n).toBe(1);
    expect(cy.avgDays).toBeCloseTo(10, 5);
  });
  it("การ์ดที่ถูกตีกลับ นับเวลารวมรอบวนกลับ", () => {
    const rejected = card({ id: "CT-901" });
    const h2 = [
      hist("CT-901", null, "idea", "2026-07-01T00:00:00.000Z"),
      hist("CT-901", "idea", "brief", "2026-07-02T00:00:00.000Z"),
      hist("CT-901", "brief", "draft", "2026-07-03T00:00:00.000Z"),
      hist("CT-901", "draft", "review", "2026-07-05T00:00:00.000Z"),
      hist("CT-901", "review", "draft", "2026-07-06T00:00:00.000Z"), // ตีกลับ
      hist("CT-901", "draft", "review", "2026-07-09T00:00:00.000Z"),
      hist("CT-901", "review", "scheduled", "2026-07-10T00:00:00.000Z"),
      hist("CT-901", "scheduled", "published", "2026-07-14T00:00:00.000Z"),
    ];
    const cy = ideaToPublishedCycle([rejected], h2, r);
    expect(cy.avgDays).toBeCloseTo(13, 5);
    // draft ถูกเข้า 2 ครั้ง แต่นับการ์ด unique ครั้งเดียว
    const flows = stageFlows([rejected], h2, r);
    expect(flows.find((f) => f.status === "draft").entered).toBe(1);
  });
  it("history ของ phantom ไม่ถูกนับ", () => {
    const flows = stageFlows([card({ id: "hist_u_arm_1" })], [hist("hist_u_arm_1", null, "idea", "2026-07-02T00:00:00.000Z")], r);
    expect(flows.every((f) => f.entered === 0)).toBe(true);
  });
});
describe("heatmap เวลาโพสต์", () => {
  const r = { start: "2026-07-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" };
  it("จับวัน (จันทร์=0) และ slot 2 ชม.", () => {
    // 21 ก.ค. 2026 = อังคาร → dow 1 · เวลา 19:00 ไทย → slot (19-8)/2 = 5
    const c = card({ id: "tue", brief: brief({ publish_at: new Date("2026-07-21T19:00:00+07:00").toISOString() }) });
    const cells = publishHeatmap([c], r);
    expect(cells).toHaveLength(1);
    expect(cells[0].dow).toBe(1);
    expect(cells[0].slot).toBe(5);
    expect(cells[0].avgER).toBeCloseTo(0.02, 5);
  });
  it("โพสต์นอกช่วง 08–22 น. ไม่เข้า heatmap", () => {
    const c = card({ id: "late", brief: brief({ publish_at: new Date("2026-07-21T23:30:00+07:00").toISOString() }) });
    expect(publishHeatmap([c], r)).toHaveLength(0);
  });
});
describe("ads rollup", () => {
  const r = { start: "2026-07-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" };
  it("เฉพาะงาน ads ที่กรอก spend และ CPL = Σspend/Σleads", () => {
    const cards = [
      card({ id: "ads1", track: "project", metrics: metrics({ spend: 4_000, leads: 20 }) }),
      card({ id: "ads2", track: "project", metrics: metrics({ spend: 2_000, leads: 5 }) }),
      card({ id: "organic", metrics: metrics({ leads: 50 }) }),
    ];
    const a = adsRollup(cards, r);
    expect(a.rows).toHaveLength(2);
    expect(a.spend).toBe(6_000);
    expect(a.cpl).toBeCloseTo(240, 5); // 6000/25
    expect(a.rows[0].card.id).toBe("ads1"); // เรียง spend มาก→น้อย
  });
});
