import { describe, expect, it } from "vitest";
import { normalizeCronTicks, cronHealth, adsDataHealth, normalizeSyncRuns, reconciliationRows, syncAccountRows } from "../src/modules/marketing/ads/adsDataHealth.js";

const mapping = (over = {}) => ({ enabled: true, accountId: "act_123", timezone: "Asia/Bangkok", currency: "THB", ...over });

describe("adsDataHealth", () => {
  it("ไม่รายงานว่าพร้อมเมื่อยังไม่มี OAuth และข้อมูลจริง", () => {
    const health = adsDataHealth({ mappings: { meta: { b1: mapping() } } });
    expect(health.state).toBe("waiting");
    expect(health.goLive).toBe(false);
  });

  it("แยกข้อมูลปกติกับข้อมูลล่าช้าตามกฎ", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    const connected = (lastSuccessAt) => mapping({ connectionId: "c1", oauthStatus: "connected", lastSuccessAt, reconciliation: { status: "passed" } });
    expect(adsDataHealth({ mappings: { meta: { b1: connected("2026-09-14T10:00:00Z") } } }, now).state).toBe("healthy");
    expect(adsDataHealth({ mappings: { meta: { b1: connected("2026-09-14T04:00:00Z") } } }, now).state).toBe("stale");
  });

  it("ไม่ขึ้นพร้อมใช้เมื่อข้อมูลสดแต่ยังไม่ตรวจยอด", () => {
    const health = adsDataHealth({ mappings: { meta: { b1: mapping({ connectionId: "c1", oauthStatus: "connected", lastSuccessAt: "2026-09-14T10:00:00Z" }) } } }, new Date("2026-09-14T12:00:00Z"));
    expect(health.state).toBe("unverified");
    expect(health.goLive).toBe(false);
  });

  it("รายงานปัญหาที่รุนแรงที่สุดเมื่อมีหลายแพลตฟอร์ม", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    const config = { mappings: {
      meta: { b1: mapping({ connectionId: "c1", oauthStatus: "connected", lastSuccessAt: "2026-09-14T04:00:00Z" }) },
      google: { b1: mapping({ accountId: "123-456-7890", connectionId: "c2", oauthStatus: "connected", lastErrorCode: "TOKEN_EXPIRED" }) },
    } };
    expect(adsDataHealth(config, now).state).toBe("error");
  });

  it("ไม่ให้ผ่านเมื่อข้อมูลมีช่วงวันที่ขาด", () => {
    const health = adsDataHealth({ mappings: { meta: { b1: mapping({ connectionId: "c1", oauthStatus: "connected", lastSuccessAt: "2026-09-14T10:00:00Z", missingDays: 2, reconciliation: { status: "passed" } }) } } }, new Date("2026-09-14T12:00:00Z"));
    expect(health.state).toBe("missing");
    expect(health.goLive).toBe(false);
  });
});

describe("reconciliationRows", () => {
  it("ต้องมีผลตรวจ 7 และ 30 วันภายใน tolerance จึงพร้อมเปิดใช้", () => {
    const config = { rules: { reconciliationTolerance: 1 }, mappings: { meta: { b1: mapping({ connectionId: "c1", oauthStatus: "connected", reconciliation: { windows: { "7d": { localSpend: 1000, remoteSpend: 1005 }, "30d": { localSpend: 4000, remoteSpend: 4200 } } } }) } } };
    const [row] = reconciliationRows(config, [{ id: "b1", name: "Brand" }]);
    expect(row.checks[0].status).toBe("passed");
    expect(row.checks[1].status).toBe("failed");
    expect(row.ready).toBe(false);
  });

  it("รองรับการตรวจช่วงที่ทั้งสองฝั่งเป็นศูนย์", () => {
    const config = { mappings: { meta: { b1: mapping({ connectionId: "c1", oauthStatus: "connected", reconciliation: { windows: { "7d": { localSpend: 0, remoteSpend: 0 }, "30d": { localSpend: 0, remoteSpend: 0 } } } }) } } };
    const [row] = reconciliationRows(config, [{ id: "b1", name: "Brand" }]);
    expect(row.checks.every((check) => check.status === "passed")).toBe(true);
    expect(row.ready).toBe(true);
  });
});

