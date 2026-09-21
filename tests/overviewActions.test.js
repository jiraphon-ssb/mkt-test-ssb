/* ตารางตัดสินใจ 2×2 + รายการ "สิ่งที่ต้องทำวันนี้" (สเปก 2026-09-21 หัวข้อ 5 และ 7)
   กติกา: ช่องไหนตัดสินไม่ได้ ห้ามเดาเป็นช้า · เรียงตามผลกระทบ ไม่ใช่ตามชื่อแบรนด์ */
import { describe, expect, it } from "vitest";
import { brandAdvice } from "../src/modules/marketing/ads/overviewActions.js";
import { monthClock, paceOf } from "../src/modules/marketing/ads/paceEngine.js";

const clock = monthClock("2026-09-21");
const of = (rev, revTarget, spend, budget) => ({
  revPace: paceOf({ actual: rev, target: revTarget, clock }),
  budgetPace: paceOf({ actual: spend, target: budget, clock, direction: "spend" }),
});

describe("brandAdvice — ตาราง 2×2", () => {
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
  it("ผลช้า × งบตามแผน = ตรวจปริมาณงาน (TEAMDEE ของจริง)", () => {
    expect(brandAdvice(of(1560880, 3500000, 150788.55, 210000))).toMatchObject({ key: "slow_slow", rank: 3, tone: "amber" });
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
