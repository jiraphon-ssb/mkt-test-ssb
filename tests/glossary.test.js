/* ชุด C (ตรวจรอบละเอียด 26 ก.ย.): คำแนะนำเดียวกันต้องชื่อเดียวกันทุกหน้า — ป้ายแคมเปญ · ตัวกรอง · การ์ดครีเอทีฟ */
import { describe, expect, it } from "vitest";
import { DECISION_LABEL, FATIGUE_LABEL } from "../src/modules/marketing/ads/glossary.js";
import { SAVED_VIEWS, campaignDecision } from "../src/modules/marketing/adsCampaigns.js";
import { actionLabel } from "../src/modules/marketing/creatives/creativeStatus.js";

const view = (key) => SAVED_VIEWS.find((v) => v.key === key).label;

describe("คำกลางทั้งระบบ", () => {
  it("คำที่อาร์ตเคาะ: ควรหยุด · ควรแก้ · สเกลได้ · รอข้อมูล · เริ่มล้า", () => {
    expect(DECISION_LABEL).toMatchObject({ stop: "ควรหยุด", fix: "ควรแก้", scale: "สเกลได้", wait: "รอข้อมูล" });
    expect(FATIGUE_LABEL).toBe("เริ่มล้า");
  });
  it("ตัวกรองหน้าแคมเปญใช้คำเดียวกับป้าย", () => {
    for (const key of ["scale", "fix", "good", "wait", "gate"]) expect(view(key)).toBe(DECISION_LABEL[key]);
    expect(view("fatigue")).toBe(FATIGUE_LABEL);
  });
  it("ป้ายแคมเปญ = คำกลาง", () => {
    const wait = campaignDecision({ complete: false });
    expect(wait.label).toBe(DECISION_LABEL.wait);
    const stop = campaignDecision({ complete: true, days: 5, spend: 5000, leads: 0, cpl: null, roas: null, creatives: [] }, null, undefined, { roasFromMeta: false });
    expect(stop.label).toBe(DECISION_LABEL.stop);
  });
  it("การ์ดครีเอทีฟ = คำกลาง", () => {
    expect(actionLabel({ action: "Scale" })).toBe(DECISION_LABEL.scale);
    expect(actionLabel({ action: "Stop" })).toBe(DECISION_LABEL.stop);
    expect(actionLabel({ action: "Fix" })).toBe(DECISION_LABEL.fix);
    expect(actionLabel({ action: "Good", fatigue: true })).toBe(FATIGUE_LABEL);
  });
});

/* ตรวจรอบ 28 ก.ย.: "ความถี่ ▲1.72% แย่ลง" — เปลี่ยนนิดเดียวก็ตะโกนแย่ลง ทำหน้ารก → น้อยกว่า 5% = ทรงตัว (สีจาง) */
import { trendOf } from "../src/modules/marketing/ads/glossary.js";
describe("trendOf — ดีขึ้น / แย่ลง / ทรงตัว", () => {
  it("≥ 5% ตามทิศของตัวชี้วัด · < 5% = ทรงตัว · ไม่รู้ = ว่าง", () => {
    expect(trendOf(9.75)).toEqual({ good: true, word: "ดีขึ้น" });
    expect(trendOf(-6, "lower")).toEqual({ good: true, word: "ดีขึ้น" });
    expect(trendOf(6, "lower")).toEqual({ good: false, word: "แย่ลง" });
    expect(trendOf(1.72, "lower")).toEqual({ good: null, word: "ทรงตัว" });
    expect(trendOf(-4.99)).toEqual({ good: null, word: "ทรงตัว" });
    expect(trendOf(null)).toEqual({ good: null, word: "" });
    expect(trendOf(20, "neutral")).toEqual({ good: null, word: "" });
  });
});