describe("sync status", () => {
  it("แสดงสถานะรายบัญชีจากหลักฐานจริงและไม่ถือว่า mapping เท่ากับเชื่อมแล้ว", () => {
    const config = { mappings: { meta: {
      b1: mapping({ accountId: "act_1" }),
      b2: mapping({ accountId: "act_2", connectionId: "c2", oauthStatus: "connected", lastSuccessAt: "2026-09-14T10:00:00Z", reconciliation: { status: "passed" } }),
    } } };
    const rows = syncAccountRows(config, [{ id: "b1", name: "A" }, { id: "b2", name: "B" }], new Date("2026-09-14T12:00:00Z"));
    expect(rows[0]).toMatchObject({ brand: "A", connected: false, state: "waiting" });
    expect(rows[1]).toMatchObject({ brand: "B", connected: true, state: "healthy", creativeEnabled: true });
  });
  it("normalize ประวัติ backend และเรียงใหม่สุดก่อน", () => {
    const runs = normalizeSyncRuns([{ id: "a", started_at: "2026-09-13", rows_written: 4 }, { id: "b", started_at: "2026-09-14", rows_written: 8 }]);
    expect(runs.map((run) => run.id)).toEqual(["b", "a"]);
    expect(runs[0].rowsWritten).toBe(8);
  });
});

describe("normalizeSyncRuns — ผู้สั่ง", () => {
  it("run ที่ไม่มี triggered_by = อัตโนมัติ · มี = คนกดเอง", () => {
    const rows = normalizeSyncRuns([
      { id: "r1", connection_id: "c1", status: "success", mode: "incremental", started_at: "2026-09-16T04:00:00Z", triggered_by: null },
      { id: "r2", connection_id: "c1", status: "success", mode: "backfill", started_at: "2026-09-16T03:00:00Z", triggered_by: "user-1" },
    ]);
    expect(rows.map((r) => r.auto)).toEqual([true, false]);
  });
});

describe("normalizeCronTicks — ประวัติตัวดึงอัตโนมัติ", () => {
  it("แปลงชื่อคอลัมน์ · เรียงใหม่ไปเก่า · รอบที่ยังไม่จบไม่มีเวลาจบ", () => {
    const rows = [
      { id: "t1", started_at: "2026-09-16T03:07:00Z", finished_at: "2026-09-16T03:07:42Z", source: "pg_cron", status: "success", planned: 4, synced: 4, reconciled: 0, failed: 0, rows_written: 1200, sync_every_hours: 6, detail: {} },
      { id: "t2", started_at: "2026-09-16T04:07:00Z", finished_at: null, source: "manual", status: "running", planned: 0, synced: 0, reconciled: 0, failed: 0, rows_written: 0 },
    ];
    const ticks = normalizeCronTicks(rows);
    expect(ticks.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(ticks[1]).toMatchObject({ source: "pg_cron", status: "success", planned: 4, synced: 4, rowsWritten: 1200, syncEveryHours: 6, auto: true });
    expect(ticks[0]).toMatchObject({ source: "manual", auto: false, finishedAt: null, durationMs: null });
    expect(ticks[1].durationMs).toBe(42000);
  });
  it("แถวพัง/ว่าง ไม่ทำให้ล้ม", () => {
    expect(normalizeCronTicks([null, undefined])).toEqual([]);
    expect(normalizeCronTicks()).toEqual([]);
  });
});

describe("cronHealth — สรุปว่าตัวดึงอัตโนมัติยังวิ่งอยู่ไหม", () => {
  const now = Date.parse("2026-09-16T04:30:00Z");
  it("มีรอบภายใน 2 ชั่วโมง = ปกติ", () => {
    expect(cronHealth([{ startedAt: "2026-09-16T04:07:00Z", status: "success" }], now)).toMatchObject({ state: "healthy", label: "ทำงานปกติ" });
  });
  it("เงียบเกิน 2 ชั่วโมง = ผิดปกติ · ยังไม่เคยวิ่งเลย = ยังไม่เริ่ม", () => {
    expect(cronHealth([{ startedAt: "2026-09-16T01:00:00Z", status: "success" }], now).state).toBe("stale");
    expect(cronHealth([], now).state).toBe("idle");
  });
  it("รอบล่าสุดพัง = ต้องแก้ แม้เวลาจะสด", () => {
    expect(cronHealth([{ startedAt: "2026-09-16T04:07:00Z", status: "failed" }], now).state).toBe("error");
  });
});
