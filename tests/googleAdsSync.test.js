/* ดึงค่าแอด Google Ads หนึ่งบัญชี — ชั้นที่คุยกับ API จริง (ฉีด fetch ปลอมเข้าไปเทส)
   ขนานกับ collectMetaFacts ของฝั่ง Meta · ไม่แตะฐานข้อมูล */
import { describe, expect, it, vi } from "vitest";
import { fetchSearchStream } from "../supabase/functions/_shared/googleAdsReports.js";
import { collectGoogleFacts } from "../supabase/functions/_shared/adsSyncJob.js";

const adRow = (date, adId, micros) => ({
  segments: { date }, campaign: { id: "c1", name: "TD" }, adGroup: { id: "g1", name: "BKK" },
  adGroupAd: { ad: { id: adId, name: `Ad ${adId}` } },
  metrics: { costMicros: String(micros), impressions: "100", clicks: "5", conversions: 1, conversionsValue: 200 },
});
const ok = (batches) => ({ ok: true, status: 200, json: async () => batches });

describe("fetchSearchStream", () => {
  it("ยิง POST พร้อม Bearer token และส่ง query ไปใน body", async () => {
    const fetch = vi.fn(async () => ok([{ results: [adRow("2026-10-06", "a1", 219870000)] }]));
    await fetchSearchStream({ url: "https://x/searchStream", query: "SELECT 1", accessToken: "AT", fetch });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://x/searchStream");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer AT");
    expect(JSON.parse(init.body)).toEqual({ query: "SELECT 1" });
  });

  it("ใส่ login-customer-id เฉพาะตอนบัญชีอยู่ใต้ MCC — ไม่ใส่พร่ำเพรื่อ", async () => {
    const fetch = vi.fn(async () => ok([]));
    await fetchSearchStream({ url: "https://x", query: "q", accessToken: "AT", fetch });
    expect(fetch.mock.calls[0][1].headers["login-customer-id"]).toBeUndefined();

    await fetchSearchStream({ url: "https://x", query: "q", accessToken: "AT", loginCustomerId: "123-456-7890", fetch });
    expect(fetch.mock.calls[1][1].headers["login-customer-id"]).toBe("1234567890");
  });

  it("โควตาเต็มแล้วลองใหม่จนสำเร็จ และรายงานว่าลองไปกี่ครั้ง", async () => {
    let n = 0;
    const fetch = vi.fn(async () => (++n < 3 ? { ok: false, status: 429, json: async () => ({}) } : ok([{ results: [] }])));
    const out = await fetchSearchStream({ url: "https://x", query: "q", accessToken: "AT", fetch, sleep: async () => {} });
    expect(out.retries).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("ผิดแบบที่ลองใหม่ไม่ช่วย = หยุดทันทีพร้อมรหัสที่แปลเป็นคำได้", async () => {
    const payload = { error: { details: [{ errors: [{ errorCode: { authorizationError: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" } }] }] } };
    const fetch = vi.fn(async () => ({ ok: false, status: 403, json: async () => payload }));
    await expect(fetchSearchStream({ url: "https://x", query: "q", accessToken: "AT", fetch, sleep: async () => {} }))
      .rejects.toMatchObject({ code: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("collectGoogleFacts", () => {
  it("แบ่งช่วงวันเป็นก้อน แล้วรวมแถวจากทุกก้อน", async () => {
    const fetch = vi.fn(async (_url, init) => {
      const day = JSON.parse(init.body).query.match(/BETWEEN '(\d{4}-\d{2}-\d{2})'/)[1];
      return ok([{ results: [adRow(day, `ad-${day}`, 1_000_000)] }]);
    });
    const out = await collectGoogleFacts({
      customerId: "123-456-7890", from: "2026-10-01", to: "2026-10-14",
      accessToken: "AT", fetch, sleep: async () => {}, chunkDays: 7,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(out.facts).toHaveLength(2);
    expect(out.facts.every((f) => f.spend === 1)).toBe(true);
  });

  it("แถวซ้ำจากการดึงทับช่วง ถูกตัดทิ้งไม่ให้ยอดบวกซ้ำ", async () => {
    const fetch = vi.fn(async () => ok([{ results: [adRow("2026-10-06", "a1", 2_000_000), adRow("2026-10-06", "a1", 2_000_000)] }]));
    const out = await collectGoogleFacts({ customerId: "1", from: "2026-10-06", to: "2026-10-06", accessToken: "AT", fetch, sleep: async () => {} });
    expect(out.facts).toHaveLength(1);
    expect(out.summary.duplicates).toBe(1);
  });

  it("แถวที่วันหลุดนอกช่วงที่ขอ = หยุด ไม่เขียนของที่อธิบายไม่ได้ลงฐาน", async () => {
    const fetch = vi.fn(async () => ok([{ results: [adRow("2025-01-01", "a1", 1_000_000)] }]));
    await expect(collectGoogleFacts({ customerId: "1", from: "2026-10-06", to: "2026-10-06", accessToken: "AT", fetch, sleep: async () => {} }))
      .rejects.toThrow();
  });
});
