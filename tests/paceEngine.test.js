/* Pace Engine กลาง — สูตรเดียวใช้ทั้ง ยอดขาย · งบ · ผลลัพธ์ (สเปก 2026-09-21 หัวข้อ 5)
   กติกาเหล็ก: ไม่รู้ = "ยังตัดสินใจไม่ได้" ห้ามแปลงเป็น 0 หรือเดาเป็นเขียว/แดง */
import { describe, expect, it } from "vitest";
import { monthClock, paceBucket, paceLabel, paceOf, paceTone } from "../src/modules/marketing/ads/paceEngine.js";

describe("monthClock", () => {
  it("นับวันที่ผ่านไปของเดือน · เดือนสั้นเดือนยาวถูกต้อง", () => {
    expect(monthClock("2026-09-21")).toMatchObject({ daysElapsed: 21, daysTotal: 30, daysLeft: 9, elapsed: 0.7, today: "2026-09-21" });
    expect(monthClock("2026-02-28")).toMatchObject({ daysElapsed: 28, daysTotal: 28, daysLeft: 0, elapsed: 1 });
    expect(monthClock("2026-08-31")).toMatchObject({ daysTotal: 31, daysLeft: 0 });
  });
  it("วันที่พัง = ไม่รู้ทั้งชุด (ไม่ใช่ 0)", () => {
    expect(monthClock("")).toMatchObject({ daysElapsed: null, daysTotal: null, daysLeft: null, elapsed: null, today: null });
  });
});

describe("paceOf — ยิ่งมากยิ่งดี (ยอดขาย · ออเดอร์ · ลีด)", () => {
  const clock = monthClock("2026-09-21");
  it("ยอดรวมทุกแบรนด์ของจริง 21 ก.ย.", () => {
    const p = paceOf({ actual: 2997302, target: 5780000, clock });
    expect(p.value).toBeCloseTo(0.7408062, 6);      // 2,997,302 ÷ 4,046,000
    expect(p.expectedToDate).toBe(4046000);
    expect(p.gap).toBe(-1048698);                    // ติดลบ = ช้ากว่าแผน
    expect(p.forecast).toBeCloseTo(4281860, 4);
    expect(p.forecastGap).toBeCloseTo(-1498140, 4);
    expect(p.requiredDaily).toBeCloseTo(309188.6666, 3);   // (5,780,000 − 2,997,302) ÷ 9 วัน
    expect(p.state).toBe("bad");
  });
  it("เกณฑ์สถานะ: ≥100% ตามแผน · 85–99.99% ใกล้เป้า · <85% ช้ากว่าแผน", () => {
    const at = (value) => paceOf({ actual: 700 * value, target: 1000, clock: { elapsed: 0.7, daysLeft: 9 } }).state;
    expect(at(1)).toBe("ontrack");
    expect(at(1.5)).toBe("ontrack");
    expect(at(0.9)).toBe("warn");
    expect(at(0.85)).toBe("warn");
    expect(at(0.8499)).toBe("bad");
  });
  it("ทำเกินเป้าทั้งเดือนแล้ว = ไม่ต้องทำเพิ่มต่อวัน (ไม่ใช่ติดลบ)", () => {
    expect(paceOf({ actual: 1200, target: 1000, clock }).requiredDaily).toBe(0);
  });
});

describe("paceOf — งบ (เร็วเกินไม่ดี แต่ยังไม่ใช่ความผิดทันที)", () => {
  const clock = monthClock("2026-09-21");
  it("t around ของจริง: ใช้ 57,038.53 จากงบ 45,000 = เกินงบทั้งเดือนแล้ว", () => {
    const p = paceOf({ actual: 57038.53, target: 45000, clock, direction: "spend" });
    expect(p.value).toBeCloseTo(1.810747, 6);
    expect(p.overTarget).toBe(true);
    expect(p.state).toBe("bad");                     // เกินงบ = แดงระดับเดียวกับยอดช้า (อาร์ตเคาะ 21 ก.ย.)
  });
  it("ใช้เร็วกว่าแผนแต่ยังไม่เกินงบ = เตือน ไม่ใช่แดง", () => {
    expect(paceOf({ actual: 800, target: 1000, clock, direction: "spend" }).state).toBe("warn");   // 114%
    expect(paceOf({ actual: 700, target: 1000, clock, direction: "spend" }).state).toBe("ontrack");
    expect(paceOf({ actual: 500, target: 1000, clock, direction: "spend" }).state).toBe("ontrack"); // ใช้ช้า = ไม่ใช่ปัญหาในตัวเอง
  });
});

describe("ยังตัดสินใจไม่ได้ — ต้องบอกด้วยว่าเพราะอะไร", () => {
  const clock = monthClock("2026-09-21");
  it("ไม่มีเป้า · ไม่มียอด · เป้าเป็นศูนย์", () => {
    expect(paceOf({ actual: 100, target: null, clock })).toMatchObject({ state: "unknown", reason: "no_target" });
    expect(paceOf({ actual: null, target: 100, clock })).toMatchObject({ state: "unknown", reason: "no_data" });
    expect(paceOf({ actual: 100, target: 0, clock })).toMatchObject({ state: "unknown", reason: "no_target" });
  });
  it("ข้อมูลเก่ากว่าที่กำหนด = เทา แม้ตัวเลขจะครบ (กันแนะนำจากข้อมูลค้าง)", () => {
    const p = paceOf({ actual: 700, target: 1000, clock, freshThrough: "2026-09-18", staleAfterDays: 2 });
    expect(p).toMatchObject({ state: "unknown", reason: "stale" });
    expect(p.value).toBeCloseTo(1, 6);               // ยังคำนวณค่าไว้ให้ดูได้ แค่ไม่ตัดสิน
    expect(paceOf({ actual: 700, target: 1000, clock, freshThrough: "2026-09-20", staleAfterDays: 2 }).state).toBe("ontrack");
  });
  it("เดือนยังไม่เริ่ม (elapsed = 0) = ยังตัดสินใจไม่ได้ ไม่ใช่หารศูนย์", () => {
    expect(paceOf({ actual: 0, target: 1000, clock: { elapsed: 0, daysLeft: 30 } })).toMatchObject({ state: "unknown", reason: "too_early" });
  });
});

describe("ป้ายและโทนสี", () => {
  it("คำไทยตรงกับสถานะ · unknown ไม่ใช่สีเขียวหรือแดง", () => {
    expect(paceLabel("ontrack")).toBe("เหนือแผน");
    expect(paceLabel("warn")).toBe("ใกล้เป้า");
    expect(paceLabel("bad")).toBe("ช้ากว่าแผน");
    expect(paceLabel("unknown")).toBe("ยังตัดสินใจไม่ได้");
    expect(paceLabel("bad", "spend")).toBe("เกินงบ");
    expect(paceLabel("warn", "spend")).toBe("ใช้เร็วกว่าแผน");
    expect(paceTone("unknown")).toBe("zinc");
    expect(paceTone("ontrack")).toBe("emerald");
  });
  it("paceBucket ใช้ป้อนตารางตัดสินใจ 2×2", () => {
    expect(paceBucket({ state: "ontrack", value: 1.2 })).toBe("fast");
    expect(paceBucket({ state: "warn", value: 0.9 })).toBe("slow");
    expect(paceBucket({ state: "unknown" })).toBeNull();
  });
});
