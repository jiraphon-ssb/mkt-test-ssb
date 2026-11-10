/* ข้อตกลงกับ SSB PLATFORM (10 พ.ย. 69) — ยอดขาย JUNTAKARN
   ท่อ ads-sync ฝั่ง platform อ่าน business_daily_facts ตรง (brand_id = b_jt · source = tmk) ด้วยคอลัมน์ชุด PLATFORM_READS
   ตัวเลขชุดนี้ต้องคงความหมายเดิม: วันของยอด = วันออเดอร์ · ยอดขาย = ออเดอร์แชทที่ไม่ยกเลิก · แถวมีครบทุกวันในช่วงที่ดึง

   เทสนี้แดง = กำลังจะผิดข้อตกลง → แจ้งฝั่ง platform ให้แก้ท่อก่อน แล้วค่อยแก้รายการข้างล่าง
   ห้ามแก้รายการให้เทสผ่านโดยไม่แจ้ง */
import { describe, expect, it } from "vitest";
import { JK_BRAND_ID, JK_SOURCE, jkRowsToDailyFacts } from "../supabase/functions/_shared/jkFacts.js";

const PLATFORM_READS = [
  "fact_date", "inquiries", "inquiry_filled", "orders", "orders_new",
  "gross_revenue", "revenue_new", "cancelled", "cancelled_value",
];
const row = { day: "2026-11-02", inquiries: 40, inq_by_channel: { Facebook: 40 }, inquiry_filled: true, orders: 6, orders_new: 4, sales: 12500.5, sales_new: 8000, ord_by_channel: { Facebook: 6 }, cancelled: 1, cancelled_value: 900 };

describe("ยอดขาย JUNTAKARN ที่ SSB PLATFORM อ่าน", () => {
  const out = jkRowsToDailyFacts([row], { from: "2026-11-01", to: "2026-11-03" });

  it("แบรนด์และแหล่งที่ platform กรองยังเป็นค่าเดิม", () => {
    expect(JK_BRAND_ID).toBe("b_jt");
    expect(JK_SOURCE).toBe("tmk");
    for (const fact of out) expect(fact).toMatchObject({ brand_id: "b_jt", source: "tmk" });
  });

  it("มีคอลัมน์ครบทุกตัวที่ platform อ่าน", () => {
    for (const column of PLATFORM_READS) expect(out[0], column).toHaveProperty(column);
  });

  it("ตัวเลขลงคอลัมน์ตามความหมายที่ตกลง", () => {
    const day = out.find((fact) => fact.fact_date === "2026-11-02");
    expect(day).toMatchObject({ inquiries: 40, inquiry_filled: true, orders: 6, orders_new: 4, gross_revenue: 12500.5, revenue_new: 8000, cancelled: 1, cancelled_value: 900 });
  });

  it("วันที่ไม่มีเหตุการณ์ยังมีแถว (ยอด 0) และคนทักที่ไม่ได้กรอกบอกด้วย inquiry_filled = false", () => {
    expect(out.map((fact) => fact.fact_date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(out[0]).toMatchObject({ orders: 0, gross_revenue: 0, inquiry_filled: false });
  });
});
