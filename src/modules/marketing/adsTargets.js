/* ============================================================
   adsTargets — เป้าของตัวชี้วัดโฆษณา (pure · มีเทสใน tests/adsTargets.test.js)
   ค่าที่หน้าตั้งค่าเก็บ: settings.ads_control.targets[brandId] = {
     revenue, budget,                 ← เป้าเงิน (ใช้เป็นน้ำหนักตอนรวมภาพรวม)
     roas (×), pctAds (%), cpl (฿),   ← เป้าอัตราส่วน — ไม่ขึ้นกับความยาวช่วง
     inquiries, qualified, deposits, closed  ← เป้ายอดนับ "ต่อเดือน" ของกรวยยอดขาย }
   ดี/แย่ตัดสินจากเป้า ไม่ใช่จากการเทียบช่วงก่อนอย่างเดียว
   ============================================================ */
import { normalizeAdPlatform } from "./adsOverview.js";
import { paceLabel, paceTone, thresholdOf } from "./ads/paceEngine.js";

export const TARGET_METRICS = [
  { key: "roas", label: "ROAS", kind: "ratio", better: "higher", setting: "roas" },
  { key: "pctAds", label: "%Ads", kind: "ratio", better: "lower", setting: "pctAds", scale: 0.01 },
  { key: "cpl", label: "CPL", kind: "ratio", better: "lower", setting: "cpl" },
  { key: "inquiries", label: "คนทัก", kind: "count", better: "higher", setting: "inquiries" },
  { key: "qualified", label: "Lead", kind: "count", better: "higher", setting: "qualified" },
  { key: "deposits", label: "มัดจำ", kind: "count", better: "higher", setting: "deposits" },
  { key: "closed", label: "ออเดอร์ปิดแล้ว", kind: "count", better: "higher", setting: "closed" },
];
const METRIC_BY_KEY = Object.fromEntries(TARGET_METRICS.map((m) => [m.key, m]));

