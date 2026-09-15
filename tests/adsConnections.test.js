import { describe, it, expect, vi } from "vitest";
import { planConnections } from "../supabase/functions/_shared/adsConnections.js";
import { applyConnectionResult, enabledMetaMappings } from "../src/modules/marketing/ads/adsConnectionSync.js";

const authorized = [
  { authorization_id: "auth-1", external_account_id: "act_111", account_name: "TEAMDEE Main", currency: "THB", timezone: "Asia/Bangkok", account_status: 1 },
  { authorization_id: "auth-1", external_account_id: "act_222", account_name: "JK Design", currency: "USD", timezone: "UTC", account_status: 1 },
  { authorization_id: "auth-1", external_account_id: "act_333", account_name: "Closed", currency: "THB", timezone: "Asia/Bangkok", account_status: 2 },
];
const source = { leadEvent: "lead", attribution: "7d_click_1d_view", backfillDays: 90, syncEveryHours: 3 };

describe("planConnections", () => {
  it("เฉพาะ mapping ที่เปิดใช้และบัญชีอยู่ในสิทธิ์ของผู้บันทึก · ค่าเงิน/timezone ยึดตาม Meta", () => {
    const plan = planConnections({
      mappings: {
        teamdee: { accountId: "act_111", enabled: true, currency: "USD" },
        jk: { accountId: " act_222 ", enabled: true },
        tar: { accountId: "act_999", enabled: true },
        jun: { accountId: "act_111x", enabled: false },
      },
      source, authorizedAccounts: authorized, existing: [],
    });
    expect(plan.upserts).toEqual([
      { provider: "meta", brand_id: "teamdee", external_account_id: "act_111", account_name: "TEAMDEE Main", currency: "THB", timezone: "Asia/Bangkok", status: "connected", authorization_id: "auth-1", config: { leadEvent: "lead", attribution: "7d_click_1d_view", backfillDays: 90 } },
      { provider: "meta", brand_id: "jk", external_account_id: "act_222", account_name: "JK Design", currency: "USD", timezone: "UTC", status: "connected", authorization_id: "auth-1", config: { leadEvent: "lead", attribution: "7d_click_1d_view", backfillDays: 90 } },
    ]);
    expect(plan.errors).toEqual([{ brandId: "tar", accountId: "act_999", code: "ACCOUNT_NOT_AUTHORIZED" }]);
  });
  it("บัญชีเดียวผูกสองแบรนด์ = error ทั้งคู่ (ยอดจะนับซ้ำ)", () => {
    const plan = planConnections({ mappings: { a: { accountId: "act_111", enabled: true }, b: { accountId: "act_111", enabled: true } }, source, authorizedAccounts: authorized, existing: [] });
    expect(plan.upserts).toEqual([]);
    expect(plan.errors.map((e) => e.code)).toEqual(["ACCOUNT_MAPPED_TWICE", "ACCOUNT_MAPPED_TWICE"]);
  });
  it("บัญชีที่ Meta ปิดใช้งาน (account_status ≠ 1) ไม่สร้าง connection", () => {
    const plan = planConnections({ mappings: { a: { accountId: "act_333", enabled: true } }, source, authorizedAccounts: authorized, existing: [] });
    expect(plan.errors).toEqual([{ brandId: "a", accountId: "act_333", code: "ACCOUNT_NOT_ACTIVE" }]);
  });
  it("connection เดิมที่ถูกปิด mapping → disabled (ไม่ลบ ยอดย้อนหลังยังอยู่) · ตัวที่ยัง map อยู่แต่เราไม่มีสิทธิ์ ไม่แตะ", () => {
    const existing = [
      { id: "c-old", provider: "meta", brand_id: "jun", external_account_id: "act_555", status: "connected" },
      { id: "c-other-lead", provider: "meta", brand_id: "tar", external_account_id: "act_999", status: "connected" },
      { id: "c-already-off", provider: "meta", brand_id: "x", external_account_id: "act_777", status: "disabled" },
      { id: "c-google", provider: "google", brand_id: "jun", external_account_id: "123", status: "connected" },
    ];
    const plan = planConnections({ mappings: { jun: { accountId: "act_555", enabled: false }, tar: { accountId: "act_999", enabled: true } }, source, authorizedAccounts: authorized, existing });
    expect(plan.disable).toEqual(["c-old"]);
  });
  it("account id ผิดรูป = error ไม่ส่งไป Meta", () => {
    const plan = planConnections({ mappings: { a: { accountId: "act_1;drop", enabled: true } }, source, authorizedAccounts: authorized, existing: [] });
    expect(plan.errors[0].code).toBe("ACCOUNT_ID_INVALID");
  });
  it("lead event ที่ไม่รู้จัก → ใช้ค่าเริ่ม · backfill นอกช่วง → 30", () => {
    const plan = planConnections({ mappings: { a: { accountId: "act_111", enabled: true } }, source: { leadEvent: "purchase_hack", backfillDays: 5000 }, authorizedAccounts: authorized, existing: [] });
    expect(plan.upserts[0].config).toEqual({ leadEvent: "messaging_conversation_started_7d", attribution: "platform_default", backfillDays: 30 });
  });
});

