/* Creative worker: ดึง creative ของโฆษณาที่มียอด → ad_creatives → Creative Library โหมด Meta Pilot */
import { describe, it, expect, vi } from "vitest";
import { rankAdIdsBySpend, buildAccountAdsUrl, creativeRowFromAd, fetchAccountCreatives, buildAdPreviewUrl, extractPreviewSrc, previewDiagnostics, PREVIEW_FORMATS, buildAdImagesUrl, imageUrlsByHash, hashesNeedingUrl, applyImageHashUrls, fetchImageUrls } from "../supabase/functions/_shared/metaCreative.js";
import { creativeAssetFromRow, factsToAdCards } from "../src/modules/marketing/ads/adsFacts.js";
import { creativeAssetOf } from "../src/modules/marketing/ads/metaCreativeContract.js";

const graphAd = (id, patch = {}) => ({
  id, name: `Ad ${id}`, campaign_id: "c1", adset_id: "s1", updated_time: "2026-09-14T10:00:00+0000",
  creative: {
    id: `cr${id}`, name: "Sofa hero", thumbnail_url: "https://scontent.xx.fbcdn.net/t.jpg", image_url: "https://scontent.xx.fbcdn.net/i.jpg",
    object_story_spec: { link_data: { message: "โซฟาลด 30%", name: "Sofa Sale", link: "https://teamdee.co/sale", call_to_action: { type: "LEARN_MORE" } } },
  },
  ...patch,
});

describe("rankAdIdsBySpend", () => {
  it("รวมค่าแอดต่อ ad_id · เรียงมากไปน้อย · ตัด id ที่ไม่ใช่ตัวเลข (กันฉีดเข้า URL) · จำกัดจำนวน", () => {
    const facts = [{ ad_id: "11", spend: 10 }, { ad_id: "22", spend: 50 }, { ad_id: "11", spend: "45.5" }, { ad_id: "x1,me", spend: 999 }, { ad_id: "", spend: 5 }, { ad_id: "33", spend: null }];
    expect(rankAdIdsBySpend(facts)).toEqual(["11", "22", "33"]);
    expect(rankAdIdsBySpend(facts, 2)).toEqual(["11", "22"]);
  });
});

describe("creativeRowFromAd → creativeAssetFromRow", () => {
  it("แถว ad_creatives ตรงคอลัมน์ migration 0006 · ไม่เก็บ spec ดิบก้อนใหญ่", () => {
    const row = creativeRowFromAd(graphAd("11"), "conn-1", "2026-09-15T10:00:00.000Z");
    expect(row).toMatchObject({
      connection_id: "conn-1", provider: "meta", external_creative_id: "cr11", external_ad_id: "11", campaign_id: "c1", ad_group_id: "s1",
      name: "Ad 11", format: "image", primary_text: "โซฟาลด 30%", headline: "Sofa Sale", call_to_action: "LEARN_MORE",
      destination_url: "https://teamdee.co/sale", media_refreshed_at: "2026-09-15T10:00:00.000Z",
    });
    expect(row.media_assets[0]).toMatchObject({ type: "image", thumbnailUrl: "https://scontent.xx.fbcdn.net/i.jpg" });   // ภาพเต็มของโฆษณาก่อนภาพย่อ creative
    expect(Object.keys(row.source_spec)).toEqual(["object_type"]);
  });
  it("ad ที่ไม่มี creative (ถูกลบ) = null", () => {
    expect(creativeRowFromAd({ id: "11" }, "conn-1")).toBeNull();
  });
  it("แปลงกลับเป็นรูปเดียวกับที่ Creative Library อ่าน (creativeAssetOf)", () => {
    const asset = creativeAssetFromRow(creativeRowFromAd(graphAd("11"), "conn-1"));
    const shown = creativeAssetOf(asset);
    expect(shown).toMatchObject({ provider: "meta", format: "image", copy: { headline: "Sofa Sale" }, destinationUrl: "https://teamdee.co/sale" });
    expect(shown.media[0].thumbnailUrl).toBe("https://scontent.xx.fbcdn.net/i.jpg");
    const hostile = creativeAssetOf(creativeAssetFromRow({ ...creativeRowFromAd(graphAd("11"), "c"), destination_url: "javascript:alert(1)", media_assets: [{ type: "image", thumbnailUrl: "javascript:x" }] }));
    expect(hostile.destinationUrl).toBeNull();
    expect(hostile.media[0].thumbnailUrl).toBeNull();
  });
});

describe("factsToAdCards ผูก creative", () => {
  it("การ์ดได้ creative_data ตาม connection + ad_id · ไม่มี creative ก็ยังแสดงยอดได้", () => {
    const conn = { id: "conn-1", brand_id: "b_td", external_account_id: "act_1", status: "connected" };
    const fact = (ad_id) => ({ connection_id: "conn-1", fact_date: "2026-09-10", level: "ad", campaign_id: "c1", campaign_name: "Sofa", ad_id, ad_name: `Ad ${ad_id}`, spend: 10, leads: 1 });
    const creatives = [creativeRowFromAd(graphAd("11"), "conn-1")];
    const [withCreative, without] = factsToAdCards([fact("11"), fact("22")], [conn], { today: "2026-09-15", creatives });
    expect(creativeAssetOf(withCreative.creative_data).media[0].thumbnailUrl).toBe("https://scontent.xx.fbcdn.net/i.jpg");
    expect(without.creative_data).toBeNull();
  });
});

