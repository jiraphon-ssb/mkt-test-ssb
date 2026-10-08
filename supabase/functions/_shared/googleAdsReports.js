/* ดึงค่าแอด Google Ads → แถว ad_daily_facts รูปเดียวกับฝั่ง Meta (metaInsights.js)
   spec: docs/superpowers/specs/2026-10-08-ads-multi-provider-import-design.md (ภาคต่อ: เชื่อม API เต็มรูปแบบ)

   ที่มา: Google Ads API v25 — POST /customers/{id}/googleAds:searchStream ด้วยภาษา GAQL
   สิทธิ์: ตั้งแต่ 10 ก.ย. 69 Google เลิกใช้ developer token แล้ว — ระดับสิทธิ์ผูกกับ Google Cloud project แทน
   (header developer-token ยังส่งได้แต่ถูกเพิกเฉย · โปรเจกต์ที่ยังไม่อนุมัติจะได้ CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION)

   กติกาตัวเลข (เหมือนฝั่ง Meta): ไม่รู้ = null ห้ามเดาเป็น 0
   - cost_micros เป็นหน่วยล้านส่วน — หารล้านที่นี่ที่เดียว
   - int64 ของ Google มาเป็นสตริงใน JSON ต้องแปลงเป็นตัวเลขก่อนเก็บ
   - Google ไม่มี reach และไม่แยก link click → เก็บ null ไม่ใช่เอา clicks มาใส่ซ้ำ */

export const GOOGLE_ADS_VERSION = "v25";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** รหัสบัญชีที่คนคัดลอกจากหน้า Google Ads มีขีดคั่น แต่ API รับเฉพาะตัวเลขล้วน */
export const customerIdOf = (raw) => String(raw ?? "").replace(/\D/g, "");

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** ค่าแอดรายวันระดับโฆษณา — ชุดฟิลด์เดียวกับที่ Meta ให้ เพื่อให้สองช่องทางเทียบกันได้ */
export function gaqlDailyAds({ since, until }) {
  if (!ISO_DAY.test(String(since)) || !ISO_DAY.test(String(until)) || since > until) {
    throw new Error(`ช่วงวันไม่ถูกต้อง: ${since} ถึง ${until}`);
  }
  return [
    "SELECT",
    "  segments.date,",
    "  campaign.id, campaign.name,",
    "  ad_group.id, ad_group.name,",
    "  ad_group_ad.ad.id, ad_group_ad.ad.name,",
    "  metrics.cost_micros, metrics.impressions, metrics.clicks,",
    "  metrics.conversions, metrics.conversions_value",
    "FROM ad_group_ad",
    `WHERE segments.date BETWEEN '${since}' AND '${until}'`,
  ].join("\n");
}

export function searchStreamUrl({ customerId, version = GOOGLE_ADS_VERSION }) {
  return `https://googleads.googleapis.com/${version}/customers/${customerIdOf(customerId)}/googleAds:searchStream`;
}

/**
 * แถวผลลัพธ์ของ searchStream → แถว ad_daily_facts
 * leads = metrics.conversions (conversion ที่บัญชีตั้งเป็นหลัก) — ถ้าต้องแยกชนิด conversion
 * ต้องเพิ่ม segments.conversion_action ใน query ซึ่งเป็นงานเฟสถัดไป ไม่ใช่การเดาตรงนี้
 */