describe("ฝั่งหน้าตั้งค่า", () => {
  it("enabledMetaMappings: มีบัญชีเปิดใช้อย่างน้อย 1 ถึงจะเรียก backend", () => {
    expect(enabledMetaMappings({ mappings: { meta: { a: { accountId: "act_1", enabled: true }, b: { enabled: true } } } })).toEqual({ a: { accountId: "act_1", enabled: true } });
    expect(enabledMetaMappings({})).toEqual({});
  });
  it("applyConnectionResult: ใส่ connectionId/สถานะกลับเข้า mapping ของแบรนด์ · error ติดรหัสไว้ · แบรนด์อื่นไม่แตะ", () => {
    const config = { mappings: { meta: { a: { accountId: "act_111", enabled: true }, b: { accountId: "act_999", enabled: true, connectionId: "old" }, c: { accountId: "act_5", enabled: false, connectionId: "c-off" } }, google: { a: { accountId: "1" } } }, sources: {} };
    const out = applyConnectionResult(config, {
      connections: [{ id: "c-1", brand_id: "a", external_account_id: "act_111", status: "connected", last_success_at: null, last_error_code: null }],
      errors: [{ brandId: "b", accountId: "act_999", code: "ACCOUNT_NOT_AUTHORIZED" }],
      disabled: ["c-off"],
    });
    expect(out.mappings.meta.a).toMatchObject({ connectionId: "c-1", oauthStatus: "connected", connectionError: null });
    expect(out.mappings.meta.b).toMatchObject({ connectionId: "old", connectionError: "ACCOUNT_NOT_AUTHORIZED" });
    expect(out.mappings.meta.c.connectionId).toBeUndefined();
    expect(out.mappings.google).toBe(config.mappings.google);
    expect(config.mappings.meta.a.connectionId).toBeUndefined();          // ไม่แก้ object เดิม
  });
});

import { META_LEAD_EVENTS } from "../supabase/functions/_shared/adsConnections.js";
import { ADS_PROVIDERS } from "../src/modules/marketing/ads/adsConnectorContract.js";
describe("สัญญาเดียวกันสองฝั่ง", () => {
  it("lead event ฝั่ง Edge Function ตรงกับตัวเลือกในหน้าตั้งค่า", () => {
    expect(META_LEAD_EVENTS).toEqual(ADS_PROVIDERS.find((p) => p.id === "meta").leadEvents);
  });
});

describe("ย้ายบัญชีไปแบรนด์อื่น", () => {
  it("connection เดิมของบัญชีนั้นถูก upsert เป็นแบรนด์ใหม่ ต้องไม่ถูกปิดทิ้งตาม", () => {
    const existing = [{ id: "c-1", provider: "meta", brand_id: "old-brand", external_account_id: "act_111", status: "connected" }];
    const plan = planConnections({ mappings: { "new-brand": { accountId: "act_111", enabled: true } }, source, authorizedAccounts: authorized, existing });
    expect(plan.upserts.map((u) => u.brand_id)).toEqual(["new-brand"]);
    expect(plan.disable).toEqual([]);
  });
});

