/* หน้าต่างรายละเอียดบิล (29 ก.ย. — อาร์ต: "กดไปดูบิลนั้นๆ จะเด้งว่าใช้อะไรไปอะไรยังไงบ้าง")
   บิล 1 ใบจ่ายค่าแอดหลายวัน (alloc จาก chargeMatch) → แตกเป็นแคมเปญ → โฆษณา ตามสัดส่วนค่าแอดของแต่ละวัน
   เลขสมมุติ (repo public) */
import { describe, expect, it } from "vitest";
import { billBreakdown } from "../src/modules/marketing/ads/billDetail.js";

const card = (account, day, campaign, adId, ad, spend, extra = {}) => ({
  account_id: `act_${account}`, fact_date: day, campaign, ad_id: adId, creative: ad, ad_group: "กลุ่ม 1", metrics: { spend }, ...extra,
});
const cards = [
  card("900000001", "2026-09-01", "โปโล", "a1", "โปโลขาว", 600),
  card("900000001", "2026-09-01", "ทักแชท", "a2", "ทักเลย", 400),
  card("900000001", "2026-09-02", "โปโล", "a1", "โปโลขาว", 300, { creative_data: { media: [{ thumbnailUrl: "https://x/t.jpg" }] } }),
  card("900000001", "2026-09-02", "โปโล", "a3", "โปโลดำ", 700),
  card("900000002", "2026-09-01", "บัญชีอื่น", "b1", "อื่น", 9999),        // คนละบัญชี — ต้องไม่ปน
];

describe("billBreakdown", () => {
  // บิลจ่ายวันที่ 1 ทั้งวัน (1,000) + วันที่ 2 ครึ่งวัน (500 จาก 1,000)
  const item = { accountId: "900000001", amount: 1500, net: 1500, uncovered: 0, alloc: [{ day: "2026-09-01", amount: 1000 }, { day: "2026-09-02", amount: 500 }] };
  const b = billBreakdown({ item, cards });

  it("รายวัน: ยอดที่บิลนี้จ่าย + บอกว่าจ่ายทั้งวันหรือบางส่วน", () => {
    expect(b.days).toEqual([{ day: "2026-09-01", amount: 1000, daySpend: 1000, whole: true }, { day: "2026-09-02", amount: 500, daySpend: 1000, whole: false }]);
  });
  it("แคมเปญเรียงมาก→น้อย · แบ่งตามสัดส่วนค่าแอดของแต่ละวัน · ผลรวม = ยอดที่ครอบคลุมพอดี", () => {
    // โปโล: 600 + (300+700)×0.5 = 1,100 · ทักแชท: 400
    expect(b.campaigns.map((c) => [c.name, c.amount])).toEqual([["โปโล", 1100], ["ทักแชท", 400]]);
    expect(b.campaigns.reduce((n, c) => n + c.amount, 0)).toBe(1500);
    expect(b.campaigns[0].share).toBeCloseTo(1100 / 1500, 6);
  });
  it("ในแคมเปญแตกเป็นโฆษณา พร้อมภาพย่อ (ถ้ามี) และชื่อกลุ่มโฆษณา", () => {
    expect(b.campaigns[0].ads.map((a) => [a.name, a.amount])).toEqual([["โปโลขาว", 750], ["โปโลดำ", 350]]);
    expect(b.campaigns[0].ads[0]).toMatchObject({ adSet: "กลุ่ม 1", thumb: "https://x/t.jpg" });
    expect(b.campaigns[1].ads[0].thumb).toBeNull();
  });
  it("เศษสตางค์กระจายแบบเศษเหลือมากสุด — ผลรวมไม่ขาดไม่เกิน", () => {
    const odd = billBreakdown({ item: { ...item, amount: 1000, net: 1000, alloc: [{ day: "2026-09-01", amount: 333.33 }, { day: "2026-09-02", amount: 666.67 }] }, cards });
    expect(Math.round(odd.campaigns.reduce((n, c) => n + c.amount, 0) * 100)).toBe(100000);
    for (const c of odd.campaigns) expect(Math.round(c.ads.reduce((n, a) => n + a.amount, 0) * 100)).toBe(Math.round(c.amount * 100));
  });
  it("ยอดรวม VAT: บอกค่าแอดก่อน VAT กับ VAT ที่ Meta เก็บแยกกัน · ส่วนที่ไม่มีค่าแอดรองรับ", () => {
    const withVat = billBreakdown({ item: { ...item, amount: 1712, net: 1600, uncovered: 100 }, cards });
    expect(withVat).toMatchObject({ covered: 1500, vat: 112, uncovered: 100 });
  });
  it("ส่วนที่จับคู่วันไม่ได้ (อยู่ในเกณฑ์ปัดเศษ ไม่ใช่ตัดเกิน) ต้องบอกเป็นบรรทัดของตัวเอง — ผลรวมบรรทัด = ยอดบิล", () => {
    // จริง 29 ก.ย.: JD1 บิล 66,400.00 แต่ค่าแอดที่จับคู่ได้ 66,249.18 — ส่วนต่าง 150.82 ไม่มีที่ไปบนหน้าจอ
    const b = billBreakdown({ item: { ...item, amount: 1600.5, net: 1600.5, uncovered: 0 }, cards });
    expect(b).toMatchObject({ covered: 1500, vat: 0, uncovered: 0, unallocated: 100.5 });
    const full = billBreakdown({ item, cards });
    expect(full.unallocated).toBe(0);
  });
  it("ไม่มี alloc (บัญชีนอกระบบ / ก่อนช่วงข้อมูล) = ว่าง ไม่เดา", () => {
    const none = billBreakdown({ item: { accountId: "900000009", amount: 363.22, net: 363.22, uncovered: 363.22, alloc: [] }, cards });
    expect(none).toMatchObject({ days: [], campaigns: [], covered: 0 });
  });
  it("วันที่มี alloc แต่ไม่มีแถวค่าแอดรายโฆษณา = รวมเป็น 'ไม่ทราบแคมเปญ' ไม่ทิ้งเงิน", () => {
    const gap = billBreakdown({ item: { ...item, amount: 200, net: 200, alloc: [{ day: "2026-09-05", amount: 200 }] }, cards });
    expect(gap.campaigns).toEqual([expect.objectContaining({ name: "ไม่ทราบแคมเปญ", amount: 200 })]);
  });
});
