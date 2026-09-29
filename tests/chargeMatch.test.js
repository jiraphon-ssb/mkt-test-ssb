/* แมทรายการตัดบัตร Meta ↔ ค่าแอดที่ระบบนับ (สเปก 2026-09-26 charge-match)
   Meta ตัดบัตรเมื่อยอดถึงเพดาน → แต่ละครั้งครอบคลุมค่าแอดคร่อมวัน จึงจัดสรรค่าแอดรายวันให้รายการตามลำดับเวลา
   ตัวเลขสมมุติทั้งหมด (repo public) */
import { describe, expect, it } from "vitest";
import { matchAccountCharges, monthChargeSummary } from "../src/modules/marketing/ads/chargeMatch.js";

// ค่าแอดวันละ 1,000 ตั้งแต่ 1–10 ก.ย.
const daily = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, "0")}`, 1000]));
const ch = (date, amount, reference = `R-${date}`, extra = {}) => ({ date, amount, reference, ...extra });

describe("matchAccountCharges — จัดสรรค่าแอดให้รายการตัดตามลำดับเวลา", () => {
  it("รายการแรกย้อนกินค่าแอดถอยหลัง · รายการถัดไปกินต่อ · บอกช่วงค่าแอดที่ครอบคลุม", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-06", 3000), ch("2026-09-03", 2000)], daily, today: "2026-09-10" });
    expect(m.vatMode).toBe("excluded");
    expect(m.charges.map((c) => [c.date, c.coverFrom, c.coverTo, c.status])).toEqual([
      ["2026-09-03", "2026-09-02", "2026-09-03", "ok"],          // ย้อน 2 วันจากวันที่ตัด
      ["2026-09-06", "2026-09-04", "2026-09-06", "ok"],
    ]);
    expect(m.unbilled).toBe(4000);                                 // 7–10 ก.ย. ยังไม่ถูกตัด
    expect(m.overCount).toBe(0);
  });
  it("Meta ตัดเกินค่าแอดที่ระบบเห็น = over พร้อมยอดที่ไม่มีค่าแอดรองรับ", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-03", 3000), ch("2026-09-05", 3500)], daily, today: "2026-09-10" });
    const second = m.charges[1];
    // ถึง 5 ก.ย. ยอดตัดหลังรายการแรกเก็บได้มากสุด ค่าแอด 4–5 ก.ย. 2,000 + ทั้งวันของวันแรก 1,000 = 3,000
    // → ตัด 3,500 เกินแน่ๆ 500 (เวลาตัดในวันไม่รู้ จึงพิสูจน์ได้เท่านี้ — ทดสอบละเอียด 27 ก.ย.)
    expect(second).toMatchObject({ status: "over", covered: 3000, uncovered: 500 });
    expect(m).toMatchObject({ overCount: 1, overAmount: 500 });
  });
  it("รายการแรกที่ข้อมูลค่าแอดย้อนไม่ถึง = nodata ไม่ใช่ตัดเกิน", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-02", 5000)], daily, today: "2026-09-10" });
    expect(m.charges[0]).toMatchObject({ status: "nodata", covered: 2000, uncovered: 3000 });
    expect(m.overCount).toBe(0);
  });
  it("ตัดกลางวัน: ค่าแอดส่วนที่เหลือของวันที่ตัดไปอยู่กับรายการถัดไป", () => {
    // รายการแรก 500 < ค่าแอดวันที่ 3 (1,000) → เศษ 500 ของวันที่ 3 ยังไม่ถูกตัด
    const m = matchAccountCharges({ charges: [ch("2026-09-03", 500), ch("2026-09-05", 2500)], daily, today: "2026-09-10" });
    expect(m.charges.map((c) => c.status)).toEqual(["ok", "ok"]);
    expect(m.charges[1]).toMatchObject({ coverFrom: "2026-09-03", coverTo: "2026-09-05" });
    // 4–10 ก.ย. 7,000 + เศษของวันแรก (รายการแรก 500 เก็บวันที่ 3 ได้ไม่เกิน 500 → ค้าง 500–1,000) − รายการที่สอง 2,500
    expect([m.unbilledMin, m.unbilledMax]).toEqual([5000, 5500]);
  });
  it("VAT: ยอดเข้าได้ทั้งรวมและไม่รวม VAT (ยอดค้างก็เข้าทั้งคู่) = บอกว่าแยกไม่ออก และไม่ฟ้องตัดเกิน", () => {
    // เดิมคาดว่าเลือก included ได้ — แต่เมื่อเวลาตัดในวันไม่รู้ ตัวเลขชุดนี้อธิบายได้ทั้งสองแบบจริงๆ
    const m = matchAccountCharges({ charges: [ch("2026-09-03", 3210), ch("2026-09-06", 3210)], daily, today: "2026-09-10", balance: 4280 });
    expect(m.vatAmbiguous).toBe(true);
    expect(m.overCount).toBe(0);
  });
  it("ไฟล์มี VAT แยก = ใช้ตามไฟล์ (given)", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-03", 3210, "R1", { vat: 210 })], daily, today: "2026-09-10" });
    expect(m.vatMode).toBe("given");
    expect(m.charges[0].net).toBe(3000);
  });
  it("ยังไม่ถูกตัด เทียบยอดค้างใน Meta: ใกล้กัน = ไม่ฟ้อง · ห่าง = balanceGap", () => {
    const ok = matchAccountCharges({ charges: [ch("2026-09-06", 6000)], daily, today: "2026-09-10", balance: 3950 });
    expect(ok.unbilled).toBe(4000);
    expect(ok.balanceGap).toBe(false);                             // ต่าง 50 ≤ ฿100
    const gap = matchAccountCharges({ charges: [ch("2026-09-06", 6000)], daily, today: "2026-09-10", balance: 1000 });
    expect(gap.balanceGap).toBe(true);
    expect(matchAccountCharges({ charges: [ch("2026-09-06", 6000)], daily, today: "2026-09-10" }).balanceGap).toBeNull();
  });
  it("ไม่มีรายการตัด = ค่าแอดทั้งหมดยังไม่ถูกตัด", () => {
    const m = matchAccountCharges({ charges: [], daily, today: "2026-09-10" });
    expect(m).toMatchObject({ unbilled: 10000, overCount: 0, charges: [] });
  });
});

describe("monthChargeSummary — แถวรายเดือน", () => {
  it("รวมยอดที่ตัดในเดือน · ตัดเกิน = review · ไม่มีรายการ = nocharges", () => {
    const m = matchAccountCharges({ charges: [ch("2026-08-31", 1000), ch("2026-09-03", 3000), ch("2026-09-05", 3500)], daily, today: "2026-09-10" });
    const sep = monthChargeSummary(m, "2026-09", { current: false });
    expect(sep).toMatchObject({ charged: 6500, count: 2, overCount: 1, status: "review" });
    const oct = monthChargeSummary(m, "2026-10", { current: false });
    expect(oct).toMatchObject({ charged: 0, count: 0, status: "nocharges" });
  });
  it("เดือนปัจจุบัน: ยอดค้างไม่ตรง = review · ปกติ = match", () => {
    const good = matchAccountCharges({ charges: [ch("2026-09-06", 6000)], daily, today: "2026-09-10", balance: 4000 });
    expect(monthChargeSummary(good, "2026-09", { current: true }).status).toBe("match");
    const bad = matchAccountCharges({ charges: [ch("2026-09-06", 6000)], daily, today: "2026-09-10", balance: 500 });
    expect(monthChargeSummary(bad, "2026-09", { current: true }).status).toBe("review");
    expect(monthChargeSummary(bad, "2026-09", { current: false }).status).toBe("match");   // เดือนเก่าไม่มียอดค้างให้เทียบ
  });
});

/* ชุด D (ตรวจรอบละเอียด 26 ก.ย.) — เคสที่ agent พิสูจน์ว่าเตือน "ตัดเกิน" ผิด หรือเดา VAT ผิด */
describe("matchAccountCharges — กรณีขอบ", () => {
  it("ตัดบัตร 2 ครั้งวันเดียว: ผลเหมือนกันไม่ว่าแถวมาลำดับไหน และไม่ฟ้องตัดเกิน", () => {
    const a = matchAccountCharges({ charges: [ch("2026-09-03", 1000, "b"), ch("2026-09-03", 2000, "a")], daily, today: "2026-09-10" });
    const b = matchAccountCharges({ charges: [ch("2026-09-03", 2000, "a"), ch("2026-09-03", 1000, "b")], daily, today: "2026-09-10" });
    expect(a.charges.map((c) => c.status)).toEqual(["ok", "ok"]);
    expect(a.charges.map((c) => [c.reference, c.status, c.coverFrom, c.coverTo])).toEqual(b.charges.map((c) => [c.reference, c.status, c.coverFrom, c.coverTo]));
    expect(a.unbilled).toBe(7000);
  });
  it("ตัดวันนี้ แต่ค่าแอดวันนี้ยังดึงไม่เข้า = รอค่าแอด (pending) ไม่ใช่ตัดเกิน", () => {
    const upTo9 = Object.fromEntries(Object.entries(daily).filter(([d]) => d <= "2026-09-09"));
    // วันที่ 10 ยังไม่มีค่าแอด: ยอดตัด 6,000 เกินที่เก็บได้ถึงวันที่ 9 (4,000 + 1,000) → รอ ไม่ใช่ตัดเกิน
    const m = matchAccountCharges({ charges: [ch("2026-09-05", 5000), ch("2026-09-10", 6000)], daily: upTo9, today: "2026-09-10" });
    expect(m.charges[1].status).toBe("pending");
    expect(m.overCount).toBe(0);
  });
  it("รายการก่อนช่วงข้อมูลค่าแอด: รายการแรกที่มีข้อมูลเริ่มย้อนใหม่ ไม่ฟ้องตัดเกิน", () => {
    const m = matchAccountCharges({ charges: [ch("2026-08-20", 3000), ch("2026-09-04", 3000)], daily, today: "2026-09-10" });
    expect(m.charges.map((c) => c.status)).toEqual(["nodata", "ok"]);
    expect(m.charges[1]).toMatchObject({ coverFrom: "2026-09-02", coverTo: "2026-09-04" });
  });
  it("เลขอ้างอิงซ้ำ (นำเข้าไฟล์ซ้ำ) นับครั้งเดียว", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-03", 3000, "T1"), ch("2026-09-03", 3000, "T1")], daily, today: "2026-09-10" });
    expect(m.charges).toHaveLength(1);
    expect(m.overCount).toBe(0);
  });
  it("VAT: ตัดกลางวันปกติ (ไม่รวม VAT) ต้องได้ excluded ไม่ใช่ included", () => {
    // ตัดกลางวัน 5 ก.ย. ฿1,500 (ค่าแอด 4 ก.ย. เต็มวัน + ครึ่งวันที่ 5)
    expect(matchAccountCharges({ charges: [ch("2026-09-03", 3000), ch("2026-09-05", 1500)], daily, today: "2026-09-10" }).vatMode).toBe("excluded");
  });
  it("VAT ห้ามบังการตัดเกิน: ตัดเกินเกินที่รวม VAT จะอธิบายได้ ต้องฟ้อง", () => {
    // ถึง 6 ก.ย. เก็บได้มากสุด 3,000 + 1,000 = 4,000 · 4,500 ÷ 1.07 = 4,205.60 ก็ยังเกิน → ไม่ใช่เรื่อง VAT
    const m = matchAccountCharges({ charges: [ch("2026-09-03", 3000), ch("2026-09-06", 4500)], daily, today: "2026-09-10" });
    expect(m.vatMode).toBe("excluded");
    expect(m.overCount).toBe(1);
  });
  it("ยอดว่างไม่กลายเป็นรายการ ฿0 · VAT ว่าง = ไม่รู้ (ไม่เปลี่ยนเป็นโหมด given)", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-03", null, "X"), ch("2026-09-03", 3000, "T1", { vat: "" })], daily, today: "2026-09-10" });
    expect(m.charges).toHaveLength(1);
    expect(m.vatMode).not.toBe("given");
  });
  it("ทศนิยมลอย: 1,070 รวม VAT = สุทธิ 1,000 พอดี (ไม่ใช่ 999.999…)", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-01", 1070, "T1", { vat: 70 })], daily, today: "2026-09-10" });
    expect(m.charges[0].net).toBe(1000);
    const d30 = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, "0")}`, 1000]));
    const inc = matchAccountCharges({ charges: ["05", "10", "15", "20", "25"].map((d, i) => ch(`2026-09-${d}`, 5350, `v${i}`)), daily: d30, today: "2026-09-30", dataThrough: "2026-09-30", balance: 5350 });
    expect(inc.vatMode).toBe("included");
    expect(inc.charges[0].net).toBe(5000);                          // 5,350 ÷ 1.07 = 5,000 พอดี ไม่ใช่ 4,999.999…
  });
});