describe("สถานะจากฐานทับ mapping (หน้าสถานะ Sync)", () => {
  it("sync พัง (status error) ยังนับว่าเชื่อม OAuth แล้ว แต่ติด lastErrorCode · token หมดอายุ = expired", () => {
    const config = { mappings: { meta: { a: { accountId: "act_1", enabled: true }, b: { accountId: "act_2", enabled: true } } } };
    const out = applyConnectionResult(config, { connections: [
      { id: "c1", brand_id: "a", external_account_id: "act_1", status: "error", last_success_at: "2026-09-14T01:00:00Z", last_error_code: "META_RATE_LIMIT" },
      { id: "c2", brand_id: "b", external_account_id: "act_2", status: "expired", last_success_at: null, last_error_code: "META_TOKEN_INVALID" },
    ] });
    expect(out.mappings.meta.a).toMatchObject({ connectionId: "c1", oauthStatus: "connected", lastErrorCode: "META_RATE_LIMIT", lastSuccessAt: "2026-09-14T01:00:00Z" });
    expect(out.mappings.meta.b).toMatchObject({ oauthStatus: "expired", lastErrorCode: "META_TOKEN_INVALID" });
  });
});

import { runSyncQueue } from "../src/modules/marketing/ads/adsConnectionSync.js";
describe("runSyncQueue", () => {
  it("ดึงทีละบัญชีตามลำดับ · บัญชีหนึ่งพังไม่หยุดบัญชีอื่น · รายงานผลรายบัญชี", async () => {
    const order = [];
    const sync = async (id) => { order.push(`start:${id}`); await Promise.resolve(); order.push(`end:${id}`); if (id === "c2") throw Object.assign(new Error("x"), { code: "META_RATE_LIMIT" }); return { rowsWritten: 10, mode: "backfill" }; };
    const progress = [];
    const out = await runSyncQueue(["c1", "c2", "c3"], sync, (done, total) => progress.push(`${done}/${total}`));
    expect(order).toEqual(["start:c1", "end:c1", "start:c2", "end:c2", "start:c3", "end:c3"]);
    expect(out).toEqual([
      { connectionId: "c1", ok: true, rowsWritten: 10, mode: "backfill", code: null },
      { connectionId: "c2", ok: false, rowsWritten: 0, mode: null, code: "META_RATE_LIMIT" },
      { connectionId: "c3", ok: true, rowsWritten: 10, mode: "backfill", code: null },
    ]);
    expect(progress).toEqual(["1/3", "2/3", "3/3"]);
  });
});

import { liveTeamAccounts } from "../supabase/functions/_shared/adsConnections.js";
describe("liveTeamAccounts — team_lead ผูกบัญชีที่สมาชิกคนใดคนหนึ่งเชื่อม OAuth ไว้", () => {
  const NOW = Date.parse("2026-09-15T10:00:00Z");
  const auths = [
    { id: "au-lead", user_id: "lead", status: "connected", expires_at: "2026-11-01T00:00:00Z", last_verified_at: "2026-09-10T00:00:00Z" },
    { id: "au-fai", user_id: "fai", status: "connected", expires_at: null, last_verified_at: "2026-09-14T00:00:00Z" },
    { id: "au-old", user_id: "old", status: "connected", expires_at: "2026-09-01T00:00:00Z", last_verified_at: "2026-08-01T00:00:00Z" },
    { id: "au-rev", user_id: "rev", status: "revoked", expires_at: null, last_verified_at: "2026-09-15T00:00:00Z" },
  ];
  const acc = (authorization_id, external_account_id) => ({ authorization_id, external_account_id, account_name: external_account_id, account_status: 1 });
  it("ตัด authorization ที่หมดอายุ/ถูกยกเลิก · บัญชีซ้ำเลือก token ของผู้เรียกก่อน ไม่งั้นตัวที่ยืนยันล่าสุด", () => {
    const out = liveTeamAccounts([acc("au-lead", "act_1"), acc("au-fai", "act_1"), acc("au-fai", "act_2"), acc("au-old", "act_3"), acc("au-rev", "act_4")], auths, { callerUserId: "lead", now: NOW });
    expect(out.map((a) => [a.external_account_id, a.authorization_id])).toEqual([["act_1", "au-lead"], ["act_2", "au-fai"]]);
    const other = liveTeamAccounts([acc("au-lead", "act_1"), acc("au-fai", "act_1")], auths, { callerUserId: "someone", now: NOW });
    expect(other[0].authorization_id).toBe("au-fai");
  });
});

