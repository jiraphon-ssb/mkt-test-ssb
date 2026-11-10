/* ข้อตกลงกับ SSB PLATFORM (10 พ.ย. 69) — เป้าเดือนของ JUNTAKARN
   ท่อ ads-sync ฝั่ง platform อ่าน ad_sales_goals (brand_id = b_jt · ไม่เอา goal_source = sale_goal / sale_target เพราะเป็นเป้าที่ดึงมาจาก platform เอง)
   และ ad_sales_goal_overrides (ค่าที่คนแก้เองชนะทีละช่อง · null = ไม่ได้แก้) ด้วยคอลัมน์ชุดข้างล่าง
   ความหมาย: sales_target = เป้ายอดรวม (ทุกลูกค้า) ของช่อง Facebook + LINE ในระบบ TMK (ตอนนี้ตั้งแค่ Facebook)
             ad_budget = งบแอด Meta (Facebook + Instagram) · roas = sales_target ÷ ad_budget
             pct_ads_new = ค่าแอด ÷ ยอดลูกค้าใหม่ (สัดส่วน 0–1) มาจากที่คนตั้งเองเท่านั้น ระบบ TMK ไม่ส่งมา

   เทสนี้แดง = กำลังจะผิดข้อตกลง → แจ้งฝั่ง platform ให้แก้ท่อก่อน แล้วค่อยแก้รายการข้างล่าง
   ห้ามแก้รายการให้เทสผ่านโดยไม่แจ้ง */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { jkGoalRows } from "../supabase/functions/_shared/jkGoals.js";
import { goalRowsToSalesGoals } from "../supabase/functions/_shared/salesFacts.js";

const GOAL_READS = ["brand_id", "month", "goal_source", "sales_target", "sales_new_target", "ad_budget", "inquiry_target", "cpi", "roas", "pct_ads_new"];
const OVERRIDE_READS = GOAL_READS.filter((column) => column !== "goal_source");

const dir = new URL("../supabase/migrations/", import.meta.url);
const migrations = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()
  .map((name) => [name, readFileSync(new URL(name, dir), "utf8")]);
const sqlOf = (table) => migrations.filter(([, sql]) => sql.includes(table)).map(([, sql]) => sql).join("\n");

describe("เป้า JUNTAKARN ที่ SSB PLATFORM อ่าน", () => {
  it("ตาราง ad_sales_goals มีคอลัมน์ครบทุกตัวที่ platform อ่าน", () => {
    const sql = sqlOf("ad_sales_goals");
    for (const column of GOAL_READS) expect(sql, column).toMatch(new RegExp(`\\b${column}\\b`));
  });

  it("ตาราง ad_sales_goal_overrides มีคอลัมน์ครบทุกตัวที่ platform อ่าน", () => {
    const sql = sqlOf("ad_sales_goal_overrides");
    for (const column of OVERRIDE_READS) expect(sql, column).toMatch(new RegExp(`\\b${column}\\b`));
  });

  it("ไม่มี migration ไหนลบหรือเปลี่ยนชื่อคอลัมน์ที่ platform อ่าน", () => {
    for (const [name, sql] of migrations) {
      if (!/ad_sales_goal/.test(sql)) continue;
      for (const column of GOAL_READS) {
        expect(sql, `${name} · ${column}`).not.toMatch(new RegExp(`^\\s*(alter table[^;]*)?\\s*(drop column (if exists )?${column}\\b|rename column ${column}\\b)`, "im"));
      }
    }
  });

  it("เป้าจาก TMK: brand b_jt · goal_source tmk_month · ROAS = เป้ายอด ÷ งบแอด · ไม่เขียน pct_ads_new", () => {
    const [row] = jkGoalRows([{ month: "2026-11-01", sales_target: 350000, ad_budget: 87500, sales_target_all: 600000, ad_budget_all: 87500, has_row: true }]);
    expect(row).toMatchObject({ brand_id: "b_jt", month: "2026-11-01", goal_source: "tmk_month", sales_target: 350000, ad_budget: 87500, roas: 4 });
    expect(row.pct_ads_new ?? null).toBeNull();
    expect(row.platform_budgets).toEqual({ meta: 87500 });   // งบแอด JK = งบ Meta
  });

  it("เป้าที่ดึงมาจาก platform เอง ใช้ goal_source sale_goal / sale_target เท่านั้น (platform กรองสองค่านี้ทิ้ง กันวน)", () => {
    const out = goalRowsToSalesGoals({
      goals: [{ brand: "TD", month: "2026-11-01", version: 1, targets: { sales: 4000000 }, ads: {}, inputs: {} }],
      targets: [{ brand: "JD", month: "2026-11-01", metric: "sales", amount: 1600000 }],
    });
    expect(out.length).toBeGreaterThan(0);
    for (const goal of out) expect(["sale_goal", "sale_target"]).toContain(goal.goal_source);
  });
});
