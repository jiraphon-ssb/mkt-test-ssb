import { describe, it, expect } from "vitest";
import { fmtMoney, fmtInt, fmtPct, fmtCompact, fmtNum, fmtRoas, fmtDays, lineSeries } from "../src/modules/marketing/dash/charts/theme.js";

/* กติกาโปรเจกต์: null ≠ 0 — "ไม่รู้" ต้องขึ้น "—" ห้ามกลายเป็น ฿0 บนหน้าจอ
   (พบ 16 ก.ย. 2569: ยอดขายที่ไม่รู้ขึ้น ฿0 ขณะที่ ROAS ข้างๆ ขึ้น "—" บนบรรทัดเดียวกัน) */
describe("ตัวจัดรูปแบบตัวเลขบนหน้าจอ", () => {
  it("ไม่รู้ค่า = — ทั้งเงิน จำนวน เปอร์เซ็นต์ และตัวย่อ", () => {
    for (const fn of [fmtMoney, fmtInt, fmtPct, fmtCompact]) {
      expect(fn(null)).toBe("—");
      expect(fn(undefined)).toBe("—");
      expect(fn(Number.NaN)).toBe("—");
    }
  });
  it("ศูนย์จริงยังเป็นศูนย์ ไม่ใช่ —", () => {
    expect(fmtMoney(0)).toBe("฿0.00");
    expect(fmtInt(0)).toBe("0");
  });
  /* กติกาอาร์ต 17 ก.ย. 2569: ค่าที่มีทศนิยมต้องแสดงทศนิยม ห้ามปัด — เทียบกับ Ads Manager ทีละสตางค์ได้ */
  it("เงิน = ทศนิยม 2 ตำแหน่งเสมอ · ตัดทิ้ง ไม่ปัด · มีตัวคั่นหลักพัน", () => {
    expect(fmtMoney(12345.678)).toBe("฿12,345.67");
    expect(fmtMoney(131682.33)).toBe("฿131,682.33");
    expect(fmtMoney(57035.04)).toBe("฿57,035.04");       // float จริงเก็บเป็น 57035.0399999… ต้องไม่กลายเป็น .03
    expect(fmtMoney(3300000)).toBe("฿3,300,000.00");
  });
  it("ยอดรวมจากการบวกหลายพันแถวต้องไม่หายไป 1 สตางค์ (float สะสม .3599999… — เคยขึ้น .35 หน้าหนึ่ง .36 อีกหน้า)", () => {
    const rows = Array.from({ length: 3523 }, (_, i) => (i === 0 ? 323552.36 - 0.01 * 3522 : 0.01));
    const sum = rows.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 323552.36)).toBeLessThan(1e-6);
    expect(fmtMoney(sum)).toBe("฿323,552.36");
    expect(fmtMoney(323552.36 - 3e-11)).toBe("฿323,552.36");   // เศษ float สะสมใต้สตางค์
    // ค่าจริงจากฐาน 17 ก.ย.: ค่าแอด 3,647 แถวรวมตามแคมเปญได้ 326972.32999999990 (นับเป็นสตางค์ = 326,972.33)
    expect(fmtMoney(326972.3299999999)).toBe("฿326,972.33");
    expect(fmtMoney(326972.33000000019)).toBe("฿326,972.33");
    expect(fmtNum(1.2399)).toBe("1.23");   // เศษจริงระดับ 4 ตำแหน่งยังตัดทิ้งตามกติกา
  });
  it("อัตราส่วน / เปอร์เซ็นต์ / วัน = 2 ตำแหน่งแบบตัดทิ้ง", () => {
    expect(fmtRoas(8.666)).toBe("8.66×");
    expect(fmtRoas(8.666, "x")).toBe("8.66x");
    expect(fmtPct(0.16666)).toBe("16.66%");
    expect(fmtPct(0.163)).toBe("16.30%");
    expect(fmtDays(1.999)).toBe("1.99 วัน");
    expect(fmtNum(-1.239)).toBe("-1.23");
    expect(fmtNum(1.005)).toBe("1.00");
  });
  it("จำนวนนับที่เป็นจำนวนเต็มไม่มีทศนิยม · ถ้ามีเศษ ต้องแสดงเศษ ไม่ปัด", () => {
    expect(fmtInt(2642)).toBe("2,642");
    expect(fmtInt(1234.4)).toBe("1,234.40");
  });
});

describe("lineSeries — ช่วงวันที่ยังไม่จบ (openFrom)", () => {
  const seg = (i, skip = false) => ({ p0DataIndex: i - 1, p1DataIndex: i, p0: { skip }, p1: { skip }, datasetIndex: 0, chart: { data: { datasets: [{ borderColor: "#298362" }] } } });
  it("ช่วงที่ลากเข้าจุดวันนี้ = เส้นประจาง · ช่วงก่อนหน้าเป็นเส้นทึบปกติ", () => {
    const s = lineSeries(17, { openFrom: 16 });
    expect(s.segment.borderDash(seg(16))).toEqual([2, 4]);
    expect(s.segment.borderColor(seg(16))).toBe("#29836280");
    expect(s.segment.borderDash(seg(15))).toBeUndefined();
    expect(s.segment.borderColor(seg(15))).toBeUndefined();
  });
  it("ไม่ส่ง openFrom = พฤติกรรมเดิม (ประเฉพาะช่วงที่ข้ามวันไม่มีข้อมูล)", () => {
    const s = lineSeries(17);
    expect(s.segment.borderDash(seg(16))).toBeUndefined();
    expect(s.segment.borderDash(seg(16, true))).toEqual([3, 4]);
  });
});
