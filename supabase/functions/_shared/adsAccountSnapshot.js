/* snapshot บัญชีแอดทุกตัวที่ token OAuth เห็น — รวมบัญชีที่ยังไม่ได้เชื่อมเข้าระบบ
   ใช้ตรวจ "เงินออกนอกระบบ" + ยอดค้าง/สถานะบัญชี (spec docs/superpowers/specs/2026-09-22-billing-recon.md)
   amount_spent/balance ของ Graph เป็น minor units (สตางค์) สะสมตลอดชีพ — เก็บดิบ แปลงตอนแสดงผลเท่านั้น */
import { fetchAllPages } from "./metaInsights.js";

const int = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export function snapshotRows(json) {
  return (json?.data ?? []).filter((a) => a && a.account_id).map((a) => ({
    external_account_id: String(a.account_id),
    account_name: String(a.name ?? ""),
    currency: String(a.currency ?? "THB"),
    account_status: int(a.account_status),
    amount_spent_cents: int(a.amount_spent),
    balance_cents: int(a.balance),
  }));
}

export async function fetchAccountSnapshots({ fetch, token, sleep, version }) {
  const url = `https://graph.facebook.com/${version}/me/adaccounts?fields=account_id,name,currency,account_status,amount_spent,balance&limit=100`;
  const { rows } = await fetchAllPages(url, { fetch, token, sleep });
  return snapshotRows({ data: rows });
}

/* ── ยอดเดือนระดับบัญชี (B1 · 22 ก.ย. 69) ────────────────────────────────────
   ทำให้ "เงินออกนอกระบบ" ใช้งานได้จริง: บัญชีที่ยังไม่ได้เชื่อมไม่มีข้อมูลใน ad_daily_facts
   เลยไม่รู้ว่าใช้เงินไปเท่าไร · เดิมออกแบบไว้เทียบ delta ของ amount_spent (สะสมตลอดชีพ)
   แต่ snapshot เก็บแถวเดียวต่อบัญชีแบบ upsert = ไม่มีค่าก่อนหน้าให้เทียบ ฟีเจอร์จึงเป็นของตาย
   → ถาม Meta ตรงๆ ด้วย insights ระดับบัญชี ได้ยอดเดือนจริง ย้อนหลังได้ ไม่ต้องรอสะสม baseline */
import { buildAccountSpendUrl, fetchRemoteSpend } from "./adsReconcile.js";

const MONTH = /^\d{4}-\d{2}$/;
/** ต้นเดือน (วันที่ ≤5) ดึงเดือนก่อนด้วย — ยอดท้ายเดือนยังขยับจาก attribution ที่มาช้า */
export function monthsToFetch(today, alsoPrevUntilDay = 5) {
  const ms = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(ms)) return [];
  const d = new Date(ms);
  const current = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  if (d.getUTCDate() > alsoPrevUntilDay) return [current];
  const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return [current, `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`];
}

/** "2026-09" → ช่วงวันแรก–วันสุดท้ายของเดือน (วันที่ 0 ของเดือนถัดไป = วันสุดท้ายจริง กันเดือน 28/29/30/31) */
export function monthRange(month) {
  if (!MONTH.test(String(month ?? ""))) return null;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** { accountId: { "YYYY-MM": สตางค์ } } — บัญชีไหนยิงไม่ได้ข้ามไป ไม่ล้มทั้งชุด
    (บัญชีถูกปิด/token ไม่มีสิทธิ์บัญชีนั้น = เรื่องปกติ ไม่ควรทำให้รอบ cron ล้ม) */
export async function fetchAccountMonthSpend({ fetch, token, sleep, version, accountIds = [], months = [] }) {
  const out = {};
  for (const id of accountIds) {
    for (const month of months) {
      const range = monthRange(month);
      if (!range) continue;
      try {
        const url = buildAccountSpendUrl({ version, accountId: `act_${String(id).replace(/^act_/, "")}`, from: range.from, to: range.to });
        const spend = await fetchRemoteSpend(url, { fetch, token, sleep });
        out[id] = { ...(out[id] ?? {}), [month]: Math.round(spend * 100) };
      } catch { /* ข้ามบัญชีนี้เดือนนี้ — รอบหน้าลองใหม่ */ }
    }
  }
  return out;
}

/** เลือก authorization ที่ใช้เก็บ snapshot ได้จริง — เกณฑ์เดียวกับ ads-reconcile (B2 · 22 ก.ย. 69)
    เดิมหยิบตัวแรกดิบๆ: ตัวที่หมดอายุ/เจ้าของออกจากทีมแล้ว ทำให้ snapshot ล้มเงียบทุกชั่วโมง
    ทั้งที่ token ตัวอื่นในทีมยังใช้ได้ */
export function pickSnapshotAuthorization(authorizations = [], { activeUsers = new Set(), now = Date.now() } = {}) {
  for (const auth of authorizations) {
    if (!auth || auth.status !== "connected") continue;
    if (!activeUsers.has(auth.user_id)) continue;
    if (auth.expires_at && Date.parse(auth.expires_at) <= now) continue;
    return auth;
  }
  return null;
}
