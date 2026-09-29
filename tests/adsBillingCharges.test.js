/* รายการตัดบัตรจริงจาก Meta (29 ก.ย. — อาร์ตทดสอบใน Graph API Explorer ยืนยันว่าใช้ได้ด้วยสิทธิ์ ads_read)
   GET /act_{id}/activities?category=BUDGET → event_type "ad_account_billing_charge" · extra_data เป็น JSON string
   {"currency":"THB","new_value":700000,"transaction_id":"…"} · new_value = สตางค์ (ยืนยันจาก balance ช่องเดียวกัน)
   fixture ใช้เลขสมมุติ (repo public — ห้ามมีเลขบัญชี/รายการจริง) */
import { describe, expect, it, vi } from "vitest";
import {
  BILLING_KINDS, activitiesUrl, billingSince, chargeWindows, fetchBillingCharges, parseBillingActivities,
} from "../supabase/functions/_shared/adsBillingCharges.js";

const ev = (event_type, event_time, extra) => ({ event_type, event_time, extra_data: JSON.stringify(extra) });

describe("parseBillingActivities — แปลงเหตุการณ์เป็นแถว ad_billing_charges", () => {
  const rows = parseBillingActivities([
    ev("ad_account_billing_charge", "2026-09-26T09:56:29+0000", { currency: "THB", new_value: 700000, transaction_id: "111-222" }),
    ev("ad_account_billing_charge", "2026-09-22T22:19:05+0000", { currency: "THB", new_value: 154192, transaction_id: "333-444" }),
    ev("update_campaign_run_status", "2026-09-27T14:03:06+0000", { run_status: { old_value: 1, new_value: 15 } }),
  ], "act_900000001");

  it("เฉพาะเหตุการณ์ตัดบัตร · สตางค์ → บาท · เลขรายการเป็น reference · ตัด act_ ออก", () => {
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: "meta_api", external_account_id: "900000001", amount: 7000, reference: "111-222" });
    expect(rows[0].raw).toMatchObject({ kind: "charge", currency: "THB", amount_minor: 700000, event_type: "ad_account_billing_charge" });
  });
  it("วันที่ตัด = วันที่เวลาไทย (22:19 UTC วันที่ 22 = 05:19 ไทยวันที่ 23)", () => {
    expect(rows[0].charge_date).toBe("2026-09-26");
    expect(rows[1].charge_date).toBe("2026-09-23");
    expect(rows[1].amount).toBe(1541.92);
  });
  it("ตัดไม่ผ่าน / คืนเงิน / chargeback เก็บไว้พร้อมชนิด (หน้าบิลใช้เตือน ไม่นับเป็นยอดตัด)", () => {
    const [failed, refund] = parseBillingActivities([
      ev("ad_account_billing_charge_failed", "2026-09-10T01:00:00+0000", { currency: "THB", new_value: 700000, transaction_id: "555" }),
      ev("ad_account_billing_refund", "2026-09-11T01:00:00+0000", { currency: "THB", new_value: 12050, transaction_id: "666" }),
    ], "900000001");
    expect(failed.raw.kind).toBe("failed");
    expect(refund).toMatchObject({ amount: 120.5, raw: { kind: "refund" } });
    expect(Object.values(BILLING_KINDS)).toEqual(expect.arrayContaining(["charge", "failed", "declined", "refund", "chargeback", "chargeback_reversal"]));
  });
  it("ไม่มีเลขรายการ = อ้างอิงจากชนิด+เวลา (ดึงซ้ำแล้วไม่เกิดแถวซ้ำ) · ข้อมูลเสีย/ไม่มียอด = ข้าม ไม่เดาเป็น 0", () => {
    const out = parseBillingActivities([
      ev("ad_account_billing_decline", "2026-09-12T01:00:00+0000", { currency: "THB", new_value: 700000 }),
      { event_type: "ad_account_billing_charge", event_time: "2026-09-13T01:00:00+0000", extra_data: "{ไม่ใช่ json" },
      ev("ad_account_billing_charge", "2026-09-14T01:00:00+0000", { currency: "THB", transaction_id: "777" }),
    ], "900000001");
    expect(out).toHaveLength(1);
    expect(out[0].reference).toBe("declined:2026-09-12T01:00:00+0000");
  });
});