describe("buildAccountAdsUrl (?ids= เลิกรองรับใน Graph v26 → อ่านจาก ad account)", () => {
  it("/act_x/ads · field เบา · ภาพย่อใหญ่ · รวมโฆษณาที่ archived · ไม่มี token", () => {
    const url = new URL(buildAccountAdsUrl({ version: "v26.0", accountId: "act_9" }));
    expect(url.origin + url.pathname).toBe("https://graph.facebook.com/v26.0/act_9/ads");
    expect(url.searchParams.has("ids")).toBe(false);
    const fields = url.searchParams.get("fields");
    expect(fields).toMatch(/^id,name,campaign_id,adset_id,updated_time,creative\.thumbnail_width\(600\)\.thumbnail_height\(600\)\{/);
    expect(fields).toContain("thumbnail_url");
    expect(fields).toContain("object_story_spec");          // ภาพปกวิดีโอ/ภาพลิงก์จริงอยู่ในสเปก (ไม่งั้นได้รูปโปรไฟล์เพจ)
    expect(url.searchParams.get("limit")).toBe("50");
    expect(JSON.parse(url.searchParams.get("effective_status"))).toContain("ARCHIVED");
    expect(url.searchParams.has("access_token")).toBe(false);
    const lean = new URL(buildAccountAdsUrl({ version: "v26.0", accountId: "act_9", limit: 13, largeThumbnails: false, withSpecs: false, includeArchived: false, after: "QVFIUk1" }));
    expect(lean.searchParams.get("fields")).toContain(",creative{");
    expect(lean.searchParams.get("fields")).not.toContain("object_story_spec");
    expect(lean.searchParams.has("effective_status")).toBe(false);
    expect(lean.searchParams.get("limit")).toBe("13");
    expect(lean.searchParams.get("after")).toBe("QVFIUk1");
  });
  it("account id / cursor ผิดรูป = throw", () => {
    expect(() => buildAccountAdsUrl({ version: "v26.0", accountId: "act_1/../me" })).toThrow("ACCOUNT_ID_INVALID");
    expect(() => buildAccountAdsUrl({ version: "v26.0", accountId: "act_1", after: "x&access_token=1" })).toThrow("CURSOR_INVALID");
  });
});

describe("fetchAccountCreatives", () => {
  const res = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
  const page = (ids, after) => res({ data: ids.map((id) => graphAd(id)), paging: after ? { cursors: { after }, next: `https://graph.facebook.com/v26.0/act_9/ads?after=${after}` } : { cursors: {} } });
  const base = (fetch, extra = {}) => ({ version: "v26.0", fetch, token: "T", sleep: async () => {}, ...extra });
  it("ไล่หน้าจนเจอ ad ที่ต้องการครบแล้วหยุด · เก็บเฉพาะ ad ที่มีค่าแอด", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(page(["1", "2", "3"], "c1"))
      .mockResolvedValueOnce(page(["4", "5"], "c2"))
      .mockResolvedValueOnce(page(["6"], null));
    const out = await fetchAccountCreatives("act_9", new Set(["2", "5"]), base(fetch));
    expect(out.ads.map((a) => a.id)).toEqual(["2", "5"]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(out.after).toBeNull();
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("after")).toBe("c1");
  });
  it("หน้าหมดก่อนเจอครบ = จบ (ad ที่เหลือไม่อยู่ในบัญชีแล้ว) · after = null", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page(["1"], null));
    const out = await fetchAccountCreatives("act_9", new Set(["1", "99"]), base(fetch));
    expect(out.ads.length).toBe(1);
    expect(out.after).toBeNull();
  });
  it("Meta ไม่รับคำขอ → ถอยทีละขั้น: ภาพย่อใหญ่ → สเปกโฆษณา → archived → ลดจำนวนต่อหน้า · จำขั้นที่ใช้ได้", async () => {
    const fetch = vi.fn(async (url) => {
      const u = new URL(url);
      if (u.searchParams.get("fields").includes("thumbnail_width")) return res({ error: { code: 100, message: "bad field" } }, 400);
      if (u.searchParams.get("fields").includes("object_story_spec")) return res({ error: { code: 1, message: "Please reduce the amount of data you're asking for" } }, 500);
      if (u.searchParams.has("effective_status")) return res({ error: { code: 100, message: "bad status" } }, 400);
      if (Number(u.searchParams.get("limit")) > 20) return res({ error: { code: 1, message: "Please reduce the amount of data you're asking for" } }, 500);
      return page(["1"], null);
    });
    const out = await fetchAccountCreatives("act_9", new Set(["1"]), base(fetch));
    expect(out.ads.length).toBe(1);
    const last = new URL(fetch.mock.calls.at(-1)[0]);
    expect(last.searchParams.get("limit")).toBe("13");
    expect(out.lastError).toMatch(/reduce the amount of data/);
  });
  it("ถอยจนสุดแล้วยังไม่ได้ = throw รหัสเดิม · rate limit/token = throw ทันที", async () => {
    const always = vi.fn(async () => res({ error: { code: 100, message: "nope" } }, 400));
    await expect(fetchAccountCreatives("act_9", new Set(["1"]), base(always))).rejects.toMatchObject({ code: "META_API_ERROR" });
    const limited = vi.fn(async () => res({ error: { code: 17 } }, 400));
    await expect(fetchAccountCreatives("act_9", new Set(["1"]), base(limited))).rejects.toMatchObject({ code: "META_RATE_LIMIT" });
    expect(limited).toHaveBeenCalledTimes(1);
  });
  it("เกินงบเวลา = หยุดแล้วคืน cursor ให้เรียกต่อ · เริ่มต่อจาก cursor ที่ส่งมาได้", async () => {
    let t = 0;
    const fetch = vi.fn(async (url) => { t += 50_000; const after = new URL(url).searchParams.get("after"); return after === "c1" ? page(["2"], null) : page(["1"], "c1"); });
    const first = await fetchAccountCreatives("act_9", new Set(["1", "2"]), base(fetch, { deadline: 40_000, now: () => t }));
    expect(first.ads.map((a) => a.id)).toEqual(["1"]);
    expect(first.after).toBe("c1");
    const second = await fetchAccountCreatives("act_9", new Set(["1", "2"]), base(fetch, { after: first.after }));
    expect(second.ads.map((a) => a.id)).toEqual(["2"]);
    expect(second.after).toBeNull();
  });
});

