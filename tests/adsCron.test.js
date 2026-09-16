import { describe, it, expect } from "vitest";
import { planCronJobs, cronDue } from "../supabase/functions/_shared/adsCron.js";

const NOW = "2026-09-16T10:00:00.000Z";
const conn = (id, patch = {}) => ({ id, status: "connected", authorization_id: "auth-" + id, timezone: "Asia/Bangkok", config: { backfillDays: 31 }, ...patch });
const run = (connection_id, patch = {}) => ({ connection_id, mode: "incremental", status: "success", range_from: "2026-08-17", range_to: "2026-09-16", finished_at: "2026-09-16T09:00:00.000Z", started_at: "2026-09-16T08:58:00.000Z", ...patch });
const plan = (args) => planCronJobs({ now: NOW, todayOf: () => "2026-09-16", ...args });

describe("cronDue — ถึงรอบดึงหรือยัง", () => {
  it("ไม่เคยดึงสำเร็จ = ถึงรอบเสมอ", () => expect(cronDue(null, NOW, 6)).toBe(true));
  it("ครบชั่วโมงที่ตั้งไว้ = ถึงรอบ · ยังไม่ครบ = ยังไม่ถึง", () => {
    expect(cronDue("2026-09-16T03:59:00.000Z", NOW, 6)).toBe(true);
    expect(cronDue("2026-09-16T04:30:00.000Z", NOW, 6)).toBe(false);
    expect(cronDue("2026-09-16T09:30:00.000Z", NOW, 1)).toBe(false);
    expect(cronDue("2026-09-16T08:30:00.000Z", NOW, 1)).toBe(true);
  });
  it("เวลาเสีย = ถึงรอบ (ดีกว่าค้างไม่ดึงเลย) · ชั่วโมงเพี้ยนใช้ค่าเริ่ม 6", () => {
    expect(cronDue("ไม่ใช่เวลา", NOW, 6)).toBe(true);
    expect(cronDue("2026-09-16T09:30:00.000Z", NOW, 0)).toBe(false);
  });
});

describe("planCronJobs — งานที่รอบนี้จะดึง", () => {
  it("ถึงรอบ: ดึง 3 วันล่าสุดก่อน (Meta ยังแก้ยอดย้อนหลัง)", () => {
    const jobs = plan({ connections: [conn("c1")], runs: [run("c1", { finished_at: "2026-09-16T01:00:00.000Z" })], syncEveryHours: 6 });
    expect(jobs).toEqual([{ connectionId: "c1", mode: "incremental", from: "2026-09-14", to: "2026-09-16" }]);
  });
  it("ยังไม่ถึงรอบ = ไม่มีงาน", () => {
    expect(plan({ connections: [conn("c1")], runs: [run("c1")], syncEveryHours: 6 })).toEqual([]);
  });
  it("มีช่องว่าง: รอบหนึ่งเติมได้จำกัด ไม่ยิงรวดเดียวจนหมดเวลา function", () => {
    const jobs = plan({ connections: [conn("c1")], runs: [], syncEveryHours: 6, maxPerConnection: 2 });
    expect(jobs).toHaveLength(2);
    expect(jobs[0].to).toBe("2026-09-16");                 // ก้อนล่าสุดมาก่อน (รวม 3 วันที่ยอดยังขยับ)
    expect(jobs[1].to < jobs[0].from).toBe(true);          // แล้วค่อยไล่ย้อนหลังทีละก้อน
  });
  it("มีวันที่ขาดอยู่ = เติมได้เลยไม่ต้องรอครบรอบ (ช่องว่างสำคัญกว่าความถี่)", () => {
    const fresh = run("c1", { finished_at: "2026-09-16T09:50:00.000Z", range_from: "2026-09-14", range_to: "2026-09-16" });
    const jobs = plan({ connections: [conn("c1")], runs: [fresh], syncEveryHours: 6 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].from < "2026-09-14").toBe(true);   // ก้อนนี้กินวันที่ขาดด้วย ไม่ใช่ดึงแค่ 3 วันล่าสุดซ้ำ
  });
  it("ไม่มีวันที่ขาด + ยังไม่ครบรอบ = ไม่ทำอะไร", () => {
    expect(plan({ connections: [conn("c1")], runs: [run("c1")], syncEveryHours: 6 })).toEqual([]);
  });
  it("บัญชีที่ปิด · ยังไม่ผูก token · กำลังรันอยู่ = ข้าม", () => {
    const busy = run("c3", { status: "running", finished_at: null, started_at: "2026-09-16T09:57:00.000Z" });
    const jobs = plan({ connections: [conn("c1", { status: "disabled" }), conn("c2", { authorization_id: null }), conn("c3")], runs: [busy], syncEveryHours: 6 });
    expect(jobs).toEqual([]);
  });
  it("run ค้างเกิน 8 นาที = ถือว่าตายแล้ว ดึงต่อได้", () => {
    const stuck = run("c1", { status: "running", finished_at: null, started_at: "2026-09-16T09:30:00.000Z" });
    expect(plan({ connections: [conn("c1")], runs: [stuck], syncEveryHours: 6 })).toHaveLength(1);
  });
  it("บัญชีที่ค้างนานสุดได้คิวก่อน และเพดานรวมต่อรอบกันเวลาไม่พอ", () => {
    const conns = [conn("c1"), conn("c2"), conn("c3")];
    const runs = [
      run("c1", { finished_at: "2026-09-16T02:00:00.000Z" }),
      run("c2", { finished_at: "2026-09-15T20:00:00.000Z" }),
      run("c3", { finished_at: "2026-09-16T01:00:00.000Z" }),
    ];
    const jobs = plan({ connections: conns, runs, syncEveryHours: 6, maxJobs: 2 });
    expect(jobs.map((job) => job.connectionId)).toEqual(["c2", "c3"]);
  });
});