describe("ช่วงวันที่ที่ดึง", () => {
  /* 29 ก.ย. (ตรวจข้อมูลกับ Meta): ส่งวันที่เปล่า Meta ตีเป็น 00:00 UTC (= 07:00 ไทย) และ until ไม่รวม
     → บิลที่ตัดหลัง 07:00 ของวันที่ดึงหาย (t around ตัด 07:08 วันนี้ ฿19,572.33 ไม่เข้า) + รอยต่อช่วงหาย 1 วัน
     (29 ส.ค. 07:00 – 30 ส.ค. 07:00 ไทย: TEAMDEE ฿7,000 ตอน 20:26 ไม่เข้า) — ต้องเป็นเวลาเที่ยงคืนไทย และ until = วันถัดไป */
  it("activitiesUrl: หมวด BUDGET · ช่วงเป็น unix เที่ยงคืนเวลาไทย · until ครอบทั้งวันสุดท้าย", () => {
    const url = activitiesUrl({ version: "v26.0", accountId: "900000001", since: "2026-09-01", until: "2026-09-29" });
    const since = Date.parse("2026-09-01T00:00:00+07:00") / 1000;
    const until = Date.parse("2026-09-30T00:00:00+07:00") / 1000;
    expect(url).toBe(`https://graph.facebook.com/v26.0/act_900000001/activities?fields=event_type,event_time,extra_data&category=BUDGET&since=${since}&until=${until}&limit=500`);
  });
  it("ช่วงที่แบ่งต่อกันไม่มีรอยรั่ว: until ของช่วงก่อน = since ของช่วงถัดไป (เวลาเดียวกันเป๊ะ)", () => {
    const [a, b] = chargeWindows({ since: "2026-06-01", until: "2026-09-29" });
    const q = (w) => new URL(activitiesUrl({ version: "v26.0", accountId: "1", ...w })).searchParams;
    expect(q(a).get("until")).toBe(q(b).get("since"));
    // บิล TEAMDEE 29 ส.ค. 20:26 ไทย ต้องอยู่ในช่วงใดช่วงหนึ่ง
    const t = Date.parse("2026-08-29T20:26:00+07:00") / 1000;
    expect([a, b].some((w) => Number(q(w).get("since")) <= t && t < Number(q(w).get("until")))).toBe(true);
  });
  it("chargeWindows: แบ่งช่วงละไม่เกิน 90 วัน ต่อกันไม่ขาด", () => {
    expect(chargeWindows({ since: "2026-06-01", until: "2026-09-29" })).toEqual([
      { since: "2026-06-01", until: "2026-08-29" }, { since: "2026-08-30", until: "2026-09-29" },
    ]);
    expect(chargeWindows({ since: "2026-09-20", until: "2026-09-29" })).toEqual([{ since: "2026-09-20", until: "2026-09-29" }]);
  });
  it("billingSince: ยังไม่เคยดึง = ย้อนถึงวันเริ่มใช้ระบบ · เคยดึงแล้ว = ย้อนซ้อน 7 วันเผื่อ Meta ลงเหตุการณ์ช้า", () => {
    expect(billingSince({ latest: null, today: "2026-09-29" })).toBe("2026-06-01");
    expect(billingSince({ latest: "2026-09-26", today: "2026-09-29" })).toBe("2026-09-19");
    expect(billingSince({ latest: "2026-05-01", today: "2026-09-29" })).toBe("2026-06-01");
  });
});

describe("fetchBillingCharges", () => {
  it("ดึงทุกบัญชีทุกช่วง รวมหน้า · บัญชีที่ล้มข้ามไป ไม่ล้มทั้งชุด · บอกว่าบัญชีไหนล้ม", async () => {
    const fetch = vi.fn(async (url) => {
      if (String(url).includes("act_900000002")) return { ok: false, status: 400, json: async () => ({ error: { message: "no permission", code: 200 } }) };
      return { ok: true, status: 200, json: async () => ({ data: [ev("ad_account_billing_charge", "2026-09-26T09:56:29+0000", { currency: "THB", new_value: 700000, transaction_id: "111-222" })] }) };
    });
    const out = await fetchBillingCharges({ fetch, token: "t", sleep: async () => {}, version: "v26.0", accountIds: ["900000001", "900000002"], since: "2026-09-20", until: "2026-09-29" });
    expect(out.rows).toHaveLength(1);
    expect(out.failed).toEqual(["900000002"]);
  });
});

