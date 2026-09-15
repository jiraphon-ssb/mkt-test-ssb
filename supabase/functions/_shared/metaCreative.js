/* Creative ของ Meta: แปลงเป็นสัญญากลาง + ตัวดึงสำหรับ Edge Function ads-creatives
   ไฟล์เดียวใช้ทั้ง Deno และหน้าเว็บ (src/modules/marketing/ads/metaCreativeContract.js re-export) · เทสใน tests/adsCreativeWorker.test.js
   ไม่เก็บไฟล์สื่อ — URL รูปของ Meta หมดอายุได้ worker ดึงใหม่ทับทุกรอบ */
import { fetchGraphJson, syncError } from "./metaInsights.js";

const WEB_URL = /^https?:\/\//i;
const FORMATS = new Set(["image", "video", "carousel", "dynamic", "catalog", "unknown"]);
const safeUrl = (value) => typeof value === "string" && WEB_URL.test(value.trim()) ? value.trim() : null;
const first = (...values) => values.find((value) => value != null && value !== "") ?? null;

export const META_AD_CREATIVE_FIELDS = [
  "id", "name", "object_type", "body", "title", "image_url", "thumbnail_url", "video_id",
  "link_url", "object_url", "effective_object_story_id", "effective_instagram_media_id",
  "instagram_permalink_url", "object_story_spec", "asset_feed_spec",
].join(",");

function mediaItem(input = {}, fallback = {}) {
  const videoId = first(input.video_id, fallback.video_id);
  const videoUrl = safeUrl(first(input.video_url, input.source, fallback.video_url));
  const imageUrl = safeUrl(first(input.picture, input.image_url, fallback.image_url));
  const thumbnailUrl = safeUrl(first(input.thumbnail_url, fallback.thumbnail_url, imageUrl));
  if (!videoId && !videoUrl && !imageUrl && !thumbnailUrl) return null;
  return {
    id: first(input.id, input.image_hash, videoId, imageUrl),
    type: videoId || videoUrl ? "video" : "image",
    imageUrl,
    thumbnailUrl,
    videoId: videoId ? String(videoId) : null,
    videoUrl,
  };
}

/** แปลง Ad + Creative response ของ Meta เป็นสัญญากลางที่ UI ใช้ได้โดยไม่ผูกกับ Graph API โดยตรง */
export function normalizeMetaAdCreative(ad = {}) {
  const creative = ad.creative ?? ad;
  if (!creative?.id && !ad?.id) return null;
  const story = creative.object_story_spec ?? {};
  const link = story.link_data ?? {};
  const video = story.video_data ?? {};
  const photo = story.photo_data ?? {};
  const feed = creative.asset_feed_spec ?? {};
  const childAssets = link.child_attachments ?? [];
  const media = [
    ...childAssets.map((item) => mediaItem(item, creative)),
    ...(feed.videos ?? []).map((item) => mediaItem(item, creative)),
    ...(feed.images ?? []).map((item) => mediaItem(item, creative)),
    mediaItem(first(Object.keys(video).length ? video : null, Object.keys(photo).length ? photo : null, link), creative),
  ].filter(Boolean).filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
  const primaryText = first(link.message, video.message, photo.message, creative.body, feed.bodies?.[0]?.text);
  const headline = first(link.name, video.title, creative.title, feed.titles?.[0]?.text);
  const description = first(link.description, video.description, feed.descriptions?.[0]?.text);
  const destinationUrl = safeUrl(first(link.link, video.link, creative.link_url, creative.object_url, feed.link_urls?.[0]?.website_url));
  const permalinkUrl = safeUrl(creative.instagram_permalink_url);
  const feedAssetCount = (feed.images?.length ?? 0) + (feed.videos?.length ?? 0);
  const format = childAssets.length > 1 ? "carousel" : feedAssetCount > 1 ? "dynamic" : media[0]?.type ?? "unknown";
  return {
    provider: "meta",
    creativeId: creative.id ? String(creative.id) : null,
    adId: ad.id ? String(ad.id) : null,
    name: first(ad.name, creative.name, headline, "ไม่ระบุชื่อครีเอทีฟ"),
    format,
    media,
    copy: { primaryText, headline, description, callToAction: first(link.call_to_action?.type, video.call_to_action?.type, creative.call_to_action_type) },
    destinationUrl,
    permalinkUrl,
    previewUrl: safeUrl(first(creative.preview_url, ad.preview_url)),
    storyId: creative.effective_object_story_id ?? null,
    instagramMediaId: creative.effective_instagram_media_id ?? null,
    sourceUpdatedAt: first(ad.updated_time, creative.updated_time),
  };
}

