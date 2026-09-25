/* หน้า Sync — แปลงข้อมูลท่อยอดขาย / creative / สิทธิ์ เป็นสิ่งที่หน้าจอบอกได้ (pure · เทสใน tests/syncSources.test.js)
   กติกาเมื่อไม่มีข้อมูล (docs/superpowers/plans/2026-09-17-sales-data-rollout.md): ยังไม่มีข้อมูล · ทีมยังไม่กรอก ·
   ยังไม่ตั้งเป้า · รอเชื่อมแหล่งข้อมูล — ห้ามโชว์ 0 แทนสิ่งที่ไม่รู้ */
import { SALES_SOURCE_BRAND_IDS, funnelStagesOf, metricCoverage } from "./salesFacts.js";
import { adsErrorText } from "./adsSyncMessages.js";

/* แบรนด์ที่มีแหล่งยอดขายจริงบนหน้าจอ — เปิด JUNTAKARN 18 ก.ย. 69 หลังท่อข้อมูลจากระบบ TMK ทำงานจริง
   ยอดขาย · ROAS · %Ads · CAC ภาพรวมรวม JUNTAKARN แล้ว
   ส่วน funnel ภาพรวม (Lead/มัดจำ) ยังนับ 3 แบรนด์ที่เก็บครบทุกขั้น และบอกบนจอว่าไม่รวมใคร — ดู FULL_FUNNEL_BRAND_IDS ใน overviewModel */
export const SALES_BRAND_IDS = SALES_SOURCE_BRAND_IDS;

/* แถวแหล่งข้อมูลของ JUNTAKARN (ระบบ TMK Operation) — นิยามต่างจากแบรนด์อื่น ต้องเขียนไว้บนจอ ไม่ให้อ่านผิด */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const time = (value) => { const t = Date.parse(String(value ?? "")); return Number.isFinite(t) ? t : null; };
export const JK_BRAND_ID = "b_jt";
const JK_SOURCE_DETAIL = "นับเฉพาะออเดอร์ช่องทาง Facebook (ไม่รวม LINE · โทร · Shopee · Lazada · หน้าร้าน) · ยอดลงตามวันที่ออเดอร์ · ไม่มีขั้น Lead และมัดจำ";
const JK_STALE_DAYS = 2;

/** runs = ประวัติรอบ pipeline (เฟส JK อยู่ใน summary.jk ของรอบ "sales") — รอบล่าสุดพังต้องขึ้นบนแถวนี้
    ไม่ใช่ไปโชว์บนแถว "ยอดขาย TD · JD · TA" ซึ่งเขียนสำเร็จคนละท่อ */
export function jkSourceRow(facts = [], { today, runs = [] } = {}) {
  const mine = (facts ?? []).filter((fact) => fact?.brand_id === JK_BRAND_ID && fact?.source === "tmk");
  const dates = mine.map((fact) => fact.fact_date).filter(Boolean).sort();
  const last = dates[dates.length - 1] ?? null;
  const lastRun = (runs ?? []).filter((run) => run?.pipeline === "sales").sort((a, b) => (time(b?.started_at) ?? 0) - (time(a?.started_at) ?? 0))[0] ?? null;
  /* ranAt = รอบดึงทำงานเมื่อไร — หน่วยเดียวกับคอลัมน์ "สดแค่ไหน" ของอีก 3 แถว
     (เดิมแถวนี้เอา "วันที่ของข้อมูล" ไปวางในคอลัมน์นั้น คนละความหมายกับแถวข้างบน อ่านเทียบกันไม่ได้) */
  const ranAt = lastRun?.started_at ?? null;
  // ความครบของเดือนนี้ นับแบบเดียวกับแถวยอดขาย: วันนี้ที่ทีมยังไม่กรอกไม่นับเป็นวันที่ขาด (วันยังไม่จบ)
  const month = String(today ?? "").slice(0, 7);
  const monthFacts = mine.filter((fact) => String(fact.fact_date ?? "").startsWith(month) && (fact.fact_date !== today || fact.inquiry_filled === true));
  const days = monthFacts.length;
  const filled = monthFacts.filter((fact) => fact.inquiry_filled === true).length;
  const base = { error: null, fresh: last, ranAt, days, filled, detail: JK_SOURCE_DETAIL };
  const error = lastRun?.summary?.jk?.error ?? null;
  if (error) return { ...base, state: "error", error };
  if (!last) return { ...base, state: "waiting", fresh: null };
  const lag = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000);
  return { ...base, state: lag <= JK_STALE_DAYS ? "ok" : "stale" };
}


