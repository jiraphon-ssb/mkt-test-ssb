/* งาน sync ของ Meta หนึ่งบัญชี (ไม่แตะฐานข้อมูล) — Edge Function ads-sync เรียกแล้วค่อยเขียนผ่าน RPC
   เทสใน tests/adsSyncJob.test.js */
import { buildInsightsUrl, chunkRange, dedupeFacts, fetchAllPages, normalizeInsightRow, summarizeFacts, syncError } from "./metaInsights.js";
import { fetchSearchStream, gaqlDailyAds, normalizeGoogleRow, searchStreamUrl } from "./googleAdsReports.js";

export function pickSyncMode(requested, connection = {}) {
  const mode = requested ?? "auto";
  if (mode === "auto") return connection.last_success_at ? "incremental" : "backfill";
  if (mode === "incremental" || mode === "backfill") return mode;
  throw syncError("SYNC_MODE_INVALID");
}

export async function collectMetaFacts({ accountId, from, to, config = {}, version, token, fetch, sleep, chunkDays = 7 }) {
  const facts = [];
  let pages = 0, retries = 0, rowsRead = 0;
  for (const part of chunkRange(from, to, chunkDays)) {
    const url = buildInsightsUrl({ version, accountId, from: part.from, to: part.to, attribution: config.attribution });
    const result = await fetchAllPages(url, { fetch, token, sleep });
    pages += result.pages; retries += result.retries; rowsRead += result.rows.length;
    for (const row of result.rows) {
      const fact = normalizeInsightRow(row, { leadEvent: config.leadEvent, attribution: config.attribution });
      if (fact.fact_date < part.from || fact.fact_date > part.to) throw syncError("INSIGHT_ROW_INVALID", "outside range");
      facts.push(fact);
    }
  }
  const { rows, duplicates } = dedupeFacts(facts);
  return { facts: rows, summary: { ...summarizeFacts(rows), rowsRead, pages, retries, duplicates } };
}

/**
 * ดึงค่าแอด Google Ads หนึ่งบัญชี — โครงเดียวกับ collectMetaFacts ให้ ads-sync เรียกสลับกันได้
 * accessToken เป็นของสดที่ขอมาจาก refresh token ก่อนเรียก (Google ให้อายุ 1 ชม.)
 */
export async function collectGoogleFacts({ customerId, from, to, config = {}, accessToken, loginCustomerId = null, fetch, sleep, chunkDays = 7 }) {
  const facts = [];
  let requests = 0, retries = 0, rowsRead = 0;
  for (const part of chunkRange(from, to, chunkDays)) {
    const query = gaqlDailyAds({ since: part.from, until: part.to });
    const result = await fetchSearchStream({ url: searchStreamUrl({ customerId }), query, accessToken, loginCustomerId, fetch, sleep });
    requests += 1; retries += result.retries;
    for (const batch of result.batches) {
      for (const row of batch?.results ?? []) {
        rowsRead += 1;
        const fact = normalizeGoogleRow(row, { attribution: config.attribution });
        // Google ส่งวันนอกช่วงที่ขอมาไม่ได้ ถ้าเจอแปลว่าเข้าใจผลลัพธ์ผิด — หยุดดีกว่าเขียนของที่อธิบายไม่ได้
        if (fact.fact_date < part.from || fact.fact_date > part.to) throw syncError("GOOGLE_ROW_INVALID", "outside range");
        facts.push(fact);
      }
    }
  }
  const { rows, duplicates } = dedupeFacts(facts);
  return { facts: rows, summary: { ...summarizeFacts(rows), rowsRead, pages: requests, retries, duplicates } };
}

export const SYNC_PUBLIC_CODES = new Set([
  "AUTH_REQUIRED", "TEAM_LEAD_REQUIRED", "METHOD_NOT_ALLOWED", "CONNECTION_ID_REQUIRED", "CONNECTION_NOT_FOUND", "CONNECTION_NOT_READY",
  "AUTHORIZATION_NOT_READY", "PROVIDER_NOT_SUPPORTED", "SYNC_ALREADY_RUNNING", "SYNC_MODE_INVALID", "SYNC_RANGE_INVALID",
  "ACCOUNT_ID_INVALID", "GRAPH_VERSION_INVALID", "INSIGHT_ROW_INVALID",
  "META_RATE_LIMIT", "META_TOKEN_INVALID", "META_PERMISSION", "META_TEMPORARY", "META_API_ERROR",
  "META_PAGING_INVALID", "META_TOO_MANY_PAGES", "META_RESPONSE_INVALID", "SYNC_WRITE_FAILED", "SYNC_EMPTY_RESULT", "RECONCILE_FAILED", "CREATIVE_SYNC_FAILED", "CURSOR_INVALID", "META_TOO_MUCH_DATA", "AD_ID_INVALID", "AD_NOT_FOUND", "PREVIEW_FORMAT_INVALID", "PREVIEW_UNAVAILABLE",
  // Google Ads — รหัสที่หน้าจอแปลเป็นคำไทยได้ ไม่โยน payload ดิบขึ้นจอ
  "GOOGLE_ROW_INVALID", "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION", "QUOTA_EXCEEDED", "GOOGLE_UNAVAILABLE", "GOOGLE_ERROR", "NOT_PERMITTED", "TOKEN_EXPIRED", "GOOGLE_MANAGER_ACCOUNT",
]);

export function publicSyncCode(error, fallback = "SYNC_FAILED") {
  const code = error?.code ?? (error instanceof Error ? error.message : String(error ?? ""));
  return SYNC_PUBLIC_CODES.has(code) ? code : fallback;
}

/* token หมดอายุ = สถานะ expired (ให้หน้าจอชวนต่อใหม่) ไม่ใช่ error ทั่วไปที่ชวนให้ไปไล่บั๊ก */
export const syncFailureStatus = (code) => code === "META_TOKEN_INVALID" || code === "TOKEN_EXPIRED" ? "expired" : "error";
