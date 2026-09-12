export const ADS_PROVIDERS = [
  {
    id: "meta", name: "Meta Ads", color: "#1877F2", phase: 1,
    accountPrefix: "act_", accountLabel: "Ad account ID",
    metrics: ["spend", "reach", "impressions", "clicks", "actions", "action_values"],
    leadEvents: ["messaging_conversation_started_7d", "lead", "onsite_conversion.lead_grouped"],
    doc: "https://developers.facebook.com/docs/marketing-api/insights",
  },
  {
    id: "google", name: "Google Ads", color: "#4285F4", phase: 2,
    accountPrefix: "", accountLabel: "Customer ID",
    metrics: ["cost_micros", "impressions", "clicks", "conversions", "conversions_value"],
    leadEvents: ["conversions", "all_conversions"],
    doc: "https://developers.google.com/google-ads/api/docs/reporting/overview",
  },
  {
    id: "tiktok", name: "TikTok Ads", color: "#FE2C55", phase: 3,
    accountPrefix: "", accountLabel: "Advertiser ID",
    metrics: ["spend", "reach", "impressions", "clicks", "conversion", "total_purchase_value"],
    leadEvents: ["lead", "form", "messaging"],
    doc: "https://business-api.tiktok.com/portal/docs",
  },
  {
    id: "shopee", name: "Shopee Ads", color: "#EE4D2D", phase: 4,
    accountPrefix: "", accountLabel: "Shop ID",
    metrics: ["spend", "clicks", "orders", "gmv", "roas"],
    leadEvents: ["orders"],
    doc: "https://open.shopee.com/",
  },
];

export const DEFAULT_SOURCE_CONFIG = {
  currency: "THB",
  timezone: "Asia/Bangkok",
  attribution: "platform_default",
  syncEveryHours: 1,
  backfillDays: 90,
};

export function validateAdsConnection(providerId, mapping = {}) {
  const provider = ADS_PROVIDERS.find((item) => item.id === providerId);
  if (!provider) return { ok: false, errors: ["ไม่รู้จัก provider"] };
  const errors = [];
  const accountId = String(mapping.accountId ?? "").trim();
  if (!accountId) errors.push(`ยังไม่มี ${provider.accountLabel}`);
  if (provider.accountPrefix && !accountId.startsWith(provider.accountPrefix)) errors.push(`รหัสต้องขึ้นต้นด้วย ${provider.accountPrefix}`);
  if (!mapping.timezone) errors.push("ยังไม่ได้เลือก timezone");
  if (!mapping.currency) errors.push("ยังไม่ได้เลือก currency");
  return { ok: errors.length === 0, errors };
}

export function buildAdsSyncRequest(providerId, connectionId, options = {}) {
  if (!ADS_PROVIDERS.some((item) => item.id === providerId)) throw new Error("Unknown ads provider");
  if (!connectionId) throw new Error("connectionId is required");
  return {
    provider: providerId,
    connectionId,
    mode: options.mode ?? "incremental",
    from: options.from ?? null,
    to: options.to ?? null,
  };
}
