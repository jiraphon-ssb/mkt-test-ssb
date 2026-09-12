import { describe, expect, it } from "vitest";
import { ADS_PROVIDERS, buildAdsSyncRequest, validateAdsConnection } from "../src/modules/marketing/ads/adsConnectorContract.js";

describe("ads connector contract", () => {
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
});
