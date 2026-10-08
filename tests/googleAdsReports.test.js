/* ตัวดึงรายงาน Google Ads (GAQL) → แถว ad_daily_facts รูปเดียวกับที่ Meta สร้าง
   pure ทั้งหมด เทสได้โดยไม่ต้องยิง API จริง · ยึด Google Ads API v25 (searchStream)
   กติกาเดียวกับฝั่ง Meta: ไม่รู้ = null ห้ามเดาเป็น 0 */
import { describe, expect, it } from "vitest";
import {
  GOOGLE_ADS_VERSION, customerIdOf, gaqlDailyAds, googleAdsErrorCode,
  isRetryableGoogleError, normalizeGoogleRow, searchStreamUrl,
} from "../supabase/functions/_shared/googleAdsReports.js";

describe("customerIdOf", () => {
  it("ตัดขีดออกจากรหัสที่คนคัดลอกมาจากหน้า Google Ads (123-456-7890)", () => {
    expect(customerIdOf("123-456-7890")).toBe("1234567890");
    expect(customerIdOf("1234567890")).toBe("1234567890");
  });
});

describe("gaqlDailyAds", () => {
  const q = gaqlDailyAds({ since: "2026-10-01", until: "2026-10-07" });

  it("ดึงระดับโฆษณา พร้อมค่าแอดและผลลัพธ์ครบตามขอบเขตที่ตกลง", () => {
    for (const field of [
      "segments.date", "campaign.id", "campaign.name", "ad_group.id", "ad_group.name",
      "ad_group_ad.ad.id", "metrics.cost_micros", "metrics.impressions", "metrics.clicks",
      "metrics.conversions", "metrics.conversions_value",
    ]) expect(q).toContain(field);
    expect(q).toMatch(/FROM ad_group_ad/);
  });

  it("ช่วงวันเป็นของที่ส่งเข้ามา ไม่ใช่นาฬิกาเครื่อง", () => {
    expect(q).toContain("BETWEEN '2026-10-01' AND '2026-10-07'");
  });

  it("ช่วงวันกลับหัว = โยน error ไม่ยิง query ที่ไม่มีความหมาย", () => {
    expect(() => gaqlDailyAds({ since: "2026-10-07", until: "2026-10-01" })).toThrow(/ช่วงวัน/);
  });
});

describe("searchStreamUrl", () => {
  it("ชี้ไปที่ endpoint ของเวอร์ชันที่ระบบล็อกไว้", () => {
    expect(searchStreamUrl({ customerId: "123-456-7890" }))
      .toBe(`https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/1234567890/googleAds:searchStream`);
  });
});

describe("normalizeGoogleRow", () => {
  const row = {
    segments: { date: "2026-10-06" },
    campaign: { id: "111", name: "TD | Search" },
    adGroup: { id: "222", name: "BKK" },
    adGroupAd: { ad: { id: "333", name: "Ad A" } },
    metrics: { costMicros: "219870000", impressions: "1831", clicks: "49", conversions: 2.5, conversionsValue: 1500 },
  };

  it("cost_micros แปลงเป็นบาทถูกต้อง (219,870,000 micros = 219.87)", () => {
    expect(normalizeGoogleRow(row).spend).toBe(219.87);
  });

  it("ได้แถวรูปเดียวกับฝั่ง Meta — ต่อเข้า ad_daily_facts ได้เลย", () => {
    expect(normalizeGoogleRow(row)).toMatchObject({
      fact_date: "2026-10-06", level: "ad",
      campaign_id: "111", campaign_name: "TD | Search",
      ad_group_id: "222", ad_group_name: "BKK",
      ad_id: "333", ad_name: "Ad A",
      impressions: 1831, clicks: 49, leads: 2.5, attributed_value: 1500,
    });
  });

  it("ตัวเลขที่ Google ส่งมาเป็นสตริง (int64) ต้องกลายเป็นตัวเลข", () => {
    const out = normalizeGoogleRow(row);
    expect(typeof out.impressions).toBe("number");
    expect(typeof out.clicks).toBe("number");
  });

  it("เมตริกที่ไม่มีในผลลัพธ์ = null ไม่ใช่ 0", () => {
    const bare = { segments: { date: "2026-10-06" }, adGroupAd: { ad: { id: "9" } }, metrics: {} };
    const out = normalizeGoogleRow(bare);
    expect(out.spend).toBe(null);
    expect(out.impressions).toBe(null);
    expect(out.attributed_value).toBe(null);
  });

  it("Google ไม่มี reach และ link click แยก = null ไม่ใช่เอา clicks มาใส่ซ้ำ", () => {
    const out = normalizeGoogleRow(row);
    expect(out.reach).toBe(null);
    expect(out.link_clicks).toBe(null);
  });

  it("ไม่มีรหัสโฆษณา = แถวใช้ไม่ได้ ต้อง throw ไม่ใช่เขียนแถวพิการลงฐาน", () => {
    expect(() => normalizeGoogleRow({ segments: { date: "2026-10-06" }, metrics: {} })).toThrow();
  });

  it("ไม่มีวันที่ = แถวใช้ไม่ได้", () => {
    expect(() => normalizeGoogleRow({ adGroupAd: { ad: { id: "9" } }, metrics: {} })).toThrow();
  });
});

describe("googleAdsErrorCode", () => {
  it("โปรเจกต์ Cloud ยังไม่ได้รับอนุมัติ = รหัสที่หน้าจอแปลเป็นคำได้", () => {
    expect(googleAdsErrorCode(403, { error: { details: [{ errors: [{ errorCode: { authorizationError: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" } } ] }] } }))
      .toBe("CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION");
  });
  it("401 = token หมดอายุ ต้องต่อใหม่", () => {
    expect(googleAdsErrorCode(401, {})).toBe("TOKEN_EXPIRED");
  });
  it("โควตาเต็มกับ 5xx = ลองใหม่ได้ · 400 = ลองใหม่ไม่ช่วย", () => {
    expect(isRetryableGoogleError(429, {})).toBe(true);
    expect(isRetryableGoogleError(503, {})).toBe(true);
    expect(isRetryableGoogleError(400, {})).toBe(false);
  });
});
