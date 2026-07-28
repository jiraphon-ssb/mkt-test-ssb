import { describe, it, expect } from "vitest";
import { computeInsights, ruleInsightProvider, countBySeverity, MIN_TOTAL } from "../src/modules/marketing/mktInsights.js";
/** ศุกร์ 24 ก.ค. 2026 16:00 ไทย */
const NOW = "2026-07-24T09:00:00.000Z";
const dayMs = 86_400_000;
/** ISO ของ "n วันก่อน now" */
const ago = (n, hourTH = 19) => {
  const d = new Date(new Date(NOW).getTime() - n * dayMs);
  d.setHours(hourTH - 7, 0, 0, 0); // ตั้งเป็นเวลาไทยคงที่ (env เทสเป็น UTC)
  return d.toISOString();
};
const settings = {
  sla_hours: 24, first_pass_target: 0.8, first_pass_window_weeks: 4,
  idea_purge_days: 60, flex_slot_per_week: 2,
};
const profiles = [
  { id: "u_ta", display_name: "คุณตะ", role: "team_lead", active: true },
  { id: "u_arm", display_name: "อาร์ม", role: "content_owner", active: true },
  { id: "u_fai", display_name: "ฝ้าย", role: "performance_marketer", active: true },
];
const brands = [
  { id: "b_td", name: "TEAMDEE", mode: "grow", default_owner: "u_arm", color: "#F26B21", active: true },
  { id: "b_jk", name: "JK Design", mode: "maintain", default_owner: "u_arm", color: "#1F6E4A", active: true },
  { id: "b_jt", name: "JUNTAKARN", mode: "rebuild", default_owner: "u_fai", color: "#A63D7A", active: true },
];
const check = {
  visual: true, logo: true, text_ratio: true, no_forbidden: true, data_verified: true, cta_clear: true,
};
const brief = (over = {}) => ({
  who_action: "a", hook: "h", key_message: "k", cta: "c", fact_checked: true,
  format: "video", size: "9:16", deadline_review: "2026-07-01",
  channels: ["Facebook"], publish_at: ago(5),
  layout_note: "l", mood: "m", ref_note: "r", ci_link: "https://x.co", ...over,
});
const metrics = (over = {}) => ({
  reach: 10_000, engagement: 200, leads: 5, spend: null, cpl: null, measured_at: ago(4), ...over,
});
let seq = 0;
function card(over = {}) {
  seq += 1;
  return {
    id: `k${seq}`, track: "content", status: "measured", brand_id: "b_td", owner_id: "u_arm",
    title: `งาน ${seq}`, pillar: "knowledge", is_realtime: false, plan_confirmed: true,
    brief: brief(), draft_link: "https://d", self_check: check, first_pass: true,
    entered_review_at: null, archived: true,
    created_at: ago(20), updated_at: ago(4), metrics: metrics(),
    ...over,
  };
}
/** ชุดการ์ดพื้นฐานให้ผ่าน guard ข้อมูลน้อย: 12 ใบ ER ~2% กระจาย 8 สัปดาห์ */
function baseCards() {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const d = 3 + i * 4; // 3..47 วันก่อน
    out.push(card({
      brand_id: i % 2 === 0 ? "b_td" : "b_jk",
      brief: brief({ publish_at: ago(d, 11) }),
      metrics: metrics({ reach: 10_000, engagement: 200, measured_at: ago(d - 1) }),
    }));
  }
  return out;
}
function appData(over = {}) {
  return {
    version: "test", profiles, brands, cards: baseCards(),
    status_history: [], review_actions: [], attachments: [], reference_links: [], settings,
    ...over,
  };
}
const run = (over = {}) => computeInsights({ data: appData(over), nowClock: NOW });
const ids = (over = {}) => run(over).map((i) => i.rule);
/* ============================================================ */
describe("guard ข้อมูลน้อย", () => {
  it("งานวัดผลน้อยกว่าขั้นต่ำ = คืน insight เดียวว่ายังสรุปไม่ได้", () => {
    const few = [card(), card(), card()];
    const list = computeInsights({ data: appData({ cards: few }), nowClock: NOW });
    expect(list).toHaveLength(1);
    expect(list[0].rule).toBe("low-data");
    expect(list[0].severity).toBe("info");
  });
  it("ข้อมูลถึงขั้นต่ำแล้วเริ่มวิเคราะห์จริง (ไม่มี low-data)", () => {
    expect(baseCards().length).toBeGreaterThanOrEqual(MIN_TOTAL);
    expect(ids()).not.toContain("low-data");
  });
  it("การ์ด phantom ไม่ช่วยให้ผ่าน guard", () => {
    const phantoms = Array.from({ length: 20 }, (_, i) => card({ id: `hist_u_arm_${i}` }));
    const list = computeInsights({ data: appData({ cards: phantoms }), nowClock: NOW });
    expect(list[0].rule).toBe("low-data");
  });
});
describe("มิติ brand", () => {
  it("ER ต่ำกว่าทีม >30% + n≥3 = เตือน", () => {
    const weak = Array.from({ length: 3 }, () => card({ brand_id: "b_jt", brief: brief({ publish_at: ago(10, 11) }), metrics: metrics({ reach: 10_000, engagement: 40 }) }));
    const list = run({ cards: [...baseCards(), ...weak] });
    const hit = list.find((i) => i.rule === "brand-er-low");
    expect(hit).toBeTruthy();
    expect(hit.title).toContain("JUNTAKARN");
    expect(hit.evidence.length).toBeGreaterThanOrEqual(2);
  });
  it("ER ต่ำแต่ n=2 (ไม่ถึงขั้นต่ำ) = ไม่เตือน", () => {
    const weak = Array.from({ length: 2 }, () => card({ brand_id: "b_jt", brief: brief({ publish_at: ago(10, 11) }), metrics: metrics({ reach: 10_000, engagement: 40 }) }));
    expect(ids({ cards: [...baseCards(), ...weak] })).not.toContain("brand-er-low");
  });
  it("ER ต่ำกว่าครึ่งของทีม = critical", () => {
    const veryWeak = Array.from({ length: 3 }, () => card({ brand_id: "b_jt", brief: brief({ publish_at: ago(10, 11) }), metrics: metrics({ reach: 10_000, engagement: 20 }) }));
    const hit = run({ cards: [...baseCards(), ...veryWeak] }).find((i) => i.rule === "brand-er-low");
    expect(hit.severity).toBe("critical");
  });
  it("brand โหมด rebuild ที่ ER ขึ้น = ข้อความ 'กำลังฟื้น' ไม่ใช่ er-rising ธรรมดา", () => {
    const older = Array.from({ length: 3 }, (_, i) => card({ brand_id: "b_jt", brief: brief({ publish_at: ago(35 + i, 11) }), metrics: metrics({ reach: 10_000, engagement: 60, measured_at: ago(34 + i) }) }));
    const newer = Array.from({ length: 3 }, (_, i) => card({ brand_id: "b_jt", brief: brief({ publish_at: ago(5 + i, 11) }), metrics: metrics({ reach: 10_000, engagement: 180, measured_at: ago(4 + i) }) }));
    const list = run({ cards: [...baseCards(), ...older, ...newer] });
    expect(list.map((i) => i.rule)).toContain("brand-rebuild-on-track");
    expect(list.find((i) => i.rule === "brand-rebuild-on-track").severity).toBe("good");
  });
  it("brand ปกติที่ ER ขึ้น = brand-er-rising", () => {
    const older = Array.from({ length: 3 }, (_, i) => card({ brand_id: "b_jk", brief: brief({ publish_at: ago(35 + i, 11) }), metrics: metrics({ reach: 10_000, engagement: 100, measured_at: ago(34 + i) }) }));
    const newer = Array.from({ length: 3 }, (_, i) => card({ brand_id: "b_jk", brief: brief({ publish_at: ago(5 + i, 11) }), metrics: metrics({ reach: 10_000, engagement: 400, measured_at: ago(4 + i) }) }));
    const list = run({ cards: [...baseCards(), ...older, ...newer] });
    expect(list.map((i) => i.rule)).toContain("brand-er-rising");
  });
  it("ER ตกแรง = brand-er-falling", () => {
    const older = Array.from({ length: 3 }, (_, i) => card({ brand_id: "b_jk", brief: brief({ publish_at: ago(35 + i, 11) }), metrics: metrics({ reach: 10_000, engagement: 400, measured_at: ago(34 + i) }) }));
    const newer = Array.from({ length: 3 }, (_, i) => card({ brand_id: "b_jk", brief: brief({ publish_at: ago(5 + i, 11) }), metrics: metrics({ reach: 10_000, engagement: 100, measured_at: ago(4 + i) }) }));
    expect(ids({ cards: [...baseCards(), ...older, ...newer] })).toContain("brand-er-falling");
  });
  it("brand โหมด grow ที่ผลิตน้อยกว่าค่ากลาง = เตือน underfed", () => {
    // baseCards ให้ b_td 6 ใบใน 8 สัปดาห์ แต่ใน 30 วันมีน้อย — เติมงานให้ brand อื่นเยอะกว่าใน 30 วัน
    const jkMany = Array.from({ length: 6 }, (_, i) => card({ brand_id: "b_jk", brief: brief({ publish_at: ago(3 + i, 11) }), metrics: metrics({ measured_at: ago(2 + i) }) }));
    const jtMany = Array.from({ length: 5 }, (_, i) => card({ brand_id: "b_jt", brief: brief({ publish_at: ago(3 + i, 11) }), metrics: metrics({ measured_at: ago(2 + i) }) }));
    const tdFew = [card({ brand_id: "b_td", brief: brief({ publish_at: ago(6, 11) }) })];
    const list = run({ cards: [...jkMany, ...jtMany, ...tdFew] });
    const hit = list.find((i) => i.rule === "brand-mode-underfed");
    expect(hit).toBeTruthy();
    expect(hit.title).toContain("TEAMDEE");
  });
});
describe("มิติ pillar / channel", () => {
  it("pillar เดียวเกินครึ่ง = แจ้งกระจุก", () => {
    const many = Array.from({ length: 10 }, (_, i) => card({ pillar: "sale_campaign", brief: brief({ publish_at: ago(3 + i, 11) }), metrics: metrics({ measured_at: ago(2 + i) }) }));
    expect(ids({ cards: [...baseCards(), ...many] })).toContain("pillar-concentration");
  });
  it("pillar ER สูงกว่าค่าเฉลี่ย 30% = ดาวเด่น", () => {
    const star = Array.from({ length: 3 }, (_, i) => card({ pillar: "social_proof", brief: brief({ publish_at: ago(4 + i, 11) }), metrics: metrics({ reach: 10_000, engagement: 600, measured_at: ago(3 + i) }) }));
    expect(ids({ cards: [...baseCards(), ...star] })).toContain("pillar-star");
  });
  it("channel ER ต่ำกว่า 60% ของทีม = channel-weak · สูงกว่า 130% = channel-star", () => {
    const weak = Array.from({ length: 3 }, (_, i) => card({ brief: brief({ channels: ["LINE OA"], publish_at: ago(4 + i, 11) }), metrics: metrics({ reach: 10_000, engagement: 50, measured_at: ago(3 + i) }) }));
    const strong = Array.from({ length: 3 }, (_, i) => card({ brief: brief({ channels: ["TikTok"], publish_at: ago(4 + i, 11) }), metrics: metrics({ reach: 10_000, engagement: 700, measured_at: ago(3 + i) }) }));
    const rules = ids({ cards: [...baseCards(), ...weak, ...strong] });
    expect(rules).toContain("channel-weak");
    expect(rules).toContain("channel-star");
  });
});
describe("มิติคน + กระบวนการ", () => {
  const actions = (n, rejects) => Array.from({ length: n }, (_, i) => ({
    id: `a${i}`, card_id: `k_hist_${i}`,
    action: i < rejects ? "reject" : "approve",
    reason: i < rejects ? "ผิด CI" : "",
    direction_pack_ref: i < rejects ? "CI" : null,
    acted_by: "u_ta", acted_at: ago(5 + i), hours_in_review: 5,
  }));
  /** สร้างชุดข้อมูลที่มี first-pass ต่ำของ "อาร์ม" (u_arm) */
  const lowFirstPass = () => {
    const acts = actions(6, 4);
    const judged = acts.map((a, i) => card({
      id: a.card_id, owner_id: "u_arm", status: "measured",
      first_pass: i >= 4, brief: brief({ publish_at: ago(8 + i, 11) }),
    }));
    return { cards: [...baseCards(), ...judged], review_actions: acts };
  };
  it("content_owner คนอื่นไม่เห็นคะแนน first-pass ของอาร์ม", () => {
    const list = computeInsights({
      data: appData(lowFirstPass()), nowClock: NOW,
      viewer: { id: "u_other", role: "content_owner" },
    });
    expect(list.map((i) => i.rule)).not.toContain("owner-first-pass-low");
  });
  it("อาร์มเองเห็นคะแนนตัวเอง", () => {
    const list = computeInsights({
      data: appData(lowFirstPass()), nowClock: NOW,
      viewer: { id: "u_arm", role: "content_owner" },
    });
    expect(list.map((i) => i.rule)).toContain("owner-first-pass-low");
  });
  it("team_lead / performance_marketer เห็นของทุกคน", () => {
    for (const role of ["team_lead", "performance_marketer"]) {
      const list = computeInsights({
        data: appData(lowFirstPass()), nowClock: NOW, viewer: { id: "u_x", role },
      });
      expect(list.map((i) => i.rule)).toContain("owner-first-pass-low");
    }
  });
  it("ไม่ส่ง viewer = พฤติกรรมเดิม (เห็นทุกคน)", () => {
    expect(run(lowFirstPass()).map((i) => i.rule)).toContain("owner-first-pass-low");
  });
  it("first-pass ต่ำกว่าเป้า 15 จุด + ตัดสิน ≥5 ใบ = เตือนรายคน", () => {
    // การ์ดของอาร์มที่ถูกตัดสิน 6 ใบ ผ่านรอบแรก 2 ใบ (33%)
    const acts = actions(6, 4);
    const judged = acts.map((a, i) => card({
      id: a.card_id, owner_id: "u_arm", status: "measured",
      first_pass: i >= 4, brief: brief({ publish_at: ago(8 + i, 11) }),
    }));
    const list = run({ cards: [...baseCards(), ...judged], review_actions: acts });
    const hit = list.find((i) => i.rule === "owner-first-pass-low");
    expect(hit).toBeTruthy();
    // หน้าสถิติถูกยุบเข้า Dashboard แล้ว — action ต้องกางไทล์แทนการเปลี่ยนหน้า
    expect(hit.action?.tile).toBe("first-pass");
    expect(hit.action?.screen).toBeUndefined();
  });
  it("มีการ์ดรอตรวจเกิน SLA = critical + ลิงก์หน้ารอตรวจ", () => {
    const overdue = card({
      status: "review", archived: false, metrics: undefined,
      entered_review_at: ago(3), brief: brief({ publish_at: null }),
    });
    const hit = run({ cards: [...baseCards(), overdue] }).find((i) => i.rule === "review-sla-breach");
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe("critical");
    expect(hit.action?.screen).toBe("review");
  });
  it("การ์ดติดขัด ≥3 ใบ = เตือน · มีใบค้างเกิน 7 วัน = critical", () => {
    const stuck = Array.from({ length: 3 }, (_, i) => card({ id: `stuck${i}`, status: "draft", archived: false, metrics: undefined, updated_at: ago(10) }));
    const hit = run({ cards: [...baseCards(), ...stuck] }).find((i) => i.rule === "stuck-pileup");
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe("critical"); // ค้าง 10 วัน
  });
  it("การ์ดติดขัด 2 ใบ = ยังไม่เตือน", () => {
    const stuck = Array.from({ length: 2 }, (_, i) => card({ id: `stuck${i}`, status: "draft", archived: false, metrics: undefined, updated_at: ago(10) }));
    expect(ids({ cards: [...baseCards(), ...stuck] })).not.toContain("stuck-pileup");
  });
  it("ขั้นที่ใช้เวลาเฉลี่ยเกิน 4 วัน = ชี้เป็นคอขวด", () => {
    const cards = [];
    const history = [];
    for (let i = 0; i < 3; i++) {
      const id = `slow${i}`;
      cards.push(card({ id, brief: brief({ publish_at: ago(6 + i, 11) }) }));
      history.push({ id: `h${i}a`, card_id: id, from_status: null, to_status: "brief", moved_by: "u_arm", moved_at: ago(20 - i) }, { id: `h${i}b`, card_id: id, from_status: "brief", to_status: "draft", moved_by: "u_arm", moved_at: ago(19 - i) }, { id: `h${i}c`, card_id: id, from_status: "draft", to_status: "review", moved_by: "u_arm", moved_at: ago(12 - i) });
    }
    const list = run({ cards: [...baseCards(), ...cards], status_history: history });
    const hit = list.find((i) => i.id === "stage-bottleneck:draft");
    expect(hit).toBeTruthy();
    expect(hit.detail).toContain("Owner");
  });
  it("ไอเดียค้างเกินกำหนด = แจ้งเคลียร์คลัง", () => {
    const old = card({ status: "idea", archived: false, metrics: undefined, updated_at: ago(90), brief: brief({ publish_at: null }) });
    expect(ids({ cards: [...baseCards(), old] })).toContain("idea-backlog");
  });
});
describe("มิติ ads", () => {
  const adsCard = (d, spend, leads) => card({
    track: "project", owner_id: "u_fai",
    brief: brief({ publish_at: null }),
    metrics: metrics({ spend, leads, cpl: spend / leads, measured_at: ago(d) }),
  });
  it("CPL ถูกลง >20% = ข่าวดี", () => {
    const before = [adsCard(45, 4_000, 10), adsCard(40, 4_000, 10)]; // CPL 400
    const now = [adsCard(10, 4_000, 20), adsCard(8, 4_000, 20)]; // CPL 200
    const hit = run({ cards: [...baseCards(), ...before, ...now] }).find((i) => i.rule === "ads-cpl-trend");
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe("good");
    expect(hit.dimension).toBe("ads");
  });
  it("CPL แพงขึ้น >25% = เตือน", () => {
    const before = [adsCard(45, 2_000, 20), adsCard(40, 2_000, 20)]; // CPL 100
    const now = [adsCard(10, 4_000, 10), adsCard(8, 4_000, 10)]; // CPL 400
    const hit = run({ cards: [...baseCards(), ...before, ...now] }).find((i) => i.rule === "ads-cpl-trend");
    expect(hit.severity).toBe("warn");
  });
  it("งาน ads ใบเดียว = ไม่สรุป trend", () => {
    expect(ids({ cards: [...baseCards(), adsCard(10, 4_000, 20)] })).not.toContain("ads-cpl-trend");
  });
});
describe("มิติเวลาโพสต์", () => {
  it("ช่วงเวลาที่ ER สูงกว่าค่าเฉลี่ย 30% + n≥3 = ชี้ช่วงทอง", () => {
    // อังคาร 19:00 — หา 3 วันอังคารย้อนหลัง
    const tuesdays = [];
    let found = 0;
    for (let d = 3; d < 80 && found < 3; d++) {
      const iso = ago(d, 19);
      if (new Date(iso).getUTCDay() === 2 || new Date(iso).getDay() === 2) {
        tuesdays.push(card({
          brief: brief({ publish_at: iso }),
          metrics: metrics({ reach: 10_000, engagement: 800, measured_at: ago(d - 1) }),
        }));
        found += 1;
      }
    }
    expect(tuesdays).toHaveLength(3);
    const hit = run({ cards: [...baseCards(), ...tuesdays] }).find((i) => i.rule === "timing-hotspot");
    expect(hit).toBeTruthy();
    expect(hit.action?.screen).toBe("cal");
  });
});
describe("การจัดอันดับ + provider", () => {
  it("critical มาก่อน warn ก่อน good ก่อน info", () => {
    const overdue = card({ status: "review", archived: false, metrics: undefined, entered_review_at: ago(3), brief: brief({ publish_at: null }) });
    const star = Array.from({ length: 3 }, (_, i) => card({ pillar: "social_proof", brief: brief({ publish_at: ago(4 + i, 11) }), metrics: metrics({ reach: 10_000, engagement: 600, measured_at: ago(3 + i) }) }));
    const list = run({ cards: [...baseCards(), overdue, ...star] });
    const order = ["critical", "warn", "good", "info"];
    const idx = list.map((i) => order.indexOf(i.severity));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
  it("id ไม่ซ้ำกัน (ใช้เป็น React key ได้)", () => {
    const list = run();
    expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
  });
  it("ruleInsightProvider คืนผลเท่ากับ computeInsights", async () => {
    const data = appData();
    const viaProvider = await ruleInsightProvider.generate({ data, nowClock: NOW });
    expect(viaProvider).toEqual(computeInsights({ data, nowClock: NOW }));
    expect(ruleInsightProvider.kind).toBe("rules");
  });
  it("countBySeverity นับครบทุกระดับ", () => {
    const list = run();
    const c = countBySeverity(list);
    expect(c.critical + c.warn + c.good + c.info).toBe(list.length);
  });
});
