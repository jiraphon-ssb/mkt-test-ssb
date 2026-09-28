/* ตารางตัดสินใจ 2×2 + รายการ "สิ่งที่ต้องทำวันนี้" (สเปก 2026-09-21 หัวข้อ 5 และ 7)
   กติกา: ช่องไหนตัดสินไม่ได้ ห้ามเดาเป็นช้า · เรียงตามผลกระทบ ไม่ใช่ตามชื่อแบรนด์ */
import { describe, expect, it } from "vitest";
import { brandAdvice, byUrgency, overviewDigest } from "../src/modules/marketing/ads/overviewActions.js";
import { monthClock, paceOf } from "../src/modules/marketing/ads/paceEngine.js";

const clock = monthClock("2026-09-21");
const of = (rev, revTarget, spend, budget) => ({
  revPace: paceOf({ actual: rev, target: revTarget, clock }),
  budgetPace: paceOf({ actual: spend, target: budget, clock, direction: "spend" }),
});

describe("brandAdvice — ตารางตัดสินใจ (ยอด 2 × งบ 3)", () => {
  it("ผลช้า × งบเร็ว = เรื่องด่วนที่สุด (t around ของจริง)", () => {
    const a = brandAdvice(of(264519, 600000, 57038.53, 45000));
    expect(a).toMatchObject({ key: "slow_fast", action: "ตรวจแคมเปญ/ครีเอทีฟทันที", tone: "rose", overBudget: true });
    expect(a.rank).toBe(5);
    expect(a.why).toContain("62.98%");
    expect(a.why).toContain("181.07%");
  });
  it("ผลเร็ว × งบเร็ว = ตามผลใกล้ชิด (JK Design ของจริง — เกินงบแล้วด้วย)", () => {
    const a = brandAdvice(of(982302, 1300000, 102911.53, 90000));
    expect(a.key).toBe("fast_fast");
    expect(a.overBudget).toBe(true);
    expect(a.rank).toBe(4);            // เกินงบดันอันดับขึ้นจากเดิม 2
  });
  /* 25 ก.ย.: เดิมงบ "ตามแผน" ถูกนับเป็น "ช้า" → ยอดช้าทุกแบรนด์ได้คำแนะนำ "ตรวจ delivery" เหมือนกันหมดทั้งตาราง
     แต่ถ้าเงินออกตามแผน delivery ไม่ใช่ปัญหา — ต้องไปดูที่แอดกับการปิดขาย */
  it("ผลช้า × งบตามแผน = เงินออกแต่ยอดไม่มา → ตรวจแอดและการปิดขาย (TEAMDEE ของจริง)", () => {
    expect(brandAdvice(of(1560880, 3500000, 150788.55, 210000))).toMatchObject({ key: "slow_onplan", action: "ตรวจแอดและการปิดขาย", rank: 3, tone: "amber" });
  });
  it("ผลช้า × งบใช้ช้า = เงินไม่ออก → ตรวจ delivery", () => {
    expect(brandAdvice(of(500, 1000, 200, 1000))).toMatchObject({ key: "slow_slow", action: "ตรวจ delivery และปริมาณงาน", tone: "amber" });
  });
  it("ผลเร็ว × งบตามแผน = ไม่มีอะไรต้องทำ (เงียบ ไม่แย่งความสนใจ)", () => {
    expect(brandAdvice(of(900, 1000, 700, 1000))).toMatchObject({ key: "fast_onplan", action: "ไปต่อตามแผน", tone: "zinc", rank: 0 });
  });
  it("แบรนด์ยอดช้าเหมือนกันแต่งบต่างกัน ต้องได้คำแนะนำต่างกัน (เดิมขึ้นข้อความเดียวทั้งตาราง)", () => {
    const actions = new Set([of(500, 1000, 700, 1000), of(500, 1000, 200, 1000), of(500, 1000, 900, 1000)].map((x) => brandAdvice(x).action));
    expect(actions.size).toBe(3);
  });
  it("ผลเร็ว × งบช้า = โอกาสเพิ่มงบ", () => {
    expect(brandAdvice(of(900, 1000, 300, 1000))).toMatchObject({ key: "fast_slow", action: "มีโอกาสเพิ่มงบ", tone: "emerald", rank: 1 });
  });
  it("ด้านใดด้านหนึ่งไม่รู้ = ยังตัดสินใจไม่ได้ พร้อมบอกว่าขาดอะไร (ห้ามเดาเป็นช้า)", () => {
    const a = brandAdvice(of(900, null, 300, 1000));
    expect(a).toMatchObject({ key: "unknown", tone: "zinc", rank: 0 });
    expect(a.why).toContain("ยังไม่ตั้งเป้าเดือนนี้");
  });
});

