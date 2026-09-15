/* backfill แบ่งช่วง + เติมช่องว่างจากประวัติ run — แก้ 546 (บัญชีใหญ่) และทำให้ตรวจยอด 30 วันมีข้อมูลครบ */
import { describe, it, expect } from "vitest";
import { coverageGaps, planSyncJobs, validateExplicitRange, coverageWindow, missingDaysOf } from "../supabase/functions/_shared/adsBackfill.js";

const run = (from, to, patch = {}) => ({ connection_id: "c1", mode: "backfill", status: "success", range_from: from, range_to: to, ...patch });

describe("coverageWindow", () => {
  it("อย่างน้อย 31 วันรวมวันนี้ — ตรวจยอด 30 วันจบเมื่อวานต้องมีข้อมูลครบเสมอ", () => {
    expect(coverageWindow("2026-09-15", 30)).toEqual({ from: "2026-08-16", to: "2026-09-15" });
    expect(coverageWindow("2026-09-15", 90)).toEqual({ from: "2026-06-18", to: "2026-09-15" });
    expect(coverageWindow("2026-09-15", 999)).toEqual({ from: "2026-03-20", to: "2026-09-15" });   // เพดาน 180
  });
});

describe("coverageGaps", () => {
  it("ไม่มี run เลย = ทั้งหน้าต่างเป็นช่องว่าง", () => {
    expect(coverageGaps([], "2026-09-01", "2026-09-10")).toEqual([{ from: "2026-09-01", to: "2026-09-10" }]);
  });
  it("นับเฉพาะ run สำเร็จของโหมดดึงยอด · reconcile/failed ไม่นับ · run ซ้อนกันรวมได้", () => {
    const runs = [
      run("2026-09-01", "2026-09-03"), run("2026-09-03", "2026-09-05", { mode: "incremental" }),
      run("2026-09-06", "2026-09-07", { status: "failed" }), run("2026-09-06", "2026-09-10", { mode: "reconcile" }),
      run("2026-09-09", "2026-09-10"),
    ];
    expect(coverageGaps(runs, "2026-09-01", "2026-09-10")).toEqual([{ from: "2026-09-06", to: "2026-09-08" }]);
  });
  it("run ที่เกินหน้าต่างถูกตัดขอบ · ช่วงเว้นหลายช่วงแยกกัน", () => {
    const runs = [run("2026-08-01", "2026-09-02"), run("2026-09-05", "2026-09-05"), run("2026-09-09", "2026-10-01")];
    expect(coverageGaps(runs, "2026-09-01", "2026-09-10")).toEqual([
      { from: "2026-09-03", to: "2026-09-04" }, { from: "2026-09-06", to: "2026-09-08" },
    ]);
  });
});

describe("missingDaysOf", () => {
  it("นับวันที่ขาดในหน้าต่าง ไม่รวม 3 วันล่าสุด (ยอดยังขยับ ไม่ถือว่าขาด)", () => {
    const runs = [run("2026-08-16", "2026-09-10")];
    expect(missingDaysOf(runs, "2026-09-15", 30)).toBe(2);          // 11–12 ก.ย. ขาด · 13–15 เป็นช่วง refresh
    expect(missingDaysOf([run("2026-08-16", "2026-09-15")], "2026-09-15", 30)).toBe(0);
  });
});

