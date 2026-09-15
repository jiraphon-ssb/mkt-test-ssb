/* Meta Insights → แถว ad_daily_facts (ใช้ใน Edge Function ads-sync)
   เป็น .js เพื่อให้ Deno และ vitest ใช้ไฟล์เดียวกัน — เทสใน tests/metaInsights.test.js
   กติกา: null ≠ 0 · ข้อมูลไม่ครบ = throw (ผู้เรียกต้องไม่เขียนข้อมูลครึ่งเดียว) · token อยู่ใน header เท่านั้น */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;
const GRAPH_HOST = "graph.facebook.com";

export const DEFAULT_LEAD_EVENT = "messaging_conversation_started_7d";
export const META_INSIGHT_FIELDS = [
  "date_start", "date_stop", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
  "spend", "impressions", "reach", "clicks", "inline_link_clicks", "actions", "action_values",
];
/* ประเภท purchase ซ้อนกัน (omni รวม pixel/onsite) → เลือกตัวแรกที่เจอตามลำดับนี้ ห้ามบวกกัน */
const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"];
const ATTRIBUTION_WINDOWS = { "7d_click_1d_view": ["7d_click", "1d_view"], "1d_click": ["1d_click"], "7d_click": ["7d_click"] };

export function syncError(code, detail) {
  const error = new Error(code);
  error.code = code;
  if (detail) error.detail = String(detail).slice(0, 300);
  return error;
}

const toTime = (iso) => {
  if (typeof iso !== "string" || !ISO.test(iso)) return NaN;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso ? t : NaN;
};
const fromTime = (t) => new Date(t).toISOString().slice(0, 10);

/** วันนี้ของบัญชีโฆษณา (Meta ตัดวันตาม timezone บัญชี) · timezone ไม่ถูกต้อง → Asia/Bangkok */
export function todayInTimeZone(now = new Date(), timeZone = "Asia/Bangkok") {
  const format = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  try { return format(timeZone || "Asia/Bangkok"); } catch { return format("Asia/Bangkok"); }
}

/** incremental = 3 วันล่าสุด (Meta แก้ยอดย้อนหลังได้) · backfill = N วัน (1–180) · นับรวมวันนี้ */
export function syncRange(mode, today, backfillDays = 30) {
  const end = toTime(today);
  if (!Number.isFinite(end)) throw syncError("SYNC_RANGE_INVALID");
  let days;
  if (mode === "incremental") days = 3;
  else if (mode === "backfill") days = Math.min(180, Math.max(1, Math.floor(Number(backfillDays) || 0)));
  else throw syncError("SYNC_MODE_INVALID");
  return { from: fromTime(end - (days - 1) * DAY), to: today };
}

/** แบ่งช่วงเป็นก้อน (ขอทีละช่วงสั้น ลดโอกาส Meta timeout ที่ level=ad) */
export function chunkRange(from, to, size = 7) {
  const start = toTime(from), end = toTime(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw syncError("SYNC_RANGE_INVALID");
  const parts = [];
  for (let t = start; t <= end; t += size * DAY) parts.push({ from: fromTime(t), to: fromTime(Math.min(end, t + (size - 1) * DAY)) });
  return parts;
}

export function buildInsightsUrl({ version, accountId, from, to, attribution = "platform_default", limit = 500 }) {
  if (!/^act_\d+$/.test(String(accountId ?? ""))) throw syncError("ACCOUNT_ID_INVALID");
  if (!/^v\d+\.\d+$/.test(String(version ?? ""))) throw syncError("GRAPH_VERSION_INVALID");
  if (!Number.isFinite(toTime(from)) || !Number.isFinite(toTime(to))) throw syncError("SYNC_RANGE_INVALID");
  const url = new URL(`https://${GRAPH_HOST}/${version}/${accountId}/insights`);
  url.searchParams.set("level", "ad");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: from, until: to }));
  url.searchParams.set("fields", META_INSIGHT_FIELDS.join(","));
  url.searchParams.set("limit", String(limit));
  const windows = ATTRIBUTION_WINDOWS[attribution];
  if (windows) url.searchParams.set("action_attribution_windows", JSON.stringify(windows));
  else url.searchParams.set("use_unified_attribution_setting", "true");
  return url.toString();
}

/* ตัวเลขจาก Meta มาเป็น string · ไม่ส่งมา = null · ไม่ใช่ตัวเลข/ติดลบ = ข้อมูลเสีย */
function metric(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw syncError("INSIGHT_ROW_INVALID", `metric ${value}`);
  return n;
}

function actionTypesFor(event) {
  const e = String(event || DEFAULT_LEAD_EVENT);
  const bare = e.replace(/^onsite_conversion\./, "");
  return [e, bare, `onsite_conversion.${bare}`];
}

function pick(list, types) {
  if (!Array.isArray(list)) return undefined;
  for (const type of types) {
    const hit = list.find((item) => item?.action_type === type);
    if (hit) return metric(hit.value);
  }
  return undefined;
}

