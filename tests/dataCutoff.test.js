/* ตรวจรอบ 28 ก.ย. (หลังเที่ยงคืน): ช่วง "ล่าสุด/นี้" นับวันที่ข้อมูลยังไม่มา แต่ช่วงเทียบเป็นวันครบ
   → เดือนนี้ขึ้น ▼5.60% ทั้งที่เทียบวันตรงกันจริง ▲0.51% · 7 วันล่าสุด มีข้อมูล 5 วันเทียบ 7 วัน ▼28.53%
   → ช่วงสำเร็จรูปแบบนับถึงปัจจุบันต้องจบที่วันที่มีข้อมูล (through) แล้วช่วงเทียบคิดจากช่วงนั้น */
import { describe, expect, it } from "vitest";
import { compareRange, dataCutoff, isoDay, periodRange, sameDatesLastMonth } from "../src/modules/marketing/adsScope.js";

const NOW = new Date("2026-09-28T12:00:00");   // จันทร์
const days = (r) => [isoDay(new Date(r.start)), isoDay(new Date(new Date(r.end).getTime() - 1))];

describe("periodRange — จบที่วันที่มีข้อมูล", () => {
  it("7/14/30 วันล่าสุด = N วันที่จบที่ through (ไม่ใช่วันนี้)", () => {
    expect(days(periodRange("7d", null, null, NOW, "2026-09-26"))).toEqual(["2026-09-20", "2026-09-26"]);
    expect(days(periodRange("14d", null, null, NOW, "2026-09-26"))).toEqual(["2026-09-13", "2026-09-26"]);
    expect(days(periodRange("30d", null, null, NOW, "2026-09-26"))).toEqual(["2026-08-28", "2026-09-26"]);
  });
  it("เดือนนี้ = 1 ถึง through · ช่วงเทียบเดือนก่อนตรงวัน (1–26 ส.ค.)", () => {
    const m = periodRange("mtd", null, null, NOW, "2026-09-26");
    expect(days(m)).toEqual(["2026-09-01", "2026-09-26"]);
    expect(days(sameDatesLastMonth(m))).toEqual(["2026-08-01", "2026-08-26"]);
  });
  it("สัปดาห์นี้: เริ่มจันทร์เหมือนเดิม จบที่ through · through ก่อนวันจันทร์ = ช่วงว่าง", () => {
    const wed = new Date("2026-09-30T12:00:00");
    expect(days(periodRange("wtd", null, null, wed, "2026-09-29"))).toEqual(["2026-09-28", "2026-09-29"]);
    const empty = periodRange("wtd", null, null, NOW, "2026-09-26");
    expect(empty.start).toBe(empty.end);
  });
  it("ช่วงเทียบ 'ช่วงก่อน' ของ 7 วัน = 7 วันก่อนหน้าช่วงที่ตัดแล้ว", () => {
    expect(days(compareRange("7d", periodRange("7d", null, null, NOW, "2026-09-26"), "previous"))).toEqual(["2026-09-13", "2026-09-19"]);
  });
  it("วันนี้ · เมื่อวาน · สัปดาห์ก่อน · เดือนก่อน · กำหนดเอง ไม่เปลี่ยน", () => {
    for (const key of ["today", "yesterday", "lastWeek", "lastMonth"]) expect(periodRange(key, null, null, NOW, "2026-09-26")).toEqual(periodRange(key, null, null, NOW));
    expect(periodRange("custom", "2026-09-01", "2026-09-28", NOW, "2026-09-26")).toEqual(periodRange("custom", "2026-09-01", "2026-09-28", NOW));
  });
  it("through ไม่ส่ง หรือถึงวันนี้แล้ว = เหมือนเดิม", () => {
    expect(periodRange("7d", null, null, NOW, null)).toEqual(periodRange("7d", null, null, NOW));
    expect(periodRange("7d", null, null, NOW, "2026-09-28")).toEqual(periodRange("7d", null, null, NOW));
  });
});

