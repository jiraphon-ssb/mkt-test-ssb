/* สะพานไประบบขาย — ตรวจค่าที่ตั้งไว้ (SALES_API_URL / SALES_API_KEY) โดยไม่คืนค่าจริงออกมา
   pure · Deno + vitest ใช้ไฟล์เดียวกัน · เทสใน tests/salesBridge.test.js
   ที่ต้องมี: sales-sync ตอบ read:0 ได้ทั้งตอนใส่ถูกแต่ประตูฝั่งขายยังไม่เปิด และตอนใส่ URL ผิดจนได้ 404 — แยกไม่ออก */

const PROJECT_URL = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/;

/** ref ของโปรเจกต์จาก URL หลัก (https://<ref>.supabase.co) · มี path ต่อท้าย = ไม่ใช่ URL โปรเจกต์ */
export function projectRef(url) {
  const match = PROJECT_URL.exec(String(url ?? "").trim());
  return match ? match[1] : null;
}

export function describeSalesUrl(url, ownUrl) {
  const value = String(url ?? "").trim();
  if (!value) return { set: false, host: null, looksLikeProjectUrl: false, sameAsThisProject: false };
  let host = null;
  try { host = new URL(value).host || null; } catch { host = null; }
  const ref = projectRef(value);
  const own = projectRef(ownUrl);
  return { set: true, host, looksLikeProjectUrl: Boolean(ref), sameAsThisProject: Boolean(ref && own && ref === own) };
}

function jwtClaims(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)));
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

/** บอกแค่ "ชนิด" ของคีย์ — ห้ามคืนตัวคีย์หรือส่วนใดของมัน */
export function describeSalesKey(key, url) {
  const value = String(key ?? "").trim();
  if (!value) return { set: false, kind: null, refMatchesUrl: null };
  if (value.startsWith("sb_secret_")) return { set: true, kind: "secret", refMatchesUrl: null };
  if (value.startsWith("sb_publishable_")) return { set: true, kind: "publishable", refMatchesUrl: null };
  const claims = jwtClaims(value);
  if (!claims) return { set: true, kind: "unknown", refMatchesUrl: null };
  const kind = claims.role === "service_role" ? "service_role" : claims.role === "anon" ? "anon" : "other";
  const keyRef = typeof claims.ref === "string" ? claims.ref : null;
  const urlRef = projectRef(url);
  return { set: true, kind, refMatchesUrl: keyRef && urlRef ? keyRef === urlRef : null };
}

/** สถานะประตู RPC หนึ่งบาน จาก HTTP status + code ของ PostgREST */
export function doorState(status, code) {
  if (status >= 200 && status < 300) return "open";
  if (code === "PGRST202" || code === "42883") return "missing";        // ฟังก์ชันยังไม่ถูกสร้าง
  if (code === "42501" || status === 403) return "no_permission";       // คีย์ใช้ได้ แต่ role นั้นไม่มีสิทธิ์เรียก
  if (status === 401) return "bad_key";                                 // คีย์ผิด/หมดอายุ/ไม่ใช่ของโปรเจกต์นี้
  return "error";                                                       // รวม 404 ที่ไม่ใช่ของ PostgREST = URL ผิด
}

/* ── เฟส 1: ตรวจของจริงของพี่ทัชด้วย secret key ──────────────────────────────────
   secret key มีสิทธิ์ทั้งฐานข้อมูลขาย จึงคุมที่ "คอลัมน์ที่ขอ" แทน: ตัดตั้งแต่ฝั่งพี่ทัช ไม่ใช่ดึงมาแล้วทิ้ง
   sale_dashboard_facts คืน customer_id / deal_id / rep / reason (เหตุผลที่หลุด ซึ่งเซลอาจพิมพ์ชื่อลูกค้าไว้)
   — ห้ามเพิ่มคอลัมน์พวกนี้เข้า FACT_COLUMNS เด็ดขาด มีเทสล็อกไว้ */
export const FACT_COLUMNS = ["kind", "day", "brand", "channel", "n", "amount", "is_new"];
const GOAL_COLUMNS = ["brand", "month", "version"];
const MONTH_START = /^\d{4}-\d{2}-01$/;

const baseOf = (url) => String(url ?? "").trim().replace(/\/+$/, "");

export function factsProbeUrl(url) {
  const target = new URL(`${baseOf(url)}/rest/v1/rpc/sale_dashboard_facts`);
  target.searchParams.set("select", FACT_COLUMNS.join(","));
  return target.toString();
}

