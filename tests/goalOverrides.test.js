/* เป้าที่ใช้จริง = ค่าจากระบบขาย ทับด้วยค่าที่คนแก้ในหน้าตั้งค่า (ทีละช่อง ทีละเดือน ทีละแบรนด์)
   กติกาที่ผู้ใช้เคาะ 18 ก.ย. 69: "อะไรชนะ — ในหน้าตั้งค่าเราชนะ"
   ไฟล์นี้คือด่านเดียวที่ตัดสินเรื่องนั้น — ทุกหน้าอ่านผลจากที่นี่ */
import { describe, expect, it } from "vitest";
import {
  GOAL_EDIT_FIELDS, changedFromSource, goalRowFor, mergeGoals, mergedGoalRows, missingGoalFields, parseGoalInput,
} from "../src/modules/marketing/ads/goalOverrides.js";

const goal = (patch = {}) => ({
  brand_id: "b_td", month: "2026-09-01", goal_source: "sale_goal", version: 3,
  sales_target: 3500000, ad_budget: 210000, orders_target: 209, roas: 9, ...patch,
});
const ov = (patch = {}) => ({ brand_id: "b_td", month: "2026-09-01", updated_at: "2026-09-18T10:00:00Z", updated_by: "p1", ...patch });
const rowOf = (goals, overrides, brandId = "b_td", month = "2026-09-01") => goalRowFor(mergeGoals(goals, overrides), brandId, month);

describe("mergeGoals — ใครชนะ", () => {
  it("ช่องที่แก้ในตั้งค่าชนะ · ช่องที่ไม่ได้แก้ใช้ค่าจากระบบขาย · บอกที่มารายช่อง", () => {
    const row = rowOf([goal()], [ov({ ad_budget: 250000 })]);
    expect(row.ad_budget).toBe(250000);
    expect(row.sales_target).toBe(3500000);
    expect(row.sources.ad_budget).toBe("manual");
    expect(row.sources.sales_target).toBe("sale_goal");
    expect(row.synced.ad_budget).toBe(210000);      // เก็บค่าต้นทางไว้ให้กดคืนค่าได้
    expect(row.updated_at).toBe("2026-09-18T10:00:00Z");
    expect(row.updated_by).toBe("p1");
  });

  it("override เป็น 0 = ตั้งใจให้เป็นศูนย์ (ไม่ตกไปใช้ค่าต้นทาง)", () => {
    const row = rowOf([goal()], [ov({ ad_budget: 0 })]);
    expect(row.ad_budget).toBe(0);
    expect(row.sources.ad_budget).toBe("manual");
  });

  it("override ที่เป็น null ทุกช่อง (ล้างหมดแล้ว) = เหมือนไม่มี override", () => {
    const row = rowOf([goal()], [ov({ ad_budget: null, sales_target: null })]);
    expect(row.ad_budget).toBe(210000);
    expect(row.sources.ad_budget).toBe("sale_goal");
  });

  it("เดือนที่ไม่มีแถวจากระบบขายเลย แต่มีคนตั้งเอง = ได้แถวเป้าจาก override ล้วน", () => {
    const row = rowOf([], [ov({ month: "2026-10-01", sales_target: 1000000 })], "b_td", "2026-10-01");
    expect(row).toMatchObject({ sales_target: 1000000, goal_source: "manual" });
    expect(row.sources.sales_target).toBe("manual");
    expect(row.synced.sales_target).toBe(null);
    expect(row.ad_budget).toBe(null);
  });

  it("เป้าจากระบบ TMK (JUNTAKARN) ก็ถูกทับได้เหมือนกัน และที่มายังอ่านออก", () => {
    const jk = goal({ brand_id: "b_jt", goal_source: "tmk_month", version: 0, sales_target: 900000, ad_budget: 150000, orders_target: null, roas: 6 });
    const row = rowOf([jk], [ov({ brand_id: "b_jt", orders_target: 60 })], "b_jt");
    expect(row.sources.sales_target).toBe("tmk_month");
    expect(row.sources.orders_target).toBe("manual");
    expect(row.orders_target).toBe(60);
    expect(row.sales_target).toBe(900000);
  });

  it("ต้นทางเปลี่ยนทีหลัง override ยังชนะ แต่บอกว่าต่างกันเท่าไหร่", () => {
    const row = rowOf([goal({ sales_target: 4000000 })], [ov({ sales_target: 3500000 })]);
    expect(row.sales_target).toBe(3500000);
    expect(changedFromSource(row)).toEqual([{ key: "sales_target", label: "เป้ายอดขาย", value: 3500000, source: 4000000 }]);
  });

  it("override ที่ค่าเท่าต้นทางเป๊ะ = ไม่ต้องเตือนว่าต่างกัน", () => {
    expect(changedFromSource(rowOf([goal()], [ov({ sales_target: 3500000 })]))).toEqual([]);
  });

  it("แยกคนละเดือนคนละแบรนด์ ไม่ปนกัน", () => {
    const merged = mergeGoals([goal(), goal({ month: "2026-08-01", sales_target: 3000000 })], [ov({ sales_target: 9 })]);
    expect(goalRowFor(merged, "b_td", "2026-08-01").sales_target).toBe(3000000);
    expect(goalRowFor(merged, "b_td", "2026-09-01").sales_target).toBe(9);
    expect(goalRowFor(merged, "b_jt", "2026-09-01")).toBe(null);
    expect(mergedGoalRows(merged)).toHaveLength(2);
  });

  it("ไม่แก้ของเดิม (ไม่ mutate) · แถวผิดรูปทิ้ง · ไม่มีอะไรเลยก็ไม่พัง", () => {
    const goals = [goal()];
    const overrides = [ov({ ad_budget: 1 })];
    mergeGoals(goals, overrides);
    expect(goals[0].ad_budget).toBe(210000);
    expect(overrides[0].ad_budget).toBe(1);
    expect(mergedGoalRows(mergeGoals([{ month: "2026-09-01" }, goal({ brand_id: null })], [{ brand_id: "b_td" }]))).toEqual([]);
    expect(mergedGoalRows(mergeGoals())).toEqual([]);
    expect(goalRowFor(null, "b_td", "2026-09-01")).toBe(null);
  });

  it("เดือนที่มาพร้อมเวลา (timestamp) อ่านเป็นเดือนเดียวกัน", () => {
    const row = rowOf([goal({ month: "2026-09-01T00:00:00+00:00" })], [ov()]);
    expect(row.sales_target).toBe(3500000);
  });
});