export function normalizeGoogleRow(row, { attribution = "platform_default" } = {}) {
  const date = row?.segments?.date;
  if (!ISO_DAY.test(String(date ?? ""))) throw new Error("แถวไม่มีวันที่ใช้ได้");
  const adId = row?.adGroupAd?.ad?.id;
  if (!adId) throw new Error("แถวไม่มีรหัสโฆษณา");
  const m = row.metrics ?? {};
  const costMicros = num(m.costMicros);
  return {
    fact_date: date,
    level: "ad",
    campaign_id: String(row.campaign?.id ?? ""),
    campaign_name: String(row.campaign?.name ?? ""),
    ad_group_id: String(row.adGroup?.id ?? ""),
    ad_group_name: String(row.adGroup?.name ?? ""),
    ad_id: String(adId),
    ad_name: String(row.adGroupAd?.ad?.name ?? ""),
    // micros → บาท · ปัดเศษทศนิยมลอยที่เกิดจากการหาร (219870000/1e6)
    spend: costMicros === null ? null : Math.round((costMicros / 1_000_000) * 10_000) / 10_000,
    impressions: num(m.impressions),
    reach: null,        // Google ไม่มี reach ระดับโฆษณา
    clicks: num(m.clicks),
    link_clicks: null,  // Google ไม่แยก link click ออกจาก click
    leads: num(m.conversions),
    // ต้อง map conversion action ที่ทีมยืนยันก่อนถึงจะบอกได้ว่าอันไหนคือการซื้อ — ยังไม่รู้ = null
    attributed_conversions: null,
    attributed_value: num(m.conversionsValue),
    attribution_window: attribution,
  };
}

/** ทุก batch ของ searchStream → แถวทั้งหมด (ข้าม batch ที่ไม่มี results) */
export function parseSearchStream(batches = [], opts = {}) {
  const rows = [];
  for (const batch of batches ?? []) {
    for (const row of batch?.results ?? []) rows.push(normalizeGoogleRow(row, opts));
  }
  return rows;
}

/** รหัสความผิดพลาดที่หน้าจอแปลเป็นคำไทยได้ — ไม่โยน payload ดิบขึ้นจอ */
export function googleAdsErrorCode(status, payload) {
  if (status === 401) return "TOKEN_EXPIRED";
  const details = payload?.error?.details ?? [];
  for (const detail of details) {
    for (const err of detail?.errors ?? []) {
      const code = err?.errorCode ?? {};
      const first = Object.values(code).find((v) => typeof v === "string");
      if (first) return first;
    }
  }
  if (status === 403) return "NOT_PERMITTED";
  if (status === 429) return "QUOTA_EXCEEDED";
  return status >= 500 ? "GOOGLE_UNAVAILABLE" : "GOOGLE_ERROR";
}

/** โควตาเต็มกับฝั่ง Google ล่ม = รอแล้วลองใหม่ได้ · 4xx อื่นลองกี่ครั้งก็เหมือนเดิม */
export function isRetryableGoogleError(status) {
  return status === 429 || status >= 500;
}

const googleError = (code, status) => Object.assign(new Error(code), { code, status });

/**
 * ยิง searchStream หนึ่งครั้ง พร้อมลองใหม่เมื่อโควตาเต็ม/ฝั่ง Google ล่ม
 * ฉีด fetch กับ sleep เข้ามาได้ → เทสได้โดยไม่ต้องต่อเน็ตและไม่ต้องรอจริง (pattern เดียวกับ fetchGraphJson ของ Meta)
 * loginCustomerId = ใส่เฉพาะบัญชีที่อยู่ใต้บัญชีผู้จัดการ (MCC) ถ้าไม่ใช่แล้วใส่ไปจะโดนปฏิเสธ
 */
export async function fetchSearchStream({ url, query, accessToken, loginCustomerId = null, fetch, sleep, maxRetries = 4, baseDelayMs = 2000, maxDelayMs = 60_000 }) {
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  if (loginCustomerId) headers["login-customer-id"] = customerIdOf(loginCustomerId);
  let retries = 0;
  for (;;) {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ query }) });
    if (response.ok) {
      const payload = await response.json();
      // searchStream คืนมาเป็นอาเรย์ของก้อน · บางครั้งห่อมาเป็นอ็อบเจ็กต์เดียวตอนผลน้อย
      return { batches: Array.isArray(payload) ? payload : [payload], retries };
    }
    const payload = await response.json().catch(() => ({}));
    const code = googleAdsErrorCode(response.status, payload);
    if (!isRetryableGoogleError(response.status) || retries >= maxRetries) throw googleError(code, response.status);
    await sleep(Math.min(baseDelayMs * 2 ** retries, maxDelayMs));
    retries += 1;
  }
}
