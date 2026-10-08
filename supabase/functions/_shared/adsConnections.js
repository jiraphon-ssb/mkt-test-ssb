/* วางแผนสร้าง/ปิด ad_connections จาก mapping ในหน้าตั้งค่า (Edge Function ads-connections)
   ยอมเฉพาะบัญชีที่ผู้บันทึกเชื่อม OAuth ไว้เอง — กันผูก token ของบัญชีที่ไม่มีสิทธิ์ · เทสใน tests/adsConnections.test.js */
import { DEFAULT_LEAD_EVENT } from "./metaInsights.js";

// ต้องตรงกับ ADS_PROVIDERS[meta].leadEvents ใน src/modules/marketing/ads/adsConnectorContract.js (มีเทสตรวจ)
export const META_LEAD_EVENTS = ["messaging_conversation_started_7d", "lead", "onsite_conversion.lead_grouped"];
export const META_ATTRIBUTIONS = ["platform_default", "7d_click_1d_view", "1d_click"];

function syncConfig(source = {}) {
  const days = Math.floor(Number(source.backfillDays));
  return {
    leadEvent: META_LEAD_EVENTS.includes(source.leadEvent) ? source.leadEvent : DEFAULT_LEAD_EVENT,
    attribution: META_ATTRIBUTIONS.includes(source.attribution) ? source.attribution : "platform_default",
    backfillDays: days >= 1 && days <= 180 ? days : 30,
  };
}

/* รูปแบบรหัสบัญชีต่อช่องทาง — Meta ขึ้นต้น act_ · Google เป็นตัวเลขล้วน (customerIdOf ล้างขีดให้แล้ว)
   ตรวจที่นี่ก่อนเขียน เพราะพิมพ์ผิดหนึ่งตัวแล้วไปเจอตอนดึงข้อมูลล้มจะหาสาเหตุยาก */
const ACCOUNT_ID_SHAPE = { meta: /^act_\d+$/, google: /^\d{6,}$/ };

export function planConnections({ provider = "meta", mappings = {}, source = {}, authorizedAccounts = [], existing = [] }) {
  const accounts = new Map(authorizedAccounts.map((account) => [String(account.external_account_id), account]));
  const config = syncConfig(source);
  const enabled = Object.entries(mappings)
    .filter(([, row]) => row?.enabled && String(row.accountId ?? "").trim())
    .map(([brandId, row]) => ({ brandId, accountId: String(row.accountId).trim() }));
  const counts = enabled.reduce((map, row) => map.set(row.accountId, (map.get(row.accountId) ?? 0) + 1), new Map());

  const upserts = [], errors = [];
  for (const { brandId, accountId } of enabled) {
    const fail = (code) => errors.push({ brandId, accountId, code });
    if (!(ACCOUNT_ID_SHAPE[provider] ?? ACCOUNT_ID_SHAPE.meta).test(accountId)) { fail("ACCOUNT_ID_INVALID"); continue; }
    if (counts.get(accountId) > 1) { fail("ACCOUNT_MAPPED_TWICE"); continue; }
    const account = accounts.get(accountId);
    if (!account) { fail("ACCOUNT_NOT_AUTHORIZED"); continue; }
    if (account.account_status != null && Number(account.account_status) !== 1) { fail("ACCOUNT_NOT_ACTIVE"); continue; }
    // บัญชีผู้จัดการของ Google (MCC) ไม่มีค่าแอดของตัวเอง ยิงรายงานไม่ได้ — กันตั้งแต่ตอนผูก
    if (account.is_manager) { fail("GOOGLE_MANAGER_ACCOUNT"); continue; }
    upserts.push({
      provider, brand_id: brandId, external_account_id: accountId,
      account_name: account.account_name ?? "",
      currency: /^[A-Z]{3}$/.test(account.currency ?? "") ? account.currency : "THB",
      timezone: account.timezone || "Asia/Bangkok",
      status: "connected", authorization_id: account.authorization_id,
      // login_customer_id ติดไปกับ config เพื่อให้ ads-sync รู้ว่าต้องเรียกผ่านบัญชีผู้จัดการตัวไหน
      config: account.login_customer_id ? { ...config, loginCustomerId: account.login_customer_id } : config,
    });
  }

  // ปิดเฉพาะ connection ที่บัญชีไม่มี mapping เปิดใช้แล้ว · ตัวที่ยัง map อยู่แต่ผู้บันทึกไม่มีสิทธิ์ ปล่อยไว้
  const stillMapped = new Set(enabled.map((row) => row.accountId));   // ยึดบัญชี: upsert ย้ายแบรนด์ใช้แถวเดิม (unique provider+account)
  const disable = existing
    // บัญชีที่ป้อนข้อมูลด้วยไฟล์ไม่ได้มาจาก mapping — ห้ามปิดตามเพราะไม่มีใน mapping
    .filter((c) => c.provider === provider && c.config?.source !== "file" && c.status !== "disabled" && !stillMapped.has(c.external_account_id))
    .map((c) => c.id);
  return { upserts, disable, errors };
}

/** บัญชีโฆษณาจาก OAuth ของทุกคนในทีมที่ยังใช้ได้ · บัญชีเดียวกันหลายคนเชื่อม: ใช้ token ของผู้เรียกก่อน ไม่งั้นตัวที่ยืนยันล่าสุด */
export function liveTeamAccounts(accounts = [], authorizations = [], { callerUserId = null, now = Date.now(), activeUserIds = null } = {}) {
  const live = new Map(authorizations
    // activeUserIds: ผู้ใช้ที่ยังมีโปรไฟล์ทีม active — คนที่ออก/ถูกปิดโปรไฟล์ token ไม่ถูกใช้ผูกหรือดึงข้อมูล
    .filter((a) => a.status === "connected" && (!a.expires_at || Date.parse(a.expires_at) > now) && (!activeUserIds || activeUserIds.has(a.user_id)))
    .map((a) => [a.id, a]));
  const rank = (account) => {
    const auth = live.get(account.authorization_id);
    return [auth.user_id === callerUserId ? 1 : 0, Date.parse(auth.last_verified_at ?? "") || 0];
  };
  const best = new Map();
  for (const account of accounts) {
    if (!live.has(account.authorization_id)) continue;
    const current = best.get(account.external_account_id);
    if (!current) { best.set(account.external_account_id, account); continue; }
    const [a1, a2] = rank(account), [c1, c2] = rank(current);
    if (a1 > c1 || (a1 === c1 && a2 > c2)) best.set(account.external_account_id, account);
  }
  return [...best.values()];
}
