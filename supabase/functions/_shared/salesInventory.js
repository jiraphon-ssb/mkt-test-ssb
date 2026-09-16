/* ตัวสำรวจข้อมูลจริงของระบบขายพี่ทัช (โหมด inventory ของ sales-sync) — pure · เทสใน tests/salesInventory.test.js
   ตอบคำถามว่า "แต่ละแหล่งมีข้อมูลเดือนไหน แบรนด์ไหน ครบแค่ไหน" ก่อนตัดสินใจดึงจริง
   กติกา: อ่านอย่างเดียว · ขอแค่คอลัมน์ที่ไม่ระบุตัวคน/ผู้ขาย · สรุปคืนแค่จำนวนและชื่อช่อง ไม่คืนยอดเงินหรือข้อความ */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 1000;
const COMPANY = "บริษัท";

const baseOf = (url) => String(url ?? "").trim().replace(/\/+$/, "");
const table = (url, name, params) => {
  const target = new URL(`${baseOf(url)}/rest/v1/${name}`);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return target.toString();
};

/** วันที่ 1 ของเดือนย้อนหลัง n เดือนจากวันที่ที่ให้ (YYYY-MM-DD) */
export function monthsBackStart(today, months) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(today ?? ""));
  if (!match) return null;
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) - Math.max(0, Math.trunc(Number(months) || 0));
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

/** URL ของทุกแหล่ง — select ถูกล็อกไว้ที่นี่ที่เดียว (เทสกันไม่ให้มีคอลัมน์ระบุตัวคนหลุดเข้ามา) */
export function inventoryUrls(url, { since, today }) {
  if (!ISO.test(String(since ?? "")) || !ISO.test(String(today ?? ""))) throw new Error("DATE_INVALID");
  return {
    goals: table(url, "sale_goal", { select: "brand,month,version,targets,ads", month: `gte.${since}` }),
    targets: table(url, "sale_target", { select: "month,brand,metric", month: `gte.${since}` }),
    spend: table(url, "mkt_spend", { select: "day,brand,platform", day: `gte.${since}` }),
    budgetVersions: table(url, "budget_version", { select: "id,status,version_no" }),
    budgetLines: table(url, "budget_line", { select: "version_id,category_key,brand,month", category_key: "in.(revenue,mkt)", month: `gte.${since}` }),
    pctTargets: table(url, "budget_pct_target", { select: "category_key,brand,active", category_key: "eq.mkt" }),
    apMarketing: table(url, "ap_request", { select: "doc_date,brand_tags,status", category_key: "eq.mkt", doc_date: `gte.${since}` }),
    plRevenue: table(url, "vw_pl_revenue", { select: "entity,ym", order: "ym.desc", limit: "24" }),
    pipeline: `${baseOf(url)}/rest/v1/rpc/sale_dashboard_pipeline`,
    insight: `${baseOf(url)}/rest/v1/rpc/sale_dashboard_insight`,
  };
}

/** แบ่งหน้าด้วย id (ไม่ซ้ำ) — เรียงด้วยคอลัมน์ที่ซ้ำได้จะทำให้แถวหล่นหรือซ้ำข้ามหน้า */
export function pagedUrl(url, offset = 0) {
  const target = new URL(url);
  target.searchParams.set("order", "id");
  target.searchParams.set("limit", String(PAGE));
  target.searchParams.set("offset", String(Math.max(0, Math.trunc(Number(offset) || 0))));
  return target.toString();
}

const hasValue = (value) => value !== null && value !== undefined && value !== "" && (typeof value !== "number" || Number.isFinite(value));
const sortObject = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
const bump = (object, key) => { object[key] = (object[key] ?? 0) + 1; };

/** เป้าแบบใหม่ → แบรนด์ × เดือน: เวอร์ชันล่าสุด · ช่องที่มีค่า · ตั้งงบแอดแล้วไหม · กี่แพลตฟอร์ม (ไม่คืนตัวเลข) */
export function summarizeGoalInventory(rows) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const brand = String(row?.brand ?? "");
    const month = String(row?.month ?? "").slice(0, 10);
    if (!brand || !ISO.test(month)) continue;
    const byMonth = out[brand] ?? (out[brand] = {});
    const current = byMonth[month];
    const version = Math.trunc(Number(row.version) || 0);
    const versions = (current?.versions ?? 0) + 1;
    if (current && current.version >= version) { current.versions = versions; continue; }
    const targets = row.targets && typeof row.targets === "object" ? row.targets : {};
    const ads = row.ads && typeof row.ads === "object" ? row.ads : {};
    byMonth[month] = {
      version, versions,
      filled: Object.keys(targets).filter((key) => hasValue(targets[key])).sort(),
      adBudgetSet: Number(targets.ad_budget) > 0,
      platforms: Array.isArray(ads.platforms) ? ads.platforms.length : 0,
      otherCost: Number(ads.other_cost) > 0,
    };
  }
  return sortObject(Object.fromEntries(Object.entries(out).map(([brand, months]) => [brand, sortObject(months)])));
}