describe("liveTeamAccounts — สมาชิกที่ถูกปิดโปรไฟล์ token ใช้ต่อไม่ได้", () => {
  it("activeUserIds ระบุ = ตัด authorization ของผู้ใช้ที่ไม่อยู่ในรายชื่อ", () => {
    const auths = [
      { id: "a1", user_id: "active", status: "connected", expires_at: null, last_verified_at: "2026-09-10T00:00:00Z" },
      { id: "a2", user_id: "left", status: "connected", expires_at: null, last_verified_at: "2026-09-14T00:00:00Z" },
    ];
    const accounts = [{ authorization_id: "a1", external_account_id: "act_1" }, { authorization_id: "a2", external_account_id: "act_2" }, { authorization_id: "a2", external_account_id: "act_1" }];
    const out = liveTeamAccounts(accounts, auths, { activeUserIds: new Set(["active"]) });
    expect(out.map((a) => [a.external_account_id, a.authorization_id])).toEqual([["act_1", "a1"]]);
  });
});

import { latestReconcileByConnection, applyReconciliation } from "../src/modules/marketing/ads/adsConnectionSync.js";
describe("ผลตรวจยอดจาก run โหมด reconcile → mapping (ให้ adsDataHealth/reconciliationRows ใช้)", () => {
  const run = (connectionId, startedAt, passed, patch = {}) => ({
    connection_id: connectionId, mode: "reconcile", status: passed ? "success" : "partial", started_at: startedAt,
    summary: { kind: "reconcile", tolerance: 1, checkedAt: startedAt, passed,
      windows: { "7d": { from: "2026-09-08", to: "2026-09-14", localSpend: 100, remoteSpend: 100, diffPct: 0, status: "passed" },
        "30d": { from: "2026-08-16", to: "2026-09-14", localSpend: 500, remoteSpend: passed ? 500 : 700, diffPct: passed ? 0 : 40, status: passed ? "passed" : "failed" } } },
    ...patch,
  });
  it("เอาเฉพาะ run ล่าสุดต่อ connection · ข้ามโหมดอื่นและ run ที่ไม่มี summary", () => {
    const latest = latestReconcileByConnection([
      run("c1", "2026-09-15T09:00:00Z", false), run("c1", "2026-09-15T10:00:00Z", true),
      run("c2", "2026-09-15T08:00:00Z", true, { summary: null }), { connection_id: "c1", mode: "incremental", started_at: "2026-09-15T11:00:00Z" },
    ]);
    expect([...latest.keys()]).toEqual(["c1"]);
    expect(latest.get("c1").passed).toBe(true);
  });
  it("ใส่ผลเข้า mapping ตาม connectionId · แถวที่ไม่มี run ไม่แตะ · โครงตรงกับที่ reconciliationRows อ่าน", () => {
    const config = { mappings: { meta: { td: { accountId: "act_1", enabled: true, connectionId: "c1" }, jk: { accountId: "act_2", enabled: true, connectionId: "c2" } } } };
    const out = applyReconciliation(config, latestReconcileByConnection([run("c1", "2026-09-15T10:00:00Z", true)]));
    expect(out.mappings.meta.td.reconciliation).toMatchObject({ status: "passed", checkedAt: "2026-09-15T10:00:00Z" });
    expect(out.mappings.meta.td.reconciliation.windows["7d"]).toMatchObject({ localSpend: 100, remoteSpend: 100 });
    expect(out.mappings.meta.jk.reconciliation).toBeUndefined();
    expect(config.mappings.meta.td.reconciliation).toBeUndefined();
  });
  it("ต่อเข้า reconciliationRows/adsDataHealth แล้วปลดป้ายรอตรวจยอดจริง", async () => {
    const { reconciliationRows, adsDataHealth } = await import("../src/modules/marketing/ads/adsDataHealth.js");
    const base = { mappings: { meta: { td: { accountId: "act_1", enabled: true, connectionId: "c1", oauthStatus: "connected", timezone: "Asia/Bangkok", currency: "THB", lastSuccessAt: new Date().toISOString() } } }, rules: { reconciliationTolerance: 1 } };
    const before = adsDataHealth(base);
    expect(before.state).toBe("unverified");
    const merged = applyReconciliation(base, latestReconcileByConnection([run("c1", "2026-09-15T10:00:00Z", true)]));
    const row = reconciliationRows(merged, [{ id: "td", name: "TEAMDEE" }])[0];
    expect(row.ready).toBe(true);
    expect(row.checks.map((c) => c.status)).toEqual(["passed", "passed"]);
    const after = adsDataHealth(merged);
    expect(after.state).toBe("healthy");
    expect(after.goLive).toBe(true);
  });
});

