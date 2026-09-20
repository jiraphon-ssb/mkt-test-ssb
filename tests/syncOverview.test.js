/* หน้า Sync แบบใหม่ — logic ล้วน: แถวแหล่งข้อมูล · เรื่องที่ควรดู · สรุปบนสุด · ประวัติรวม
   กติกาหลัก: ระหว่างโหลดห้ามบอกว่า "ยังไม่มี/ยังไม่เชื่อม" (บั๊กบน production 17 ก.ย.) */
import { describe, expect, it } from "vitest";
import {
  ago, agoHours, creativeSourceRow, historyTimeline, metaSourceRow, nextCronAt, nextSyncAt, salesSourceRow, syncIssues, syncVerdict,
} from "../src/modules/marketing/ads/syncOverview.js";

const NOW = Date.parse("2026-09-17T03:00:00Z");   // 10:00 เวลาไทย
const acc = (patch = {}) => ({ key: "meta:b_td", brand: "TEAMDEE", connectionId: "c1", connected: true, state: "healthy", label: "ข้อมูลล่าสุดปกติ",
  lastSuccessAt: "2026-09-16T22:07:00Z", ageHours: 4.9, missingDays: 0, errorCode: null, reconciliation: { ready: true }, ...patch });
const run = (pipeline, patch = {}) => ({ id: `${pipeline}-1`, pipeline, status: "success", trigger_kind: "cron", started_at: "2026-09-17T02:07:00Z", finished_at: "2026-09-17T02:07:04Z", ...patch });

describe("metaSourceRow", () => {
  it("กำลังโหลด = loading ไม่เดาสถานะจากค่าเก่า", () => {
    expect(metaSourceRow({ accounts: [acc({ state: "missing" })], ready: false, now: NOW }).state).toBe("loading");
  });
  it("ครบ 4 บัญชี ปกติ = ok · บอกความสดจากบัญชีที่ดึงล่าสุด · ตรวจยอดผ่าน x/y", () => {
    const row = metaSourceRow({ accounts: [acc(), acc({ key: "b", reconciliation: { ready: false } })], ready: true, everyHours: 6, now: NOW });
    expect(row).toMatchObject({ state: "ok", stateLabel: "ปกติ", sub: "2 บัญชี" });
    expect(row.fresh.text).toBe("4 ชม. 54 นาทีก่อน");
    expect(row.fresh.sub).toBe("ดึงทุก 6 ชม.");
    expect(row.complete).toEqual({ text: "ไม่มีวันขาด", sub: "ตรวจยอดผ่าน 1/2" });
  });
  it("บัญชีไหนพัง = ทั้งแถว bad และบอกจำนวน · ขาดวัน = บอกรวมกี่วัน", () => {
    expect(metaSourceRow({ accounts: [acc(), acc({ key: "b", state: "error" })], ready: true, now: NOW })).toMatchObject({ state: "bad", stateLabel: "ดึงไม่สำเร็จ 1 บัญชี" });
    expect(metaSourceRow({ accounts: [acc({ missingDays: 3, state: "missing" })], ready: true, now: NOW }).complete.text).toBe("ขาด 3 วัน");
  });
  it("ไม่มีบัญชีที่เชื่อม = waiting", () => {
    expect(metaSourceRow({ accounts: [], ready: true, now: NOW }).state).toBe("waiting");
  });
});

describe("ago — หน่วยเวลาเดียวกันทั้งหน้า", () => {
  it("ต่ำกว่าชั่วโมง = นาที · ข้ามชั่วโมง = ชม. + นาที (ไม่ใช่ทศนิยมของชั่วโมง) · เกิน 2 วัน = วัน", () => {
    expect(ago("2026-09-17T02:47:00Z", NOW)).toBe("13 นาทีก่อน");
    expect(ago("2026-09-16T22:06:00Z", NOW)).toBe("4 ชม. 54 นาทีก่อน");
    expect(ago("2026-09-17T00:00:00Z", NOW)).toBe("3 ชม.ก่อน");        // นาทีลงตัว = ไม่ต้องเขียน 0 นาที
    expect(ago("2026-09-14T03:00:00Z", NOW)).toBe("3 วันก่อน");
    expect(ago(null, NOW)).toBe("—");
  });
  it("agoHours = สูตรเดียวกัน ใช้กับแถวที่รู้แค่จำนวนชั่วโมง", () => {
    expect(agoHours(4.9)).toBe("4 ชม. 54 นาทีก่อน");
    expect(agoHours(0.25)).toBe("15 นาทีก่อน");
    expect(agoHours(null)).toBe("—");
  });
});

