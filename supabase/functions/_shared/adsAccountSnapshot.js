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