/* ทดสอบแบบใช้งานจริง 27 ก.ย. (อาร์ต "แก้เลยตามนี้"): ผู้บริหารเปิดมาต้องรู้ใน 1 บรรทัดว่าเดือนนี้เป็นยังไง และเรื่องไหนก่อน
   ตารางแบรนด์เรียงตามความด่วน (ชื่อแบรนด์ไม่ได้บอกว่าต้องดูใครก่อน) */
describe("เรียงแบรนด์ตามความด่วน + บรรทัดสรุป", () => {
  const brand = (id, rev, revTarget, spend, budget) => {
    const p = of(rev, revTarget, spend, budget);
    return { id, name: id.toUpperCase(), pace2: { rev: p.revPace, budget: p.budgetPace, advice: brandAdvice(p) } };
  };
  const a = brand("a", 700, 1000, 700, 1000);    // ตามแผนทั้งคู่
  const b = brand("b", 300, 1000, 1200, 1000);   // ยอดช้า + เกินงบแล้ว = ด่วนสุด
  const c = brand("c", 500, 1000, 700, 1000);    // ยอดช้า งบตามแผน
  const d = brand("d", 900, null, 300, 1000);    // ยังไม่ตั้งเป้า = ตัดสินไม่ได้ ไว้ท้าย
  const c2 = brand("c2", 400, 1000, 700, 1000);  // ช่องเดียวกับ c แต่ขาดมากกว่า → มาก่อน c
  it("byUrgency: อันดับจากตารางตัดสินใจ · อันดับเท่ากันเอาที่ขาดจากแผนมากกว่าก่อน · ตัดสินไม่ได้ไว้ท้าย · ไม่แก้ลำดับเดิม", () => {
    const list = [a, d, c, b, c2];
    expect(byUrgency(list).map((x) => x.id)).toEqual(["b", "c2", "c", "a", "d"]);
    expect(list.map((x) => x.id)).toEqual(["a", "d", "c", "b", "c2"]);
  });
  it("overviewDigest: คาดขาดเป้าเท่าไร · เกินงบกี่แบรนด์ · เรื่องแรกคือแบรนด์ที่ด่วนสุด", () => {
    const overall = { rev: paceOf({ actual: 2100, target: 4000, clock }) };   // คาดปิด 2,100 × 30 ÷ 21 = 3,000
    const g = overviewDigest({ overallPace: overall, brands: [a, b, c, d] });
    expect(g.shortfall).toBeCloseTo(1000, 6);
    expect(g.overBudget).toBe(1);
    expect(g.companyOver).toBe(false);   // ไม่ได้ส่งจังหวะงบรวมมา = ไม่รู้ ไม่ใช่เกิน
    expect(g.first).toMatchObject({ id: "b", name: "B", action: "ตรวจแคมเปญ/ครีเอทีฟทันที" });
    // ตรวจรอบ 27 ก.ย. ดึก: งบรวมเกินแล้วต้องบอก — เดิมขึ้นแค่ "เกินงบ 2 แบรนด์" อ่านเหมือนปัญหาเฉพาะบางแบรนด์
    const over = { ...overall, budget: paceOf({ actual: 1300, target: 1000, clock, direction: "spend" }) };
    expect(overviewDigest({ overallPace: over, brands: [a, b] }).companyOver).toBe(true);
  });
  it("ทุกแบรนด์ปกติ = ไม่มีเรื่องแรก · คาดเกินเป้า = shortfall ติดลบ · ยังไม่ตั้งเป้ารวม = ไม่มีตัวเลขคาด", () => {
    const g = overviewDigest({ overallPace: { rev: paceOf({ actual: 3500, target: 4000, clock }) }, brands: [a, d] });
    expect(g.first).toBeNull();
    expect(g.overBudget).toBe(0);
    expect(g.shortfall).toBeLessThan(0);
    expect(overviewDigest({ overallPace: { rev: paceOf({ actual: 3500, target: null, clock }) }, brands: [a] }).shortfall).toBeNull();
    expect(overviewDigest({ overallPace: null, brands: [a] })).toBeNull();
  });
});
