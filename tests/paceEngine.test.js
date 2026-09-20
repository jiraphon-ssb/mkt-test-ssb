import { describe, expect, it } from "vitest";
import { coveragePace, cumulativePace, freshnessPace, monthClock, thresholdPace } from "../src/modules/marketing/ads/paceEngine.js";

describe("Pace Engine กลาง", () => {
  it("คำนวณนาฬิกาเดือนและเป้าสะสมโดยไม่เดาค่าว่าง", () => {
    expect(monthClock("2026-09-15")).toMatchObject({ daysElapsed: 15, daysTotal: 30, daysLeft: 15, elapsed: 0.5 });
    expect(cumulativePace({ actual: 40, target: 100, elapsed: 0.5, daysLeft: 15 })).toMatchObject({ expectedToDate: 50, ratioToPace: 0.8, state: "bad", requiredDaily: 4 });
    expect(cumulativePace({ actual: null, target: 100, elapsed: 0.5 }).progress).toBeNull();
  });

  it("ใช้กติกาเดียวกันกับเกณฑ์ขั้นต่ำ ความสด และความครบ", () => {
    expect(thresholdPace(5, 5)).toMatchObject({ progress: 1, state: "ontrack", remaining: 0 });
    expect(coveragePace(8, 10)).toMatchObject({ progress: 0.8, state: "warn", missing: 2 });
    expect(freshnessPace("2026-09-21T00:00:00Z", 6, Date.parse("2026-09-21T03:00:00Z"))).toMatchObject({ ageHours: 3, progress: 0.5, state: "ontrack" });
  });
});
