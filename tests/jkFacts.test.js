/* JK (JUNTAKARN) — แถวสรุปรายวันจากระบบ TMK → business_daily_facts
   นับเฉพาะออเดอร์ช่องแชท · วันของยอด = วันออเดอร์ · funnel 2 ขั้น (คนทัก → ยืนยันออเดอร์) */
import { describe, it, expect } from "vitest";
import { JK_BRAND_ID, JK_SOURCE, JK_CHANNEL_KEYS, jkRowsToDailyFacts, jkExtraColumns, jkCoveredDays } from "../supabase/functions/_shared/jkFacts.js";

const row = (patch = {}) => ({
  day: "2026-09-02", inquiries: 30, inq_by_channel: { Facebook: 20, LINE: 10 }, inquiry_filled: true,
  orders: 4, orders_new: 3, sales: 52000, sales_new: 40000, ord_by_channel: { Facebook: 3, LINE: 1 },
  cancelled: 1, cancelled_value: 1500, ...patch,
});

describe("jkRowsToDailyFacts", () => {
  it("แถวหนึ่งวัน → แถว business_daily_facts ของ b_jt ครบทุกช่องที่ใช้จริง", () => {
    const [out] = jkRowsToDailyFacts([row()], { from: "2026-09-02", to: "2026-09-02" });
    expect(out).toEqual({
      brand_id: "b_jt", fact_date: "2026-09-02", source: "tmk", external_record_id: "JK|2026-09-02",
      inquiries: 30, inquiries_by_channel: { Facebook: 20, LINE: 10 }, inquiry_filled: true,
      channel_funnel: { Facebook: { inquiries: 20, leads: 0, deposits: 0, orders: 3 }, LINE: { inquiries: 10, leads: 0, deposits: 0, orders: 1 } },
      qualified_leads: 0, leads_new: 0, deposits: 0, deposit_value: 0,
      orders: 4, orders_new: 3, gross_revenue: 52000, revenue_new: 40000,
      refunds: 0, cash_received: 0, cancelled: 1, cancelled_value: 1500,
    });
    expect(JK_BRAND_ID).toBe("b_jt");
    expect(JK_SOURCE).toBe("tmk");
  });

  it("วันที่ไม่มีแถวจาก RPC = แถว 0 (ยอดแก้ย้อนหลังได้ ต้องทับทั้งช่วง ไม่ใช่เว้นวัน)", () => {
    const out = jkRowsToDailyFacts([row({ day: "2026-09-03" })], { from: "2026-09-02", to: "2026-09-04" });
    expect(out.map((r) => r.fact_date)).toEqual(["2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(out[0]).toMatchObject({ orders: 0, gross_revenue: 0, inquiries: 0, inquiry_filled: false, channel_funnel: {} });
  });

  it("ปัดเศษเงินเป็นสตางค์ · ค่าติดลบ/ไม่ใช่ตัวเลขเป็น 0 · วันนอกช่วงถูกทิ้ง", () => {
    const out = jkRowsToDailyFacts([
      row({ day: "2026-09-02", sales: 1234.567, sales_new: -5, orders: "3", cancelled_value: null }),
      row({ day: "2026-08-31" }),
    ], { from: "2026-09-02", to: "2026-09-02" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ gross_revenue: 1234.57, revenue_new: 0, orders: 3, cancelled_value: 0 });
  });

  it("ช่วงวันไม่ถูกต้อง = []", () => {
    expect(jkRowsToDailyFacts([row()], { from: "2026-09-05", to: "2026-09-01" })).toEqual([]);
    expect(jkRowsToDailyFacts([row()], {})).toEqual([]);
  });
});

describe("jkExtraColumns — ข้อมูลลูกค้าห้ามข้ามระบบ", () => {
  it("คอลัมน์นอกรายการที่อนุญาต ต้องถูกรายงานกลับ (เรียงชื่อ)", () => {
    expect(jkExtraColumns([row({ customer_name: "คุณเอ", order_no: "SO-1" })])).toEqual(["customer_name", "order_no"]);
    // เวลาตอบแชทเฉลี่ยยังไม่ได้ใช้ จึงไม่ได้ขอ — ถ้าปลายทางส่งมาต้องนับเป็นคอลัมน์เกิน (ขอเท่าที่ใช้จริง)
    expect(jkExtraColumns([row({ avg_reply_minutes: 12 })])).toEqual(["avg_reply_minutes"]);
    expect(jkExtraColumns([row()])).toEqual([]);
  });
});

describe("ชื่อช่องทาง — กันข้อความอิสระจากฝั่ง TMK (ช่อง channel แก้มือได้ อาจมีชื่อ/เบอร์ลูกค้า)", () => {
  it("ช่องทางนอกรายการรวมเข้า 'อื่นๆ' ไม่เอาข้อความดิบมาเป็น key", () => {
    const [out] = jkRowsToDailyFacts([row({
      inq_by_channel: { Facebook: 5, "คุณสมชาย 081-234-5678": 7 },
      ord_by_channel: { "LINE @somchai (SO-1042)": 2, LINE: 1 },
    })], { from: "2026-09-02", to: "2026-09-02" });
    expect(out.inquiries_by_channel).toEqual({ Facebook: 5, other: 7 });
    expect(out.channel_funnel).toEqual({
      Facebook: { inquiries: 5, leads: 0, deposits: 0, orders: 0 },
      other: { inquiries: 7, leads: 0, deposits: 0, orders: 2 },
      LINE: { inquiries: 0, leads: 0, deposits: 0, orders: 1 },
    });
    expect(JK_CHANNEL_KEYS).toContain("Facebook");
    expect(JK_CHANNEL_KEYS).toContain("LINE");
  });
  it("ช่องทางที่ไม่รู้จักหลายชื่อรวมยอดกัน ไม่ทิ้ง", () => {
    const [out] = jkRowsToDailyFacts([row({ inq_by_channel: { xxx: 3, yyy: 4 }, ord_by_channel: {} })], { from: "2026-09-02", to: "2026-09-02" });
    expect(out.inquiries_by_channel).toEqual({ other: 7 });
  });
});

describe("jkCoveredDays — กันเขียนศูนย์ทับของจริงเมื่อบางก้อนคืนค่าว่าง", () => {
  it("นับเฉพาะวันในช่วงที่ปลายทางคืนมาจริง", () => {
    expect(jkCoveredDays([row({ day: "2026-09-02" }), row({ day: "2026-09-02" }), row({ day: "2026-09-03" })], { from: "2026-09-01", to: "2026-09-03" })).toBe(2);
    expect(jkCoveredDays([row({ day: "2026-08-31" })], { from: "2026-09-01", to: "2026-09-03" })).toBe(0);
    expect(jkCoveredDays([], { from: "2026-09-01", to: "2026-09-03" })).toBe(0);
  });
});
