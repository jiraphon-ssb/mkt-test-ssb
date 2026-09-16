/* ตัวดึง/แปลง Meta Insights ที่ Edge Function ads-sync ใช้ — pure JS เทสได้ใน vitest */
import { describe, it, expect, vi } from "vitest";
import {
  todayInTimeZone, hourInTimeZone, syncRange, chunkRange, buildInsightsUrl, normalizeInsightRow,
  metaErrorCode, isRetryableMetaError, fetchAllPages, dedupeFacts, summarizeFacts,
} from "../supabase/functions/_shared/metaInsights.js";

const row = (patch = {}) => ({
  date_start: "2026-09-10", date_stop: "2026-09-10",
  campaign_id: "c1", campaign_name: "Sofa Sale", adset_id: "s1", adset_name: "BKK 25-44", ad_id: "a1", ad_name: "Video A",
  spend: "1520.35", impressions: "40210", reach: "30100", clicks: "812", inline_link_clicks: "640",
  actions: [
    { action_type: "link_click", value: "640" },
    { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "37" },
    { action_type: "lead", value: "5" },
  ],
  ...patch,
});

describe("ช่วงวันที่", () => {
  it("วันนี้ตาม timezone ของบัญชี ไม่ใช่ UTC", () => {
    const at = new Date("2026-09-13T18:30:00Z");                 // 01:30 ของ 14 ก.ย. ในไทย
    expect(todayInTimeZone(at, "Asia/Bangkok")).toBe("2026-09-14");
    expect(todayInTimeZone(at, "UTC")).toBe("2026-09-13");
    expect(todayInTimeZone(at, "Not/AZone")).toBe("2026-09-14"); // timezone เพี้ยน → ใช้ Asia/Bangkok
  });
  it("incremental = 3 วันล่าสุดรวมวันนี้ · backfill = N วันรวมวันนี้", () => {
    expect(syncRange("incremental", "2026-09-14")).toEqual({ from: "2026-09-12", to: "2026-09-14" });
    expect(syncRange("backfill", "2026-09-14", 30)).toEqual({ from: "2026-08-16", to: "2026-09-14" });
    expect(syncRange("backfill", "2026-03-01", 2)).toEqual({ from: "2026-02-28", to: "2026-03-01" });
  });
  it("backfill จำกัด 1–180 วัน · mode ไม่รู้จัก = error", () => {
    expect(syncRange("backfill", "2026-09-14", 999).from).toBe("2026-03-19");
    expect(syncRange("backfill", "2026-09-14", 0)).toEqual({ from: "2026-09-14", to: "2026-09-14" });
    expect(() => syncRange("reconcile-all", "2026-09-14")).toThrow("SYNC_MODE_INVALID");
    expect(() => syncRange("incremental", "14/09/2026")).toThrow("SYNC_RANGE_INVALID");
  });
  it("แบ่งช่วงยาวเป็นก้อนละ 7 วัน ไม่ตกหล่นและไม่ซ้ำ", () => {
    const parts = chunkRange("2026-08-16", "2026-09-14", 7);
    expect(parts[0]).toEqual({ from: "2026-08-16", to: "2026-08-22" });
    expect(parts.at(-1)).toEqual({ from: "2026-09-13", to: "2026-09-14" });
    expect(parts.length).toBe(5);
    expect(chunkRange("2026-09-14", "2026-09-14")).toEqual([{ from: "2026-09-14", to: "2026-09-14" }]);
  });
});