import { runSyncJobs, applyCoverage, syncCreativesFor } from "../src/modules/marketing/ads/adsConnectionSync.js";
describe("runSyncJobs — คิวดึงยอดแบบแบ่งก้อน", () => {
  it("ทำทีละก้อนตามลำดับ · ส่งช่วงวันไปกับคำขอ · ก้อนพังไม่หยุดก้อนอื่น · สรุปผลต่อบัญชี", async () => {
    const jobs = [
      { connectionId: "a", mode: "backfill", from: "2026-09-06", to: "2026-09-15" },
      { connectionId: "a", mode: "backfill", from: "2026-08-27", to: "2026-09-05" },
      { connectionId: "b", mode: "incremental", from: "2026-09-13", to: "2026-09-15" },
    ];
    const calls = [];
    const sync = async (id, mode, range) => {
      calls.push([id, mode, range.from, range.to]);
      if (range.from === "2026-08-27") throw Object.assign(new Error("x"), { code: "SYNC_FAILED" });
      return { rowsWritten: 5 };
    };
    const progress = [];
    const out = await runSyncJobs(jobs, sync, (done, total) => progress.push(`${done}/${total}`));
    expect(calls).toEqual([["a", "backfill", "2026-09-06", "2026-09-15"], ["a", "backfill", "2026-08-27", "2026-09-05"], ["b", "incremental", "2026-09-13", "2026-09-15"]]);
    expect(progress).toEqual(["1/3", "2/3", "3/3"]);
    expect(out.byConnection).toEqual({
      a: { jobs: 2, ok: 1, failed: 1, rowsWritten: 5, firstError: "SYNC_FAILED" },
      b: { jobs: 1, ok: 1, failed: 0, rowsWritten: 5, firstError: null },
    });
    expect(out.failed).toBe(1);
  });
  it("บัญชีเจอ token เสีย/สิทธิ์ไม่พอ = ข้ามก้อนที่เหลือของบัญชีนั้น (ยิงต่อก็พังซ้ำ)", async () => {
    const jobs = [1, 2, 3].map((n) => ({ connectionId: "a", mode: "backfill", from: `2026-09-0${n}`, to: `2026-09-0${n}` }));
    const sync = vi.fn(async () => { throw Object.assign(new Error("x"), { code: "META_TOKEN_INVALID" }); });
    const out = await runSyncJobs(jobs, sync);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(out.byConnection.a).toMatchObject({ jobs: 3, failed: 3, firstError: "META_TOKEN_INVALID" });
  });
});

describe("applyCoverage — ช่อง 'ช่องว่าง' ในหน้าสถานะ Sync มาจากประวัติ run จริง", () => {
  it("ใส่ missingDays ต่อแบรนด์ตาม connectionId · แถวที่ไม่รู้ไม่แตะ", () => {
    const config = { mappings: { meta: { td: { connectionId: "c1" }, jk: { connectionId: "c2" }, x: {} } } };
    const out = applyCoverage(config, new Map([["c1", 0], ["c2", 3]]));
    expect(out.mappings.meta.td.missingDays).toBe(0);
    expect(out.mappings.meta.jk.missingDays).toBe(3);
    expect(out.mappings.meta.x.missingDays).toBeUndefined();
  });
});

describe("syncCreativesFor — ดึง creative ต่อเนื่องจน nextCursor = null", () => {
  it("วนตาม cursor · รวมจำนวนที่บันทึก · มีเพดานรอบกันวนไม่รู้จบ", async () => {
    const call = vi.fn(async (id, cursor) => cursor == null ? { saved: 90, nextCursor: "c1" } : { saved: 40, nextCursor: null });
    expect(await syncCreativesFor("c1", call)).toEqual({ saved: 130, rounds: 2, error: null });
    expect(call.mock.calls.map((c) => c[1])).toEqual([null, "c1"]);
    const loop = vi.fn(async () => ({ saved: 1, nextCursor: "again" }));
    expect((await syncCreativesFor("c1", loop, 3)).rounds).toBe(3);
  });
  it("พังกลางทาง = คืนสิ่งที่ได้แล้ว + รหัส error (ไม่ throw ให้คิวหลักล้ม)", async () => {
    const call = vi.fn().mockResolvedValueOnce({ saved: 50, nextCursor: "c1" }).mockRejectedValueOnce(Object.assign(new Error("x"), { code: "META_RATE_LIMIT" }));
    expect(await syncCreativesFor("c1", call)).toEqual({ saved: 50, rounds: 2, error: "META_RATE_LIMIT" });
  });
});
