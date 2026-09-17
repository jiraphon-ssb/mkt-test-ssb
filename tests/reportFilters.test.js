/* ตัวกรองรายงาน: อยู่ในลิงก์ (ส่งต่อให้คนอื่นเห็นภาพเดียวกัน) และใช้ร่วมกันทุกหน้า (จำล่าสุดในแท็บ) */
import { describe, expect, it } from "vitest";
import { SHARED_FILTER_DEFAULTS, readReportFilters, writeReportFilters, sharedFilters } from "../src/modules/marketing/ui/reportFilters.js";

const today = "2026-09-17";
const page = { status: { default: "all" }, q: { default: "" }, sort: { default: "spend", allowed: ["spend", "roas"] } };

describe("readReportFilters", () => {
  it("ไม่มีอะไรเลย = ค่าเริ่มต้น (เดือนนี้ · ช่วงก่อน · ทุกช่องทาง · ยอดรวม · ทุกแบรนด์)", () => {
    expect(readReportFilters(new URLSearchParams(), null, { today, page })).toEqual({
      ...SHARED_FILTER_DEFAULTS, from: "2026-09-01", to: today, status: "all", q: "", sort: "spend",
    });
  });
  it("ลิงก์มาก่อนความจำในแท็บ · ลิงก์ที่มี period = ใช้ลิงก์ล้วน (คนรับลิงก์เห็นเหมือนคนส่ง)", () => {
    const url = new URLSearchParams("period=lastWeek&brand=b_td&sort=roas");
    const session = { period: "7d", channel: "Meta Ads", brand: "b_jk" };
    expect(readReportFilters(url, session, { today, page })).toMatchObject({ period: "lastWeek", brand: "b_td", channel: "all", sort: "roas" });
  });
  it("ลิงก์ไม่มีตัวกรอง = ใช้ค่าล่าสุดที่เลือกในแท็บนี้ (เปลี่ยนหน้าแล้วไม่ต้องตั้งใหม่) · ตัวกรองเฉพาะหน้าไม่ข้ามหน้า", () => {
    const session = { period: "custom", from: "2026-09-01", to: "2026-09-10", compare: "lastMonth", basis: "new" };
    expect(readReportFilters(new URLSearchParams("panel=settings"), session, { today, page })).toMatchObject({ period: "custom", from: "2026-09-01", to: "2026-09-10", compare: "lastMonth", basis: "new", status: "all" });
  });
  it("ค่าผิดรูป = ค่าเริ่มต้น: period ไม่รู้จัก · วันที่กลับหัว/เลยวันนี้ · ค่าที่ไม่อยู่ในรายการ", () => {
    const bad = readReportFilters(new URLSearchParams("period=xx&compare=zz&basis=q&sort=cpm"), null, { today, page });
    expect(bad).toMatchObject({ period: "mtd", compare: "previous", basis: "total", sort: "spend" });
    const flipped = readReportFilters(new URLSearchParams("period=custom&from=2026-09-10&to=2026-09-01"), null, { today, page });
    expect(flipped).toMatchObject({ period: "mtd", from: "2026-09-01", to: today });
    const future = readReportFilters(new URLSearchParams("period=custom&from=2026-09-10&to=2026-10-01"), null, { today, page });
    expect(future.period).toBe("mtd");
  });
  it("ช่วงสำเร็จรูปคำนวณ from/to ใหม่จากวันนี้ (ลิงก์ 'สัปดาห์ก่อน' เปิดวันไหนก็เป็นสัปดาห์ก่อนของวันนั้น)", () => {
    expect(readReportFilters(new URLSearchParams("period=lastWeek&from=2026-01-01&to=2026-01-07"), null, { today, page })).toMatchObject({ from: "2026-09-07", to: "2026-09-13" });
  });
});

describe("writeReportFilters", () => {
  it("เขียน period เสมอ · ค่าอื่นเขียนเฉพาะที่ไม่ใช่ค่าเริ่มต้น · from/to เฉพาะกำหนดเอง · คงพารามิเตอร์อื่นของหน้า (panel/tab)", () => {
    const next = writeReportFilters(new URLSearchParams("panel=settings&tab=rules"), { ...SHARED_FILTER_DEFAULTS, from: "2026-09-01", to: today, brand: "b_td", status: "all", q: "โซฟา", sort: "spend" }, { page });
    expect(next.toString()).toBe("panel=settings&tab=rules&period=mtd&brand=b_td&q=%E0%B9%82%E0%B8%8B%E0%B8%9F%E0%B8%B2");
    const custom = writeReportFilters(new URLSearchParams(), { ...SHARED_FILTER_DEFAULTS, period: "custom", from: "2026-09-01", to: "2026-09-05" }, { page });
    expect(custom.get("from")).toBe("2026-09-01");
    expect(custom.get("to")).toBe("2026-09-05");
  });
  it("sharedFilters ตัดตัวกรองเฉพาะหน้าออก (ไว้จำข้ามหน้า)", () => {
    expect(sharedFilters({ ...SHARED_FILTER_DEFAULTS, from: "a", to: "b", status: "x" })).toEqual({ ...SHARED_FILTER_DEFAULTS, from: "a", to: "b" });
  });
});
