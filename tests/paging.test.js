/* หน้า pagination ของ PostgREST — เดิมอ่านทีละหน้าเรียงต่อกัน (17 หน้า ≈ 7 วิ = 83% ของเวลาโหลด Overview)
   แก้ 21 ก.ย. ค่ำ: หน้าแรกขอ count มาด้วย แล้วยิงหน้าที่เหลือพร้อมกันทั้งหมด */
import { describe, expect, it } from "vitest";
import { pageOffsets } from "../src/foundation/data/paging.js";

describe("pageOffsets — offset ของหน้าที่เหลือหลังหน้าแรก", () => {
  it("17,234 แถว หน้าละ 1,000 → เริ่ม 1000 จนถึง 17000", () => {
    const offsets = pageOffsets(17234, 1000);
    expect(offsets[0]).toBe(1000);
    expect(offsets.at(-1)).toBe(17000);
    expect(offsets).toHaveLength(17);
  });
  it("พอดีหน้าเดียวหรือน้อยกว่า = ไม่มีหน้าเพิ่ม", () => {
    expect(pageOffsets(1000, 1000)).toEqual([]);
    expect(pageOffsets(7, 1000)).toEqual([]);
    expect(pageOffsets(0, 1000)).toEqual([]);
    expect(pageOffsets(null, 1000)).toEqual([]);       // count หายมา (เช่น HEAD ล้ม) = อย่าพัง ให้เท่ากับไม่มีหน้าเพิ่ม
  });
  it("พอดีสองหน้า = หน้าเพิ่มหน้าเดียว", () => {
    expect(pageOffsets(2000, 1000)).toEqual([1000]);
  });
});
