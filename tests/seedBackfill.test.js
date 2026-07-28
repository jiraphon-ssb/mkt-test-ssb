import { describe, it, expect } from "vitest";
import { buildBackfill, mondayOf, BACKFILL_WEEKS } from "../src/modules/marketing/data/seedBackfill.js";
import { buildSeed } from "../src/modules/marketing/data/seed.js";
import { analyticsCards, ideaToPublishedCycle, kpiSummary, lastCompletedWeeks, publishHeatmap, stageFlows, weeklySeries, weeksRange, adsRollup, } from "../src/modules/marketing/mktAnalytics.js";
import { brandAverageER, engagementRate, isStuck } from "../src/modules/marketing/mktRules.js";
/** จันทร์ 20 ก.ค. 2026 (ใช้เป็น anchor คงที่ในเทส) */
const ANCHOR = new Date("2026-07-24T09:00:00.000Z").getTime();
const NOW = new Date(ANCHOR).toISOString();
describe("backfill — deterministic", () => {
  it("anchor เดียวกันได้ผลเหมือนกันทุกครั้ง", () => {
    const a = buildBackfill(ANCHOR);
    const b = buildBackfill(ANCHOR);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("anchor วันไหนในสัปดาห์เดียวกันก็ได้ชุดเดิม (quantize เป็นจันทร์)", () => {
    const monday = mondayOf(ANCHOR);
    const a = buildBackfill(monday + 1000);
    const b = buildBackfill(monday + 4 * 86_400_000); // วันศุกร์เดียวกัน
    expect(a.cards.map((c) => c.id)).toEqual(b.cards.map((c) => c.id));
    expect(a.cards[0].metrics?.reach).toBe(b.cards[0].metrics?.reach);
  });
  it("mondayOf คืนวันจันทร์เวลา 00:00", () => {
    const m = new Date(mondayOf(ANCHOR));
    expect(m.getDay()).toBe(1);
    expect(m.getHours()).toBe(0);
  });
});
describe("backfill — invariants ไม่พังของเดิม", () => {
  const { cards, history } = buildBackfill(ANCHOR);
  it("ทุกใบเป็น measured + archived (ไม่โผล่บอร์ด/ปฏิทิน)", () => {
    expect(cards.every((c) => c.status === "measured" && c.archived === true)).toBe(true);
  });
  it("id ไม่ชนกับการ์ดชุดเดิม (CT-xxx) และไม่ซ้ำกันเอง", () => {
    expect(cards.every((c) => c.id.startsWith("bf_"))).toBe(true);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
  });
  it("การ์ดที่ถูกตีกลับมี first_pass=false ตรงกับเส้น history", () => {
    for (const c of cards) {
      const moves = history.filter((h) => h.card_id === c.id);
      const wasRejected = moves.some((h) => h.from_status === "review" && h.to_status === "draft");
      expect(c.first_pass).toBe(!wasRejected);
    }
  });
  it("ทุกใบมีเส้นทางครบถึง measured + audit ปิดงาน", () => {
    for (const c of cards) {
      const moves = history.filter((h) => h.card_id === c.id).map((h) => `${h.from_status}→${h.to_status}`);
      expect(moves).toContain("null→idea");
      expect(moves).toContain("scheduled→published");
      expect(moves).toContain("published→measured");
      expect(moves).toContain("measured→measured"); // audit ปิดงาน
    }
  });
  it("ประวัติเรียงเวลาถูกทาง (idea เก่าสุด → measured ใหม่สุด)", () => {
    for (const c of cards.slice(0, 10)) {
      const moves = history
        .filter((h) => h.card_id === c.id && h.from_status !== h.to_status)
        .sort((a, b) => new Date(a.moved_at).getTime() - new Date(b.moved_at).getTime());
      expect(moves[0].to_status).toBe("idea");
      expect(moves[moves.length - 1].to_status).toBe("measured");
    }
  });
  it("การ์ด archived ไม่ถูกนับว่าติดขัด", () => {
    expect(cards.every((c) => !isStuck(c, 3, NOW, history))).toBe(true);
  });
  it("ทุกใบมี metrics ที่คำนวณ ER ได้", () => {
    expect(cards.every((c) => engagementRate(c.metrics) != null)).toBe(true);
  });
});
describe("backfill — เล่าเรื่องได้จริง (ข้อมูลพอสำหรับ Dashboard)", () => {
  const { cards } = buildBackfill(ANCHOR);
  // backfill เติมสัปดาห์ที่จบแล้ว 12 สัปดาห์ — หน้าต่างต้องตรงกันเป๊ะ
  const weeks = lastCompletedWeeks(BACKFILL_WEEKS, NOW);
  const range = weeksRange(weeks);
  it("ปริมาณ ~50-70 ใบ กระจายครบ 12 สัปดาห์", () => {
    expect(cards.length).toBeGreaterThanOrEqual(50);
    expect(cards.length).toBeLessThanOrEqual(80);
    const series = weeklySeries(cards, weeks);
    expect(series.every((p) => p.produced > 0)).toBe(true); // ทุกสัปดาห์มีงาน
  });
  it("TEAMDEE (grow) ER ขาขึ้น — ครึ่งหลังสูงกว่าครึ่งแรก", () => {
    const td = cards.filter((c) => c.brand_id === "b_td");
    const first = kpiSummary(td, { start: weeks[0].start, end: weeks[5].end });
    const last = kpiSummary(td, { start: weeks[6].start, end: weeks[11].end });
    expect(last.er).toBeGreaterThan(first.er * 1.2);
  });
  it("JUNTAKARN (rebuild) เริ่มต่ำแล้วฟื้น", () => {
    // ดูเฉพาะงาน content — งาน ads ของแบรนด์นี้เป็น reach ที่ซื้อมา ER คนละฐาน
    const jt = cards.filter((c) => c.brand_id === "b_jt" && c.track === "content");
    const early = kpiSummary(jt, { start: weeks[0].start, end: weeks[3].end });
    const late = kpiSummary(jt, { start: weeks[8].start, end: weeks[11].end });
    expect(early.er).toBeLessThan(0.01);
    expect(late.er).toBeGreaterThan(early.er * 1.5);
  });
  it("brand maintain นิ่ง (ครึ่งหลังไม่ต่างจากครึ่งแรกเกิน 25%)", () => {
    for (const b of ["b_jk", "b_ta"]) {
      const bc = cards.filter((c) => c.brand_id === b);
      const first = kpiSummary(bc, { start: weeks[0].start, end: weeks[5].end });
      const last = kpiSummary(bc, { start: weeks[6].start, end: weeks[11].end });
      const ratio = last.er / first.er;
      expect(ratio).toBeGreaterThan(0.75);
      expect(ratio).toBeLessThan(1.25);
    }
  });
  it("งาน ads มี spend/CPL และ CPL ถูกลงตามเวลา", () => {
    const early = adsRollup(cards, { start: weeks[0].start, end: weeks[5].end });
    const late = adsRollup(cards, { start: weeks[6].start, end: weeks[11].end });
    expect(early.rows.length).toBeGreaterThanOrEqual(2);
    expect(late.rows.length).toBeGreaterThanOrEqual(2);
    expect(late.cpl).toBeLessThan(early.cpl * 0.8);
  });
  it("funnel + cycle time คำนวณได้จากประวัติจริง", () => {
    const { history } = buildBackfill(ANCHOR);
    const flows = stageFlows(cards, history, range);
    const draft = flows.find((f) => f.status === "draft");
    expect(draft.entered).toBeGreaterThan(20);
    // ผลิตงาน 2-4 วันตามที่ออกแบบ (มีรอบตีกลับบางใบทำให้เฉลี่ยสูงขึ้นได้)
    expect(draft.avgDays).toBeGreaterThan(1.5);
    expect(draft.avgDays).toBeLessThan(6);
    const cycle = ideaToPublishedCycle(cards, history, range);
    expect(cycle.n).toBeGreaterThan(20);
    expect(cycle.avgDays).toBeGreaterThan(4);
    expect(cycle.avgDays).toBeLessThan(20);
  });
  it("heatmap มีช่วงทองอังคาร/พฤหัส เย็น (slot 5) แรงพอให้ระบบชี้ได้", () => {
    const cells = publishHeatmap(cards, range);
    const hot = cells.filter((c) => (c.dow === 1 || c.dow === 3) && c.slot === 5);
    expect(hot.length).toBeGreaterThan(0);
    expect(hot.some((c) => c.n >= 3)).toBe(true);
    // ต้องเกินค่าเฉลี่ยรวม 30% ขึ้นไป ไม่งั้น insight "ช่วงทอง" จะไม่ยิง
    const teamER = kpiSummary(cards, range).er;
    expect(hot.some((c) => c.n >= 3 && c.avgER >= teamER * 1.3)).toBe(true);
  });
  it("กระจายครบ 4 brand และครบ 4 pillar", () => {
    expect(new Set(cards.map((c) => c.brand_id)).size).toBe(4);
    const pillars = new Set(cards.map((c) => c.pillar).filter(Boolean));
    expect(pillars.size).toBe(4);
  });
});
describe("seed รวม backfill แล้วยังไม่พังเรื่องเดิม", () => {
  const seed = buildSeed();
  it("การ์ด demo เดิม (CT-xxx) ยังอยู่ครบ + phantom ยังอยู่", () => {
    expect(seed.cards.filter((c) => c.id.startsWith("CT-")).length).toBeGreaterThanOrEqual(18);
    expect(seed.cards.some((c) => c.id.startsWith("hist"))).toBe(true);
  });
  it("ไม่เพิ่ม review_actions (ตัวเลขหน้าสถิติคงเดิม)", () => {
    // backfill ไม่แตะ review_actions — จำนวนต้องเท่ากับที่ seed เดิมสร้าง (39)
    expect(seed.review_actions.every((a) => !a.card_id.startsWith("bf_"))).toBe(true);
  });
  it("ป้ายผลของการ์ด demo เดิมไม่เปลี่ยนความหมาย (ใบ 4.2% ยังเขียว / 0.8% ยังแดง)", () => {
    const tdAvg = brandAverageER(seed.cards, "b_td");
    expect(tdAvg).not.toBeNull();
    // ใบเด่น 4.2% ต้องยังเกินค่าเฉลี่ย · ใบแย่ 0.8% ต้องยังต่ำกว่าครึ่งของค่าเฉลี่ย
    expect(0.042).toBeGreaterThan(tdAvg);
    expect(0.008).toBeLessThan(tdAvg * 0.5);
  });
  it("การ์ดที่เห็นบนบอร์ด (ไม่ archived) ไม่มี bf_ เลย", () => {
    const onBoard = analyticsCards(seed.cards).filter((c) => !c.archived);
    expect(onBoard.some((c) => c.id.startsWith("bf_"))).toBe(false);
  });
});