describe("buildInsightsUrl", () => {
  it("ขอรายวันระดับ ad พร้อม field ที่ต้องใช้ · ไม่มี token ใน URL", () => {
    const url = new URL(buildInsightsUrl({ version: "v26.0", accountId: "act_123", from: "2026-09-12", to: "2026-09-14" }));
    expect(url.origin + url.pathname).toBe("https://graph.facebook.com/v26.0/act_123/insights");
    expect(url.searchParams.get("level")).toBe("ad");
    expect(url.searchParams.get("time_increment")).toBe("1");
    expect(JSON.parse(url.searchParams.get("time_range"))).toEqual({ since: "2026-09-12", until: "2026-09-14" });
    for (const f of ["spend", "impressions", "reach", "clicks", "inline_link_clicks", "actions", "action_values", "ad_id", "adset_id", "campaign_id"]) {
      expect(url.searchParams.get("fields").split(",")).toContain(f);
    }
    expect(url.searchParams.get("use_unified_attribution_setting")).toBe("true");
    expect(url.searchParams.has("access_token")).toBe(false);
  });
  it("attribution ที่เลือกเองส่งเป็น action_attribution_windows", () => {
    const url = new URL(buildInsightsUrl({ version: "v26.0", accountId: "act_1", from: "2026-09-14", to: "2026-09-14", attribution: "7d_click_1d_view" }));
    expect(JSON.parse(url.searchParams.get("action_attribution_windows"))).toEqual(["7d_click", "1d_view"]);
    expect(url.searchParams.has("use_unified_attribution_setting")).toBe(false);
  });
  it("account id ต้องขึ้นต้น act_ ตามด้วยตัวเลข (กัน path injection)", () => {
    expect(() => buildInsightsUrl({ version: "v26.0", accountId: "act_1/../me", from: "2026-09-14", to: "2026-09-14" })).toThrow("ACCOUNT_ID_INVALID");
    expect(() => buildInsightsUrl({ version: "v26.0", accountId: "123", from: "2026-09-14", to: "2026-09-14" })).toThrow("ACCOUNT_ID_INVALID");
  });
});

describe("hourInTimeZone", () => {
  const at = (iso) => new Date(iso);
  it("อ่านชั่วโมงตามโซนของบัญชี (ไทย +7)", () => {
    expect(hourInTimeZone(at("2026-09-16T02:30:00Z"), "Asia/Bangkok")).toBe(9);
    expect(hourInTimeZone(at("2026-09-16T17:10:00Z"), "Asia/Bangkok")).toBe(0);
  });
  it("โซนอื่นและโซนเพี้ยน — เพี้ยนให้ตกไปที่เวลาไทย ไม่ throw", () => {
    expect(hourInTimeZone(at("2026-09-16T02:30:00Z"), "America/Los_Angeles")).toBe(19);
    expect(hourInTimeZone(at("2026-09-16T02:30:00Z"), "ไม่ใช่โซน")).toBe(9);
  });
});

