import { META_AD_CREATIVE_FIELDS } from "./metaCreativeContract.js";

/** ความหมายของ action ที่เก็บใน ad_daily_facts.leads — ชื่อใน UI ต้องไม่เผยคีย์ดิบของ Graph API */
export const META_RESULT_EVENTS = [
  ["messaging_conversation_started_7d", "การสนทนาผ่านข้อความที่เริ่มต้น"],
  ["lead", "Lead"],
  ["onsite_conversion.lead_grouped", "Lead (รวม)"],
];
export const metaResultLabel = (event) => META_RESULT_EVENTS.find(([key]) => key === event)?.[1] ?? "ผลลัพธ์จาก Meta";

export const ADS_PROVIDERS = [
  {
    id: "meta", name: "Meta Ads", color: "#1877F2", phase: 1,
    accountPrefix: "act_", accountLabel: "Ad account ID",
    metrics: ["spend", "reach", "impressions", "clicks", "actions", "action_values"],
    leadEvents: META_RESULT_EVENTS.map(([key]) => key),
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

/** งานอ่าน Creative ของ Meta สำหรับ Edge Function; ไม่มี token หรือ URL สื่อถูกส่งเข้า browser */
export function buildMetaCreativeSyncRequest(connectionId, accountId, options = {}) {
  if (!connectionId) throw new Error("connectionId is required");
  const externalAccountId = String(accountId ?? "").trim();
  if (!externalAccountId.startsWith("act_")) throw new Error("Meta accountId must start with act_");
  return {
    provider: "meta",
    connectionId,
    resource: "ad_creatives",
    method: "GET",
    path: `/${externalAccountId}/ads`,
    params: {
      fields: `id,name,campaign_id,adset_id,status,effective_status,updated_time,creative{${META_AD_CREATIVE_FIELDS}}`,
      limit: Math.min(500, Math.max(1, Number(options.limit) || 100)),
      after: options.after ?? null,
    },
  };
}