/** รับทั้งข้อมูล normalized จาก backend และ Graph response ดิบ เพื่อให้ rollout เปลี่ยนผ่านได้ */
export function creativeAssetOf(value) {
  if (!value) return null;
  if (value.provider && Array.isArray(value.media)) return {
    ...value,
    format: FORMATS.has(value.format) ? value.format : "unknown",
    media: value.media.map((item) => ({ ...item, imageUrl: safeUrl(item.imageUrl), thumbnailUrl: safeUrl(item.thumbnailUrl), videoUrl: safeUrl(item.videoUrl) })),
    destinationUrl: safeUrl(value.destinationUrl),
    permalinkUrl: safeUrl(value.permalinkUrl),
    previewUrl: safeUrl(value.previewUrl),
  };
  return normalizeMetaAdCreative(value);
}

/* ── worker ─────────────────────────────────────────────────────────── */
/* field เบาที่หน้าจอใช้จริง — ไม่ขอ object_story_spec/asset_feed_spec (ก้อนใหญ่ ทำให้ Meta ตอบ "ลดปริมาณข้อมูล" เมื่อขอหลาย ad) */
export const META_CREATIVE_LIGHT_FIELDS = [
  "id", "name", "object_type", "body", "title", "image_url", "thumbnail_url", "video_id", "link_url", "object_url",
  "call_to_action_type", "effective_object_story_id", "effective_instagram_media_id", "instagram_permalink_url",
].join(",");

/** ad_id ที่มีค่าแอดมากสุดก่อน (creative ที่คนดูบ่อยได้ภาพก่อน) · ตัด id ที่ไม่ใช่ตัวเลข */
export function rankAdIdsBySpend(facts = [], limit = 400) {
  const totals = new Map();
  for (const fact of facts) {
    const id = String(fact?.ad_id ?? "");
    if (!/^\d+$/.test(id)) continue;
    totals.set(id, (totals.get(id) ?? 0) + (Number(fact.spend) || 0));
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([id]) => id);
}

const AD_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO"];

/** โฆษณาของบัญชีพร้อม creative — Graph v26 เลิกรองรับ ?ids= จึงอ่านจาก /act_x/ads แล้วคัดเฉพาะ ad ที่มีค่าแอด */
export function buildAccountAdsUrl({ version, accountId, limit = 50, largeThumbnails = true, includeArchived = true, after = null }) {
  if (!/^act_\d+$/.test(String(accountId ?? ""))) throw syncError("ACCOUNT_ID_INVALID");
  if (!/^v\d+\.\d+$/.test(String(version ?? ""))) throw syncError("GRAPH_VERSION_INVALID");
  if (after != null && !/^[A-Za-z0-9_\-]{1,512}$/.test(String(after))) throw syncError("CURSOR_INVALID");
  const url = new URL(`https://graph.facebook.com/${version}/${accountId}/ads`);
  const creative = largeThumbnails ? "creative.thumbnail_width(600).thumbnail_height(600)" : "creative";
  url.searchParams.set("fields", `id,name,campaign_id,adset_id,updated_time,${creative}{${META_CREATIVE_LIGHT_FIELDS}}`);
  url.searchParams.set("limit", String(Math.max(1, Math.min(100, Math.floor(limit)))));
  if (includeArchived) url.searchParams.set("effective_status", JSON.stringify(AD_STATUSES));   // ad ที่มีค่าแอดแต่ถูกเก็บแล้ว
  if (after) url.searchParams.set("after", String(after));
  return url.toString();
}

