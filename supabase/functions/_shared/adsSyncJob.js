/* งาน sync ของ Meta หนึ่งบัญชี (ไม่แตะฐานข้อมูล) — Edge Function ads-sync เรียกแล้วค่อยเขียนผ่าน RPC
   เทสใน tests/adsSyncJob.test.js */
import { buildInsightsUrl, chunkRange, dedupeFacts, fetchAllPages, normalizeInsightRow, summarizeFacts, syncError } from "./metaInsights.js";

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

export const SYNC_PUBLIC_CODES = new Set([
  "AUTH_REQUIRED", "TEAM_LEAD_REQUIRED", "METHOD_NOT_ALLOWED", "CONNECTION_ID_REQUIRED", "CONNECTION_NOT_FOUND", "CONNECTION_NOT_READY",
  "AUTHORIZATION_NOT_READY", "PROVIDER_NOT_SUPPORTED", "SYNC_ALREADY_RUNNING", "SYNC_MODE_INVALID", "SYNC_RANGE_INVALID",
  "ACCOUNT_ID_INVALID", "GRAPH_VERSION_INVALID", "INSIGHT_ROW_INVALID",
  "META_RATE_LIMIT", "META_TOKEN_INVALID", "META_PERMISSION", "META_TEMPORARY", "META_API_ERROR",
  "META_PAGING_INVALID", "META_TOO_MANY_PAGES", "META_RESPONSE_INVALID", "SYNC_WRITE_FAILED", "SYNC_EMPTY_RESULT", "RECONCILE_FAILED", "CREATIVE_SYNC_FAILED", "CURSOR_INVALID", "META_TOO_MUCH_DATA", "AD_ID_INVALID", "AD_NOT_FOUND", "PREVIEW_FORMAT_INVALID", "PREVIEW_UNAVAILABLE",
]);

export function publicSyncCode(error, fallback = "SYNC_FAILED") {
  const code = error?.code ?? (error instanceof Error ? error.message : String(error ?? ""));
  return SYNC_PUBLIC_CODES.has(code) ? code : fallback;
}

export const syncFailureStatus = (code) => code === "META_TOKEN_INVALID" ? "expired" : "error";
