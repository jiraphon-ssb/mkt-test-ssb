/* Creative ของ Meta: แปลงเป็นสัญญากลาง + ตัวดึงสำหรับ Edge Function ads-creatives
   ไฟล์เดียวใช้ทั้ง Deno และหน้าเว็บ (src/modules/marketing/ads/metaCreativeContract.js re-export) · เทสใน tests/adsCreativeWorker.test.js
   ไม่เก็บไฟล์สื่อ — URL รูปของ Meta หมดอายุได้ worker ดึงใหม่ทับทุกรอบ */
import { fetchAllPages, fetchGraphJson, syncError } from "./metaInsights.js";

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
  /* ภาพของตัวโฆษณาเอง (ภาพปกวิดีโอ/ภาพลิงก์/ภาพโพสต์) มาก่อนภาพย่อระดับ creative
     — ภาพย่อระดับ creative ของโฆษณาจากโพสต์เพจมักเป็นรูปโปรไฟล์เพจ ไม่ใช่ตัวคอนเทนต์ */
  const ownImage = safeUrl(first(input.picture, input.image_url, input.url));
  const imageUrl = ownImage ?? safeUrl(fallback.image_url);
  const thumbnailUrl = safeUrl(first(input.thumbnail_url, ownImage, fallback.image_url, fallback.thumbnail_url));
  if (!videoId && !videoUrl && !imageUrl && !thumbnailUrl) return null;
  /* hash ของภาพที่ Meta ยังไม่ส่ง URL มาให้ (พบในอัลบั้ม/carousel) — worker เอาไปขอ URL ที่ /act_x/adimages
     ถ้าไม่ทำ ทุกชิ้นในอัลบั้มจะใช้ภาพระดับ creative ตัวเดียวกันหมด */
  const imageHash = first(input.image_hash, input.hash);
  return {
    id: first(input.id, imageHash, videoId, imageUrl),
    type: videoId || videoUrl ? "video" : "image",
    imageUrl,
    thumbnailUrl,
    videoId: videoId ? String(videoId) : null,
    videoUrl,
    imageHash: typeof imageHash === "string" ? imageHash : null,
    /* "creative" = ชิ้นนี้ไม่มีภาพของตัวเอง ได้แต่ภาพระดับ creative มาใช้แทน (โฆษณาจากโพสต์เพจมักเป็นรูปโปรไฟล์เพจ)
       → worker ไปหาภาพจริงให้ (ขอ URL จาก image_hash ก่อน ไม่ได้ค่อยดึงจากโพสต์)
       ต้องดูจาก ownImage ไม่ใช่ imageUrl — imageUrl รวมภาพที่ fallback มาแล้ว ถ้าเช็คจากตัวนั้นจะนึกว่ามีภาพของตัวเองทุกชิ้น */
    source: ownImage || videoId || videoUrl || safeUrl(input.thumbnail_url) ? "ad" : "creative",
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
/** ลิงก์โพสต์ของโฆษณา: Facebook จาก story id (pageid_postid) · Instagram จาก permalink ที่ Meta ส่งมา */
export function postLinksOf(asset) {
  if (!asset) return [];
  const links = [];
  if (typeof asset.storyId === "string" && /^\d+_\d+$/.test(asset.storyId)) links.push({ key: "facebook", label: "โพสต์ Facebook", url: `https://www.facebook.com/${asset.storyId}` });
  const ig = safeUrl(asset.permalinkUrl);
  if (ig) links.push({ key: "instagram", label: "โพสต์ Instagram", url: ig });
  return links;
}

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
/* สเปกโฆษณา: ภาพปกวิดีโอ ภาพลิงก์ carousel dynamic — ขอก่อน ถ้า Meta ว่าหนักเกินค่อยตัดทิ้ง */
const SPEC_FIELDS = "image_hash,object_story_spec,asset_feed_spec";

export function buildAccountAdsUrl({ version, accountId, limit = 50, largeThumbnails = true, withSpecs = true, includeArchived = true, after = null }) {
  if (!/^act_\d+$/.test(String(accountId ?? ""))) throw syncError("ACCOUNT_ID_INVALID");
  if (!/^v\d+\.\d+$/.test(String(version ?? ""))) throw syncError("GRAPH_VERSION_INVALID");
  if (after != null && !/^[A-Za-z0-9_-]{1,512}$/.test(String(after))) throw syncError("CURSOR_INVALID");
  const url = new URL(`https://graph.facebook.com/${version}/${accountId}/ads`);
  const creative = largeThumbnails ? "creative.thumbnail_width(600).thumbnail_height(600)" : "creative";
  const creativeFields = withSpecs ? `${META_CREATIVE_LIGHT_FIELDS},${SPEC_FIELDS}` : META_CREATIVE_LIGHT_FIELDS;
  // effective_status = เปิด/ปิดของโฆษณา (ตารางครีเอทีฟ 25 ก.ย.) — มากับคำขอเดิม ไม่เพิ่มจำนวนครั้งที่ยิง
  url.searchParams.set("fields", `id,name,effective_status,campaign_id,adset_id,updated_time,${creative}{${creativeFields}}`);
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
    // ค่าจาก Meta เป็นคำตัวใหญ่สั้นๆ (ACTIVE/PAUSED/…) — อย่างอื่นไม่เก็บ กันข้อมูลแปลกเข้าตาราง
    effective_status: /^[A-Z_]{1,40}$/.test(String(ad.effective_status ?? "")) ? ad.effective_status : null,
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
  let limit = 50, largeThumbnails = true, withSpecs = true, includeArchived = true;
  while (pages < maxPages) {
    if (now() >= deadline) return { ads, pages, after: cursor, lastError };
    let payload;
    try {
      ({ payload } = await fetchGraphJson(buildAccountAdsUrl({ version, accountId, limit, largeThumbnails, withSpecs, includeArchived, after: cursor }), graphOpts));
    } catch (error) {
      if (!RECOVERABLE.has(error?.code)) throw error;
      lastError = error.detail ?? error.code;
      if (largeThumbnails) largeThumbnails = false;
      else if (withSpecs) withSpecs = false;
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

/* ── ตัวอย่างโฆษณา (Ad Preview API · ใช้ ads_read) — iframe ของ Meta เล่นคลิปได้ตามที่ลูกค้าเห็นจริง ── */
export const PREVIEW_FORMATS = ["MOBILE_FEED_STANDARD", "DESKTOP_FEED_STANDARD", "INSTAGRAM_STANDARD", "INSTAGRAM_STORY"];

export function buildAdPreviewUrl({ version, adId, format = "MOBILE_FEED_STANDARD" }) {
  if (!/^v\d+\.\d+$/.test(String(version ?? ""))) throw syncError("GRAPH_VERSION_INVALID");
  if (!/^\d+$/.test(String(adId ?? ""))) throw syncError("AD_ID_INVALID");
  if (!PREVIEW_FORMATS.includes(format)) throw syncError("PREVIEW_FORMAT_INVALID");
  const url = new URL(`https://graph.facebook.com/${version}/${adId}/previews`);
  url.searchParams.set("ad_format", format);
  return url.toString();
}

const PREVIEW_HOSTS = new Set(["www.facebook.com", "business.facebook.com"]);
const PREVIEW_PATH = "/ads/api/preview_iframe.php";

/** ตรวจด้วย URL parser (ไม่ใช่ regex ของตัวอักษร): https · host ของ Facebook · path ของหน้าตัวอย่าง · ไม่มี user/pass */
function previewUrl(value) {
  if (typeof value !== "string" || /[\s"'<>]/.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || !PREVIEW_HOSTS.has(url.hostname) || url.pathname !== PREVIEW_PATH || url.username || url.password || url.port) return null;
  url.hash = "";
  return url.href;
}

const IFRAME_SRC = /<iframe\b[^>]*?\ssrc\s*=\s*(["'])(.*?)\1/i;

/** src ของ iframe ที่ Meta ส่งมาใน body · ยอมเฉพาะหน้าตัวอย่างของ facebook.com · ไม่คืน HTML ให้ browser */
export function extractPreviewSrc(body) {
  const match = IFRAME_SRC.exec(String(body ?? ""));
  return match ? previewUrl(match[2].replace(/&amp;/g, "&")) : null;
}

/** รูปแบบของ body ที่ตรวจไม่ผ่าน สำหรับ log — ไม่เผย query (d/t ของ Meta) */
export function previewDiagnostics(body) {
  const text = String(body ?? "");
  const match = IFRAME_SRC.exec(text);
  let url = null;
  try { url = match ? new URL(match[2].replace(/&amp;/g, "&")) : null; } catch { url = null; }
  return { iframe: Boolean(match), protocol: url?.protocol ?? null, host: url?.hostname ?? null, path: url?.pathname ?? null, length: text.length };
}

/** ตรวจซ้ำฝั่ง browser ก่อนใส่ iframe */
export const isPreviewSrc = (src) => previewUrl(src) === src && src != null;

/* ── ภาพของอัลบั้ม/carousel ที่ Meta ส่งมาเป็น image_hash ไม่ใช่ URL ──
   child_attachments มักมีแค่ image_hash → ทุกชิ้นตกไปใช้ภาพระดับ creative ตัวเดียวกัน
   หน้าจอเลยนับ "ภาพที่ 1/8" แต่ภาพไม่เปลี่ยน · แก้โดยขอ URL ตาม hash จาก /act_x/adimages
   อยู่ในบัญชีโฆษณาเดียวกัน ใช้ ads_read ที่มีอยู่แล้ว ไม่ต้องขอสิทธิ์เพิ่ม */
const IMAGE_HASH = /^[A-Za-z0-9_-]{1,120}$/;   // charset คือสิ่งที่กันการฉีดเข้า URL ความยาวไม่ใช่ตัวตัดสิน
const HASHES_PER_CALL = 50;

export function buildAdImagesUrl({ version, accountId, hashes = [] }) {
  if (!/^act_\d+$/.test(String(accountId ?? ""))) throw syncError("ACCOUNT_ID_INVALID");
  if (!/^v\d+\.\d+$/.test(String(version ?? ""))) throw syncError("GRAPH_VERSION_INVALID");
  const clean = hashes.filter((hash) => IMAGE_HASH.test(String(hash ?? "")));
  if (!clean.length) throw syncError("IMAGE_HASHES_REQUIRED");
  const url = new URL(`https://graph.facebook.com/${version}/${accountId}/adimages`);
  url.searchParams.set("fields", "hash,url,url_128");
  url.searchParams.set("hashes", JSON.stringify(clean.slice(0, HASHES_PER_CALL)));
  return url.toString();
}

/** ผลจาก /adimages → Map(hash → URL) · เอาภาพใหญ่ก่อน ภาพย่อเป็นตัวสำรอง */
export function imageUrlsByHash(payload = {}) {
  const out = new Map();
  for (const item of payload?.data ?? []) {
    const hash = String(item?.hash ?? "");
    const url = safeUrl(first(item?.url, item?.url_128));
    if (IMAGE_HASH.test(hash) && url) out.set(hash, url);
  }
  return out;
}

/** hash ที่ยังต้องไปขอ URL — เฉพาะชิ้นที่ไม่มีภาพของตัวเอง (source = creative) */
export function hashesNeedingUrl(rows = []) {
  const out = new Set();
  for (const row of rows) {
    for (const item of Array.isArray(row?.media_assets) ? row.media_assets : []) {
      if (item?.source === "creative" && IMAGE_HASH.test(String(item?.imageHash ?? ""))) out.add(item.imageHash);
    }
  }
  return [...out];
}

/** เติม URL ที่ขอมาได้กลับเข้าแถว · hash ที่ยังไม่ได้ URL ปล่อยไว้ให้ขั้นดึงจากโพสต์ทำต่อ */
export function applyImageHashUrls(rows = [], urlByHash = new Map()) {
  if (!urlByHash.size) return rows;
  return rows.map((row) => {
    const media = Array.isArray(row?.media_assets) ? row.media_assets : null;
    if (!media?.some((item) => item?.source === "creative" && urlByHash.has(item?.imageHash))) return row;
    return {
      ...row,
      media_assets: media.map((item) => {
        const url = item?.source === "creative" ? urlByHash.get(item?.imageHash) : null;
        return url ? { ...item, imageUrl: url, thumbnailUrl: url, source: "ad" } : item;
      }),
    };
  });
}

/** ขอ URL ของทุก hash เป็นก้อน · ขอไม่ได้ = คืนเหตุผล ไม่ล้มทั้งงาน (ยังมีภาพระดับ creative ให้แสดงอยู่) */
export async function fetchImageUrls({ version, accountId, hashes = [], deadline = Infinity, now = Date.now, ...opts }) {
  const graphOpts = { ...opts, maxRetries: 0, baseDelayMs: 1000, maxDelayMs: 1000 };
  const urls = new Map();
  for (let i = 0; i < hashes.length; i += HASHES_PER_CALL) {
    if (now() >= deadline) return { urls, reason: "DEADLINE" };
    try {
      const { payload } = await fetchGraphJson(buildAdImagesUrl({ version, accountId, hashes: hashes.slice(i, i + HASHES_PER_CALL) }), graphOpts);
      for (const [hash, url] of imageUrlsByHash(payload)) urls.set(hash, url);
    } catch (error) {
      return { urls, reason: error?.code ?? "META_API_ERROR" };
    }
  }
  return { urls, reason: null };
}

/* ── ภาพจริงของโพสต์เพจ (โฆษณาแบบบูสต์โพสต์เดิม) · ต้องมี pages_show_list + pages_read_engagement ──
   ใช้ Page access token จาก /me/accounts เฉพาะในหน่วยความจำของคำขอนั้น ไม่เก็บ ไม่ log ไม่ส่งออก */
/* business_management: เพจที่อยู่ใต้ Business Manager ไม่โผล่ใน /me/accounts ถ้าผู้ใช้ไม่ได้เป็น admin ของเพจตรงๆ
   (เจอจริงทุกบัญชี — ทุกเพจของโฆษณาบูสต์โพสต์หายหมด) ต้องถาม Business เพิ่มถึงจะได้ token เพจ */
export const OAUTH_SCOPES = ["ads_read", "pages_show_list", "pages_read_engagement", "business_management"];
const STORY_ID = /^\d+_\d+$/;

export function needsPostMedia(row) {
  if (!row || typeof row.effective_story_id !== "string" || !STORY_ID.test(row.effective_story_id)) return false;
  const media = Array.isArray(row.media_assets) ? row.media_assets : [];
  return media.length === 0 || media.every((item) => item?.source === "creative");
}

export function buildPageTokensUrl({ version }) {
  if (!/^v\d+\.\d+$/.test(String(version ?? ""))) throw syncError("GRAPH_VERSION_INVALID");
  const url = new URL(`https://graph.facebook.com/${version}/me/accounts`);
  url.searchParams.set("fields", "id,access_token");
  url.searchParams.set("limit", "100");
  return url.toString();
}

const BIZ_EDGES = new Set(["owned_pages", "client_pages"]);

export function buildBusinessesUrl({ version }) {
  if (!/^v\d+\.\d+$/.test(String(version ?? ""))) throw syncError("GRAPH_VERSION_INVALID");
  const url = new URL(`https://graph.facebook.com/${version}/me/businesses`);
  url.searchParams.set("fields", "id");
  url.searchParams.set("limit", "50");
  return url.toString();
}

/** เพจที่ Business เป็นเจ้าของ (owned_pages) และเพจของลูกค้าที่ Business ดูแล (client_pages) */
export function buildBusinessPagesUrl({ version, businessId, edge }) {
  if (!/^v\d+\.\d+$/.test(String(version ?? ""))) throw syncError("GRAPH_VERSION_INVALID");
  if (!/^\d+$/.test(String(businessId ?? ""))) throw syncError("BUSINESS_ID_INVALID");
  if (!BIZ_EDGES.has(String(edge ?? ""))) throw syncError("BUSINESS_EDGE_INVALID");
  const url = new URL(`https://graph.facebook.com/${version}/${businessId}/${edge}`);
  url.searchParams.set("fields", "id,access_token");
  url.searchParams.set("limit", "100");
  return url.toString();
}

export function buildPostMediaUrl({ version, storyId }) {
  if (!/^v\d+\.\d+$/.test(String(version ?? ""))) throw syncError("GRAPH_VERSION_INVALID");
  if (!STORY_ID.test(String(storyId ?? ""))) throw syncError("STORY_ID_INVALID");
  const url = new URL(`https://graph.facebook.com/${version}/${storyId}`);
  url.searchParams.set("fields", "full_picture,permalink_url,attachments{media_type,type,media,subattachments.limit(10){media_type,media}}");
  return url.toString();
}

/** โพสต์ → media ที่หน้าจอใช้ (วิดีโอ = ภาพปก · อัลบั้ม = carousel · ภาพเดี่ยว) */
export function postMediaFrom(post = {}) {
  const attachment = post?.attachments?.data?.[0] ?? null;
  const item = (src, type) => { const u = safeUrl(src); return u ? { type, imageUrl: u, thumbnailUrl: u, videoId: null, videoUrl: null, source: "post" } : null; };
  const kind = (value) => String(value ?? "").toLowerCase().includes("video") ? "video" : "image";
  const subs = attachment?.subattachments?.data ?? [];
  let media, format;
  if (subs.length > 1) {
    media = subs.map((sub) => item(sub?.media?.image?.src, kind(sub?.media_type))).filter(Boolean);
    format = "carousel";
  } else {
    format = kind(attachment?.media_type ?? attachment?.type);
    const one = item(attachment?.media?.image?.src ?? post?.full_picture, format);
    media = one ? [one] : [];
  }
  return { format, permalink: safeUrl(post?.permalink_url), media: media.map((m, i) => ({ id: `post-${i}`, ...m })) };
}

/** เติมภาพจากโพสต์จริงให้แถวที่มีแค่ภาพย่อระดับ creative · ไม่มีสิทธิ์/rate limit/หมดเวลา = คืนแถวเดิม + เหตุผล (ไม่ throw) */
export async function enrichRowsWithPosts(rows, { version, token, deadline = Infinity, now = Date.now, concurrency = 4, scopes = [], ...opts }) {
  const graphOpts = { ...opts, maxRetries: 0, baseDelayMs: 1000, maxDelayMs: 1000 };
  // needed = แถวที่ยังไม่มีภาพของตัวเอง — ต้องรายงานคู่กับ enriched ไม่งั้น "enriched: 0" แปลไม่ออกว่าไม่มีงาน หรือทำไม่สำเร็จ
  const needed = rows.filter(needsPostMedia).length;
  if (!needed) return { rows, enriched: 0, needed: 0, missingPages: [], usedUserToken: 0, businesses: 0, reason: null };
  const pageTokens = new Map();
  const addPages = (pages) => {
    for (const page of pages ?? []) {
      if (/^\d+$/.test(String(page?.id ?? "")) && typeof page.access_token === "string" && page.access_token) pageTokens.set(String(page.id), page.access_token);
    }
  };
  try {
    const { rows: pages } = await fetchAllPages(buildPageTokensUrl({ version }), { ...graphOpts, token, maxPages: 10 });
    addPages(pages);
  } catch (error) {
    return { rows, enriched: 0, needed, missingPages: [], usedUserToken: 0, businesses: 0, reason: error?.code ?? "META_API_ERROR" };
  }
  /* เพจใต้ Business Manager ไม่อยู่ใน /me/accounts — ถามจาก Business ต่อ (ต้องมี business_management)
     ล้มตรงนี้ไม่ใช่เรื่องใหญ่: ยังมี token ผู้ใช้เป็นทางสำรองอยู่ จึงกลืน error แล้วไปต่อ */
  let businesses = 0;
  if (scopes.includes("business_management")) {
    try {
      const { rows: bizRows } = await fetchAllPages(buildBusinessesUrl({ version }), { ...graphOpts, token, maxPages: 5 });
      const ids = bizRows.map((biz) => String(biz?.id ?? "")).filter((id) => /^\d+$/.test(id));
      businesses = ids.length;
      for (const businessId of ids) {
        for (const edge of ["owned_pages", "client_pages"]) {
          try {
            const { rows: pages } = await fetchAllPages(buildBusinessPagesUrl({ version, businessId, edge }), { ...graphOpts, token, maxPages: 5 });
            addPages(pages);
          } catch { /* Business นี้ไม่ให้ดู edge นี้ → ข้าม */ }
        }
      }
    } catch { /* ถาม Business ไม่ได้ → ใช้เท่าที่มี */ }
  }
  const stories = [...new Set(rows.filter(needsPostMedia).map((row) => row.effective_story_id))];
  const missingPages = new Set();
  const results = new Map();
  const queue = [...stories];
  let reason = null;
  let usedUserToken = 0;
  const worker = async () => {
    while (queue.length && !reason) {
      if (now() >= deadline) { reason = "DEADLINE"; return; }
      const story = queue.shift();
      const page = story.split("_")[0];
      // ไม่มี token ของเพจนั้น → ลองด้วย token ผู้ใช้ บางเพจที่ผู้ใช้มีบทบาทอยู่ก็อ่านโพสต์ได้
      const pageToken = pageTokens.get(page);
      /* เพจที่ไม่มี token และลองด้วย token ผู้ใช้แล้วไม่ผ่าน = ไม่ผ่านทั้งเพจ ไม่ใช่เฉพาะโพสต์นั้น
         ถ้าไม่จำไว้ จะยิงพลาดทีละโพสต์จนครบ (ของจริงคือ 130 ครั้งต่อรอบ) เปลืองโควตาเปล่าๆ */
      if (!pageToken && missingPages.has(page)) continue;
      try {
        const { payload } = await fetchGraphJson(buildPostMediaUrl({ version, storyId: story }), { ...graphOpts, token: pageToken ?? token });
        const post = postMediaFrom(payload);
        if (post.media.length) {
          results.set(story, post);
          if (!pageToken) usedUserToken += 1;
        } else if (!pageToken) missingPages.add(page);
      } catch (error) {
        if (error?.code === "META_RATE_LIMIT" || error?.code === "META_TOKEN_INVALID") { reason = error.code; return; }
        // โพสต์ถูกลบ / ไม่มีสิทธิ์โพสต์นี้ → ข้าม · ถ้าไม่มี token เพจด้วย ให้รายงานว่าเพจนี้เข้าไม่ถึง
        if (!pageToken) missingPages.add(page);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  let enriched = 0;
  const out = rows.map((row) => {
    const post = needsPostMedia(row) ? results.get(row.effective_story_id) : null;
    if (!post) return row;
    enriched += 1;
    return { ...row, media_assets: post.media.slice(0, 20), format: FORMATS.has(post.format) ? post.format : row.format, source_spec: { ...row.source_spec, ...(post.permalink ? { post_permalink: post.permalink } : {}) } };
  });
  return { rows: out, enriched, needed, missingPages: [...missingPages], usedUserToken, businesses, reason };
}
