import { describe, expect, it } from "vitest";
import { creativeAssetOf, META_AD_CREATIVE_FIELDS, normalizeMetaAdCreative } from "../src/modules/marketing/ads/metaCreativeContract.js";

describe("Meta creative contract", () => {
  it("แปลง single image พร้อมข้อความ CTA และลิงก์", () => {
    const out = normalizeMetaAdCreative({ id: "ad1", name: "Ad A", creative: { id: "cr1", thumbnail_url: "https://cdn.example/thumb.jpg", object_story_spec: { link_data: { message: "ข้อความหลัก", name: "หัวข้อ", description: "รายละเอียด", link: "https://example.com/product", call_to_action: { type: "SHOP_NOW" } } } } });
    expect(out).toMatchObject({ provider: "meta", adId: "ad1", creativeId: "cr1", format: "image", destinationUrl: "https://example.com/product" });
    expect(out.copy).toEqual({ primaryText: "ข้อความหลัก", headline: "หัวข้อ", description: "รายละเอียด", callToAction: "SHOP_NOW" });
    expect(out.media[0]).toMatchObject({ type: "image", thumbnailUrl: "https://cdn.example/thumb.jpg" });
  });

  it("รองรับวิดีโอ carousel และ dynamic asset", () => {
    const video = normalizeMetaAdCreative({ id: "ad-v", creative: { id: "cr-v", object_story_spec: { video_data: { video_id: "v1", image_url: "https://cdn.example/v.jpg" } } } });
    expect(video.media[0]).toMatchObject({ type: "video", videoId: "v1" });
    const carousel = normalizeMetaAdCreative({ id: "ad-c", creative: { id: "cr-c", object_story_spec: { link_data: { child_attachments: [{ image_hash: "a", picture: "https://cdn.example/a.jpg" }, { image_hash: "b", picture: "https://cdn.example/b.jpg" }] } } } });
    expect(carousel.format).toBe("carousel");
    expect(carousel.media).toHaveLength(2);
    const dynamic = normalizeMetaAdCreative({ id: "ad-d", creative: { id: "cr-d", asset_feed_spec: { images: [{ hash: "a", image_url: "https://cdn.example/a.jpg" }, { hash: "b", image_url: "https://cdn.example/b.jpg" }] } } });
    expect(dynamic.format).toBe("dynamic");
  });

  it("ไม่ส่ง javascript URL เข้า UI และประกาศ fields ที่ connector ต้องขอ", () => {
    const out = creativeAssetOf({ id: "ad1", creative: { id: "cr1", image_url: "javascript:alert(1)", link_url: "javascript:alert(2)" } });
    expect(out.media).toEqual([]);
    expect(out.destinationUrl).toBeNull();
    expect(META_AD_CREATIVE_FIELDS).toContain("object_story_spec");
    expect(META_AD_CREATIVE_FIELDS).toContain("asset_feed_spec");
    const normalized = creativeAssetOf({ provider: "meta", format: "video", media: [{ imageUrl: "javascript:bad", videoUrl: "https://video.example/ad.mp4" }], destinationUrl: "javascript:bad", previewUrl: "https://preview.example/ad" });
    expect(normalized.media[0].imageUrl).toBeNull();
    expect(normalized.destinationUrl).toBeNull();
    expect(normalized.previewUrl).toBe("https://preview.example/ad");
    expect(normalized.media[0].videoUrl).toBe("https://video.example/ad.mp4");
  });
});

import { postLinksOf } from "../src/modules/marketing/ads/metaCreativeContract.js";
describe("ภาพจริงของโฆษณา + ลิงก์โพสต์", () => {
  it("ใช้ภาพของตัวโฆษณาเอง (ภาพปกวิดีโอ/ภาพลิงก์) ก่อนภาพย่อระดับ creative ที่มักเป็นรูปโปรไฟล์เพจ", () => {
    const logo = "https://scontent.xx.fbcdn.net/page-logo.jpg";
    const video = normalizeMetaAdCreative({ id: "ad-v", creative: { id: "cr-v", thumbnail_url: logo, object_story_spec: { video_data: { video_id: "v1", image_url: "https://scontent.xx.fbcdn.net/video-cover.jpg" } } } });
    expect(video.media[0]).toMatchObject({ type: "video", thumbnailUrl: "https://scontent.xx.fbcdn.net/video-cover.jpg", videoId: "v1" });
    const link = normalizeMetaAdCreative({ id: "ad-l", creative: { id: "cr-l", thumbnail_url: logo, object_story_spec: { link_data: { picture: "https://scontent.xx.fbcdn.net/link.jpg" } } } });
    expect(link.media[0].thumbnailUrl).toBe("https://scontent.xx.fbcdn.net/link.jpg");
    const onlyCreative = normalizeMetaAdCreative({ id: "ad-p", creative: { id: "cr-p", thumbnail_url: "https://scontent.xx.fbcdn.net/t.jpg" } });
    expect(onlyCreative.media[0].thumbnailUrl).toBe("https://scontent.xx.fbcdn.net/t.jpg");     // ไม่มีอะไรดีกว่า ก็ใช้ภาพย่อ
  });
  it("postLinksOf: Instagram จาก permalink · Facebook จาก story id (เพจ_โพสต์) · รูปแบบแปลกไม่สร้างลิงก์", () => {
    expect(postLinksOf({ permalinkUrl: "https://www.instagram.com/p/abc/", storyId: "1234_5678" })).toEqual([
      { key: "facebook", label: "โพสต์ Facebook", url: "https://www.facebook.com/1234_5678" },
      { key: "instagram", label: "โพสต์ Instagram", url: "https://www.instagram.com/p/abc/" },
    ]);
    expect(postLinksOf({ storyId: "1234_5678/../evil" })).toEqual([]);
    expect(postLinksOf({ permalinkUrl: "javascript:alert(1)" })).toEqual([]);
    expect(postLinksOf(null)).toEqual([]);
  });
});