export function normalizeInsightRow(row, { leadEvent = DEFAULT_LEAD_EVENT, attribution = "platform_default" } = {}) {
  if (!row || typeof row !== "object") throw syncError("INSIGHT_ROW_INVALID", "row");
  if (!Number.isFinite(toTime(row.date_start)) || row.date_start !== row.date_stop) throw syncError("INSIGHT_ROW_INVALID", "date");
  if (!row.ad_id) throw syncError("INSIGHT_ROW_INVALID", "ad_id");
  const purchaseType = Array.isArray(row.action_values) ? PURCHASE_TYPES.find((type) => row.action_values.some((item) => item?.action_type === type)) : undefined;
  return {
    fact_date: row.date_start,
    level: "ad",
    campaign_id: String(row.campaign_id ?? ""),
    campaign_name: String(row.campaign_name ?? ""),
    ad_group_id: String(row.adset_id ?? ""),
    ad_group_name: String(row.adset_name ?? ""),
    ad_id: String(row.ad_id),
    ad_name: String(row.ad_name ?? ""),
    spend: metric(row.spend),
    impressions: metric(row.impressions),
    reach: metric(row.reach),
    clicks: metric(row.clicks),
    link_clicks: metric(row.inline_link_clicks),
    // Meta ไม่ส่ง action ที่เป็นศูนย์ → ไม่มีใน actions = 0 lead ของวันนั้น
    leads: pick(row.actions, actionTypesFor(leadEvent)) ?? 0,
    attributed_conversions: purchaseType ? pick(row.actions, [purchaseType]) ?? null : null,
    attributed_value: purchaseType ? pick(row.action_values, [purchaseType]) : null,
    attribution_window: attribution,
  };
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
export function metaErrorCode(status, payload) {
  const code = Number(payload?.error?.code);
  if (code === 190 || status === 401) return "META_TOKEN_INVALID";
  if (code === 10 || (code >= 200 && code < 300) || status === 403) return "META_PERMISSION";
  if (RATE_LIMIT_CODES.has(code) || (code >= 80000 && code <= 80014) || status === 429) return "META_RATE_LIMIT";
  if (payload?.error?.is_transient || code === 1 || code === 2 || status >= 500) return "META_TEMPORARY";
  return "META_API_ERROR";
}
export function isRetryableMetaError(status, payload) {
  return ["META_RATE_LIMIT", "META_TEMPORARY"].includes(metaErrorCode(status, payload));
}

/** ดึงทุกหน้า · retry แบบ backoff เฉพาะ rate limit/ชั่วคราว · พลาดหน้าไหน = throw ทั้งก้อน */
/** เรียก Graph หนึ่งครั้ง · retry แบบ backoff เฉพาะ rate limit/ชั่วคราว · token อยู่ใน header · host ต้องเป็น graph.facebook.com */
export async function fetchGraphJson(url, { fetch, token, sleep, maxRetries = 4, baseDelayMs = 2000, maxDelayMs = 60_000 }) {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.hostname !== GRAPH_HOST) throw syncError("META_PAGING_INVALID");   // token ไปเฉพาะ https://graph.facebook.com
  let retries = 0;
  for (let attempt = 0; ; attempt++) {
    let status = 0, body = null, failed;
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      status = response.status;
      body = await response.json().catch(() => null);
      failed = !response.ok || body?.error;
    } catch {
      failed = true; status = 503; body = null;                       // network error = ชั่วคราว
    }
    if (!failed) return { payload: body, retries };
    if (!isRetryableMetaError(status, body) || attempt >= maxRetries) throw syncError(metaErrorCode(status, body), body?.error?.message);
    retries++;
    await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** attempt));
  }
}

/** ดึงทุกหน้า · พลาดหน้าไหน = throw ทั้งก้อน */
export async function fetchAllPages(firstUrl, { maxPages = 200, ...opts }) {
  const rows = [];
  let url = firstUrl, pages = 0, retries = 0;
  while (url) {
    if (pages >= maxPages) throw syncError("META_TOO_MANY_PAGES");
    const result = await fetchGraphJson(url, opts);
    retries += result.retries;
    if (!Array.isArray(result.payload?.data)) throw syncError("META_RESPONSE_INVALID");
    rows.push(...result.payload.data);
    pages++;
    url = result.payload.paging?.next ?? null;
  }
  return { rows, pages, retries };
}

const factKey = (r) => [r.fact_date, r.level, r.campaign_id, r.ad_group_id, r.ad_id].join("|");
export function dedupeFacts(facts) {
  const map = new Map();
  for (const fact of facts) map.set(factKey(fact), fact);
  return { rows: [...map.values()], duplicates: facts.length - map.size };
}

export function summarizeFacts(facts) {
  const dates = [...new Set(facts.map((r) => r.fact_date))].sort();
  const sum = (key) => Math.round(facts.reduce((acc, r) => acc + (r[key] ?? 0), 0) * 10_000) / 10_000;
  return { rows: facts.length, spend: sum("spend"), leads: sum("leads"), days: dates.length, from: dates[0] ?? null, to: dates.at(-1) ?? null };
}
