import { describe, it, expect } from "vitest";
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
