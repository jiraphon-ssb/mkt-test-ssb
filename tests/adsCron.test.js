import { describe, it, expect } from "vitest";
import { cronDue, planCreativeTargets, planCronJobs, planReconcileTargets, salesDue, summarizeTick, tokenWarning } from "../supabase/functions/_shared/adsCron.js";

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

describe("cronDue — tick ตรงนาทีที่ 7 ต้องไม่พลาดรอบเพราะรอบก่อนจบช้าไปไม่กี่วินาที", () => {
  it("รอบก่อนจบ 22:07:30 · tick 04:07:00 (ขาด 30 วิ) = ถึงรอบแล้ว (เคยเลื่อนไป 05:07 ทำให้รอบ 6 ชม. กลายเป็น 7)", () => {
    expect(cronDue("2026-09-16T22:07:30.000Z", "2026-09-17T04:07:00.000Z", 6)).toBe(true);
  });
  it("ยังห่างเกินช่วงผ่อนผัน (ขาด 20 นาที) = ยังไม่ถึง", () => {
    expect(cronDue("2026-09-16T22:27:00.000Z", "2026-09-17T04:07:00.000Z", 6)).toBe(false);
  });
});

describe("planCronJobs — รอบตรวจยอดไม่นับเป็นรอบดึงข้อมูล", () => {
  it("ดึงล่าสุด 22:07 · ตรวจยอด 03:54 · tick 04:07 = ถึงรอบดึงแล้ว (เคยถูกเลื่อนไป 10:07 เพราะนับรอบตรวจยอด)", () => {
    const runs = [
      run("c1", { mode: "incremental", range_from: "2026-08-17", range_to: "2026-09-17", started_at: "2026-09-16T22:07:04.000Z", finished_at: "2026-09-16T22:07:30.000Z" }),
      run("c1", { mode: "reconcile", range_from: "2026-08-18", range_to: "2026-09-16", started_at: "2026-09-17T03:54:27.000Z", finished_at: "2026-09-17T03:54:29.000Z" }),
    ];
    const jobs = planCronJobs({ connections: [conn("c1", { config: { backfillDays: 30 } })], runs, now: "2026-09-17T04:07:00.000Z", todayOf: () => "2026-09-17", syncEveryHours: 6 });
    expect(jobs.map((j) => j.connectionId)).toEqual(["c1"]);
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
  it("ยังไม่ครบรอบ: หยิบเฉพาะก้อนย้อนหลัง ไม่ดึง 3 วันล่าสุดซ้ำทุก tick จนช่องว่างไม่ถูกเติม", () => {
    // เหมือนของจริง: ก.ย. ดึงครบแล้ว แต่ มิ.ย.–ส.ค. ยังขาด และเพิ่งดึงไปเมื่อ 10 นาทีก่อน
    const runs = [
      run("c1", { finished_at: "2026-09-16T09:50:00.000Z", range_from: "2026-09-01", range_to: "2026-09-16", mode: "backfill" }),
      run("c1", { finished_at: "2026-09-16T09:00:00.000Z", range_from: "2026-08-20", range_to: "2026-08-25", mode: "backfill" }),
    ];
    const jobs = plan({ connections: [conn("c1", { config: { backfillDays: 90 } })], runs, syncEveryHours: 6 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ mode: "backfill" });
    expect(jobs[0].to < "2026-09-01").toBe(true);
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

describe("บัญชีเสียต้องไม่ลากบัญชีอื่นหยุดตาม", () => {
  it("บัญชีที่ token หมดอายุ (status expired) ไม่ถูกวางแผนอีก — ไม่งั้นจะอยู่หัวคิวถาวร", () => {
    const jobs = plan({
      connections: [conn("c1", { status: "expired" }), conn("c2")],
      runs: [run("c2", { finished_at: "2026-09-16T01:00:00.000Z" })],
      syncEveryHours: 6,
    });
    expect(jobs.map((job) => job.connectionId)).toEqual(["c2"]);
  });
  it("บัญชีที่ยังไม่ผูก token ก็ข้าม ไม่ปนเข้าคิว", () => {
    const jobs = plan({ connections: [conn("c1", { authorization_id: null }), conn("c2")], runs: [], syncEveryHours: 6 });
    expect(jobs.every((job) => job.connectionId === "c2")).toBe(true);
  });
});

describe("planReconcileTargets — ตรวจยอดอัตโนมัติวันละครั้ง", () => {
  const recon = (connection_id, patch = {}) => ({ connection_id, mode: "reconcile", status: "success", started_at: "2026-09-16T02:00:00.000Z", finished_at: "2026-09-16T02:00:10.000Z", ...patch });
  const target = (args) => planReconcileTargets({ now: NOW, todayOf: () => "2026-09-16", hourOf: () => 17, ...args });

  it("ข้อมูลครบ + สายพอ + วันนี้ยังไม่ได้ตรวจ = ตรวจ", () => {
    expect(target({ connections: [conn("c1")], runs: [run("c1")] })).toEqual(["c1"]);
  });
  it("ยังเช้าอยู่ (Meta ยังปิดยอดเมื่อวานไม่เสร็จ) = ยังไม่ตรวจ", () => {
    expect(target({ connections: [conn("c1")], runs: [run("c1")], hourOf: () => 6 })).toEqual([]);
  });
  it("ตรวจไปแล้ววันนี้ = ไม่ตรวจซ้ำ · ของเมื่อวาน = ตรวจใหม่", () => {
    expect(target({ connections: [conn("c1")], runs: [run("c1"), recon("c1")] })).toEqual([]);
    expect(target({ connections: [conn("c1")], runs: [run("c1"), recon("c1", { started_at: "2026-09-15T02:00:00.000Z" })] })).toEqual(["c1"]);
  });
  it("ยังมีวันที่ขาด = ไม่ตรวจ (ตรวจไปก็ไม่ผ่านเพราะข้อมูลไม่ครบ)", () => {
    expect(target({ connections: [conn("c1")], runs: [] })).toEqual([]);
  });
  it("บัญชีปิด/ไม่มี token = ไม่ตรวจ · ตรวจที่ล้มเหลววันนี้ไม่นับว่าตรวจแล้ว", () => {
    expect(target({ connections: [conn("c1", { status: "disabled" })], runs: [run("c1")] })).toEqual([]);
    expect(target({ connections: [conn("c1")], runs: [run("c1"), recon("c1", { status: "failed" })] })).toEqual(["c1"]);
  });
  it("ยอดไม่ตรง (partial) เมื่อชั่วโมงที่แล้ว = พักก่อน ไม่ตรวจซ้ำทุก tick", () => {
    const justNow = recon("c1", { status: "partial", started_at: "2026-09-16T09:30:00.000Z" });
    expect(target({ connections: [conn("c1")], runs: [run("c1"), justNow] })).toEqual([]);
  });
  it("พ้นช่วงพักแล้ว = ลองใหม่ได้", () => {
    const earlier = recon("c1", { status: "partial", started_at: "2026-09-16T05:00:00.000Z" });
    expect(target({ connections: [conn("c1")], runs: [run("c1"), earlier] })).toEqual(["c1"]);
  });
  it("ลองครบโควตาของวันแล้ว = หยุด ไม่กิน quota Meta ทั้งวัน", () => {
    const tries = ["2026-09-16T01:00:00.000Z", "2026-09-16T03:00:00.000Z", "2026-09-16T05:00:00.000Z"]
      .map((started_at) => recon("c1", { status: "partial", started_at }));
    expect(target({ connections: [conn("c1")], runs: [run("c1"), ...tries] })).toEqual([]);
  });
  it("ผ่านแล้ววันนี้ ต่อให้เคยพลาดมาก่อน = ไม่ตรวจซ้ำ", () => {
    const failed = recon("c1", { status: "partial", started_at: "2026-09-16T01:00:00.000Z" });
    const passed = recon("c1", { status: "success", started_at: "2026-09-16T03:00:00.000Z" });
    expect(target({ connections: [conn("c1")], runs: [run("c1"), failed, passed] })).toEqual([]);
  });
});

describe("planCreativeTargets — รีเฟรชรูป/ข้อความโฆษณาเอง", () => {
  const targets = (args) => planCreativeTargets({ now: NOW, ...args });

  it("ไม่เคยรีเฟรช = ถึงคิว", () => {
    expect(targets({ connections: [conn("c1")], refreshedAt: {} })).toEqual(["c1"]);
  });
  it("เพิ่งรีเฟรช = ยังไม่ถึงคิว · เกินรอบแล้ว = ถึงคิว", () => {
    expect(targets({ connections: [conn("c1")], refreshedAt: { c1: "2026-09-16T08:00:00.000Z" } })).toEqual([]);
    expect(targets({ connections: [conn("c1")], refreshedAt: { c1: "2026-09-15T08:00:00.000Z" } })).toEqual(["c1"]);
  });
  it("บัญชีปิด / token หมด / ยังไม่ผูก = ข้าม", () => {
    expect(targets({ connections: [conn("c1", { status: "disabled" }), conn("c2", { status: "expired" }), conn("c3", { authorization_id: null })] })).toEqual([]);
  });
  it("ค้างนานสุดได้คิวก่อน และทำทีละบัญชีต่อรอบ (ads-creatives กินเวลาถึง 90 วิ)", () => {
    const connections = [conn("c1"), conn("c2"), conn("c3")];
    const refreshedAt = { c1: "2026-09-14T10:00:00.000Z", c2: "2026-09-10T10:00:00.000Z", c3: null };
    expect(targets({ connections, refreshedAt })).toEqual(["c3"]);
    expect(targets({ connections, refreshedAt: { ...refreshedAt, c3: "2026-09-13T10:00:00.000Z" }, max: 2 })).toEqual(["c2", "c3"]);
  });
  it("เวลาที่บันทึกไว้เสีย = ถือว่ายังไม่เคยรีเฟรช", () => {
    expect(targets({ connections: [conn("c1")], refreshedAt: { c1: "ไม่ใช่เวลา" } })).toEqual(["c1"]);
  });
});

describe("salesDue — ดึงยอดขายจริงวันละครั้ง", () => {
  it("หลัง 9 โมงและวันนี้ยังไม่ได้ดึง = ดึง", () => {
    expect(salesDue({ lastAt: "2026-09-15T23:00:00.000Z", now: NOW, hour: 17, today: "2026-09-16" })).toBe(true);
    expect(salesDue({ lastAt: null, now: NOW, hour: 17, today: "2026-09-16" })).toBe(true);
  });
  it("ยังเช้าอยู่ = ยังไม่ดึง · ดึงไปแล้ววันนี้ = ไม่ดึงซ้ำ", () => {
    expect(salesDue({ lastAt: null, now: NOW, hour: 6, today: "2026-09-16" })).toBe(false);
    expect(salesDue({ lastAt: "2026-09-16T03:00:00.000Z", now: NOW, hour: 17, today: "2026-09-16" })).toBe(false);
  });
  it("ดึงไม่สำเร็จ = ลองใหม่รอบหน้า แต่ไม่เกินโควตาของวัน", () => {
    expect(salesDue({ lastAt: null, now: NOW, hour: 17, today: "2026-09-16", tries: 3 })).toBe(true);
    expect(salesDue({ lastAt: null, now: NOW, hour: 17, today: "2026-09-16", tries: 4 })).toBe(false);
  });
});

describe("summarizeTick — สรุปลงประวัติ", () => {
  it("นับงานที่สำเร็จ/ล้มเหลว แถวที่เขียน และสถานะรวม", () => {
    const sync = [{ ok: true, rows: 120 }, { ok: true, rows: 66 }];
    expect(summarizeTick({ planned: 2, sync, reconcile: [{ ok: true }] })).toEqual({
      planned: 2, synced: 2, failed: 0, rowsWritten: 186, reconciled: 1, status: "success",
    });
  });
  it("งานอื่นในรอบ (ยอดขาย/creative) พัง = รอบนั้นไม่เขียวสนิท", () => {
    expect(summarizeTick({ planned: 1, sync: [{ ok: true, rows: 5 }], extra: [{ ok: false }] }).status).toBe("partial");
    expect(summarizeTick({ planned: 1, sync: [{ ok: true, rows: 5 }], extra: [{ ok: true }] }).status).toBe("success");
    expect(summarizeTick({ planned: 0, extra: [{ ok: false }] })).toMatchObject({ status: "failed", failed: 1, synced: 0 });
  });
  it("มีบางงานพัง = partial · พังหมด = failed · ไม่มีงานเลย = success (ไม่ถึงรอบ ไม่ใช่ความผิดพลาด)", () => {
    expect(summarizeTick({ planned: 2, sync: [{ ok: true, rows: 5 }, { ok: false }] }).status).toBe("partial");
    expect(summarizeTick({ planned: 1, sync: [{ ok: false }] }).status).toBe("failed");
    expect(summarizeTick({ planned: 0, sync: [] })).toEqual({ planned: 0, synced: 0, failed: 0, rowsWritten: 0, reconciled: 0, status: "success" });
  });
});

describe("tokenWarning — เตือนก่อน token หมดอายุ", () => {
  const at = (iso) => Date.parse(iso);
  it("เหลือ ≤7 วัน = เตือน · เหลือมากกว่านั้น = เงียบ", () => {
    expect(tokenWarning("2026-09-20T00:00:00.000Z", at("2026-09-16T10:00:00Z"))).toEqual({ code: "META_TOKEN_EXPIRING", daysLeft: 3 });
    expect(tokenWarning("2026-11-14T08:46:00.000Z", at("2026-09-16T10:00:00Z"))).toBeNull();
  });
  it("หมดอายุไปแล้ว = เตือนแบบหมดอายุ · ไม่มีวันหมดอายุ/ค่าเสีย = ไม่เตือน (ไม่เดา)", () => {
    expect(tokenWarning("2026-09-15T00:00:00.000Z", at("2026-09-16T10:00:00Z"))).toEqual({ code: "META_TOKEN_INVALID", daysLeft: 0 });
    expect(tokenWarning(null, at("2026-09-16T10:00:00Z"))).toBeNull();
    expect(tokenWarning("ไม่ใช่เวลา", at("2026-09-16T10:00:00Z"))).toBeNull();
  });
});
