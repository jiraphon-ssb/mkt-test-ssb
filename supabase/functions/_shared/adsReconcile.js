/* ตรวจยอดอัตโนมัติ (ข้อ 4): เทียบค่าแอด 7/30 วัน (จบเมื่อวาน) ระหว่าง ad_daily_facts กับ Meta ระดับบัญชี
   pure JS — Edge Function ads-reconcile เรียกใช้ · เทสใน tests/adsReconcile.test.js
   กติกา: หน้าต่างไม่รวมวันนี้ (ยอดยังขยับ) · Meta = ความจริงอ้างอิง · เทียบไม่ได้ = failed ไม่ใช่ผ่าน */
import { fetchAllPages, syncError } from "./metaInsights.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;
const toTime = (iso) => (typeof iso === "string" && ISO.test(iso) ? Date.parse(`${iso}T00:00:00Z`) : NaN);
const fromTime = (t) => new Date(t).toISOString().slice(0, 10);
const ATTRIBUTION_WINDOWS = { "7d_click_1d_view": ["7d_click", "1d_view"], "1d_click": ["1d_click"], "7d_click": ["7d_click"] };

export const RECONCILE_WINDOW_KEYS = ["7d", "30d"];

/** หน้าต่างตรวจ: จบเมื่อวาน (ตาม timezone บัญชีที่ผู้เรียกส่ง today มา) · 7 และ 30 วันเต็ม */
export function reconcileWindows(today) {
  const t = toTime(today);
  if (!Number.isFinite(t)) throw syncError("SYNC_RANGE_INVALID");
  const end = t - DAY;
  return {
    "7d": { from: fromTime(end - 6 * DAY), to: fromTime(end) },
    "30d": { from: fromTime(end - 29 * DAY), to: fromTime(end) },
  };
}

/** ยอดรวมระดับบัญชีจาก Meta — แถวเดียว ไม่แบ่งรายวัน · attribution ต้องตรงกับที่ sync ใช้ */
export function buildAccountSpendUrl({ version, accountId, from, to, attribution = "platform_default" }) {
  if (!/^act_\d+$/.test(String(accountId ?? ""))) throw syncError("ACCOUNT_ID_INVALID");
  if (!/^v\d+\.\d+$/.test(String(version ?? ""))) throw syncError("GRAPH_VERSION_INVALID");
  if (!Number.isFinite(toTime(from)) || !Number.isFinite(toTime(to))) throw syncError("SYNC_RANGE_INVALID");
  const url = new URL(`https://graph.facebook.com/${version}/${accountId}/insights`);
  url.searchParams.set("level", "account");
  url.searchParams.set("fields", "spend");
  url.searchParams.set("time_range", JSON.stringify({ since: from, until: to }));
  const windows = ATTRIBUTION_WINDOWS[attribution];
  if (windows) url.searchParams.set("action_attribution_windows", JSON.stringify(windows));
  else url.searchParams.set("use_unified_attribution_setting", "true");
  return url.toString();
}

export async function fetchRemoteSpend(url, opts) {
  const { rows } = await fetchAllPages(url, opts);
  return rows.length ? Number(rows[0]?.spend) || 0 : 0;   // ไม่มีแถว = ช่วงนั้นไม่ได้ยิงแอด = 0
}

/** รวมค่าแอดฝั่งเราแบบแบ่งหน้า — query(offset, limit) คืน [{spend}] ของหน้า */
export async function sumLocalSpend(query, page = 1000) {
  let total = 0;
  for (let offset = 0; offset < 500_000; offset += page) {
    const rows = await query(offset, page);
    for (const row of rows ?? []) total += Number(row?.spend) || 0;
    if (!rows || rows.length < page) break;
  }
  return Math.round(total * 10_000) / 10_000;
}

/** เทียบยอด: ผ่านเมื่อต่างไม่เกิน tolerance% ของยอด Meta · Meta 0 ผ่านเฉพาะเราก็ 0 · เทียบไม่ได้ = failed */
export function compareSpend(localSpend, remoteSpend, tolerance) {
  if (!Number.isFinite(localSpend) || !Number.isFinite(remoteSpend)) return { localSpend, remoteSpend, diffPct: null, status: "failed" };
  if (remoteSpend === 0) return { localSpend, remoteSpend, diffPct: localSpend === 0 ? 0 : null, status: localSpend === 0 ? "passed" : "failed" };
  const diffPct = Math.round(Math.abs(localSpend - remoteSpend) / Math.abs(remoteSpend) * 10_000) / 100;
  return { localSpend, remoteSpend, diffPct, status: diffPct <= tolerance ? "passed" : "failed" };
}

export function buildReconcileSummary({ windows, tolerance, results }) {
  const out = {};
  for (const key of RECONCILE_WINDOW_KEYS) out[key] = { ...windows[key], ...results[key] };
  return {
    kind: "reconcile",
    tolerance,
    checkedAt: new Date().toISOString(),
    windows: out,
    passed: RECONCILE_WINDOW_KEYS.every((key) => out[key].status === "passed"),
  };
}