const isoOrNull = (value) => {
  if (!value) return null;
  const t = Date.parse(String(value).replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Graph ad (+creative) → แถว ad_creatives (คอลัมน์ตาม migration 0006) · ad ที่ไม่มี creative = null */
export function creativeRowFromAd(ad, connectionId, now = new Date().toISOString()) {
  if (!ad?.id || !ad.creative?.id) return null;
  const n = normalizeMetaAdCreative(ad);
  return {
    connection_id: connectionId,
    provider: "meta",
    external_creative_id: String(n.creativeId ?? ""),
    external_ad_id: String(ad.id),
    campaign_id: String(ad.campaign_id ?? ""),
    ad_group_id: String(ad.adset_id ?? ""),
    name: String(n.name ?? "").slice(0, 500),
    format: FORMATS.has(n.format) ? n.format : "unknown",
    primary_text: n.copy.primaryText ?? null,
    headline: n.copy.headline ?? null,
    description: n.copy.description ?? null,
    call_to_action: n.copy.callToAction ?? null,
    destination_url: n.destinationUrl,
    permalink_url: n.permalinkUrl,
    preview_url: n.previewUrl,
    effective_story_id: n.storyId,
    instagram_media_id: n.instagramMediaId,
    media_assets: n.media.slice(0, 20),
    source_spec: { object_type: ad.creative.object_type ?? null },
    source_updated_at: isoOrNull(n.sourceUpdatedAt),
    media_refreshed_at: now,
  };
}

/* error ที่แก้ได้ด้วยการผ่อนคำขอ · rate limit/token/สิทธิ์ = หยุดทั้งงาน */
const RECOVERABLE = new Set(["META_API_ERROR", "META_TEMPORARY", "META_TOO_MUCH_DATA", "META_RESPONSE_INVALID"]);

/** ไล่หน้าโฆษณาของบัญชี เก็บ ad ที่อยู่ใน wantedIds · หยุดเมื่อเจอครบ / หน้าหมด / เกินงบเวลา (คืน after ให้เรียกต่อ)
    Meta ไม่รับคำขอ → ถอยทีละขั้น: ภาพย่อใหญ่ → ตัวกรอง archived → ลดจำนวนต่อหน้า (ถึง ≤5 แล้วยังพัง = throw)
    คืนแค่ cursor (paging.cursors.after) ไม่คืน URL หน้าถัดไป */
export async function fetchAccountCreatives(accountId, wantedIds, { version, after = null, deadline = Infinity, now = Date.now, maxPages = 40, maxRetries = 0, baseDelayMs = 1000, ...opts }) {   // ไม่ retry: rate limit หยุดทันที · error อื่นถอยเป็นคำขอที่เบาลงแทน
  const graphOpts = { ...opts, maxRetries, baseDelayMs, maxDelayMs: baseDelayMs };
  const ads = [], found = new Set();
  let cursor = after, pages = 0, lastError = null;
  let limit = 50, largeThumbnails = true, includeArchived = true;
  while (pages < maxPages) {
    if (now() >= deadline) return { ads, pages, after: cursor, lastError };
    let payload;
    try {
      ({ payload } = await fetchGraphJson(buildAccountAdsUrl({ version, accountId, limit, largeThumbnails, includeArchived, after: cursor }), graphOpts));
    } catch (error) {
      if (!RECOVERABLE.has(error?.code)) throw error;
      lastError = error.detail ?? error.code;
      if (largeThumbnails) largeThumbnails = false;
      else if (includeArchived) includeArchived = false;
      else if (limit > 5) limit = Math.ceil(limit / 2);
      else throw error;
      continue;
    }
    if (!Array.isArray(payload?.data)) throw syncError("META_RESPONSE_INVALID");
    pages++;
    for (const ad of payload.data) {
      const id = String(ad?.id ?? "");
      if (wantedIds.has(id) && !found.has(id)) { found.add(id); ads.push(ad); }
    }
    const nextCursor = payload.paging?.next ? payload.paging?.cursors?.after ?? null : null;
    if (!nextCursor || found.size >= wantedIds.size) return { ads, pages, after: null, lastError };
    cursor = nextCursor;
  }
  return { ads, pages, after: cursor, lastError };
}