describe("ตัวอย่างโฆษณาของ Meta (เล่นคลิปได้ · ใช้สิทธิ์ ads_read)", () => {
  it("buildAdPreviewUrl: /{ad_id}/previews · format เฉพาะที่อนุญาต · ad id ต้องเป็นตัวเลข", () => {
    const url = new URL(buildAdPreviewUrl({ version: "v26.0", adId: "120200", format: "INSTAGRAM_STANDARD" }));
    expect(url.origin + url.pathname).toBe("https://graph.facebook.com/v26.0/120200/previews");
    expect(url.searchParams.get("ad_format")).toBe("INSTAGRAM_STANDARD");
    expect(new URL(buildAdPreviewUrl({ version: "v26.0", adId: "1" })).searchParams.get("ad_format")).toBe("MOBILE_FEED_STANDARD");
    expect(() => buildAdPreviewUrl({ version: "v26.0", adId: "1", format: "RIGHT_COLUMN_STANDARD&x=1" })).toThrow("PREVIEW_FORMAT_INVALID");
    expect(() => buildAdPreviewUrl({ version: "v26.0", adId: "me" })).toThrow("AD_ID_INVALID");
    expect(PREVIEW_FORMATS).toEqual(["MOBILE_FEED_STANDARD", "DESKTOP_FEED_STANDARD", "INSTAGRAM_STANDARD", "INSTAGRAM_STORY"]);
  });
  it("extractPreviewSrc: ดึง src ของ iframe จาก Meta ด้วยการ parse URL · รองรับเครื่องหมายคำพูดทั้งสองแบบ/ลำดับ attribute/อักขระ base64 · ยอมเฉพาะ preview_iframe.php ของ facebook.com", () => {
    const body = '<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=AQabc&amp;t=AQxyz" width="540" height="690" scrolling="yes" style="border: none;"></iframe>';
    expect(extractPreviewSrc(body)).toBe("https://www.facebook.com/ads/api/preview_iframe.php?d=AQabc&t=AQxyz");
    expect(extractPreviewSrc("<iframe width='540' src='https://www.facebook.com/ads/api/preview_iframe.php?d=AQ%2Bx/y+z*&amp;t=AQ-_.' ></iframe>")).toBe("https://www.facebook.com/ads/api/preview_iframe.php?d=AQ%2Bx/y+z*&t=AQ-_.");
    expect(extractPreviewSrc('<iframe src="https://business.facebook.com/ads/api/preview_iframe.php?d=1"></iframe>')).toBe("https://business.facebook.com/ads/api/preview_iframe.php?d=1");
    expect(extractPreviewSrc('<iframe src="https://evil.example/ads/api/preview_iframe.php?d=1"></iframe>')).toBeNull();
    expect(extractPreviewSrc('<iframe src="https://www.facebook.com.evil.example/ads/api/preview_iframe.php?d=1"></iframe>')).toBeNull();
    expect(extractPreviewSrc('<iframe src="https://user@www.facebook.com/ads/api/preview_iframe.php?d=1"></iframe>')).toBeNull();
    expect(extractPreviewSrc('<iframe src="https://www.facebook.com/other.php?d=1"></iframe>')).toBeNull();
    expect(extractPreviewSrc('<iframe src="http://www.facebook.com/ads/api/preview_iframe.php?d=1"></iframe>')).toBeNull();
    expect(extractPreviewSrc('<iframe src="javascript:alert(1)"></iframe>')).toBeNull();
    expect(extractPreviewSrc("")).toBeNull();
  });
  it("previewDiagnostics: บอกรูปแบบ body ที่ตรวจไม่ผ่านโดยไม่เผย query (ใช้เขียน log)", () => {
    expect(previewDiagnostics('<iframe src="https://www.facebook.com/x.php?d=SECRET"></iframe>')).toEqual({ iframe: true, protocol: "https:", host: "www.facebook.com", path: "/x.php", length: 63 });
    expect(previewDiagnostics("<div>no preview</div>")).toEqual({ iframe: false, protocol: null, host: null, path: null, length: 21 });
  });
});