/* ทดสอบละเอียด 27 ก.ย. (agent พิสูจน์ + ผมพิสูจน์ซ้ำ): จัดสรรรายวันเดาเวลาตัดในวันไม่ได้ → เตือนตัดเกินผิด
   แก้เป็นเทียบยอดสะสม: รายการหลังรายการแรกต้องไม่เกิน "ค่าแอดหลังวันแรกถึงสิ้นวันที่ตัด + ค่าแอดทั้งวันของวันแรก"
   (รายการแรกตัดตอนไหนของวันไม่รู้ ค่าแอดที่เหลือของวันนั้นอยู่ได้ตั้งแต่ 0 ถึงทั้งวัน) */
describe("เทียบยอดสะสม — ไม่เตือนผิดเมื่อเวลาตัดในวันไม่รู้", () => {
  it("Meta ตัดทุก ฿1,500 ขณะใช้วันละ ฿1,000 = ไม่ตัดเกิน", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-02", 1500, "a"), ch("2026-09-03", 1500, "b")], daily, today: "2026-09-10" });
    expect(m.charges.map((c) => c.status)).toEqual(["ok", "ok"]);
    expect(m.overCount).toBe(0);
  });
  it("บัญชีรวม VAT ตัดหลายครั้ง: ไม่เตือนตัดเกิน", () => {
    const d5 = Object.fromEntries(Object.keys(daily).map((d) => [d, 5000]));
    const charges = ["02", "03", "05", "06"].map((d, i) => ch(`2026-09-${d}`, 8025, `r${i}`));
    expect(matchAccountCharges({ charges, daily: d5, today: "2026-09-10" }).overCount).toBe(0);
  });
  it("ตัดเกินเกินกว่าที่ค่าแอดทั้งวันของวันแรกจะอธิบายได้ = เตือน พร้อมยอดที่พิสูจน์ได้", () => {
    // หลังรายการแรก (3 ก.ย.) ถึง 5 ก.ย. มีค่าแอดได้มากสุด 2,000 + 1,000 = 3,000 → ตัด 4,000 เกินแน่ๆ 1,000
    const m = matchAccountCharges({ charges: [ch("2026-09-03", 3000), ch("2026-09-05", 4000)], daily, today: "2026-09-10" });
    expect(m.charges[1]).toMatchObject({ status: "over", uncovered: 1000 });
    expect(m).toMatchObject({ overCount: 1, overAmount: 1000 });
  });
  it("VAT: ตัดรวม 7% ต่อเนื่อง — ยอดค้างยืนยัน = included · ไม่มียอดค้าง = แยกไม่ออก (ห้ามเดา) แต่ไม่เตือนแดง", () => {
    // ยอดอย่างเดียวแยก "รวม VAT" ออกจาก "ตัดเกิน ~7% ทุกครั้ง" ไม่ได้ (ทดสอบละเอียดรอบ 2) → ต้องมียอดค้างใน Meta ยืนยัน
    const d30 = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, "0")}`, 1000]));
    const charges = ["05", "10", "15", "20", "25"].map((d, i) => ch(`2026-09-${d}`, 5350, `v${i}`));
    const withBal = matchAccountCharges({ charges, daily: d30, today: "2026-09-30", dataThrough: "2026-09-30", balance: 5350 });
    expect(withBal.vatMode).toBe("included");
    expect(withBal.overCount).toBe(0);
    const noBal = matchAccountCharges({ charges, daily: d30, today: "2026-09-30" });
    expect(noBal.vatAmbiguous).toBe(true);
    expect(noBal.overCount).toBe(0);
    expect(noBal.charges.some((c) => c.status === "vatcheck")).toBe(true);   // เหลือง: ถ้าไม่คิด VAT แปลว่าตัดเกิน
  });
  it("ยังไม่ถูกตัดเป็นช่วง (ไม่รู้เวลาตัดของรายการแรก) · ยอดค้างอยู่ในช่วง = ไม่ฟ้อง", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-06", 6000)], daily, today: "2026-09-10", balance: 4500 });
    expect([m.unbilledMin, m.unbilledMax]).toEqual([4000, 5000]);   // 7–10 ก.ย. + เศษของวันที่ 6 (0–1,000)
    expect(m.balanceGap).toBe(false);
  });
  it("ยอดเกินแสดงในฐานเดียวกับยอดที่ตัด (รวม VAT ตามไฟล์)", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-03", 3210, "g1", { vat: 210 }), ch("2026-09-05", 5350, "g2", { vat: 350 })], daily, today: "2026-09-10" });
    // สุทธิ 5,000 เทียบค่าแอดได้มากสุด 3,000 → เกินสุทธิ 2,000 = รวม VAT 2,140
    expect(m.charges[1]).toMatchObject({ status: "over", uncovered: 2000, uncoveredGross: 2140 });
    expect(m.overAmount).toBe(2140);
  });
});

/* ทดสอบละเอียด 27 ก.ย. + อาร์ตอนุญาตแก้คำสั่งอ่าน: โหลดเฉพาะเดือนที่ดู → รายการแรกของเดือนย้อนไปกินค่าแอดเดือนก่อน
   (ตัด 20,000 วันที่ 5 ก.ย. ขึ้น "ครอบคลุม 17 ส.ค. – 5 ก.ย.") จึงจับตัดเกินของรายการนั้นไม่ได้ → โหลดย้อน 2 เดือนเป็นจุดตั้งต้น */
import { chargeWindow } from "../src/modules/marketing/ads/chargeMatch.js";
describe("chargeWindow — ช่วงวันที่โหลดรายการตัดบัตร", () => {
  it("ย้อน 2 เดือนก่อนเดือนที่ดู ถึงก่อนวันแรกของเดือนถัดไป · ข้ามปีได้", () => {
    expect(chargeWindow("2026-09-01")).toEqual({ from: "2026-07-01", before: "2026-10-01" });
    expect(chargeWindow("2026-01-01")).toEqual({ from: "2025-11-01", before: "2026-02-01" });
  });
  it("รายการเดือนก่อนเป็นจุดตั้งต้น → รายการแรกของเดือนนี้ตรวจตัดเกินได้", () => {
    const aug = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`2026-08-${String(i + 1).padStart(2, "0")}`, 1000]));
    const m = matchAccountCharges({ charges: [ch("2026-08-31", 1000, "A"), ch("2026-09-05", 20000, "B")], daily: { ...aug, ...daily }, today: "2026-09-10" });
    expect(m.charges[1].status).toBe("over");          // 31 ส.ค. → 5 ก.ย. เก็บได้มากสุด 5,000 + 1,000 = 6,000
  });
});

/* ทดสอบละเอียดรอบ 2 (agent จำลองการตัดบัตร 17,282 เคส) — บั๊กจากการเดา VAT + ยอดค้างช่วงข้อมูลยังดึงไม่ครบ */
describe("เดา VAT ต้องไม่เตือนผิด และไม่บังการตัดเกิน", () => {
  it("CE1: บัญชีรวม VAT แยกไม่ออก → ไม่ขึ้นตัดเกินแดง (ขึ้นแค่ 'เกินถ้าไม่คิด VAT')", () => {
    const m = matchAccountCharges({ charges: ["01", "02", "03"].map((d, i) => ch(`2026-09-${d}`, 1070, `r${i}`)),
      daily: { "2026-09-01": 0, "2026-09-02": 1000, "2026-09-03": 1500, "2026-09-04": 0 }, today: "2026-09-04", dataThrough: "2026-09-04" });
    expect(m.overCount).toBe(0);
    expect(m.charges.some((c) => c.status === "over")).toBe(false);
  });
  it("CE2: บัญชีไม่รวม VAT ตัดเกิน 3,000 → ห้ามเดาว่า 'รวม VAT' แล้วเงียบ — อย่างน้อยต้องขึ้น 'เกินถ้าไม่คิด VAT'", () => {
    const days = ["01", "02", "03", "04", "05", "06"].map((d) => `2026-09-${d}`);
    const daily6 = Object.fromEntries(days.map((d, i) => [d, i === 0 ? 0 : 10000]).concat([["2026-09-07", 0]]));
    const m = matchAccountCharges({ charges: days.map((d, i) => ch(d, i === 5 ? 13000 : 10000, `R${i}`)), daily: daily6, today: "2026-09-07", dataThrough: "2026-09-07" });
    expect(m.vatMode).not.toBe("included");
    expect(m.charges.some((c) => c.status === "over" || c.status === "vatcheck")).toBe(true);
  });
  it("ยอดค้างเทียบได้เฉพาะขั้นต่ำเมื่อค่าแอดวันล่าสุดยังดึงไม่ครบ (CE3 เคยขึ้นเหลืองผิด)", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-01", 5000, "A"), ch("2026-09-03", 5000, "B")],
      daily: { "2026-09-01": 1000, "2026-09-02": 4000, "2026-09-03": 3000 }, today: "2026-09-04", dataThrough: "2026-09-03", balance: 4000 });
    expect(m.unbilledMax).toBeNull();          // วันที่ยังไม่ดึง = ไม่รู้เพดาน
    expect(m.balanceGap).toBe(false);
  });
  it("เลขอ้างอิงเดียวกันแต่ยอดต่างกัน = ไม่ขึ้นกับลำดับแถว (เก็บทั้งคู่ให้คนเห็น)", () => {
    const d2 = { "2026-09-01": 1000, "2026-09-02": 1000 };
    const a = [ch("2026-09-01", 1000, "X"), ch("2026-09-02", 100, "Y"), ch("2026-09-02", 900, "Y")];
    const r1 = matchAccountCharges({ charges: a, daily: d2, today: "2026-09-03" });
    const r2 = matchAccountCharges({ charges: [a[0], a[2], a[1]], daily: d2, today: "2026-09-03" });
    expect(r1.charges.map((c) => [c.amount, c.status])).toEqual(r2.charges.map((c) => [c.amount, c.status]));
    expect(r1.charges).toHaveLength(3);
  });
  it("monthChargeSummary รับเดือนที่ไม่เติมเลข 0 หรือ Date ได้ถูก", () => {
    const m = matchAccountCharges({ charges: [ch("2026-01-05", 20), ch("2026-10-05", 40), ch("2026-11-01", 50)], daily: { "2025-12-01": 1000 }, today: "2026-12-01" });
    expect(monthChargeSummary(m, "2026-1").charged).toBe(20);
    expect(monthChargeSummary(m, new Date(Date.UTC(2026, 0, 15))).charged).toBe(20);
  });
});

/* 29 ก.ย. — หน้าต่างรายละเอียดบิล + สมการกระทบยอด: แต่ละรายการต้องบอกว่าจ่ายค่าแอดวันไหนเท่าไร (ยอดก่อน VAT) */
describe("alloc — ค่าแอดรายวันที่แต่ละรายการจ่าย", () => {
  it("รายการแรกย้อน · รายการถัดไปต่อ · เรียงวันเก่า→ใหม่ · ผลรวม = covered", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-06", 3000), ch("2026-09-03", 2000)], daily, today: "2026-09-10" });
    expect(m.charges[0].alloc).toEqual([{ day: "2026-09-02", amount: 1000 }, { day: "2026-09-03", amount: 1000 }]);
    expect(m.charges[1].alloc).toEqual([{ day: "2026-09-04", amount: 1000 }, { day: "2026-09-05", amount: 1000 }, { day: "2026-09-06", amount: 1000 }]);
  });
  it("ตัดกลางวัน: วันเดียวแบ่งให้สองรายการ", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-03", 500), ch("2026-09-05", 2500)], daily, today: "2026-09-10" });
    expect(m.charges[0].alloc).toEqual([{ day: "2026-09-03", amount: 500 }]);
    expect(m.charges[1].alloc).toEqual([{ day: "2026-09-03", amount: 500 }, { day: "2026-09-04", amount: 1000 }, { day: "2026-09-05", amount: 1000 }]);
  });
  it("ยอดรวม VAT: alloc เป็นยอดก่อน VAT (net)", () => {
    const m = matchAccountCharges({ charges: [ch("2026-09-02", 2140, "A", { vat: 140 })], daily, today: "2026-09-10" });
    expect(m.charges[0].alloc).toEqual([{ day: "2026-09-01", amount: 1000 }, { day: "2026-09-02", amount: 1000 }]);
    expect(m.charges[0].net).toBe(2000);
  });
  it("ก่อนช่วงข้อมูล = alloc ว่าง", () => {
    const m = matchAccountCharges({ charges: [ch("2026-08-20", 700)], daily, today: "2026-09-10" });
    expect(m.charges[0].alloc).toEqual([]);
  });
});
