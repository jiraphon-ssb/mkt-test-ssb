import { describe, it, expect } from "vitest";
import { paginate, pageNumbers, normalizePageSize } from "../src/modules/marketing/ui/pagination.js";

describe("paginate", () => {
  it("ช่วงของหน้า · ตัวเลขแสดงผล 1-based · หน้าเกินถูกหนีบ", () => {
    expect(paginate(266, 1, 12)).toEqual({ page: 1, pages: 23, start: 0, end: 12, from: 1, to: 12, total: 266 });
    expect(paginate(266, 23, 12)).toMatchObject({ page: 23, start: 264, end: 266, from: 265, to: 266 });
    expect(paginate(266, 99, 12).page).toBe(23);
    expect(paginate(266, 0, 12).page).toBe(1);
    expect(paginate(0, 3, 12)).toEqual({ page: 1, pages: 1, start: 0, end: 0, from: 0, to: 0, total: 0 });
  });
});

describe("pageNumbers", () => {
  it("หน้าน้อยแสดงครบ · หน้าเยอะย่อด้วย … ให้ไม่เกิน 7 ช่อง และมีหน้าแรก/สุดท้ายเสมอ", () => {
    expect(pageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageNumbers(1, 23)).toEqual([1, 2, 3, 4, 5, "…", 23]);
    expect(pageNumbers(12, 23)).toEqual([1, "…", 11, 12, 13, "…", 23]);
    expect(pageNumbers(23, 23)).toEqual([1, "…", 19, 20, 21, 22, 23]);
    expect(pageNumbers(4, 23)).toEqual([1, 2, 3, 4, 5, "…", 23]);
    expect(pageNumbers(1, 1)).toEqual([1]);
  });
});

describe("normalizePageSize", () => {
  it("ยอมเฉพาะขนาดที่กำหนด · ค่าแปลกใช้ค่าเริ่ม", () => {
    expect(normalizePageSize("24", [12, 24, 48], 12)).toBe(24);
    expect(normalizePageSize("13", [12, 24, 48], 12)).toBe(12);
    expect(normalizePageSize(null, [10, 20, 50], 20)).toBe(20);
  });
});