export function goalProbeUrl(url, month) {
  if (!MONTH_START.test(String(month ?? ""))) throw new Error("MONTH_INVALID");
  const target = new URL(`${baseOf(url)}/rest/v1/sale_goal`);
  target.searchParams.set("select", GOAL_COLUMNS.join(","));
  target.searchParams.set("month", `eq.${month}`);
  return target.toString();
}

/** แถว facts → จำนวนต่อชนิด · ไม่คืนแถวดิบ วันที่ หรือยอดรายรายการ */
export function summarizeFacts(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byKind = {};
  const brands = new Set();
  const inquiryDays = {};
  const seenInquiry = new Set();
  const extra = new Set();
  for (const row of list) {
    for (const column of Object.keys(row ?? {})) if (!FACT_COLUMNS.includes(column)) extra.add(column);
    const kind = String(row?.kind ?? "unknown");
    const bucket = byKind[kind] ?? (byKind[kind] = { rows: 0, n: 0, amount: 0 });
    bucket.rows += 1;
    bucket.n += Number(row?.n) || 0;
    bucket.amount += Number(row?.amount) || 0;
    if (row?.brand) brands.add(String(row.brand));
    if (kind === "inq" && row?.brand && row?.day) {
      const key = `${row.brand}|${row.day}`;
      if (!seenInquiry.has(key)) {
        seenInquiry.add(key);
        inquiryDays[row.brand] = (inquiryDays[row.brand] ?? 0) + 1;
      }
    }
  }
  return { rows: list.length, byKind, brands: [...brands].sort(), inquiryDays, extraColumns: [...extra].sort() };
}

export function summarizeGoals(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const brands = {};
  for (const row of list) {
    if (!row?.brand) continue;
    brands[row.brand] = Math.max(brands[row.brand] ?? 0, Number(row.version) || 0);
  }
  return { rows: list.length, brands: Object.fromEntries(Object.entries(brands).sort(([a], [b]) => a.localeCompare(b))) };
}

/** ผลตรวจทั้งหมด → คำตัดสินเดียว เรียงจากสาเหตุต้นทางไปปลายทาง */
export function probeVerdict({ key, facts, goals } = {}) {
  if (!key || key.set === false) return "not_configured";
  if (["publishable", "anon"].includes(key.kind)) return "wrong_key_kind";
  const states = [facts?.state, goals?.state];
  if (states.includes("bad_key")) return "bad_key";
  if (states.every((state) => state === "unreachable" || state === "error")) return "url_error";
  if (facts?.state === "no_permission") return "no_permission";
  if (facts?.state !== "open") return "facts_error";
  if (facts.summary?.extraColumns?.length) return "column_leak";
  if (!facts.summary?.rows) return "facts_empty";
  if (goals?.state !== "open") return "goals_error";
  if (!goals.summary?.rows) return "no_goal_this_month";
  return "ready";
}

/* ── เฟส 2: ท่อจริง ── */

/** เพดานแถวต่อคำขอของ PostgREST บน Supabase — ได้กลับมาเท่านี้พอดี = อาจถูกตัด ต้องแบ่งช่วงให้เล็กลง */
export const PAGE_LIMIT = 1000;

const monthFilter = (months) => {
  const list = Array.isArray(months) ? months : [];
  if (!list.length || !list.every((month) => MONTH_START.test(String(month)))) throw new Error("MONTHS_INVALID");
  return `in.(${list.join(",")})`;
};

/** sale_goal: เอาแค่ตัวเลขเป้า + งบแอด — ไม่ดึง created_by / reason / inputs / base */
export function goalsUrl(url, months) {
  const target = new URL(`${baseOf(url)}/rest/v1/sale_goal`);
  target.searchParams.set("select", "brand,month,version,targets,ads");
  target.searchParams.set("month", monthFilter(months));
  return target.toString();
}

/** sale_target (เป้าแบบเก่า): ไม่ดึง updated_by */
export function targetsUrl(url, months) {
  const target = new URL(`${baseOf(url)}/rest/v1/sale_target`);
  target.searchParams.set("select", "month,brand,metric,amount");
  target.searchParams.set("month", monthFilter(months));
  return target.toString();
}

/** เดือนที่ต้อง sync เป้า: เดือนก่อน + เดือนนี้ (วันที่ตามเวลาไทยที่ส่งเข้ามา) */
export function monthsToSync(today) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(today ?? ""));
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const pad = (value) => String(value).padStart(2, "0");
  return [`${prevYear}-${pad(prevMonth)}-01`, `${year}-${pad(month)}-01`];
}