import { isPreviewSrc } from "../src/modules/marketing/ads/metaCreativeContract.js";
describe("isPreviewSrc (ตรวจซ้ำฝั่ง browser)", () => {
  it("ยอมเฉพาะ preview_iframe.php ของ facebook.com แบบ https", () => {
    expect(isPreviewSrc("https://www.facebook.com/ads/api/preview_iframe.php?d=AQ1&t=AQ2")).toBe(true);
    expect(isPreviewSrc("http://www.facebook.com/ads/api/preview_iframe.php?d=1")).toBe(false);
    expect(isPreviewSrc("https://www.facebook.com.evil.com/ads/api/preview_iframe.php?d=1")).toBe(false);
    expect(isPreviewSrc("https://business.facebook.com/ads/api/preview_iframe.php?d=AQ%2B/x")).toBe(true);
    expect(isPreviewSrc(null)).toBe(false);
  });
});

import { needsPostMedia, buildPageTokensUrl, buildPostMediaUrl, postMediaFrom, enrichRowsWithPosts, OAUTH_SCOPES, buildBusinessesUrl, buildBusinessPagesUrl } from "../supabase/functions/_shared/metaCreative.js";
describe("ภาพจริงของโฆษณาที่บูสต์โพสต์เพจ (pages_read_engagement)", () => {
  const LOGO = "https://scontent.xx.fbcdn.net/v/t39.30808-1/logo.jpg";
  const statusAd = (id, story) => ({ id, name: `Ad ${id}`, campaign_id: "c", adset_id: "s", creative: { id: `cr${id}`, object_type: "STATUS", thumbnail_url: LOGO, effective_object_story_id: story } });
  const res = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

  it("OAuth ขอ ads_read เป็นหลัก + สิทธิ์อ่านเพจแบบอ่านอย่างเดียว + หาเพจจาก Business ได้", () => {
    expect(OAUTH_SCOPES).toEqual(["ads_read", "pages_show_list", "pages_read_engagement", "business_management"]);
    expect(OAUTH_SCOPES.some((scope) => /publish|manage_posts|ads_management/.test(scope))).toBe(false);   // อ่านอย่างเดียว ไม่ขอสิทธิ์เขียน
  });
  it("needsPostMedia: มีโพสต์ id และมีแค่ภาพย่อระดับ creative (รูปโปรไฟล์เพจ) · โฆษณาที่มีภาพของตัวเองไม่ต้อง", () => {
    expect(needsPostMedia(creativeRowFromAd(statusAd("1", "111_222"), "conn"))).toBe(true);
    expect(needsPostMedia(creativeRowFromAd(graphAd("2"), "conn"))).toBe(false);          // มี image_url ของตัวเอง
    expect(needsPostMedia(creativeRowFromAd(statusAd("3", null), "conn"))).toBe(false);    // ไม่มีโพสต์
    expect(needsPostMedia({ effective_story_id: "111_222", media_assets: [] })).toBe(true);
    expect(needsPostMedia({ effective_story_id: "111_222/../x", media_assets: [] })).toBe(false);
  });
  it("URL: /me/accounts ขอแค่ id + token เพจ · /{story} ขอภาพ/ไฟล์แนบ/ลิงก์ · id ผิดรูป throw", () => {
    const pages = new URL(buildPageTokensUrl({ version: "v26.0" }));
    expect(pages.pathname).toBe("/v26.0/me/accounts");
    expect(pages.searchParams.get("fields")).toBe("id,access_token");
    const post = new URL(buildPostMediaUrl({ version: "v26.0", storyId: "111_222" }));
    expect(post.pathname).toBe("/v26.0/111_222");
    expect(post.searchParams.get("fields")).toContain("full_picture");
    expect(post.searchParams.get("fields")).toContain("attachments");
    expect(() => buildPostMediaUrl({ version: "v26.0", storyId: "me" })).toThrow("STORY_ID_INVALID");
  });
  it("postMediaFrom: วิดีโอ/อัลบั้ม/ภาพเดี่ยว → media ของโพสต์ · ลิงก์ที่ไม่ใช่ http(s) ถูกทิ้ง", () => {
    const video = postMediaFrom({ full_picture: "https://scontent.xx.fbcdn.net/cover.jpg", permalink_url: "https://www.facebook.com/111/posts/222", attachments: { data: [{ media_type: "video", media: { image: { src: "https://scontent.xx.fbcdn.net/cover-big.jpg" } } }] } });
    expect(video).toEqual({ format: "video", permalink: "https://www.facebook.com/111/posts/222", media: [{ id: "post-0", type: "video", imageUrl: "https://scontent.xx.fbcdn.net/cover-big.jpg", thumbnailUrl: "https://scontent.xx.fbcdn.net/cover-big.jpg", videoId: null, videoUrl: null, source: "post" }] });
    const album = postMediaFrom({ attachments: { data: [{ media_type: "album", subattachments: { data: [{ media: { image: { src: "https://s/a.jpg" } } }, { media: { image: { src: "javascript:x" } } }, { media: { image: { src: "https://s/b.jpg" } } }] } }] } });
    expect(album.format).toBe("carousel");
    expect(album.media.map((m) => m.imageUrl)).toEqual(["https://s/a.jpg", "https://s/b.jpg"]);
    expect(postMediaFrom({ full_picture: "https://s/p.jpg" }).media[0]).toMatchObject({ type: "image", imageUrl: "https://s/p.jpg" });
    expect(postMediaFrom({}).media).toEqual([]);
  });
  it("enrichRowsWithPosts: ใช้ token ของเพจนั้นเรียกโพสต์ · ใส่ภาพจริงแทนโลโก้ · token เพจไม่ออกมานอกฟังก์ชัน", async () => {
    const rows = [creativeRowFromAd(statusAd("1", "111_222"), "conn"), creativeRowFromAd(statusAd("2", "111_222"), "conn"), creativeRowFromAd(statusAd("3", "999_333"), "conn"), creativeRowFromAd(graphAd("4"), "conn")];
    const fetch = vi.fn(async (url, init) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/me/accounts")) return res({ data: [{ id: "111", access_token: "PAGE_TOKEN_111" }] });
      if (u.pathname.endsWith("/111_222")) {
        expect(init.headers.Authorization).toBe("Bearer PAGE_TOKEN_111");
        return res({ full_picture: "https://scontent.xx.fbcdn.net/real.jpg", permalink_url: "https://www.facebook.com/111/posts/222" });
      }
      throw new Error("unexpected " + url);
    });
    const out = await enrichRowsWithPosts(rows, { version: "v26.0", fetch, token: "USER", sleep: async () => {} });
    expect(fetch).toHaveBeenCalledTimes(3);                                   // เพจ 1 + โพสต์ซ้ำกันเรียกครั้งเดียว + เพจที่ไม่มี token ลองด้วย token ผู้ใช้อีก 1
    expect(out.enriched).toBe(2);
    // needed คู่กับ enriched — ถ้ามีแต่ enriched:0 จะแยกไม่ออกว่า "ไม่มีงาน" กับ "ทำไม่สำเร็จ"
    expect(out.needed).toBe(3);
    expect(out.missingPages).toEqual(["999"]);
    expect(out.rows[0].media_assets[0]).toMatchObject({ imageUrl: "https://scontent.xx.fbcdn.net/real.jpg", source: "post" });
    expect(out.rows[0].source_spec.post_permalink).toBe("https://www.facebook.com/111/posts/222");
    expect(out.rows[2].media_assets[0].thumbnailUrl).toBe(LOGO);             // เพจที่ไม่มีสิทธิ์ คงของเดิม
    expect(out.rows[3]).toBe(rows[3]);                                        // โฆษณาที่มีภาพแล้วไม่แตะ
    expect(JSON.stringify(out)).not.toContain("PAGE_TOKEN");
  });
  it("ไม่มีสิทธิ์อ่านเพจ / rate limit = ไม่ทำให้การดึง creative ล้ม · คืนเหตุผลให้แจ้งผู้ใช้", async () => {
    const rows = [creativeRowFromAd(statusAd("1", "111_222"), "conn")];
    const denied = vi.fn(async () => res({ error: { code: 200, message: "Requires pages_show_list" } }, 403));
    const out = await enrichRowsWithPosts(rows, { version: "v26.0", fetch: denied, token: "USER", sleep: async () => {} });
    expect(out).toMatchObject({ enriched: 0, needed: 1, reason: "META_PERMISSION" });
    expect(out.rows).toEqual(rows);
    const limited = vi.fn(async (url) => new URL(url).pathname.endsWith("/me/accounts") ? res({ data: [{ id: "111", access_token: "T" }] }) : res({ error: { code: 4 } }, 400));
    const out2 = await enrichRowsWithPosts(rows, { version: "v26.0", fetch: limited, token: "USER", sleep: async () => {} });
    expect(out2).toMatchObject({ enriched: 0, reason: "META_RATE_LIMIT" });
  });
  it("เกินงบเวลา = หยุดเติมภาพ คืนแถวที่ได้แล้ว", async () => {
    let t = 0;
    const rows = ["1", "2", "3"].map((id) => creativeRowFromAd(statusAd(id, `111_${id}00`), "conn"));
    const fetch = vi.fn(async (url) => { t += 30_000; return new URL(url).pathname.endsWith("/me/accounts") ? res({ data: [{ id: "111", access_token: "T" }] }) : res({ full_picture: "https://s/x.jpg" }); });
    const out = await enrichRowsWithPosts(rows, { version: "v26.0", fetch, token: "USER", sleep: async () => {}, deadline: 50_000, now: () => t, concurrency: 1 });
    expect(out.enriched).toBe(1);
    expect(out.reason).toBe("DEADLINE");
  });
});

