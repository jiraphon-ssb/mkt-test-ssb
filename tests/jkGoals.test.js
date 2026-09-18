/* เป้าเดือนของ JUNTAKARN จากระบบ TMK → ad_sales_goals ของ b_jt
   เป้าช่องแชท (ฐานเดียวกับยอดที่นับ) · งบแอด Meta = Facebook + Instagram · ROAS คิดเองจากสองตัวนี้
   กติกาที่ห้ามพลาด: เดือนที่ทีมยังไม่ตั้งเป้า = ไม่เขียนอะไร (ห้ามเขียนศูนย์ทับของที่คนตั้งไว้เอง) */
import { describe, expect, it } from "vitest";
import { JK_GOAL_COLUMNS, jkGoalExtraColumns, jkGoalRows } from "../supabase/functions/_shared/jkGoals.js";

const row = (patch = {}) => ({
  month: "2026-09-01", sales_target: 900000, ad_budget: 150000,
  sales_target_all: 1500000, ad_budget_all: 200000, has_row: true, ...patch,
});
const first = (rows) => jkGoalRows(rows)[0];

describe("jkGoalRows", () => {
  it("เป้า · งบ · ROAS ของแบรนด์ b_jt พร้อมที่มา tmk_month", () => {
    const out = first([row()]);
    expect(out).toMatchObject({
      brand_id: "b_jt", month: "2026-09-01", version: 0, goal_source: "tmk_month",
      sales_target: 900000, ad_budget: 150000,
    });
    expect(out.roas).toBeCloseTo(6);
    // งบรายแพลตฟอร์ม: หน้า ads ใช้ช่อง meta ตัวนี้แทนการหารงบแบรนด์เฉลี่ย
    expect(out.platform_budgets).toEqual({ meta: 150000 });
  });

  it("เดือนที่ยังไม่มีแถวเป้าเลย = ไม่เขียนอะไร", () => {
    expect(jkGoalRows([row({ has_row: false, sales_target: 0, ad_budget: 0 })])).toEqual([]);
    expect(jkGoalRows([row({ sales_target: 0, ad_budget: 0 })])).toEqual([]);
    expect(jkGoalRows([])).toEqual([]);
    expect(jkGoalRows(null)).toEqual([]);
  });

  it("มีแถวแต่ตั้งแค่บางอย่าง = เขียนเท่าที่มี ส่วนที่ไม่มีเป็น null ไม่ใช่ 0", () => {
    const onlyTarget = first([row({ ad_budget: 0 })]);
    expect(onlyTarget).toMatchObject({ sales_target: 900000, ad_budget: null, roas: null });
    expect(onlyTarget.platform_budgets).toEqual({});
    const onlyBudget = first([row({ sales_target: 0 })]);
    expect(onlyBudget).toMatchObject({ sales_target: null, ad_budget: 150000, roas: null });
  });

  it("ตัวเลขที่มาเป็น string จาก PostgREST อ่านได้ · ทศนิยมไม่ถูกปัด", () => {
    const out = first([row({ sales_target: "900000.50", ad_budget: "150000.25" })]);
    expect(out.sales_target).toBeCloseTo(900000.5);
    expect(out.ad_budget).toBeCloseTo(150000.25);
    expect(out.roas).toBeCloseTo(900000.5 / 150000.25);
  });

  it("เดือนผิดรูป หรือไม่ใช่วันที่ 1 ของเดือน = ทิ้ง (คีย์ต้องตรงกับ ad_sales_goals)", () => {
    expect(jkGoalRows([row({ month: "เดือนนี้" })])).toEqual([]);
    expect(jkGoalRows([row({ month: "2026-09-15" })])).toEqual([]);
    expect(jkGoalRows([row({ month: null })])).toEqual([]);
    expect(first([row({ month: "2026-09-01T00:00:00Z" })])).toMatchObject({ month: "2026-09-01" });
  });

  it("ค่าติดลบหรือค่าพัง = ถือว่าไม่มี (ไม่เขียนค่าประหลาดลงเป้า)", () => {
    expect(jkGoalRows([row({ sales_target: -5, ad_budget: -5 })])).toEqual([]);
    expect(first([row({ ad_budget: "ไม่รู้" })])).toMatchObject({ ad_budget: null, roas: null });
  });

  it("หลายเดือนพร้อมกัน = เรียงตามที่ได้มา แถวละเดือน", () => {
    const out = jkGoalRows([row(), row({ month: "2026-08-01", sales_target: 800000, ad_budget: 100000 })]);
    expect(out.map((item) => item.month)).toEqual(["2026-09-01", "2026-08-01"]);
    expect(out[1].roas).toBeCloseTo(8);
  });

  it("คอลัมน์เกินที่ขอ = จับได้ก่อนเขียน (ข้อมูลไม่ข้ามระบบ)", () => {
    expect(jkGoalExtraColumns([{ ...row(), salesperson: "เอ", note: "x" }])).toEqual(["note", "salesperson"]);
    expect(jkGoalExtraColumns([row()])).toEqual([]);
    for (const banned of ["salesperson", "customer_name", "order_no"]) expect(JK_GOAL_COLUMNS).not.toContain(banned);
  });
});

describe("jkGoalUrl", () => {
  it("ยิงไป RPC เป้า พร้อม select allowlist · ตัด / ท้าย URL ให้", async () => {
    const { jkGoalUrl } = await import("../supabase/functions/_shared/jkBridge.js");
    const url = jkGoalUrl("https://tmk.supabase.co/");
    expect(url.startsWith("https://tmk.supabase.co/rest/v1/rpc/jk_ads_monthly_goal?")).toBe(true);
    expect(new URL(url).searchParams.get("select")).toBe(JK_GOAL_COLUMNS.join(","));
  });
});

/* งบแอดที่พิมพ์ผิดเป็นเลขจิ๋ว (เช่น 0.01) ทำให้ ROAS ล้นคอลัมน์ numeric(12,4) แล้วรอบล้มทั้งรอบ (22003)
   กันที่ต้นทาง: ล้นเมื่อไหร่ = ไม่รู้ ไม่ใช่เขียนค่าประหลาดลงเป้า */
describe("ROAS ไม่ล้นคอลัมน์", () => {
  it("งบแอดจิ๋วจนอัตราส่วนเกินพิสัย = roas null แต่เป้ายอดกับงบยังเขียนได้", () => {
    const out = jkGoalRows([row({ sales_target: 900000, ad_budget: 0.0001 })])[0];
    expect(out).toMatchObject({ sales_target: 900000, ad_budget: 0.0001, roas: null });
    expect(jkGoalRows([row({ sales_target: 900000, ad_budget: 0.01 })])[0].roas).toBeCloseTo(90000000);
  });
});
