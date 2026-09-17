import { describe, it, expect } from "vitest";
import { fmtMoney, fmtInt, fmtPct, fmtCompact, lineSeries } from "../src/modules/marketing/dash/charts/theme.js";

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
    expect(fmtMoney(0)).toBe("฿0");
    expect(fmtInt(0)).toBe("0");
  });
  it("ปัดและใส่ตัวคั่นหลักพันตามปกติ", () => {
    expect(fmtMoney(12345.6)).toBe("฿12,346");
    expect(fmtInt(1234.4)).toBe("1,234");
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