/* ── ภาพของอัลบั้มที่ Meta ส่งมาเป็น image_hash ไม่ใช่ URL ──
   ของจริงที่เจอ: อัลบั้ม 8 ชิ้น child_attachments มีแต่ image_hash → ทุกชิ้นตกไปใช้ภาพระดับ creative
   ตัวเดียวกัน หน้าจอเลยนับ 1/8 แต่ภาพไม่เปลี่ยน · ต้องไปขอ URL จาก /act_x/adimages มาเติม */
describe("ภาพจาก image_hash", () => {
  const rowWith = (media) => ({ external_ad_id: "1", media_assets: media });
  const hashItem = (hash, patch = {}) => ({ id: hash, imageHash: hash, type: "image", imageUrl: "https://s/fallback.jpg", thumbnailUrl: "https://s/fallback.jpg", videoId: null, videoUrl: null, source: "creative", ...patch });

  it("child ที่มีแต่ image_hash: เก็บ hash ไว้ และทำเครื่องหมายว่ายังไม่ใช่ภาพของตัวเอง", () => {
    const ad = graphAd("1", { creative: {
      id: "cr1", name: "Album", thumbnail_url: "https://scontent.xx.fbcdn.net/page-avatar.jpg",
      object_story_spec: { link_data: { child_attachments: [{ image_hash: "h1", name: "A" }, { image_hash: "h2", name: "B" }] } },
    } });
    const media = creativeRowFromAd(ad, "conn-1").media_assets;
    expect(media.filter((m) => m.imageHash).map((m) => m.imageHash)).toEqual(["h1", "h2"]);
    expect(media.every((m) => m.source === "creative")).toBe(true);
  });

  it("child ที่มีภาพของตัวเองอยู่แล้ว = ไม่ต้องไปขอ URL ซ้ำ", () => {
    const ad = graphAd("2", { creative: {
      id: "cr2", name: "Album", image_url: "https://scontent.xx.fbcdn.net/i.jpg",
      object_story_spec: { link_data: { child_attachments: [{ image_hash: "h9", picture: "https://scontent.xx.fbcdn.net/child.jpg" }] } },
    } });
    const media = creativeRowFromAd(ad, "conn-1").media_assets;
    expect(media[0]).toMatchObject({ source: "ad", imageUrl: "https://scontent.xx.fbcdn.net/child.jpg" });
    expect(hashesNeedingUrl([rowWith(media)])).toEqual([]);
  });

  it("เก็บเฉพาะ hash ที่ยังไม่มีภาพของตัวเอง · ไม่ซ้ำ · ตัด hash รูปแบบแปลก (กันฉีดเข้า URL)", () => {
    const rows = [
      rowWith([hashItem("h1"), hashItem("h2"), hashItem("h1")]),
      rowWith([hashItem("h3", { source: "ad" }), hashItem("ฮแฮช!"), { id: "x", source: "creative" }]),
    ];
    expect(hashesNeedingUrl(rows)).toEqual(["h1", "h2"]);
  });

  it("URL ที่ขอ: ต่อ /act_x/adimages พร้อม hashes เป็น JSON · กันเวอร์ชัน/บัญชีเพี้ยน", () => {
    const url = new URL(buildAdImagesUrl({ version: "v26.0", accountId: "act_123", hashes: ["h1", "h2"] }));
    expect(url.pathname).toBe("/v26.0/act_123/adimages");
    expect(url.searchParams.get("hashes")).toBe(JSON.stringify(["h1", "h2"]));
    expect(url.searchParams.get("fields")).toContain("url");
    expect(() => buildAdImagesUrl({ version: "26", accountId: "act_1", hashes: ["h"] })).toThrow();
    expect(() => buildAdImagesUrl({ version: "v26.0", accountId: "123", hashes: ["h"] })).toThrow();
    expect(() => buildAdImagesUrl({ version: "v26.0", accountId: "act_1", hashes: [] })).toThrow();
  });

  it("อ่านผลเป็น hash → URL · เลือกภาพใหญ่ก่อน · ทิ้งค่าที่ไม่ใช่ URL", () => {
    const map = imageUrlsByHash({ data: [
      { hash: "h1", url: "https://scontent.xx.fbcdn.net/big1.jpg", url_128: "https://scontent.xx.fbcdn.net/s1.jpg" },
      { hash: "h2", url_128: "https://scontent.xx.fbcdn.net/s2.jpg" },
      { hash: "h3", url: "javascript:alert(1)" },
      { url: "https://scontent.xx.fbcdn.net/no-hash.jpg" },
    ] });
    expect(map.get("h1")).toBe("https://scontent.xx.fbcdn.net/big1.jpg");
    expect(map.get("h2")).toBe("https://scontent.xx.fbcdn.net/s2.jpg");
    expect(map.has("h3")).toBe(false);
    expect(map.size).toBe(2);
  });

  it("เติม URL กลับเข้าแถว: ชิ้นที่ได้ภาพจริงเปลี่ยนเป็น ad · ชิ้นที่ยังไม่ได้คงเดิม", () => {
    const rows = [rowWith([hashItem("h1"), hashItem("h2"), hashItem("h3", { source: "ad", imageUrl: "https://s/own.jpg" })])];
    const out = applyImageHashUrls(rows, new Map([["h1", "https://s/real1.jpg"]]));
    expect(out[0].media_assets[0]).toMatchObject({ imageUrl: "https://s/real1.jpg", thumbnailUrl: "https://s/real1.jpg", source: "ad" });
    expect(out[0].media_assets[1]).toMatchObject({ imageUrl: "https://s/fallback.jpg", source: "creative" });
    expect(out[0].media_assets[2]).toMatchObject({ imageUrl: "https://s/own.jpg", source: "ad" });
    expect(applyImageHashUrls(rows, new Map())).toEqual(rows);
  });

  it("ดึงจริงเป็นก้อนละไม่เกิน 50 hash · ขอไม่ได้ก็ไม่ล้มทั้งงาน คืนเหตุผลแทน", async () => {
    const calls = [];
    const fetchOk = vi.fn(async (url) => {
      calls.push(new URL(url).searchParams.get("hashes"));
      const hashes = JSON.parse(new URL(url).searchParams.get("hashes"));
      return { ok: true, status: 200, json: async () => ({ data: hashes.map((h) => ({ hash: h, url: `https://scontent.xx.fbcdn.net/${h}.jpg` })) }) };
    });
    const many = Array.from({ length: 120 }, (_, i) => `h${i}`);
    const ok = await fetchImageUrls({ version: "v26.0", accountId: "act_1", hashes: many, fetch: fetchOk, token: "T", sleep: async () => {} });
    expect(calls).toHaveLength(3);
    expect(JSON.parse(calls[0])).toHaveLength(50);
    expect(ok.urls.size).toBe(120);
    expect(ok.reason).toBe(null);

    const fetchBad = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 100, message: "bad" } }) }));
    const bad = await fetchImageUrls({ version: "v26.0", accountId: "act_1", hashes: ["h1"], fetch: fetchBad, token: "T", sleep: async () => {} });
    expect(bad.urls.size).toBe(0);
    expect(bad.reason).toBeTruthy();
  });
});