describe("salesSourceRow", () => {
  const facts = [
    { brand_id: "b_td", fact_date: "2026-09-01", inquiry_filled: true },
    { brand_id: "b_td", fact_date: "2026-09-02", inquiry_filled: false },
    { brand_id: "b_ta", fact_date: "2026-09-01", inquiry_filled: true },
    { brand_id: "b_td", fact_date: "2026-08-31", inquiry_filled: false },
  ];
  it("กำลังโหลด = loading (ไม่ขึ้น ยังไม่เคยดึง)", () => {
    expect(salesSourceRow({ runs: [], facts: [], ready: false, today: "2026-09-17", now: NOW }).state).toBe("loading");
  });
  it("รอบล่าสุดสำเร็จ = ok · ครบแค่ไหน = คนทักที่ทีมกรอกเดือนนี้", () => {
    const row = salesSourceRow({ runs: [run("sales")], facts, ready: true, today: "2026-09-17", now: NOW });
    expect(row).toMatchObject({ state: "ok", stateLabel: "ปกติ" });
    expect(row.fresh.text).toBe("53 นาทีก่อน");
    expect(row.complete.text).toBe("คนทักทีมกรอก 2/3 วัน");
    const withToday = [...facts, { brand_id: "b_td", fact_date: "2026-09-17", inquiry_filled: false }];
    expect(salesSourceRow({ runs: [run("sales")], facts: withToday, ready: true, today: "2026-09-17", now: NOW }).complete.text).toBe("คนทักทีมกรอก 2/3 วัน");
  });
  it("ไม่เคยดึง = bad · รอบล่าสุดล้ม = bad พร้อมเหตุผล · เก่าเกิน 36 ชม. = warn", () => {
    expect(salesSourceRow({ runs: [], facts: [], ready: true, today: "2026-09-17", now: NOW })).toMatchObject({ state: "bad", stateLabel: "ยังไม่เคยดึง" });
    expect(salesSourceRow({ runs: [run("sales", { status: "failed", error_code: "SALES_KEY_INVALID" })], facts, ready: true, today: "2026-09-17", now: NOW }).state).toBe("bad");
    expect(salesSourceRow({ runs: [run("sales", { started_at: "2026-09-15T10:00:00Z" })], facts, ready: true, today: "2026-09-17", now: NOW }).state).toBe("warn");
  });
  it("แถวจาก source 'tmk' (JUNTAKARN) ไม่นับในตัวหารของแถวนี้", () => {
    const withJk = [...facts,
      { brand_id: "b_jt", fact_date: "2026-09-01", source: "tmk", inquiry_filled: true },
      { brand_id: "b_jt", fact_date: "2026-09-02", source: "tmk", inquiry_filled: true },
    ];
    expect(salesSourceRow({ runs: [run("sales")], facts: withJk, ready: true, today: "2026-09-17", now: NOW }).complete.text).toBe("คนทักทีมกรอก 2/3 วัน");
  });
  it("รอบ partial เพราะเฟส JUNTAKARN ล้มอย่างเดียว = แถวนี้ยังปกติ · เป้าล้ม = เตือน", () => {
    const jkOnly = run("sales", { status: "partial", summary: { jk: { error: "JK_NO_PERMISSION" }, goals: { error: null } } });
    expect(salesSourceRow({ runs: [jkOnly], facts, ready: true, today: "2026-09-17", now: NOW })).toMatchObject({ state: "ok", stateLabel: "ปกติ" });
    const goalsBad = run("sales", { status: "partial", summary: { jk: { error: null }, goals: { error: "SALES_GOALS_FAILED" } } });
    const row = salesSourceRow({ runs: [goalsBad], facts, ready: true, today: "2026-09-17", now: NOW });
    expect(row.state).toBe("warn");
    expect(row.hint).toContain("เป้า");
  });
});

