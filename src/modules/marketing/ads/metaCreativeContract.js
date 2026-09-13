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