/* ดึง + บันทึก (ใช้ร่วม ads-cron รอบ 09:00 และปุ่ม "ดึงยอดค้างบัญชีแอด" ใน ads-snapshot) */
import { syncBillingCharges } from "../supabase/functions/_shared/adsBillingCharges.js";
describe("syncBillingCharges", () => {
  const fakeDb = ({ latest = null, upsertError = null } = {}) => {
    const calls = { upserts: [], latestQuery: null };
    const db = {
      from: (table) => ({
        select: () => ({ eq: (col, val) => ({ order: () => ({ limit: () => ({ maybeSingle: async () => { calls.latestQuery = { table, col, val }; return { data: latest ? { charge_date: latest } : null }; } }) }) }) }),
        upsert: async (rows, opts) => { calls.upserts.push({ table, rows, opts }); return { error: upsertError }; },
      }),
    };
    return { db, calls };
  };
  const okFetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [ev("ad_account_billing_charge", "2026-09-26T09:56:29+0000", { currency: "THB", new_value: 700000, transaction_id: "111-222" })] }) }));

  it("ย้อนซ้อน 7 วันจากรายการล่าสุด (เฉพาะแถวจาก meta_api) · upsert กันซ้ำด้วยบัญชี+เลขรายการ · สรุปผล", async () => {
    const { db, calls } = fakeDb({ latest: "2026-09-26" });
    const out = await syncBillingCharges({ db, fetch: okFetch, token: "t", sleep: async () => {}, version: "v26.0", accountIds: ["900000001"], today: "2026-09-29" });
    expect(calls.latestQuery).toEqual({ table: "ad_billing_charges", col: "source", val: "meta_api" });
    expect(okFetch.mock.calls[0][0]).toContain(`since=${Date.parse("2026-09-19T00:00:00+07:00") / 1000}&until=${Date.parse("2026-09-30T00:00:00+07:00") / 1000}`);
    expect(calls.upserts[0]).toMatchObject({ table: "ad_billing_charges", opts: { onConflict: "external_account_id,reference" } });
    expect(out).toEqual({ since: "2026-09-19", rows: 1, failed: [], error: null });
  });
  it("ไม่มีเหตุการณ์ = ไม่ upsert · บันทึกไม่สำเร็จ = คืนข้อความ error ไม่ throw (รอบ cron ต้องไปต่อ)", async () => {
    const empty = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
    const a = fakeDb();
    expect((await syncBillingCharges({ db: a.db, fetch: empty, token: "t", sleep: async () => {}, version: "v26.0", accountIds: ["1"], today: "2026-09-29" })).rows).toBe(0);
    expect(a.calls.upserts).toHaveLength(0);
    const b = fakeDb({ upsertError: { message: "no unique index" } });
    const out = await syncBillingCharges({ db: b.db, fetch: okFetch, token: "t", sleep: async () => {}, version: "v26.0", accountIds: ["1"], today: "2026-09-29" });
    expect(out.error).toBe("no unique index");
  });
});

it("เหตุการณ์เดียวกันมาซ้ำในชุดเดียว = บันทึกแถวเดียว (upsert ชุดเดียวที่มีคีย์ซ้ำ Postgres จะ error)", async () => {
  const dup = ev("ad_account_billing_charge", "2026-09-26T09:56:29+0000", { currency: "THB", new_value: 700000, transaction_id: "111-222" });
  const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [dup, dup] }) }));
  const upserts = [];
  const db = { from: () => ({
    select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
    upsert: async (rows) => { upserts.push(rows); return { error: null }; },
  }) };
  const out = await syncBillingCharges({ db, fetch, token: "t", sleep: async () => {}, version: "v26.0", accountIds: ["1"], today: "2026-06-10" });
  expect(upserts[0]).toHaveLength(1);
  expect(out.rows).toBe(1);
});

/* ดึงย้อนตั้งแต่วันที่กำหนด (ครั้งเดียว) — เติมรอยรั่ว 29 ส.ค. ที่รอบปกติ (ย้อน 7 วัน) ไปไม่ถึง */
it("syncBillingCharges({ since }): ไม่สนรายการล่าสุด · ต่ำกว่าวันเริ่มระบบ/ค่าเสีย = ใช้วันเริ่มระบบ/ปกติ", async () => {
  const calls = [];
  const fetch = vi.fn(async (url) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => ({ data: [] }) }; });
  const db = { from: () => ({
    select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { charge_date: "2026-09-28" } }) }) }) }) }),
    upsert: async () => ({ error: null }),
  }) };
  const base = { db, fetch, token: "t", sleep: async () => {}, version: "v26.0", accountIds: ["1"], today: "2026-09-29" };
  const at = (iso) => Date.parse(`${iso}T00:00:00+07:00`) / 1000;
  expect((await syncBillingCharges({ ...base, since: "2026-06-01" })).since).toBe("2026-06-01");
  expect(calls[0]).toContain(`since=${at("2026-06-01")}`);
  expect((await syncBillingCharges({ ...base, since: "2025-01-01" })).since).toBe("2026-06-01");     // ก่อนวันเริ่มระบบ = วันเริ่มระบบ
  expect((await syncBillingCharges({ ...base, since: "ไม่ใช่วันที่" })).since).toBe("2026-09-21");  // ค่าเสีย = รอบปกติ (ล่าสุด −7)
});