describe("creativeSourceRow", () => {
  const accounts = [acc(), acc({ key: "b", connectionId: "c2" })];
  it("ยังไม่มีรอบที่บันทึก = waiting (ไม่ใช่ปัญหา)", () => {
    expect(creativeSourceRow({ runs: [], accounts, ready: true, now: NOW })).toMatchObject({ state: "waiting", stateLabel: "รอรอบแรก" });
  });
  it("รีเฟรชครบทุกบัญชีใน 2 วัน = ok · บางบัญชี = บอกกี่บัญชี", () => {
    const ok = creativeSourceRow({ runs: [run("creatives", { connection_id: "c1" }), run("creatives", { id: "x", connection_id: "c2" })], accounts, ready: true, now: NOW });
    expect(ok).toMatchObject({ state: "ok", complete: { text: "2/2 บัญชีรีเฟรชใน 2 วัน" } });
    const part = creativeSourceRow({ runs: [run("creatives", { connection_id: "c1" })], accounts, ready: true, now: NOW });
    expect(part.complete.text).toBe("1/2 บัญชีรีเฟรชใน 2 วัน");
  });
  it("จังหวะดึงเขียนรูปแบบเดียวกับแถวอื่น · เก่าเกิน 2 วัน ใช้คำว่า ล่าช้า ไม่ใช่ ค้าง", () => {
    expect(creativeSourceRow({ runs: [run("creatives", { connection_id: "c1" })], accounts, ready: true, now: NOW }).fresh.sub).toBe("ดึงวันละครั้ง · ต่อบัญชี");
    expect(creativeSourceRow({ runs: [run("creatives", { connection_id: "c1", started_at: "2026-09-14T00:00:00Z" })], accounts, ready: true, now: NOW }).stateLabel).toBe("ล่าช้า");
  });
  it("รอบล่าสุดของบัญชีไหนล้ม = bad · เก่าเกิน 2 วัน = warn", () => {
    expect(creativeSourceRow({ runs: [run("creatives", { connection_id: "c1", status: "failed" })], accounts, ready: true, now: NOW }).state).toBe("bad");
    expect(creativeSourceRow({ runs: [run("creatives", { connection_id: "c1", started_at: "2026-09-14T00:00:00Z" })], accounts, ready: true, now: NOW }).state).toBe("warn");
  });
});

