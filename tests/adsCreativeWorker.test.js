/* Creative worker: ดึง creative ของโฆษณาที่มียอด → ad_creatives → Creative Library โหมด Meta Pilot */
import { describe, it, expect, vi } from "vitest";
import { rankAdIdsBySpend, buildAccountAdsUrl, creativeRowFromAd, fetchAccountCreatives, buildAdPreviewUrl, extractPreviewSrc, PREVIEW_FORMATS } from "../supabase/functions/_shared/metaCreative.js";
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
  it("extractPreviewSrc: ดึง src ของ iframe จาก Meta · ถอด &amp; · ยอมเฉพาะ https://www.facebook.com/ads/api/preview_iframe.php", () => {
    const body = '<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=AQabc&amp;t=AQxyz" width="540" height="690" scrolling="yes" style="border: none;"></iframe>';
    expect(extractPreviewSrc(body)).toBe("https://www.facebook.com/ads/api/preview_iframe.php?d=AQabc&t=AQxyz");
    expect(extractPreviewSrc('<iframe src="https://evil.example/ads/api/preview_iframe.php?d=1"></iframe>')).toBeNull();
    expect(extractPreviewSrc('<iframe src="javascript:alert(1)"></iframe>')).toBeNull();
    expect(extractPreviewSrc('<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=1&quot;onload=alert(1)"></iframe>')).toBeNull();
    expect(extractPreviewSrc("")).toBeNull();
  });
});

import { isPreviewSrc } from "../src/modules/marketing/ads/metaCreativeContract.js";
describe("isPreviewSrc (ตรวจซ้ำฝั่ง browser)", () => {
  it("ยอมเฉพาะ preview_iframe.php ของ facebook.com แบบ https", () => {
    expect(isPreviewSrc("https://www.facebook.com/ads/api/preview_iframe.php?d=AQ1&t=AQ2")).toBe(true);
    expect(isPreviewSrc("http://www.facebook.com/ads/api/preview_iframe.php?d=1")).toBe(false);
    expect(isPreviewSrc("https://www.facebook.com.evil.com/ads/api/preview_iframe.php?d=1")).toBe(false);
    expect(isPreviewSrc(null)).toBe(false);
  });
});
