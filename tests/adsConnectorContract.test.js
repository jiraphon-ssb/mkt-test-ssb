import { describe, expect, it } from "vitest";
import { ADS_PROVIDERS, META_RESULT_EVENTS, buildAdsSyncRequest, buildMetaCreativeSyncRequest, metaResultLabel, validateAdsConnection } from "../src/modules/marketing/ads/adsConnectorContract.js";

describe("ads connector contract", () => {
  it("แสดงชื่อ Meta result ที่คนอ่านได้ แต่ยังเก็บ event key เดิมไว้ sync", () => {
    expect(META_RESULT_EVENTS.map(([key]) => key)).toEqual(ADS_PROVIDERS.find((provider) => provider.id === "meta").leadEvents);
    expect(metaResultLabel("messaging_conversation_started_7d")).toBe("การสนทนาผ่านข้อความที่เริ่มต้น");
    expect(metaResultLabel("unknown")).toBe("ผลลัพธ์จาก Meta");
  });
  it("defines every planned provider once", () => {
    expect(ADS_PROVIDERS.map((provider) => provider.id)).toEqual(["meta", "google", "tiktok", "shopee"]);
  });

  it("requires Meta account prefix and locale", () => {
    expect(validateAdsConnection("meta", { accountId: "123", timezone: "Asia/Bangkok", currency: "THB" }).ok).toBe(false);
    expect(validateAdsConnection("meta", { accountId: "act_123", timezone: "Asia/Bangkok", currency: "THB" })).toEqual({ ok: true, errors: [] });
  });

  it("builds a provider-neutral sync request", () => {
    expect(buildAdsSyncRequest("google", "connection-1", { mode: "backfill", from: "2026-01-01", to: "2026-01-31" })).toEqual({
      provider: "google", connectionId: "connection-1", mode: "backfill", from: "2026-01-01", to: "2026-01-31",
    });
  });

  it("สร้างงานดึง Meta Creative แบบแบ่งหน้าโดยไม่พก token", () => {
    const request = buildMetaCreativeSyncRequest("conn-1", "act_123", { limit: 250, after: "cursor" });
    expect(request.path).toBe("/act_123/ads");
    expect(request.params.fields).toContain("creative{");
    expect(request.params.fields).toContain("thumbnail_url");
    expect(request.params.after).toBe("cursor");
    expect(JSON.stringify(request)).not.toContain("access_token");
  });
});