describe("syncIssues", () => {
  const rows = { meta: { key: "meta", name: "ค่าแอด Meta", state: "ok" }, creatives: { key: "creatives", name: "Creative", state: "waiting" }, sales: { key: "sales", name: "ยอดขาย", state: "ok" } };
  it("แถวแหล่งที่ bad/warn กลายเป็นเรื่องที่ต้องดู · waiting/loading/ok ไม่นับ", () => {
    const issues = syncIssues({ rows: { ...rows, sales: { key: "sales", name: "ยอดขาย", state: "bad", stateLabel: "ยังไม่เคยดึง" } }, now: NOW });
    expect(issues).toEqual([expect.objectContaining({ level: "bad", key: "source:sales", text: "ยอดขาย: ยังไม่เคยดึง" })]);
  });
  it("token: ไม่มี = bad · ไม่รู้วันหมดอายุ = warn · เหลือ ≤7 วัน = bad · ยังโหลดไม่เสร็จ = ไม่พูดถึง", () => {
    expect(syncIssues({ rows, authorizations: { ready: true, items: [] }, now: NOW })[0]).toMatchObject({ level: "bad", key: "token" });
    expect(syncIssues({ rows, authorizations: { ready: true, items: [{ status: "connected", expires_at: null }] }, now: NOW })[0]).toMatchObject({ level: "warn", key: "token" });
    expect(syncIssues({ rows, authorizations: { ready: true, items: [{ status: "connected", expires_at: "2026-09-20T00:00:00Z" }] }, now: NOW })[0]).toMatchObject({ level: "bad", text: expect.stringContaining("2 วัน") });
    expect(syncIssues({ rows, authorizations: { ready: false, items: [] }, now: NOW })).toEqual([]);
  });
  it("ตัวดึงอัตโนมัติไม่วิ่ง = bad", () => {
    expect(syncIssues({ rows, cron: { state: "stale", label: "เงียบเกินกำหนด" }, now: NOW })[0]).toMatchObject({ level: "bad", key: "cron" });
  });
  it("เป้าเดือนนี้ยังไม่ครบ = wait (รอคนอื่น) รวมเป็นเรื่องเดียว · เรียง bad → warn → wait", () => {
    const goals = { ready: true, missingByBrand: [{ name: "TEAMDEE", missing: ["งบแอด", "CPL"] }, { name: "t around", missing: ["งบแอด"] }] };
    const issues = syncIssues({ rows, goals, authorizations: { ready: true, items: [{ status: "connected", expires_at: null }] }, now: NOW });
    expect(issues.map((i) => i.level)).toEqual(["warn", "wait"]);
    expect(issues[1].text).toBe("เป้าเดือนนี้ยังไม่ตั้ง: งบแอด · CPL (2 แบรนด์)");
  });
});

describe("syncVerdict", () => {
  it("ยังโหลดอยู่ = loading แม้ยังไม่เจอปัญหา (ไม่รีบบอกว่าพร้อมใช้)", () => {
    expect(syncVerdict({ loading: true, issues: [] }).state).toBe("loading");
  });
  it("มี bad = ต้องแก้ · มีแค่ warn/wait = ใช้ได้แต่ควรดู · ไม่มีเลย = พร้อมใช้", () => {
    expect(syncVerdict({ loading: false, issues: [{ level: "bad" }, { level: "warn" }] })).toMatchObject({ state: "bad", title: "ต้องแก้ 1 เรื่อง" });
    expect(syncVerdict({ loading: false, issues: [{ level: "warn" }, { level: "wait" }] })).toMatchObject({ state: "warn", title: "ข้อมูลใช้ได้ · มี 2 เรื่องควรดู" });
    expect(syncVerdict({ loading: false, issues: [] })).toMatchObject({ state: "ok", title: "ข้อมูลพร้อมใช้" });
  });
  it("เจอ bad ระหว่างโหลดแล้ว = บอกเลย ไม่ต้องรอ", () => {
    expect(syncVerdict({ loading: true, issues: [{ level: "bad" }] }).state).toBe("bad");
  });
});

describe("nextCronAt", () => {
  it("รอบถัดไป = นาทีที่ 7 ของชั่วโมงถัดไป (หรือชั่วโมงนี้ถ้ายังไม่ถึง)", () => {
    expect(nextCronAt(Date.parse("2026-09-17T03:00:00Z"))).toBe("2026-09-17T03:07:00.000Z");
    expect(nextCronAt(Date.parse("2026-09-17T03:08:00Z"))).toBe("2026-09-17T04:07:00.000Z");
  });
});

describe("nextSyncAt — ดึงค่าแอดรอบถัดไปจริง (ไม่ใช่ tick ที่ไม่มีงาน)", () => {
  it("ดึงล่าสุด 11:21 (04:21 UTC) ทุก 6 ชม. = ถึงรอบตั้งแต่ 10:11 UTC → tick 11:07 UTC (18:07 ไทย) · ผ่อนผัน 10 นาทีเหมือน cron", () => {
    expect(nextSyncAt("2026-09-17T04:21:34Z", 6, Date.parse("2026-09-17T05:00:00Z"))).toBe("2026-09-17T11:07:00.000Z");
    expect(nextSyncAt("2026-09-16T22:07:30Z", 6, Date.parse("2026-09-17T03:00:00Z"))).toBe("2026-09-17T04:07:00.000Z");
  });
  it("เลยกำหนดแล้ว = tick ถัดไป · ไม่เคยดึง = tick ถัดไป", () => {
    expect(nextSyncAt("2026-09-16T00:00:00Z", 6, Date.parse("2026-09-17T03:20:00Z"))).toBe("2026-09-17T04:07:00.000Z");
    expect(nextSyncAt(null, 6, Date.parse("2026-09-17T03:20:00Z"))).toBe("2026-09-17T04:07:00.000Z");
  });
});