describe("dataCutoff — วันสุดท้ายที่ใช้คิด (หลักเดียวกับนาฬิกาจังหวะ)", () => {
  it("ข้อมูลถึงเมื่อวาน/วันนี้ = เมื่อวาน (วันนี้ยังไม่จบ)", () => {
    expect(dataCutoff("2026-09-28", "2026-09-27")).toBe("2026-09-27");
    expect(dataCutoff("2026-09-28", "2026-09-28")).toBe("2026-09-27");
  });
  it("หลังเที่ยงคืนก่อนรอบตี 5 = วันที่มีข้อมูล · ค้างนานกว่านั้น (ท่อพัง) ถอยไม่เกิน 1 วัน", () => {
    expect(dataCutoff("2026-09-28", "2026-09-26")).toBe("2026-09-26");
    expect(dataCutoff("2026-09-28", "2026-09-20")).toBe("2026-09-26");
  });
  it("ไม่รู้ว่าข้อมูลถึงไหน (ข้อมูลตัวอย่าง) = null ไม่ตัด", () => {
    expect(dataCutoff("2026-09-28", null)).toBeNull();
  });
});

/* รีวิวโค้ด 28 ก.ย.: setMonth(-1) ล้นเมื่อวันท้ายช่วงเกินจำนวนวันของเดือนก่อน
   1–30 มี.ค. เคยเทียบกับ 1 ก.พ.–2 มี.ค. (นับ 1–2 มี.ค. ซ้ำทั้งสองฝั่ง) → ตัดวันท้ายให้อยู่ในเดือนก่อน */
describe("sameDatesLastMonth — ไม่ล้นเข้าเดือนนี้", () => {
  const r = (a, b) => ({ start: new Date(`${a}T00:00:00`).toISOString(), end: new Date(new Date(`${b}T00:00:00`).getTime() + 86_400_000).toISOString() });
  it("1–30 มี.ค. → 1–28 ก.พ. · 1–31 มี.ค. → 1–28 ก.พ. · 1–26 ก.ย. → 1–26 ส.ค.", () => {
    expect(days(sameDatesLastMonth(r("2027-03-01", "2027-03-30")))).toEqual(["2027-02-01", "2027-02-28"]);
    expect(days(sameDatesLastMonth(r("2027-03-01", "2027-03-31")))).toEqual(["2027-02-01", "2027-02-28"]);
    expect(days(sameDatesLastMonth(r("2026-09-01", "2026-09-26")))).toEqual(["2026-08-01", "2026-08-26"]);
  });
  it("ช่วงข้ามเดือน (30 วันล่าสุด 29 ส.ค.–27 ก.ย.) → 29 ก.ค.–27 ส.ค. · วันเริ่ม 31 ในเดือนสั้นตัดเป็นวันสุดท้าย", () => {
    expect(days(sameDatesLastMonth(r("2026-08-29", "2026-09-27")))).toEqual(["2026-07-29", "2026-08-27"]);
    expect(days(sameDatesLastMonth(r("2027-03-31", "2027-04-29")))).toEqual(["2027-02-28", "2027-03-29"]);
  });
});

/* รีวิวโค้ด 28 ก.ย.: เดาวันที่ข้อมูลครบจาก "วันล่าสุดที่มีค่าแอด > 0" ผิดเมื่อเมื่อวานทุกบัญชีหยุด (ใช้เงิน ฿0 จริง)
   → ข้อมูลครบถึงวันก่อนรอบดึงสำเร็จล่าสุด (เวลาไทย) */
import { syncedThrough } from "../src/modules/marketing/adsScope.js";
describe("syncedThrough — ข้อมูลครบถึงวันก่อนรอบดึงสำเร็จ", () => {
  it("ดึงสำเร็จ 28 ก.ย. 05:20 (ไทย) = ข้อมูลครบถึง 27 · ดึงเมื่อ 27 ก.ย. 05:20 = ถึง 26 · ไม่รู้ = null", () => {
    expect(syncedThrough("2026-09-27T22:20:00Z")).toBe("2026-09-27");
    expect(syncedThrough("2026-09-26T22:20:00Z")).toBe("2026-09-26");
    expect(syncedThrough(null)).toBeNull();
    expect(syncedThrough("x")).toBeNull();
  });
});