/* ── เพจที่ไม่โผล่ใน /me/accounts ──
   ของจริง: ทุกบัญชีคืน missingPages: 1 เพราะเพจอยู่ใต้ Business Manager ผู้ใช้ไม่ได้เป็น admin ของเพจตรงๆ
   ทางออก: หาเพจจาก Business ด้วย (ต้องมี business_management) และถ้ายังไม่ได้ token เพจ ให้ลองใช้ token ผู้ใช้ยิงโพสต์ตรง */
describe("หาเพจจาก Business + ใช้ token ผู้ใช้เป็นทางสำรอง", () => {
  const statusAd2 = (id, story) => ({
    id, name: `Ad ${id}`, campaign_id: "c1", adset_id: "s1",
    creative: { id: `cr${id}`, object_type: "STATUS", thumbnail_url: "https://scontent.xx.fbcdn.net/page-logo.jpg", effective_object_story_id: story },
  });
  const res2 = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

  it("ขอ business_management ตอนเชื่อม Meta (ไม่งั้นเพจใต้ Business จะหาไม่เจอ)", () => {
    expect(OAUTH_SCOPES).toContain("business_management");
    expect(OAUTH_SCOPES).toContain("pages_read_engagement");
  });

  it("URL ของ business: /me/businesses และ /{id}/owned_pages · กันเวอร์ชัน/รหัสเพี้ยน", () => {
    expect(new URL(buildBusinessesUrl({ version: "v26.0" })).pathname).toBe("/v26.0/me/businesses");
    const owned = new URL(buildBusinessPagesUrl({ version: "v26.0", businessId: "123", edge: "owned_pages" }));
    expect(owned.pathname).toBe("/v26.0/123/owned_pages");
    expect(owned.searchParams.get("fields")).toBe("id,access_token");
    expect(new URL(buildBusinessPagesUrl({ version: "v26.0", businessId: "123", edge: "client_pages" })).pathname).toBe("/v26.0/123/client_pages");
    expect(() => buildBusinessPagesUrl({ version: "v26.0", businessId: "abc", edge: "owned_pages" })).toThrow();
    expect(() => buildBusinessPagesUrl({ version: "v26.0", businessId: "123", edge: "../me" })).toThrow();
  });

  it("เพจไม่อยู่ใน /me/accounts แต่อยู่ใต้ Business = ได้ token เพจมาใช้", async () => {
    const rows = [creativeRowFromAd(statusAd2("1", "111_222"), "conn")];
    const fetch = vi.fn(async (url, init) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/me/accounts")) return res2({ data: [] });
      if (u.pathname.endsWith("/me/businesses")) return res2({ data: [{ id: "900" }] });
      if (u.pathname.endsWith("/900/owned_pages")) return res2({ data: [{ id: "111", access_token: "BIZ_PAGE_TOKEN" }] });
      if (u.pathname.endsWith("/900/client_pages")) return res2({ data: [] });
      if (u.pathname.endsWith("/111_222")) {
        expect(init.headers.Authorization).toBe("Bearer BIZ_PAGE_TOKEN");
        return res2({ full_picture: "https://scontent.xx.fbcdn.net/from-business.jpg", permalink_url: "https://www.facebook.com/111/posts/222" });
      }
      throw new Error("unexpected " + url);
    });
    const out = await enrichRowsWithPosts(rows, { version: "v26.0", fetch, token: "USER", sleep: async () => {}, scopes: ["business_management"] });
    expect(out).toMatchObject({ enriched: 1, needed: 1, missingPages: [] });
    expect(out.rows[0].media_assets[0]).toMatchObject({ imageUrl: "https://scontent.xx.fbcdn.net/from-business.jpg", source: "post" });
    expect(JSON.stringify(out)).not.toContain("BIZ_PAGE_TOKEN");
  });

  it("ไม่มี token เพจจากทางไหนเลย = ลองด้วย token ผู้ใช้ ถ้าได้ก็ถือว่าสำเร็จ", async () => {
    const rows = [creativeRowFromAd(statusAd2("1", "111_222"), "conn")];
    const fetch = vi.fn(async (url, init) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/me/accounts")) return res2({ data: [] });
      if (u.pathname.endsWith("/111_222")) {
        expect(init.headers.Authorization).toBe("Bearer USER");
        return res2({ full_picture: "https://scontent.xx.fbcdn.net/via-user.jpg", permalink_url: "https://www.facebook.com/111/posts/222" });
      }
      throw new Error("unexpected " + url);
    });
    const out = await enrichRowsWithPosts(rows, { version: "v26.0", fetch, token: "USER", sleep: async () => {} });
    expect(out).toMatchObject({ enriched: 1, usedUserToken: 1 });
    expect(out.rows[0].media_assets[0].imageUrl).toBe("https://scontent.xx.fbcdn.net/via-user.jpg");
  });

  it("token ผู้ใช้ก็อ่านโพสต์นั้นไม่ได้ = รายงานเพจที่ขาด ไม่ล้มงาน", async () => {
    const rows = [creativeRowFromAd(statusAd2("1", "111_222"), "conn")];
    const fetch = vi.fn(async (url) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/me/accounts")) return res2({ data: [] });
      return res2({ error: { code: 200, message: "no permission" } }, 403);
    });
    const out = await enrichRowsWithPosts(rows, { version: "v26.0", fetch, token: "USER", sleep: async () => {} });
    expect(out).toMatchObject({ enriched: 1 - 1, needed: 1, missingPages: ["111"] });
    expect(out.rows[0]).toBe(rows[0]);
  });

  it("token ผู้ใช้อ่านเพจนั้นไม่ได้ = เลิกลองเพจนั้นทั้งรอบ ไม่ยิงซ้ำทีละโพสต์จนหมดโควตา", async () => {
    // ของจริง: 130 โพสต์ของเพจเดียวกัน ถ้าไม่จำว่าเพจนี้เข้าไม่ได้ จะยิงพลาด 130 ครั้งทุกรอบ
    const rows = Array.from({ length: 5 }, (_, i) => creativeRowFromAd(statusAd2(String(i), `111_${i}`), "conn"));
    let postCalls = 0;
    const fetch = vi.fn(async (url) => {
      if (url.includes("/me/accounts")) return res2({ data: [] });
      postCalls += 1;
      return res2({ error: { code: 200, message: "no permission" } }, 403);
    });
    const out = await enrichRowsWithPosts(rows, { version: "v26.0", fetch, token: "USER", sleep: async () => {}, concurrency: 1 });
    expect(postCalls).toBe(1);
    expect(out).toMatchObject({ enriched: 0, needed: 5, missingPages: ["111"], usedUserToken: 0 });
  });

  it("ไม่มีสิทธิ์ business_management = ไม่ต้องเสียคำขอไปถาม Business", async () => {
    const rows = [creativeRowFromAd(statusAd2("1", "111_222"), "conn")];
    const seen = [];
    const fetch = vi.fn(async (url) => {
      seen.push(new URL(url).pathname);
      if (url.includes("/me/accounts")) return res2({ data: [] });
      return res2({ full_picture: "https://scontent.xx.fbcdn.net/u.jpg" });
    });
    await enrichRowsWithPosts(rows, { version: "v26.0", fetch, token: "USER", sleep: async () => {}, scopes: ["ads_read"] });
    expect(seen.some((path) => path.includes("businesses"))).toBe(false);
  });
});