describe("historyTimeline", () => {
  const accounts = [acc()];
  const ticks = [{ id: "t1", startedAt: "2026-09-17T02:07:00Z", status: "success", auto: true, planned: 0, synced: 0, reconciled: 0, rowsWritten: 0, durationMs: 2000 },
    { id: "t2", startedAt: "2026-09-16T22:07:00Z", status: "success", auto: true, planned: 4, synced: 4, reconciled: 0, rowsWritten: 392, durationMs: 28000 }];
  const syncRuns = [{ id: "s1", connectionId: "c1", status: "success", mode: "incremental", startedAt: "2026-09-16T22:07:05Z", rowsWritten: 174, auto: true }];
  const pipes = [run("sales", { rows_written: 42 }), run("inventory", { id: "i1" })];

  it("รวมทุกแหล่งเป็นเส้นเวลาเดียว เรียงใหม่ก่อน · รอบ cron ที่ไม่มีงานไม่ใส่", () => {
    const items = historyTimeline({ ticks, syncRuns, pipelineRuns: pipes, accounts });
    expect(items.map((i) => i.kind)).toEqual(["sales", "inventory", "meta", "cron"]);
    expect(items[0]).toMatchObject({ title: "ดึงยอดขาย", detail: "เขียน 42 แถว", statusLabel: "สำเร็จ", tone: "ok", auto: true });
    expect(items[2]).toMatchObject({ title: "ดึงค่าแอด Meta · TEAMDEE", detail: "ล่าสุด · เขียน 174 แถว" });
    expect(items[3]).toMatchObject({ title: "รอบอัตโนมัติ", detail: "ดึง 4 ก้อน · เขียน 392 แถว" });
  });
  it("รอบที่ถูกยกเลิกโดยตั้งใจ (SUPERSEDED_*) = ยกเลิกแล้ว สีเทา พร้อมเหตุผล ไม่ใช่ ไม่สำเร็จ สีแดง · รหัสอื่นแปลเป็นภาษาคน", () => {
    const runs = [
      { id: "x1", connectionId: "c1", status: "failed", mode: "incremental", startedAt: "2026-09-16T03:54:00Z", rowsWritten: 0, errorCode: "SUPERSEDED_PURCHASE_FIX", auto: false },
      { id: "x2", connectionId: "c1", status: "failed", mode: "backfill", startedAt: "2026-09-15T16:07:00Z", rowsWritten: 0, errorCode: "STALE_RUN", auto: true },
    ];
    const [superseded, stale] = historyTimeline({ syncRuns: runs, accounts });
    expect(superseded).toMatchObject({ statusLabel: "ยกเลิกแล้ว", tone: "muted" });
    expect(superseded.detail).not.toContain("SUPERSEDED");
    expect(stale).toMatchObject({ statusLabel: "ไม่สำเร็จ", tone: "bad" });
    expect(stale.detail).not.toContain("STALE_RUN");
  });
  it("กรองตามชนิด · ตัวกรองยอดขายรวมรอบสำรวจแหล่งของระบบขายด้วย", () => {
    expect(historyTimeline({ ticks, syncRuns, pipelineRuns: pipes, accounts, kind: "sales" }).map((i) => i.kind)).toEqual(["sales", "inventory"]);
    expect(historyTimeline({ ticks, syncRuns, pipelineRuns: pipes, accounts, kind: "meta" }).map((i) => i.kind)).toEqual(["meta"]);
  });
});