describe("normalizeInsightRow", () => {
  it("แปลงตัวเลขเป็น number และจับคู่ชื่อคอลัมน์ ad_daily_facts", () => {
    const fact = normalizeInsightRow(row(), { leadEvent: "messaging_conversation_started_7d", attribution: "platform_default" });
    expect(fact).toEqual({
      fact_date: "2026-09-10", level: "ad",
      campaign_id: "c1", campaign_name: "Sofa Sale", ad_group_id: "s1", ad_group_name: "BKK 25-44", ad_id: "a1", ad_name: "Video A",
      spend: 1520.35, impressions: 40210, reach: 30100, clicks: 812, link_clicks: 640,
      leads: 37, attributed_conversions: null, attributed_value: null, attribution_window: "platform_default",
    });
  });
  it("lead event เลือกตามตั้งค่า · ชื่อแบบมี prefix onsite_conversion ก็นับ", () => {
    expect(normalizeInsightRow(row(), { leadEvent: "lead" }).leads).toBe(5);
    expect(normalizeInsightRow(row(), { leadEvent: "onsite_conversion.messaging_conversation_started_7d" }).leads).toBe(37);
  });
  it("Meta ไม่ส่ง actions (ไม่มีผลลัพธ์วันนั้น) = 0 lead · แต่ spend/impressions ที่ไม่ส่งมา = null ไม่ใช่ 0", () => {
    const fact = normalizeInsightRow(row({ actions: undefined, spend: undefined, reach: undefined }), { leadEvent: "lead" });
    expect(fact.leads).toBe(0);
    expect(fact.spend).toBeNull();
    expect(fact.reach).toBeNull();
  });
  it("ยอดขาย = มูลค่า purchase ที่ Meta attribute · เลือกประเภทเดียวไม่บวกซ้ำ · ไม่มี purchase = null", () => {
    const withPurchase = row({
      actions: [{ action_type: "omni_purchase", value: "3" }, { action_type: "purchase", value: "3" }],
      action_values: [{ action_type: "omni_purchase", value: "45900.5" }, { action_type: "purchase", value: "45900.5" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "45900.5" }],
    });
    const fact = normalizeInsightRow(withPurchase, { leadEvent: "lead" });
    expect(fact.attributed_value).toBe(45900.5);
    expect(fact.attributed_conversions).toBe(3);
    expect(normalizeInsightRow(row({ action_values: [{ action_type: "add_to_cart", value: "10" }] }), {}).attributed_value).toBeNull();
  });
  it("นับจำนวน purchase จาก actions โดยไม่ผูกกับมูลค่า — ซื้อผ่านแชท/ในแอปที่ Meta ไม่ส่งมูลค่ามา ต้องไม่หาย", () => {
    // เคสจริง บัญชี เพจหลัก-JK1 4 ก.ย. 2026: Meta รายงาน 18 ครั้ง มูลค่าว่าง (เดิมระบบบันทึกเป็น null → 0)
    const noValue = normalizeInsightRow(row({ actions: [{ action_type: "omni_purchase", value: "18" }], action_values: undefined }), { leadEvent: "lead" });
    expect(noValue.attributed_conversions).toBe(18);
    expect(noValue.attributed_value).toBeNull();
    // มีมูลค่าเฉพาะบางประเภท: จำนวนต้องมาจาก omni (ครบทุกช่องทาง) ไม่ใช่เฉพาะประเภทที่มีมูลค่า
    const mixed = normalizeInsightRow(row({
      actions: [{ action_type: "omni_purchase", value: "12" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "1" }],
      action_values: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "558" }],
    }), { leadEvent: "lead" });
    expect(mixed.attributed_conversions).toBe(12);
    expect(mixed.attributed_value).toBe(558);
    // ซื้อในแชท (onsite) อย่างเดียวก็ต้องนับ
    expect(normalizeInsightRow(row({ actions: [{ action_type: "onsite_conversion.purchase", value: "4" }] }), {}).attributed_conversions).toBe(4);
    // ไม่มี purchase เลย = null (ไม่ใช่ 0) เพราะแยกไม่ออกจาก "บัญชีนี้ไม่วัดการซื้อ"
    expect(normalizeInsightRow(row({ actions: [{ action_type: "lead", value: "5" }] }), {}).attributed_conversions).toBeNull();
  });
  it("แถวผิดรูป (ไม่มี ad_id · ไม่ใช่รายวัน · วันที่เพี้ยน · ตัวเลขติดลบ/ไม่ใช่ตัวเลข) = throw ไม่เขียนข้อมูลเสีย", () => {
    expect(() => normalizeInsightRow(row({ ad_id: "" }), {})).toThrow("INSIGHT_ROW_INVALID");
    expect(() => normalizeInsightRow(row({ date_stop: "2026-09-11" }), {})).toThrow("INSIGHT_ROW_INVALID");
    expect(() => normalizeInsightRow(row({ date_start: "10/09/2026", date_stop: "10/09/2026" }), {})).toThrow("INSIGHT_ROW_INVALID");
    expect(() => normalizeInsightRow(row({ spend: "abc" }), {})).toThrow("INSIGHT_ROW_INVALID");
    expect(() => normalizeInsightRow(row({ impressions: "-4" }), {})).toThrow("INSIGHT_ROW_INVALID");
  });
});