describe("missingGoalFields — ขาดอะไรบ้าง", () => {
  it("บอกช่องที่ยังไม่มีค่าเลย (ทั้งต้นทางและตั้งค่า)", () => {
    const keys = missingGoalFields(rowOf([goal()], [])).map((field) => field.key);
    expect(keys).toContain("inquiry_target");
    expect(keys).toContain("cpl");
    expect(keys).not.toContain("sales_target");
    expect(keys).not.toContain("orders_target");
  });
  it("เติมในตั้งค่าแล้ว = ไม่นับว่าขาด", () => {
    const keys = missingGoalFields(rowOf([goal()], [ov({ inquiry_target: 1500 })])).map((field) => field.key);
    expect(keys).not.toContain("inquiry_target");
  });
  it("ไม่มีแถวเลย = ขาดทุกช่อง", () => {
    expect(missingGoalFields(null)).toHaveLength(GOAL_EDIT_FIELDS.length);
  });
});

describe("parseGoalInput — รับแบบที่คนพิมพ์จริง", () => {
  it("เงิน: มีคอมมา มีสัญลักษณ์บาท มีทศนิยม", () => {
    expect(parseGoalInput("1,300,000", "money")).toBe(1300000);
    expect(parseGoalInput("฿90,000.50", "money")).toBeCloseTo(90000.5);
    expect(parseGoalInput(" 250000 ", "money")).toBe(250000);
    expect(parseGoalInput("0", "money")).toBe(0);
  });
  it("อัตราส่วน: พิมพ์ x ต่อท้ายได้", () => {
    expect(parseGoalInput("6.5x", "ratio")).toBe(6.5);
    expect(parseGoalInput("9×", "ratio")).toBe(9);
  });
  it("เปอร์เซ็นต์เก็บเป็นสัดส่วน 0–1 · เกิน 100% = พิมพ์ผิด", () => {
    expect(parseGoalInput("12%", "pct")).toBeCloseTo(0.12);
    expect(parseGoalInput("12", "pct")).toBeCloseTo(0.12);
    expect(parseGoalInput("0.12", "pct")).toBeCloseTo(0.12);
    expect(parseGoalInput("1", "pct")).toBe(1);          // 1 = 100% (ช่องนี้เก็บสัดส่วน)
    expect(parseGoalInput("1%", "pct")).toBeCloseTo(0.01);
    expect(parseGoalInput("150%", "pct")).toBe(undefined);
  });
  it("เว้นว่าง = ล้างค่า (null) · พิมพ์ผิด = undefined (ห้ามบันทึก)", () => {
    expect(parseGoalInput("", "money")).toBe(null);
    expect(parseGoalInput(null, "money")).toBe(null);
    expect(parseGoalInput("   ", "money")).toBe(null);
    expect(parseGoalInput("ไม่รู้", "money")).toBe(undefined);
    expect(parseGoalInput("-5", "money")).toBe(undefined);
    expect(parseGoalInput("1.2.3", "money")).toBe(undefined);
  });
});

describe("GOAL_EDIT_FIELDS", () => {
  it("ชื่อช่องตรงกับคอลัมน์ในตาราง override · มีหน่วยครบทุกช่อง", () => {
    const keys = GOAL_EDIT_FIELDS.map((field) => field.key);
    expect(keys).toEqual([
      "sales_target", "ad_budget", "orders_target", "deposits_target", "leads_target",
      "inquiry_target", "cpl", "cac", "cpi", "roas", "pct_ads_new",
    ]);
    for (const field of GOAL_EDIT_FIELDS) {
      expect(field.label.length, field.key).toBeGreaterThan(2);
      expect(["money", "count", "ratio", "pct"], field.key).toContain(field.unit);
    }
  });
});

/* หน้าตั้งค่าจัดช่องเป็นกลุ่ม — ทุกช่องต้องอยู่ในกลุ่มพอดีหนึ่งกลุ่ม ไม่ตกหล่นและไม่ซ้ำ
   (ถ้าเพิ่มช่องใหม่แล้วลืมใส่กลุ่ม ช่องนั้นจะหายไปจากหน้าจอเงียบๆ) */
import { GOAL_FIELD_GROUPS } from "../src/modules/marketing/ads/goalOverrides.js";
describe("GOAL_FIELD_GROUPS", () => {
  it("ครอบทุกช่องพอดีหนึ่งครั้ง · เรียงตามเส้นทางลูกค้า", () => {
    const inGroups = GOAL_FIELD_GROUPS.flatMap((group) => group.fields);
    expect([...inGroups].sort()).toEqual(GOAL_EDIT_FIELDS.map((field) => field.key).sort());
    expect(new Set(inGroups).size).toBe(inGroups.length);
    expect(GOAL_FIELD_GROUPS[1].fields).toEqual(["inquiry_target", "leads_target", "deposits_target", "orders_target"]);
  });
});
