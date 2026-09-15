/* Creative worker: ดึง creative ของโฆษณาที่มียอด → ad_creatives → Creative Library โหมด Meta Pilot */
import { describe, it, expect, vi } from "vitest";
import { rankAdIdsBySpend, buildAdsByIdsUrl, creativeRowFromAd, fetchAdsByIds } from "../supabase/functions/_shared/metaCreative.js";
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

describe("buildAdsByIdsUrl", () => {
  it("ขอหลาย ad ในคำขอเดียว · field creative ครบ · ขอภาพย่อขนาดใหญ่ · ไม่มี token", () => {
    const url = new URL(buildAdsByIdsUrl({ version: "v26.0", ids: ["11", "22"] }));
    expect(url.origin + url.pathname).toBe("https://graph.facebook.com/v26.0/");
    expect(url.searchParams.get("ids")).toBe("11,22");
    const fields = url.searchParams.get("fields");
    expect(fields).toMatch(/^id,name,campaign_id,adset_id,updated_time,creative\.thumbnail_width\(600\)\.thumbnail_height\(600\)\{/);
    expect(fields).toContain("object_story_spec");
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(new URL(buildAdsByIdsUrl({ version: "v26.0", ids: ["11"], largeThumbnails: false })).searchParams.get("fields")).toContain(",creative{");
  });
  it("id ไม่ใช่ตัวเลข / ว่าง / เกิน 50 = throw", () => {
    expect(() => buildAdsByIdsUrl({ version: "v26.0", ids: ["me"] })).toThrow("AD_IDS_INVALID");
    expect(() => buildAdsByIdsUrl({ version: "v26.0", ids: [] })).toThrow("AD_IDS_INVALID");
    expect(() => buildAdsByIdsUrl({ version: "v26.0", ids: Array.from({ length: 51 }, (_, i) => String(i + 1)) })).toThrow("AD_IDS_INVALID");
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
    expect(row.media_assets[0]).toMatchObject({ type: "image", thumbnailUrl: "https://scontent.xx.fbcdn.net/t.jpg" });
    expect(Object.keys(row.source_spec)).toEqual(["object_type"]);
  });
  it("ad ที่ไม่มี creative (ถูกลบ) = null", () => {
    expect(creativeRowFromAd({ id: "11" }, "conn-1")).toBeNull();
  });
  it("แปลงกลับเป็นรูปเดียวกับที่ Creative Library อ่าน (creativeAssetOf)", () => {
    const asset = creativeAssetFromRow(creativeRowFromAd(graphAd("11"), "conn-1"));
    const shown = creativeAssetOf(asset);
    expect(shown).toMatchObject({ provider: "meta", format: "image", copy: { headline: "Sofa Sale" }, destinationUrl: "https://teamdee.co/sale" });
    expect(shown.media[0].thumbnailUrl).toBe("https://scontent.xx.fbcdn.net/t.jpg");
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
    expect(creativeAssetOf(withCreative.creative_data).media[0].thumbnailUrl).toBe("https://scontent.xx.fbcdn.net/t.jpg");
    expect(without.creative_data).toBeNull();
  });
});

describe("fetchAdsByIds", () => {
  const res = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
  const opts = (fetch) => ({ fetch, token: "T", sleep: async () => {}, version: "v26.0" });
  it("แบ่งคำขอละ 50 · รวมผลที่ Meta ตอบเป็น object ตาม id", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => String(i + 1));
    const fetch = vi.fn(async (url) => {
      const asked = new URL(url).searchParams.get("ids").split(",");
      return res(Object.fromEntries(asked.map((id) => [id, graphAd(id)])));
    });
    const out = await fetchAdsByIds(ids, opts(fetch));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(out.ads.length).toBe(60);
    expect(out.skipped).toEqual([]);
  });
  it("Meta ไม่รับ modifier ภาพย่อ (#100) → ลองแบบไม่มี modifier แล้วจำไว้ใช้ต่อ", async () => {
    const fetch = vi.fn(async (url) => {
      if (new URL(url).searchParams.get("fields").includes("thumbnail_width")) return res({ error: { code: 100, message: "bad field" } }, 400);
      return res({ "11": graphAd("11") });
    });
    const out = await fetchAdsByIds(["11"], opts(fetch));
    expect(out.ads.length).toBe(1);
    expect(out.largeThumbnails).toBe(false);
  });
  it("ทั้งก้อนพังเพราะบาง id เข้าไม่ได้ → ไล่ทีละ id ข้ามตัวที่พัง · token หมดอายุ = หยุดทั้งหมด", async () => {
    const fetch = vi.fn(async (url) => {
      const asked = new URL(url).searchParams.get("ids").split(",");
      if (asked.includes("99")) return res({ error: { code: 100, message: "no access" } }, 400);
      return res(Object.fromEntries(asked.map((id) => [id, graphAd(id)])));
    });
    const out = await fetchAdsByIds(["11", "99", "22"], { ...opts(fetch) });
    expect(out.ads.map((a) => a.id).sort()).toEqual(["11", "22"]);
    expect(out.skipped).toEqual(["99"]);
    const dead = vi.fn(async () => res({ error: { code: 190 } }, 401));
    await expect(fetchAdsByIds(["11"], opts(dead))).rejects.toMatchObject({ code: "META_TOKEN_INVALID" });
  });
});