export const COVERAGE_METRICS = [
  { key: "inquiries", label: "คนทัก (ทีมกรอก)" },
  { key: "qualified_leads", label: "ลีด", stage: "qualified" },
  { key: "deposits", label: "ได้ออเดอร์", stage: "deposits" },
  { key: "orders", label: "ยืนยันออเดอร์" },
  { key: "gross_revenue", label: "ยอดขาย" },
];

const monthsBetween = (from, to) => {
  const out = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
};
const lastDayOf = (month) => { const [y, m] = month.split("-").map(Number); return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const dayCount = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

/** ตารางความครบ: แบรนด์ × ตัวชี้วัด × เดือน · state = full | partial | not_filled | no_data | open | waiting_source
    today = วันที่ยังไม่ปิด: ทีมยังไม่กรอกคนทักของวันนี้ไม่นับเป็นวันที่ขาด (เคยขึ้น "กรอก 16/17" ทั้งที่วันยังไม่จบ)
    ranges = ช่วงวันจริงของแต่ละเดือน (เริ่มกลางเดือน · ยังเปิดอยู่) ให้หัวตารางบอกได้ */
export function coverageMatrix(facts = [], { brandIds = [], from, to, today = null } = {}) {
  if (!ISO.test(String(from ?? "")) || !ISO.test(String(to ?? "")) || from > to) return { months: [], rows: [], ranges: [] };
  const months = monthsBetween(from, to);
  const rangeOf = (month) => ({ start: month === from.slice(0, 7) ? from : `${month}-01`, end: month === to.slice(0, 7) ? to : lastDayOf(month) });
  const ranges = months.map((month) => { const { start, end } = rangeOf(month); return { month, start, end, partialStart: start !== `${month}-01`, open: Boolean(today) && end >= today }; });
  const coverage = metricCoverage(facts);
  const byBrandMonth = new Map();
  for (const fact of facts ?? []) {
    const day = fact?.fact_date;
    if (!ISO.test(String(day ?? "")) || day < from || day > to) continue;
    const key = `${fact.brand_id}|${day.slice(0, 7)}`;
    const list = byBrandMonth.get(key) ?? [];
    list.push(fact);
    byBrandMonth.set(key, list);
  }
  const rows = [];
  for (const brandId of brandIds) {
    const isSource = SALES_BRAND_IDS.includes(brandId);
    const stages = funnelStagesOf(brandId);
    for (const metric of COVERAGE_METRICS) {
      // ระบบขายของบางแบรนด์ไม่มีขั้นนี้เลย (JUNTAKARN ไม่มี Lead/มัดจำ) — ช่องต้องบอกว่า "ไม่มีขั้นนี้" ไม่ใช่ "ทีมยังไม่กรอก"
      const missingStage = metric.stage && !stages.includes(metric.stage);
      const cells = months.map((month) => {
        if (!isSource) return { month, state: "waiting_source" };
        if (missingStage) return { month, state: "no_stage" };
        const { start, end } = rangeOf(month);
        const list = byBrandMonth.get(`${brandId}|${month}`) ?? [];
        const openToday = Boolean(today) && start <= today && today <= end && !list.some((fact) => fact.fact_date === today && fact.inquiry_filled === true);
        const days = dayCount(start, end) - (metric.key === "inquiries" && openToday ? 1 : 0);
        if (!list.length) return { month, state: "no_data", days };
        if (metric.key === "inquiries") {
          const filled = list.filter((fact) => fact.inquiry_filled === true).length;
          if (days <= 0) return { month, days: 0, filled, state: "open" };
          return { month, days, filled, state: filled === 0 ? "not_filled" : filled < days ? "partial" : "full" };
        }
        const since = coverage.get(brandId)?.[metric.key] ?? null;
        if (!since || since > end) return { month, days, state: "no_data", ...(since ? { since } : {}) };
        return since > start ? { month, days, since, state: "partial" } : { month, days, state: "full" };
      });
      rows.push({ brandId, metric: metric.key, label: metric.label, cells });
    }
  }
  return { months, rows, ranges };
}

export const GOAL_FIELDS = [
  ["sales_target", "เป้ายอดขาย"], ["sales_new_target", "ยอดลูกค้าใหม่"], ["orders_target", "ยืนยันออเดอร์"], ["deposits_target", "ได้ออเดอร์"], ["leads_target", "ลีด"], ["inquiry_target", "คนทัก"],
  ["ad_budget", "งบแอด"], ["cpl", "CPL"], ["roas", "ROAS"], ["pct_ads_new", "%Ads"], ["cac", "CAC"], ["cpi", "ต้นทุนต่อทัก"],
];

/** เป้าเดือนนี้ของแบรนด์: ที่มา · ช่องที่มี · ช่องที่ยังไม่ตั้ง */
export function goalGaps(goal) {
  if (!goal) return { source: "none", version: null, present: [], missing: GOAL_FIELDS.map(([, label]) => label) };
  const present = [];
  const missing = [];
  for (const [key, label] of GOAL_FIELDS) {
    const value = goal[key];
    // 0 = ตั้งใจให้เป็นศูนย์ (เช่นเดือนที่พักแอด) — ค่าที่ท่อ sync เขียนมาเป็น null อยู่แล้วเมื่อไม่ได้ตั้ง
    const set = value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
    (set ? present : missing).push(label);
  }
  return { source: goal.goal_source ?? "sale_goal", version: goal.version ?? null, present, missing };
}

const INVENTORY = [
  ["goals", "เป้าหมายแบบใหม่ (งบแอด · CPL · ROAS · %Ads)", (d) => d.rowCount > 0 ? `${d.rowCount} เวอร์ชัน` : "ระบบพร้อม แต่ยังไม่มีใครบันทึกเป้าในหน้าเป้าหมาย"],
  ["legacyTargets", "เป้าแบบเก่า (ยอด · ออเดอร์ · มัดจำ · ลีด · คนทัก)", (d) => d.rowCount > 0 ? `มีเดือน ${Object.keys(d.summary ?? {}).map((m) => m.slice(0, 7)).join(" · ")}` : "ยังไม่มี"],
  ["adSpendCsv", "ค่าแอดที่นำเข้าจากไฟล์ (Google · TikTok)", (d) => d.rowCount > 0 ? `${d.rowCount} แถว` : "ยังไม่มีใครนำเข้า"],
  ["budget", "งบประมาณรายได้ / การตลาด", (d) => d.rowCount > 0 ? `มีเดือน ${Object.keys(d.summary ?? {}).map((m) => m.slice(0, 7)).join(" · ")}` : "ยังไม่มีงบในช่วงนี้"],
  ["marketingPctTarget", "% การตลาดเป้า (โมดูลงบ)", (d) => d.summary?.active > 0 ? `ตั้งไว้ ${d.summary.active} รายการ` : "ยังไม่ได้ตั้ง"],
  ["marketingExpenseAp", "ค่าการตลาดตามบัญชี (เบิกจ่าย)", (d) => {
    const months = Object.values(d.summary ?? {});
    const pending = months.reduce((n, m) => n + (m.statuses?.pending_approval ?? 0), 0);
    return d.rowCount > 0 ? `${d.rowCount} รายการ${pending ? ` · รออนุมัติ ${pending}` : ""}` : "ยังไม่มี";
  }],
  ["plRevenue", "P&L รายได้", () => "คีย์อ่านไม่ได้ (ด่านสิทธิ์ตามบริษัท) และเป็นระดับบริษัท ไม่ใช่แบรนด์"],
  ["pipeline", "Pipeline (ความเร็ว · งานค้าง · funnel ตามช่องทาง)", () => "คีย์อ่านได้ · ยังไม่ได้ดึงมาแสดงในหน้า ads"],
  ["insight", "ลูกค้า / สินค้า", () => "คีย์อ่านได้ · ยังไม่ได้ดึงมาแสดงในหน้า ads"],
];

/** แหล่งอื่นในระบบขายจากรอบสำรวจล่าสุด · state = has_data | empty | callable | unreadable */
export function inventorySources(report) {
  if (!report || typeof report !== "object") return [];
  return INVENTORY.filter(([key]) => report[key]).map(([key, label, describe]) => {
    const door = report[key];
    if (door.state !== "open") return { key, label, state: "unreadable", detail: `อ่านไม่ได้ (${door.state ?? "ไม่ทราบสาเหตุ"})` };
    if (key === "pipeline" || key === "insight") return { key, label, state: "callable", detail: describe(door) };
    if (key === "plRevenue") return { key, label, state: door.rowCount > 0 ? "has_data" : "unreadable", detail: door.rowCount > 0 ? "อ่านได้" : describe(door) };
    const hasData = key === "marketingPctTarget" ? door.summary?.active > 0 : door.rowCount > 0;
    return { key, label, state: hasData ? "has_data" : "empty", detail: describe(door) };
  });
}

/** รอบรีเฟรช creative ล่าสุดของบัญชี */
export function creativeRunView(run) {
  if (!run) return null;
  const s = run.summary ?? {};
  const total = Number(s.total) || 0;
  const hashAsked = Number(s.hashImages?.asked) || 0;
  return {
    total,
    postMediaPct: total ? (Number(s.withPostMedia) || 0) / total : null,
    creativeOnly: Number(s.creativeOnly) || 0,
    hash: hashAsked ? `${Number(s.hashImages?.resolved) || 0}/${hashAsked}` : null,
    missingPages: Number(s.postMedia?.missingPages) || 0,
    needsReconnect: Array.isArray(s.missingScopes) && s.missingScopes.length > 0,
    hasMore: Boolean(s.hasMore),
    tone: run.status === "success" ? "ok" : run.status === "partial" ? "warn" : run.status === "running" ? "muted" : "bad",
    errorText: run.error_code ? adsErrorText(run.error_code, run.error_code) : null,
  };
}

export function tokenDaysLeft(expiresAt, now = Date.now()) {
  const exp = time(expiresAt);
  if (exp === null) return null;
  return Math.max(0, Math.floor((exp - now) / 86_400_000));
}

const VERDICT = {
  ready: ["ok", "เชื่อมต่อระบบขายได้ครบ", "คีย์ถูกชนิด · อ่านยอดขายและเป้าได้"],
  no_goal_this_month: ["warn", "เชื่อมต่อได้ · เดือนนี้ยังไม่มีเป้าในหน้าเป้าหมายแบบใหม่", "ยอดขายเข้าได้ปกติ · งบแอด CPL ROAS %Ads จะขึ้น “ยังไม่ตั้งเป้า” จนกว่าจะบันทึกเป้า"],
  not_configured: ["bad", "ยังไม่ได้ตั้งค่าการเชื่อมต่อ", "ใส่ SALES_API_URL และ SALES_API_KEY ใน Edge Function Secrets"],
  wrong_key_kind: ["bad", "ใส่คีย์ผิดชนิด", "ต้องเป็น secret key (ขึ้นต้น sb_secret_) ไม่ใช่ publishable"],
  bad_key: ["bad", "คีย์ใช้ไม่ได้", "คีย์ผิด หมดอายุ หรือถูกถอนไปแล้ว — ขอคีย์ marketing_bridge ใหม่"],
  url_error: ["bad", "เรียกระบบขายไม่ถึง", "ตรวจ SALES_API_URL ต้องเป็น https://<ref>.supabase.co"],
  no_permission: ["bad", "คีย์ไม่มีสิทธิ์อ่านยอดขาย", "ต้องให้ฝั่งระบบขายเพิ่มสิทธิ์"],
  facts_empty: ["bad", "อ่านได้แต่ยอดขายว่าง", "ด่านสิทธิ์ในระบบขายกันคีย์ระบบไว้"],
  facts_error: ["bad", "อ่านยอดขายไม่สำเร็จ", "ลองใหม่อีกครั้ง"],
  goals_error: ["warn", "อ่านยอดขายได้ แต่อ่านเป้าไม่สำเร็จ", "ลองใหม่อีกครั้ง"],
  column_leak: ["bad", "ระบบขายส่งข้อมูลเกินที่ขอ", "หยุดใช้ไว้ก่อนจนกว่าจะตรวจฝั่งระบบขาย"],
};

export function checkVerdictView(verdict) {
  const [tone, title, detail] = VERDICT[verdict] ?? ["bad", "ผลตรวจไม่รู้จัก", String(verdict ?? "")];
  return { tone, title, detail };
}

const STATUS = { success: ["สำเร็จ", "ok"], partial: ["สำเร็จบางส่วน", "warn"], failed: ["ไม่สำเร็จ", "bad"], running: ["กำลังทำงาน", "muted"] };

/** แถวประวัติรอบดึงข้อมูล (data_pipeline_runs) */
export function pipelineRunView(run) {
  const [statusLabel, tone] = STATUS[run?.status] ?? [String(run?.status ?? "ไม่ทราบ"), "muted"];
  const started = time(run?.started_at);
  const finished = time(run?.finished_at);
  return {
    trigger: run?.trigger_kind === "manual" ? "กดเอง" : "อัตโนมัติ",
    statusLabel, tone,
    durationMs: started !== null && finished !== null ? finished - started : null,
    errorText: run?.error_code ? adsErrorText(run.error_code, run.error_code) : null,
  };
}

/** ดึงย้อนหลังเป็นรายเดือน — function รับครั้งละ ≤93 วัน และรายเดือนทำให้พังเดือนไหนก็กดซ้ำเฉพาะเดือนนั้นได้ */
export function backfillRanges(from, to) {
  if (!ISO.test(String(from ?? "")) || !ISO.test(String(to ?? "")) || from > to) return [];
  return monthsBetween(from, to).map((month) => ({
    from: month === from.slice(0, 7) ? from : `${month}-01`,
    to: month === to.slice(0, 7) ? to : lastDayOf(month),
  }));
}

/** แถวที่เริ่มล่าสุดต่อกลุ่ม */
export function latestBy(rows = [], keyOf) {
  const out = new Map();
  for (const row of rows ?? []) {
    const key = keyOf(row);
    if (key === null || key === undefined) continue;
    const current = out.get(key);
    if (!current || (time(row.started_at) ?? 0) > (time(current.started_at) ?? 0)) out.set(key, row);
  }
  return out;
}