const positive = (v) => {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

/** ค่าจากหน้าตั้งค่า → หน่วยเดียวกับตัวชี้วัด · 0/ว่าง/ติดลบ = ยังไม่ตั้ง (null) */
export function normalizeTargets(raw) {
  return Object.fromEntries(TARGET_METRICS.map((m) => {
    const v = positive(raw?.[m.setting]);
    return [m.key, v == null ? null : v * (m.scale ?? 1)];
  }));
}

/* น้ำหนักตอนรวมอัตราส่วน: ROAS ถ่วงด้วยงบ · %Ads ถ่วงด้วยเป้ายอดขาย · CPL ถ่วงด้วยเป้าคนทัก */
const WEIGHT_OF = { roas: "budget", pctAds: "revenue", cpl: "inquiries" };

/** เป้าภาพรวมจากเป้ารายแบรนด์ (ค่าดิบจากหน้าตั้งค่า) — แบรนด์ไหนไม่ได้ตั้งตัวใด เป้ารวมตัวนั้น = null */
export function combineTargets(rawList = []) {
  const list = rawList.map((raw) => ({ raw: raw ?? {}, t: normalizeTargets(raw) }));
  const out = { coverage: { brands: list.length }, missing: {} };
  for (const m of TARGET_METRICS) {
    const missing = list.filter((b) => b.t[m.key] == null).length;
    out.missing[m.key] = missing;
    if (!list.length || missing > 0) { out[m.key] = null; continue; }
    if (m.kind === "count") { out[m.key] = list.reduce((n, b) => n + b.t[m.key], 0); continue; }
    const weights = list.map((b) => positive(b.raw[WEIGHT_OF[m.key]]));
    const useWeights = weights.every((w) => w != null);
    const sw = useWeights ? weights.reduce((a, b) => a + b, 0) : list.length;
    out[m.key] = list.reduce((n, b, i) => n + b.t[m.key] * (useWeights ? weights[i] : 1), 0) / sw;
  }
  return out;
}

const tone3 = (ratio, texts) => (ratio >= 1 ? ["emerald", texts[0]] : ratio >= 0.9 ? ["amber", texts[1]] : ["rose", texts[2]]);

/** ทำได้เท่าไรจากเป้า
    period: { mode: "month", elapsed: 0–1 } — ยอดนับเทียบเป้าเดือน แต่ตัดสินจากจังหวะที่ควรถึงวันนี้
            { mode: "range", rangeDays, monthDays } — ยอดนับใช้เป้าเดือนเฉลี่ยตามจำนวนวันในช่วง
    อัตราส่วน (ROAS/%Ads/CPL) ใช้เป้าตรงๆ ไม่ขึ้นกับช่วง */
export function targetProgress(metric, value, target, period = { mode: "month", elapsed: 1 }) {
  if (target == null) return { state: "unset", tone: "zinc", text: "ยังไม่ตั้งเป้า", target: null };
  const m = typeof metric === "string" ? METRIC_BY_KEY[metric] : metric;
  if (m.kind === "count") {
    const monthTarget = target;
    const goal = period.mode === "range" ? target * (period.rangeDays / period.monthDays) : target;
    const expected = period.mode === "range" ? goal : target * (period.elapsed ?? 1);
    if (value == null) return { state: "nodata", tone: "zinc", text: "ยังไม่มีข้อมูล", target: goal, monthTarget, expected };
    /* จังหวะ = ทำได้ ÷ ที่ควรได้ถึงวันนี้ — เกณฑ์และคำเดียวกับ Pace Engine ทั้งหน้า (รื้อ 21 ก.ย. 69)
       เดิมบล็อกนี้ตัดสินเอง คำจึงไม่ตรงกับการ์ดยอดขายและตารางแบรนด์ที่อ่านจาก paceOf */
    const pace = thresholdOf(value, expected);
    return { state: "set", tone: paceTone(pace.state), text: paceLabel(pace.state), pace: pace.value, paceState: pace.state, kind: "higher",
      target: goal, monthTarget, expected, pct: value / goal, gap: value - goal };
  }
  if (value == null) return { state: "nodata", tone: "zinc", text: "ยังไม่มีข้อมูล", target };
  const rate = thresholdOf(value, target, { direction: m.better === "lower" ? "lower" : "higher" });
  return { state: "set", tone: paceTone(rate.state), text: paceLabel(rate.state, m.better === "lower" ? "rate_lower" : "rate_higher"),
    paceState: rate.state, kind: m.better === "lower" ? "rate_lower" : "rate_higher",
    target, pct: rate.value, gap: value - target };
}

/** จับคู่ค่าจริง {key: value} กับเป้า (normalize แล้ว) ทุกตัวชี้วัด → {key: progress} */
export function goalsFor(values = {}, targets = {}, period) {
  return Object.fromEntries(TARGET_METRICS.map((m) => [m.key, targetProgress(m, values[m.key] ?? null, targets[m.key] ?? null, period)]));
}

/** ช่วงที่เลือกบนจอ → period ของ targetProgress
    "เดือนนี้" = โหมดเดือน (elapsed = สัดส่วนวันที่ผ่านไปของเดือน) · ช่วงอื่น = เฉลี่ยเป้าเดือนตามจำนวนวันในช่วง (อิงเดือนของวันสุดท้าย) */
export function periodForTargets({ monthView, from, to, today }) {
  const dayOf = (iso) => new Date(`${iso}T00:00:00`);
  if (monthView) {
    const t = dayOf(today);
    const monthDays = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    return { mode: "month", elapsed: Math.min(t.getDate(), monthDays) / monthDays, monthDays };
  }
  const end = dayOf(to);
  const rangeDays = Math.round((end - dayOf(from)) / 86_400_000) + 1;
  return { mode: "range", rangeDays, monthDays: new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate() };
}

/** ดึงค่าจาก items ของ adsSalePipeline → {key: value} สำหรับ goalsFor */
export const pipelineValues = (pipeline) => Object.fromEntries((pipeline?.items ?? []).map((it) => [it.key, it.value]));

/* ── งบ/เป้ายอดขายรายเดือน: หน้าตั้งค่าคือความจริงชุดเดียว ───────────────
   ฐานไม่มีตาราง ad_budgets/sales_targets (โหลดใหม่ = ค่า mock) → คำนวณแถวของเดือนนี้จาก targets ตอนอ่านทุกครั้ง
   ลงเฉพาะแพลตฟอร์มที่มีค่าแอดจริงเดือนนี้ (ตามสัดส่วนแผนเดิม · ไม่มีแผนเดิม = เท่ากัน) → ผลรวมแบรนด์เท่าค่าที่ตั้งเป๊ะ */
const slug = (text) => String(text).replace(/[^a-z0-9]+/gi, "").toLowerCase();

function allocate(rows, targets, field, prefix, month, channelsByBrand) {
  let out = rows;
  for (const [brandId, raw] of Object.entries(targets ?? {})) {
    const wanted = positive(raw?.[field]);
    if (wanted == null) continue;
    const channels = channelsByBrand.get(brandId)?.length ? channelsByBrand.get(brandId) : ["Meta Ads"];
    const mine = out.filter((r) => r.brand_id === brandId && r.month === month);
    const weights = channels.map((ch) => mine.filter((r) => normalizeAdPlatform(r.channel) === ch).reduce((n, r) => n + (Number(r.amount) || 0), 0));
    const totalWeight = weights.reduce((n, w) => n + w, 0);
    let allocated = 0;
    const next = channels.map((channel, i) => {
      const last = i === channels.length - 1;
      const share = totalWeight > 0 ? weights[i] / totalWeight : 1 / channels.length;
      const amount = last ? Math.round(wanted) - allocated : Math.floor(wanted * share);
      allocated += amount;
      return { id: `${prefix}_${brandId}_${slug(channel)}_${month}`, brand_id: brandId, channel, month, amount };
    });
    out = [...out.filter((r) => !(r.brand_id === brandId && r.month === month)), ...next];
  }
  return out;
}

export function plansFromTargets({ targets = {}, adBudgets = [], salesTargets = [], month, channelsByBrand = new Map() }) {
  return {
    adBudgets: allocate(adBudgets, targets, "budget", "budget", month, channelsByBrand),
    salesTargets: allocate(salesTargets, targets, "revenue", "revenue", month, channelsByBrand),
  };
}
