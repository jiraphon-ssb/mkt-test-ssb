/* แถบที่มาของตัวเลข — ต้องบอกความสดของทั้ง 3 ระบบ ไม่ใช่ของ Meta อย่างเดียว */
import { describe, expect, it } from "vitest";
import { SOURCE_LEGEND, sourceChips, stripVerdict } from "../src/modules/marketing/ads/adsSourceStrip.js";

const TODAY = "2026-09-18";
const summary = { accounts: 4, from: "2026-06-18", to: "2026-09-18", lastSuccessAt: "2026-09-18T05:07:00Z", provisionalToday: true, empty: false };
const ssb = (fact_date, brand_id = "b_td") => ({ brand_id, fact_date, source: "crm" });
const jk = (fact_date) => ({ brand_id: "b_jt", fact_date, source: "tmk" });
const goal = (brand_id) => ({ brand_id, month: "2026-09-01" });
/* ⚠️ รหัสแบรนด์: TD=b_td · JD=b_jk (ไม่ใช่ b_jd) · TA=b_ta · JUNTAKARN=b_jt */
const chipOf = (chips, key) => chips.find((chip) => chip.key === key);

describe("sourceChips", () => {
  it("ครบทุกแหล่ง: ค่าแอด · ยอดขายพี่ทัช · JUNTAKARN · เป้า", () => {
    const chips = sourceChips({
      summary, today: TODAY,
      sales: [ssb("2026-09-17"), ssb("2026-09-18", "b_jk"), jk("2026-09-17")],
      salesGoals: [goal("b_td"), goal("b_jk"), goal("b_ta")],
    });
    expect(chips.map((chip) => chip.key)).toEqual(["meta", "sales", "jk", "goals"]);
    expect(chipOf(chips, "meta")).toMatchObject({ value: "4 บัญชี · ถึง 18 ก.ย.", tone: "ok" });
    expect(chipOf(chips, "sales")).toMatchObject({ value: "ถึง 18 ก.ย. (วันนี้)", tone: "ok", fresh: "2026-09-18" });
    expect(chipOf(chips, "jk")).toMatchObject({ value: "ถึง 17 ก.ย. (เมื่อวาน)", tone: "ok" });
    expect(chipOf(chips, "goals")).toMatchObject({ value: "3/3 แบรนด์", tone: "ok" });
    expect(stripVerdict(chips)).toEqual({ state: "ok", text: "ข้อมูลจริง · ทุกแหล่งสดและครบ" });
  });

  it("JUNTAKARN ยังไม่มีแถว = รอเชื่อมแหล่งข้อมูล (ไม่ใช่ 0) และหัวแถบบอกว่ายังไม่มี", () => {
    const chips = sourceChips({ summary, today: TODAY, sales: [ssb("2026-09-18")], salesGoals: [goal("b_td"), goal("b_jk"), goal("b_ta")] });
    expect(chipOf(chips, "jk")).toMatchObject({ value: "รอเชื่อมแหล่งข้อมูล", tone: "muted", fresh: null });
    expect(stripVerdict(chips)).toEqual({ state: "muted", text: "ข้อมูลจริง · ยังไม่มี ยอดขาย JUNTAKARN" });
  });

  it("แถวของ JUNTAKARN ไม่ถูกนับเป็นความสดของยอดขายพี่ทัช (คนละระบบ)", () => {
    const chips = sourceChips({ summary, today: TODAY, sales: [ssb("2026-09-10"), jk("2026-09-18")] });
    expect(chipOf(chips, "sales")).toMatchObject({ value: "ถึง 10 ก.ย.", tone: "warn" });
    expect(chipOf(chips, "jk")).toMatchObject({ value: "ถึง 18 ก.ย. (วันนี้)", tone: "ok" });
    expect(stripVerdict(chips).state).toBe("warn");
    expect(stripVerdict(chips).text).toContain("ยอดขาย TD · JD · TA");
  });

  it("ค่าแอดค้างเกิน 1 วัน = เตือน · ยังไม่มีบัญชี = ยังไม่มีข้อมูล", () => {
    expect(chipOf(sourceChips({ summary: { ...summary, to: "2026-09-16" }, today: TODAY }), "meta").tone).toBe("warn");
    expect(chipOf(sourceChips({ summary: { accounts: 0, to: null }, today: TODAY }), "meta")).toMatchObject({ value: "ยังไม่มีบัญชี · ยังไม่มีข้อมูล", tone: "muted" });
  });

  it("เป้า: ขาดบางแบรนด์ = เตือนพร้อมบอกจำนวน · เป้าเดือนอื่นไม่นับ", () => {
    expect(chipOf(sourceChips({ summary, today: TODAY, salesGoals: [goal("b_td")] }), "goals")).toMatchObject({ value: "1/3 แบรนด์", tone: "warn" });
    expect(chipOf(sourceChips({ summary, today: TODAY, salesGoals: [{ brand_id: "b_td", month: "2026-08-01" }] }), "goals")).toMatchObject({ value: "ยังไม่ตั้งเป้า", tone: "muted" });
  });

  it("ที่มาของตัวเลขเขียนเป็นคู่ระบบ→ตัวชี้วัด อ่านออกว่าอะไรมาจากไหน", () => {
    expect(SOURCE_LEGEND.map((item) => item.from)).toEqual(["ระบบขาย", "Meta"]);
    expect(SOURCE_LEGEND[0].metrics).toContain("ยอดขาย");
    expect(SOURCE_LEGEND[1].metrics).toContain("ค่าแอด");
  });
});