/** เป้าแบบเก่า → เดือน × แบรนด์: จำนวนตัวชี้วัดที่ตั้ง */
export function summarizeTargetInventory(rows) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const month = String(row?.month ?? "").slice(0, 10);
    if (!ISO.test(month) || !row?.brand) continue;
    bump(out[month] ?? (out[month] = {}), row.brand);
  }
  return sortObject(Object.fromEntries(Object.entries(out).map(([month, brands]) => [month, sortObject(brands)])));
}

/** ค่าแอดจาก CSV → แบรนด์ × แพลตฟอร์ม: จำนวนวัน · วันแรก · วันล่าสุด */
export function summarizeSpendInventory(rows) {
  const days = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.brand || !row?.platform || !ISO.test(String(row.day ?? ""))) continue;
    const key = `${row.brand}|${row.platform}`;
    (days[key] ?? (days[key] = new Set())).add(row.day);
  }
  const out = {};
  for (const [key, set] of Object.entries(days)) {
    const [brand, platform] = key.split("|");
    const sorted = [...set].sort();
    (out[brand] ?? (out[brand] = {}))[platform] = { days: sorted.length, first: sorted[0], last: sorted[sorted.length - 1] };
  }
  return sortObject(Object.fromEntries(Object.entries(out).map(([brand, platforms]) => [brand, sortObject(platforms)])));
}

/** งบประมาณ → เดือน × หมวด: แบรนด์ที่มีงบในเวอร์ชันอนุมัติ / มีแค่ในร่าง */
export function summarizeBudgetInventory(lines, versions) {
  const status = new Map((Array.isArray(versions) ? versions : []).map((version) => [version.id, version.status]));
  const found = {};
  for (const line of Array.isArray(lines) ? lines : []) {
    const month = String(line?.month ?? "").slice(0, 10);
    if (!ISO.test(month) || !line?.category_key) continue;
    const scope = line.brand ?? COMPANY;
    const bucket = ((found[month] ?? (found[month] = {}))[line.category_key] ?? (found[month][line.category_key] = { approved: new Set(), draft: new Set() }));
    (status.get(line.version_id) === "approved" ? bucket.approved : bucket.draft).add(scope);
  }
  const out = {};
  for (const [month, categories] of Object.entries(found)) {
    out[month] = sortObject(Object.fromEntries(Object.entries(categories).map(([category, { approved, draft }]) => [category, {
      approved: [...approved].sort(),
      draftOnly: [...draft].filter((scope) => !approved.has(scope)).sort(),
    }])));
  }
  return sortObject(out);
}

/** % การตลาดเป้า → เปิดใช้กี่อัน ระดับไหนบ้าง (ไม่คืนค่า %) */
export function summarizePctTargets(rows) {
  const active = (Array.isArray(rows) ? rows : []).filter((row) => row?.active);
  return { active: active.length, scopes: [...new Set(active.map((row) => row.brand ?? COMPANY))].sort() };
}

/** ค่าการตลาดตามบัญชี (AP หมวด mkt) → เดือน: จำนวนรายการ · ติดแท็กแบรนด์ · แยกแบรนด์ · แยกสถานะ (ไม่คืนยอดเงิน) */
export function summarizeApMarketing(rows) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const month = ISO.test(String(row?.doc_date ?? "")) ? row.doc_date.slice(0, 7) : "ไม่ระบุวันที่";
    const bucket = out[month] ?? (out[month] = { count: 0, tagged: 0, brands: {}, statuses: {} });
    bucket.count += 1;
    const tags = Array.isArray(row?.brand_tags) ? row.brand_tags.filter(Boolean) : [];
    if (tags.length) bucket.tagged += 1;
    for (const tag of tags) bump(bucket.brands, tag);
    bump(bucket.statuses, String(row?.status ?? "unknown"));
  }
  return sortObject(Object.fromEntries(Object.entries(out).map(([month, bucket]) => [month, { ...bucket, brands: sortObject(bucket.brands), statuses: sortObject(bucket.statuses) }])));
}

/** RPC ตอบรูปไหน — ชื่อก้อนบนสุดเท่านั้น ไม่เอาเนื้อข้อมูล */
export function rpcShape(payload) {
  if (Array.isArray(payload)) return { type: "array", length: payload.length };
  if (payload && typeof payload === "object") return { type: "object", keys: Object.keys(payload).sort() };
  return { type: payload === null || payload === undefined ? "null" : typeof payload };
}
