/* แถบที่มาของตัวเลข — ต้องบอกความสดของทั้ง 3 ระบบ ไม่ใช่ของ Meta อย่างเดียว */
import { describe, expect, it } from "vitest";
import { SOURCE_LEGEND, sourceChips, stripVerdict } from "../src/modules/marketing/ads/adsSourceStrip.js";

const TODAY = "2026-09-18";
const summary = { accounts: 4, from: "2026-06-18", to: "2026-09-18", lastSuccessAt: "2026-09-18T05:07:00Z", provisionalToday: true, empty: false };
const ssb = (fact_date, brand_id = "b_td") => ({ brand_id, fact_date, source: "crm" });
const jk = (fact_date) => ({ brand_id: "b_jt", fact_date, source: "tmk" });
// เป้า "ตั้งแล้ว" = มีเป้ายอดขายของเดือนนั้น (มาจากระบบขาย ระบบ TMK หรือตั้งเองก็ได้)
const goal = (brand_id, sales_target = 1000000) => ({ brand_id, month: "2026-09-01", sales_target });
const allGoals = [goal("b_td"), goal("b_jk"), goal("b_ta"), goal("b_jt")];   // 4 แบรนด์ที่มีแหล่งยอดขาย
/* ⚠️ รหัสแบรนด์: TD=b_td · JD=b_jk (ไม่ใช่ b_jd) · TA=b_ta · JUNTAKARN=b_jt */
const chipOf = (chips, key) => chips.find((chip) => chip.key === key);

describe("sourceChips", () => {
  it("ครบทุกแหล่ง: ค่าแอด · ยอดขายพี่ทัช · JUNTAKARN · เป้า", () => {
    const chips = sourceChips({
      summary, today: TODAY,
      sales: [ssb("2026-09-17"), ssb("2026-09-18", "b_jk"), jk("2026-09-17")],
      salesGoals: allGoals,
    });
    expect(chips.map((chip) => chip.key)).toEqual(["meta", "sales", "jk", "goals"]);
    expect(chipOf(chips, "meta")).toMatchObject({ value: "4 บัญชี · ถึง 18 ก.ย.", tone: "ok" });
    expect(chipOf(chips, "sales")).toMatchObject({ value: "ถึง 18 ก.ย. (วันนี้)", tone: "ok", fresh: "2026-09-18" });
    expect(chipOf(chips, "jk")).toMatchObject({ value: "ถึง 17 ก.ย. (เมื่อวาน)", tone: "ok" });
    expect(chipOf(chips, "goals")).toMatchObject({ value: "4/4 แบรนด์", tone: "ok" });
    expect(stripVerdict(chips)).toEqual({ state: "ok", text: "ข้อมูลจริง · ทุกแหล่งสดและครบ" });
  });

  it("JUNTAKARN ยังไม่มีแถว = รอเชื่อมแหล่งข้อมูล (ไม่ใช่ 0) และหัวแถบบอกว่ายังไม่มี", () => {
    const chips = sourceChips({ summary, today: TODAY, sales: [ssb("2026-09-18")], salesGoals: allGoals });
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
    expect(chipOf(sourceChips({ summary, today: TODAY, salesGoals: [goal("b_td")] }), "goals")).toMatchObject({ value: "1/4 แบรนด์", tone: "warn" });
    // เป้า 0 = ตั้งใจให้เป็นศูนย์ → นับว่าตั้งแล้ว · ไม่มีค่า (null) เท่านั้นที่ถือว่ายังไม่ตั้ง
    expect(chipOf(sourceChips({ summary, today: TODAY, salesGoals: [goal("b_td", 0), goal("b_jt", null)] }), "goals")).toMatchObject({ value: "1/4 แบรนด์", tone: "warn" });
    expect(chipOf(sourceChips({ summary, today: TODAY, salesGoals: [goal("b_td", null)] }), "goals")).toMatchObject({ value: "ยังไม่ตั้งเป้า", tone: "muted" });
    expect(chipOf(sourceChips({ summary, today: TODAY, salesGoals: [{ brand_id: "b_td", month: "2026-08-01", sales_target: 1 }] }), "goals")).toMatchObject({ value: "ยังไม่ตั้งเป้า", tone: "muted" });
    // JUNTAKARN นับด้วยแล้ว — เป้าจากระบบ TMK หรือที่ตั้งเองในหน้าตั้งค่าก็นับ
    expect(chipOf(sourceChips({ summary, today: TODAY, salesGoals: [goal("b_jt")] }), "goals")).toMatchObject({ value: "1/4 แบรนด์" });
  });

  it("ที่มาของตัวเลขเขียนเป็นคู่ระบบ→ตัวชี้วัด อ่านออกว่าอะไรมาจากไหน", () => {
    expect(SOURCE_LEGEND.map((item) => item.from)).toEqual(["ระบบขาย", "Meta Ads"]);
    expect(SOURCE_LEGEND[0].metrics).toContain("ยอดขาย");
    expect(SOURCE_LEGEND[1].metrics).toContain("ค่าแอด");
  });
});

/* หัวแถบต้องใช้คำให้ตรงชนิดของป้าย — เป้าไม่ใช่เรื่อง "สด" แต่เป็นเรื่อง "ครบ"
   (เจอบนหน้าจริง 18 ก.ย. 69: ขึ้นว่า "เป้าเดือนนี้ ยังไม่สด" ซึ่งอ่านไม่รู้เรื่อง) */
describe("stripVerdict — คำที่ใช้ตามชนิดของป้าย", () => {
  it("เป้าขาดบางแบรนด์ = ยังไม่ครบ · แหล่งข้อมูลค้าง = ยังไม่สด · ขาดทั้งคู่บอกทั้งสองอย่าง", () => {
    const goalsOnly = sourceChips({ summary, today: TODAY, sales: [ssb("2026-09-18"), jk("2026-09-18")], salesGoals: [goal("b_td")] });
    expect(stripVerdict(goalsOnly).text).toBe("ข้อมูลจริง · เป้าเดือนนี้ยังไม่ครบ");
    const staleOnly = sourceChips({ summary, today: TODAY, sales: [ssb("2026-09-10"), jk("2026-09-18")], salesGoals: allGoals });
    expect(stripVerdict(staleOnly).text).toBe("ข้อมูลจริง · ยอดขาย TD · JD · TA ยังไม่สด");
    const both = sourceChips({ summary, today: TODAY, sales: [ssb("2026-09-10"), jk("2026-09-18")], salesGoals: [goal("b_td")] });
    expect(stripVerdict(both).text).toBe("ข้อมูลจริง · ยอดขาย TD · JD · TA ยังไม่สด · เป้าเดือนนี้ยังไม่ครบ");
  });
});