describe("planSyncJobs", () => {
  const conn = (patch = {}) => ({ id: "c1", timezone: "Asia/Bangkok", config: { backfillDays: 90 }, ...patch });
  it("ไม่เคย sync = แบ่งทั้งหน้าต่างเป็นก้อนละ ≤10 วัน ใหม่ไปเก่า (ยอดล่าสุดมาก่อน)", () => {
    const jobs = planSyncJobs({ connections: [conn()], runs: [], todayOf: () => "2026-09-15" });
    expect(jobs[0]).toEqual({ connectionId: "c1", mode: "backfill", from: "2026-09-06", to: "2026-09-15" });
    expect(jobs.at(-1).from).toBe("2026-06-18");
    expect(jobs.every((j) => (Date.parse(j.to) - Date.parse(j.from)) / 864e5 <= 9)).toBe(true);
    const days = jobs.reduce((n, j) => n + (Date.parse(j.to) - Date.parse(j.from)) / 864e5 + 1, 0);
    expect(days).toBe(90);
  });
  it("มีข้อมูลครบแล้ว = ดึงแค่ 3 วันล่าสุด (Meta แก้ยอดย้อนหลังได้)", () => {
    const jobs = planSyncJobs({ connections: [conn()], runs: [run("2026-06-18", "2026-09-15")], todayOf: () => "2026-09-15" });
    expect(jobs).toEqual([{ connectionId: "c1", mode: "incremental", from: "2026-09-13", to: "2026-09-15" }]);
  });
  it("JK Design: backfill 30 วัน (17 ส.ค.–15 ก.ย.) ขาดวันแรกของหน้าต่างตรวจยอด → เติมเฉพาะ 16 ส.ค. + 3 วันล่าสุด", () => {
    const runs = [run("2026-08-17", "2026-09-15")];
    const jobs = planSyncJobs({ connections: [conn({ config: { backfillDays: 30 } })], runs, todayOf: () => "2026-09-15" });
    expect(jobs).toEqual([
      { connectionId: "c1", mode: "incremental", from: "2026-09-13", to: "2026-09-15" },
      { connectionId: "c1", mode: "backfill", from: "2026-08-16", to: "2026-08-16" },
    ]);
  });
  it("หลายบัญชี: ทำครบบัญชีหนึ่งก่อนไปบัญชีถัดไป · runs ของบัญชีอื่นไม่ปน · timezone ต่อบัญชี", () => {
    const jobs = planSyncJobs({
      connections: [conn({ id: "a", config: { backfillDays: 30 } }), conn({ id: "b", config: { backfillDays: 30 }, timezone: "UTC" })],
      runs: [run("2026-08-16", "2026-09-15", { connection_id: "a" })],
      todayOf: (tz) => tz === "UTC" ? "2026-09-14" : "2026-09-15",
    });
    expect(jobs[0]).toMatchObject({ connectionId: "a", mode: "incremental" });
    expect(jobs.filter((j) => j.connectionId === "b").length).toBe(4);   // 31 วัน / 10 = 4 ก้อน
    expect(jobs.findIndex((j) => j.connectionId === "b")).toBe(1);
  });
});

describe("validateExplicitRange (ฝั่ง server)", () => {
  it("ช่วงที่ client ส่งมาต้องอยู่ในเพดาน: ≤ 14 วันต่อครั้ง · ไม่เกินวันนี้ · ไม่เก่ากว่า 180 วัน", () => {
    expect(validateExplicitRange({ from: "2026-09-06", to: "2026-09-15" }, "2026-09-15")).toEqual({ from: "2026-09-06", to: "2026-09-15" });
    expect(() => validateExplicitRange({ from: "2026-09-01", to: "2026-09-15" }, "2026-09-15")).toThrow("SYNC_RANGE_INVALID");
    expect(() => validateExplicitRange({ from: "2026-09-14", to: "2026-09-16" }, "2026-09-15")).toThrow("SYNC_RANGE_INVALID");
    expect(() => validateExplicitRange({ from: "2026-03-01", to: "2026-03-05" }, "2026-09-15")).toThrow("SYNC_RANGE_INVALID");
    expect(() => validateExplicitRange({ from: "2026-09-10", to: "2026-09-05" }, "2026-09-15")).toThrow("SYNC_RANGE_INVALID");
    expect(() => validateExplicitRange({ from: "x", to: "2026-09-05" }, "2026-09-15")).toThrow("SYNC_RANGE_INVALID");
  });
  it("ไม่ส่งช่วงมา = null (ใช้โหมดเดิมของ server)", () => {
    expect(validateExplicitRange({}, "2026-09-15")).toBeNull();
  });
});
