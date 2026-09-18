/* สะพานไประบบ TMK (ยอดขาย JUNTAKARN) — URL ของ RPC และการแบ่งช่วงวัน */
import { describe, it, expect } from "vitest";
import { jkFactsUrl, jkWindows } from "../supabase/functions/_shared/jkBridge.js";

describe("jkFactsUrl", () => {
  it("ชี้ไป RPC พร้อมขอเฉพาะคอลัมน์ที่อนุญาต (กันข้อมูลลูกค้าข้ามระบบ)", () => {
    const url = new URL(jkFactsUrl("https://asimudifasqvtjegbvdp.supabase.co", "2026-09-01", "2026-09-17"));
    expect(url.pathname).toBe("/rest/v1/rpc/jk_ads_daily_facts");
    expect(url.searchParams.get("select")).toBe("day,inquiries,inq_by_channel,inquiry_filled,orders,orders_new,sales,sales_new,ord_by_channel,cancelled,cancelled_value");
  });
  it("URL ที่มี / ต่อท้าย ใช้ได้ · วันที่ผิดรูป = โยน DATE_INVALID", () => {
    expect(jkFactsUrl("https://x.supabase.co/", "2026-09-01", "2026-09-02")).toContain("https://x.supabase.co/rest/v1/rpc/");
    expect(() => jkFactsUrl("https://x.supabase.co", "01/09/2026", "2026-09-17")).toThrow("DATE_INVALID");
  });
});

describe("jkWindows", () => {
  it("แบ่งเป็นก้อนละไม่เกิน size วัน (รวมหัวท้าย)", () => {
    expect(jkWindows("2026-09-01", "2026-09-05", 2)).toEqual([
      { from: "2026-09-01", to: "2026-09-02" }, { from: "2026-09-03", to: "2026-09-04" }, { from: "2026-09-05", to: "2026-09-05" },
    ]);
    expect(jkWindows("2026-09-01", "2026-09-30").length).toBe(1);
  });
  it("ช่วงกลับหัวหรือวันที่ผิดรูป = []", () => {
    expect(jkWindows("2026-09-05", "2026-09-01")).toEqual([]);
    expect(jkWindows("2026-9-5", "2026-09-30")).toEqual([]);
  });
});