describe("ข้อผิดพลาดของ Meta", () => {
  it("แยกรหัส: rate limit · token · สิทธิ์ · อื่นๆ", () => {
    expect(metaErrorCode(400, { error: { code: 17 } })).toBe("META_RATE_LIMIT");
    expect(metaErrorCode(400, { error: { code: 80004 } })).toBe("META_RATE_LIMIT");
    expect(metaErrorCode(429, {})).toBe("META_RATE_LIMIT");
    expect(metaErrorCode(401, { error: { code: 190 } })).toBe("META_TOKEN_INVALID");
    expect(metaErrorCode(403, { error: { code: 200 } })).toBe("META_PERMISSION");
    expect(metaErrorCode(403, { error: { code: 10 } })).toBe("META_PERMISSION");
    expect(metaErrorCode(500, { error: { code: 1, is_transient: true } })).toBe("META_TEMPORARY");
    expect(metaErrorCode(400, { error: { code: 100 } })).toBe("META_API_ERROR");
  });
  it("Meta ขอให้ลดปริมาณข้อมูล (code 1) = META_TOO_MUCH_DATA ไม่ retry (ยิงซ้ำก็พังเหมือนเดิม)", () => {
    const payload = { error: { code: 1, message: "Please reduce the amount of data you're asking for, then retry your request" } };
    expect(metaErrorCode(500, payload)).toBe("META_TOO_MUCH_DATA");
    expect(isRetryableMetaError(500, payload)).toBe(false);
    expect(metaErrorCode(500, { error: { code: 1, message: "An unknown error occurred" } })).toBe("META_TEMPORARY");
  });
  it("retry เฉพาะ rate limit / ชั่วคราว ไม่ retry token หรือสิทธิ์", () => {
    expect(isRetryableMetaError(400, { error: { code: 4 } })).toBe(true);
    expect(isRetryableMetaError(503, {})).toBe(true);
    expect(isRetryableMetaError(400, { error: { code: 2, is_transient: true } })).toBe(true);
    expect(isRetryableMetaError(401, { error: { code: 190 } })).toBe(false);
    expect(isRetryableMetaError(403, { error: { code: 200 } })).toBe(false);
    expect(isRetryableMetaError(400, { error: { code: 100 } })).toBe(false);
  });
});

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe("fetchAllPages", () => {
  const first = "https://graph.facebook.com/v26.0/act_1/insights?level=ad";
  it("ตาม paging.next จนหมด · ส่ง token ใน header เท่านั้น", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(res(200, { data: [{ n: 1 }, { n: 2 }], paging: { next: "https://graph.facebook.com/v26.0/act_1/insights?after=x" } }))
      .mockResolvedValueOnce(res(200, { data: [{ n: 3 }], paging: {} }));
    const out = await fetchAllPages(first, { fetch, token: "TKN", sleep: async () => {} });
    expect(out.rows.map((r) => r.n)).toEqual([1, 2, 3]);
    expect(out.pages).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer TKN");
    expect(String(fetch.mock.calls[1][0])).not.toContain("TKN");
  });
  it("rate limit → รอแบบ backoff แล้วลองใหม่หน้าเดิม", async () => {
    const sleep = vi.fn(async () => {});
    const fetch = vi.fn()
      .mockResolvedValueOnce(res(400, { error: { code: 17, message: "User request limit reached" } }))
      .mockResolvedValueOnce(res(500, { error: { code: 2, is_transient: true } }))
      .mockResolvedValueOnce(res(200, { data: [{ n: 1 }] }));
    const out = await fetchAllPages(first, { fetch, token: "T", sleep, baseDelayMs: 1000 });
    expect(out.rows).toEqual([{ n: 1 }]);
    expect(out.retries).toBe(2);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });
  it("retry เกินรอบ = throw พร้อมรหัส (ไม่คืนข้อมูลครึ่งเดียว)", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(res(200, { data: [{ n: 1 }], paging: { next: "https://graph.facebook.com/v26.0/next" } }))
      .mockResolvedValue(res(400, { error: { code: 17 } }));
    await expect(fetchAllPages(first, { fetch, token: "T", sleep: async () => {}, maxRetries: 2 })).rejects.toMatchObject({ code: "META_RATE_LIMIT" });
    expect(fetch).toHaveBeenCalledTimes(4);                    // หน้าแรก 1 + หน้าสอง 1 + retry 2
  });
  it("token หมดอายุ = หยุดทันทีไม่ retry", async () => {
    const fetch = vi.fn().mockResolvedValue(res(401, { error: { code: 190, message: "Session has expired" } }));
    const sleep = vi.fn();
    await expect(fetchAllPages(first, { fetch, token: "T", sleep })).rejects.toMatchObject({ code: "META_TOKEN_INVALID" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
  it("network error ถือเป็นชั่วคราว ลองใหม่ได้", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(res(200, { data: [] }));
    const out = await fetchAllPages(first, { fetch, token: "T", sleep: async () => {} });
    expect(out.rows).toEqual([]);
  });
  it("paging.next ชี้ไป host อื่น = หยุด (กัน token รั่ว)", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(res(200, { data: [{ n: 1 }], paging: { next: "https://evil.example/steal" } }));
    await expect(fetchAllPages(first, { fetch, token: "T", sleep: async () => {} })).rejects.toMatchObject({ code: "META_PAGING_INVALID" });
  });
  it("paging.next เป็น http (ไม่เข้ารหัส) = หยุด ไม่ส่ง token แบบ plaintext", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(res(200, { data: [{ n: 1 }], paging: { next: "http://graph.facebook.com/v26.0/next" } }));
    await expect(fetchAllPages(first, { fetch, token: "T", sleep: async () => {} })).rejects.toMatchObject({ code: "META_PAGING_INVALID" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("เกินจำนวนหน้าสูงสุด = throw ไม่วนไม่รู้จบ", async () => {
    const fetch = vi.fn().mockResolvedValue(res(200, { data: [{ n: 1 }], paging: { next: "https://graph.facebook.com/v26.0/loop" } }));
    await expect(fetchAllPages(first, { fetch, token: "T", sleep: async () => {}, maxPages: 3 })).rejects.toMatchObject({ code: "META_TOO_MANY_PAGES" });
  });
  it("response ไม่มี data array = throw", async () => {
    const fetch = vi.fn().mockResolvedValue(res(200, { result: "?" }));
    await expect(fetchAllPages(first, { fetch, token: "T", sleep: async () => {} })).rejects.toMatchObject({ code: "META_RESPONSE_INVALID" });
  });
});

describe("dedupeFacts / summarizeFacts", () => {
  const f = (patch) => ({ fact_date: "2026-09-10", level: "ad", campaign_id: "c", ad_group_id: "s", ad_id: "a", spend: 10, leads: 1, ...patch });
  it("แถวซ้ำ key เดียวกันเก็บตัวล่าสุด และนับจำนวนที่ตัด", () => {
    const out = dedupeFacts([f({ spend: 10 }), f({ spend: 12 }), f({ ad_id: "b" })]);
    expect(out.rows.length).toBe(2);
    expect(out.rows.find((r) => r.ad_id === "a").spend).toBe(12);
    expect(out.duplicates).toBe(1);
  });
  it("สรุปยอดรวมสำหรับบันทึกใน run (null ไม่ถูกนับเป็น 0)", () => {
    expect(summarizeFacts([f({ spend: 10.5, leads: 2 }), f({ spend: null, leads: 1, fact_date: "2026-09-11" })]))
      .toEqual({ rows: 2, spend: 10.5, leads: 3, days: 2, from: "2026-09-10", to: "2026-09-11" });
    expect(summarizeFacts([])).toEqual({ rows: 0, spend: 0, leads: 0, days: 0, from: null, to: null });
  });
});
