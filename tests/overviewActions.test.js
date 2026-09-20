/* ตารางตัดสินใจ 2×2 + รายการ "สิ่งที่ต้องทำวันนี้" (สเปก 2026-09-21 หัวข้อ 5 และ 7)
   กติกา: ช่องไหนตัดสินไม่ได้ ห้ามเดาเป็นช้า · เรียงตามผลกระทบ ไม่ใช่ตามชื่อแบรนด์ */
import { describe, expect, it } from "vitest";
import { brandAdvice, todayActions } from "../src/modules/marketing/ads/overviewActions.js";
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

describe("todayActions — 3 เรื่องเรียงตามผลกระทบ", () => {
  const brands = [
    { id: "b_td", name: "TEAMDEE", ...of(1560880, 3500000, 150788.55, 210000) },
    { id: "b_jk", name: "JK Design", ...of(982302, 1300000, 102911.53, 90000) },
    { id: "b_ta", name: "t around", ...of(264519, 600000, 57038.53, 45000) },
    { id: "b_jt", name: "JUNTAKARN", ...of(189601, 380000, 67531.36, 95000) },
  ];
  const goalGaps = [{ brandId: "b_jt", name: "JUNTAKARN", missing: ["คนทัก", "ลีด", "มัดจำ", "CPL", "CAC", "ต้นทุนต่อทัก"] }];
  const creatives = [
    { id: "c1", name: "ชิ้น A", brand: "TEAMDEE", action: "Stop", why: "ROAS 0.80x", next: "ปิดตัวนี้", spend: 12000, tone: "rose" },
    { id: "c2", name: "ชิ้น B", brand: "JK Design", action: "Fix", why: "คนเห็นซ้ำจน CTR ตก", next: "เปลี่ยนชิ้นงาน", spend: 4000, tone: "amber" },
  ];
  it("แบรนด์มาก่อนเสมอ · t around ขึ้นอันดับ 1 · ตัดที่ 3 เรื่อง", () => {
    const { items: list, total } = todayActions({ brands, goalGaps, creatives });
    expect(list).toHaveLength(3);
    expect(total).toBe(7);
    expect(list[0]).toMatchObject({ kind: "brand", brandId: "b_ta", level: "bad" });
    expect(list[0].title).toContain("t around");
    expect(list[1].brandId).toBe("b_jk");
    // โควตาแบรนด์ 2 ช่อง — ช่องที่ 3 ต้องเป็นเรื่องอื่น ไม่งั้นเป้าที่ยังไม่ตั้งกับครีเอทีฟไม่มีวันโผล่
    expect(list[2].kind).toBe("goal");
  });
  it("เป้าที่ยังไม่ตั้งมาหลังแบรนด์ · แคมเปญ/ครีเอทีฟอยู่ล่างสุด (อาร์ตเคาะ 21 ก.ย.)", () => {
    const { items: list } = todayActions({ brands, goalGaps, creatives, limit: 20 });
    const kinds = list.map((item) => item.kind);
    expect(kinds.indexOf("goal")).toBeGreaterThan(kinds.lastIndexOf("brand"));
    expect(kinds.indexOf("creative")).toBeGreaterThan(kinds.indexOf("goal"));
    expect(list.find((item) => item.kind === "goal").detail).toContain("6 ช่อง");
    // ครีเอทีฟเรียงตามค่าแอดที่เสียไป ไม่ใช่ตามชื่อ
    const cre = list.filter((item) => item.kind === "creative");
    expect(cre.map((item) => item.id)).toEqual(["c1", "c2"]);
  });
  it("ไม่มีเรื่องต้องทำ = รายการว่าง (ไม่ใช่ยัดเรื่องที่ตัดสินไม่ได้มาแทน)", () => {
    const calm = [{ id: "b_x", name: "ปกติ", ...of(900, 1000, 700, 1000) }];
    expect(todayActions({ brands: calm, goalGaps: [], creatives: [] })).toEqual({ items: [], total: 0 });
  });
});
