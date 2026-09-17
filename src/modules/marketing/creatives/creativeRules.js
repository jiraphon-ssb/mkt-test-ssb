/* กฎคัดครีเอทีฟ — ทีมตั้งเกณฑ์เองว่า "ค่าแอดที่ใช้ไป คุ้มกับผลที่ได้ไหม" (เก็บใน settings.ads_control.creativeRules)
   ผลต่อชิ้น: pass ผ่าน · fail ไม่ผ่าน · pending ยังตัดสินไม่ได้ (ใช้เงินยังน้อย) · nodata ไม่มีข้อมูลตัวนั้น · na ไม่เข้าข่ายกฎ
   ตัวเลขใช้ของ Meta ทั้งหมด (การซื้อ/ROAS = attribution ของ Meta ไม่ใช่ยอดจากระบบขาย) */
import { fmtInt, fmtMoney, fmtNum } from "../dash/charts/theme.js";

/* kind: cost = ค่าแอด ÷ จำนวน (count = ฟิลด์จำนวนที่หาร · ยังไม่มีผลเลยแต่ใช้เงินเกินเพดาน = ไม่ผ่าน)
   ratio / count / money = เทียบค่าตรงๆ · scale = ตัวคูณจากค่าในแถวเป็นหน่วยที่คนกรอก (CTR เก็บ 0.012 กรอก 1.2) */
export const CREATIVE_RULE_METRICS = [
  { key: "cpa", label: "ต้นทุนต่อการซื้อ", kind: "cost", count: "purchases", noun: "การซื้อ", unit: "money", defaultOp: "lte" },
  { key: "cpl", label: "ต้นทุนต่อคนทัก (CPL)", kind: "cost", count: "leads", noun: "คนทัก", unit: "money", defaultOp: "lte" },
  { key: "cpc", label: "ต้นทุนต่อคลิก (CPC)", kind: "cost", count: "clicks", noun: "คลิก", unit: "money", defaultOp: "lte" },
  { key: "cpm", label: "ต้นทุนต่อ 1,000 การเห็น (CPM)", kind: "cost", count: "impressions", noun: "การเห็น", per: 1000, unit: "money", defaultOp: "lte" },
  { key: "roas", label: "ROAS (Meta)", kind: "ratio", unit: "times", defaultOp: "gte" },
  { key: "ctr", label: "CTR", kind: "ratio", unit: "pct", scale: 100, defaultOp: "gte" },
  { key: "frequency", label: "ความถี่", kind: "ratio", unit: "times", defaultOp: "lte" },
  { key: "purchases", label: "จำนวนการซื้อ", kind: "count", unit: "count", defaultOp: "gte" },
  { key: "leads", label: "จำนวนคนทัก", kind: "count", unit: "count", defaultOp: "gte" },
  { key: "spend", label: "ค่าแอด", kind: "money", unit: "money", defaultOp: "lte" },
];
const METRIC = Object.fromEntries(CREATIVE_RULE_METRICS.map((m) => [m.key, m]));
export const RULE_OPS = [["lte", "ไม่เกิน"], ["gte", "อย่างน้อย"]];
/* หน่วยข้างช่องกรอก: เป็นคำ ไม่ใช้ "×" เพราะข้างช่องว่างดูเหมือนปุ่มล้างค่า */
export const RULE_UNIT_TEXT = { money: "บาท", times: "เท่า", pct: "%", count: "" };
export const RULE_PLACEHOLDER = { money: "เช่น 500", times: "เช่น 3", pct: "เช่น 1.5", count: "เช่น 5" };
export const MAX_CREATIVE_RULES = 12;

/** ตัวเลขที่คนพิมพ์: รับคอมมา ฿ % x × "เท่า" "บาท" และช่องว่าง · ว่าง = null · อ่านไม่ออก/ติดลบ = NaN (หน้าจอเตือน) */
export function parseRuleNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : NaN;
  const text = String(value).replace(/[,\s฿%×xX]|บาท|เท่า|ครั้ง|คน/g, "");
  if (text === "") return null;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(text)) return NaN;
  return Number(text);
}
const nonNegative = (value) => {
  const n = parseRuleNumber(value);
  return Number.isNaN(n) ? null : n;
};
let seq = 0;
export const newRuleId = () => `cr_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export function normalizeCreativeRules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && METRIC[r.metric]).slice(0, MAX_CREATIVE_RULES).map((r) => ({
    id: String(r.id || newRuleId()),
    name: String(r.name ?? "").trim(),
    brandId: r.brandId || "all",
    metric: r.metric,
    op: r.op === "gte" || r.op === "lte" ? r.op : METRIC[r.metric].defaultOp,
    value: nonNegative(r.value),
    minSpend: nonNegative(r.minSpend) ?? 0,
  }));
}

/** กฎที่ยังไม่มีค่าเกณฑ์ที่ใช้ได้ (ว่าง หรืออ่านไม่ออก) — กฎพวกนี้ไม่ถูกใช้กรอง */
export const incompleteRules = (rules = []) => (rules ?? []).filter((rule) => rule && METRIC[rule.metric] && nonNegative(rule.value) == null);

export function formatRuleValue(metricKey, value) {
  const m = METRIC[metricKey];
  if (value == null) return "—";
  if (m.unit === "money") return fmtMoney(value);
  if (m.unit === "pct") return `${fmtNum(value, 2)}%`;
  if (m.unit === "times") return `${fmtNum(value, 2)}×`;
  return fmtInt(value);
}

/** ค่าในแถว → หน่วยเดียวกับที่คนกรอก */
function actualOf(row, m) {
  if (m.kind === "cost") {
    const count = row[m.count];
    if (!(count > 0) || row.spend == null) return null;
    return (row.spend / count) * (m.per ?? 1);
  }
  const value = row[m.key];
  return value == null ? null : value * (m.scale ?? 1);
}

export const ruleTitle = (rule) => rule.name || describeRule(rule);

export function describeRule(rule) {
  const m = METRIC[rule.metric];
  const op = RULE_OPS.find(([k]) => k === rule.op)?.[1] ?? "";
  const min = rule.minSpend > 0 ? ` · เมื่อใช้เงินแล้วอย่างน้อย ${fmtMoney(rule.minSpend)}` : "";
  return `${m.label} ${op} ${formatRuleValue(rule.metric, rule.value)}${min}`;
}

export function evaluateCreativeRule(row, rule) {
  const m = METRIC[rule?.metric];
  if (!m || rule.value == null) return { status: "na", actual: null, text: "กฎยังไม่ใส่ค่า" };
  if (rule.brandId && rule.brandId !== "all" && row.brandId !== rule.brandId) return { status: "na", actual: null, text: "กฎนี้ใช้กับแบรนด์อื่น" };
  const spend = row.spend ?? 0;
  if (rule.minSpend > 0 && spend < rule.minSpend) {
    return { status: "pending", actual: null, text: `ใช้ไป ${fmtMoney(spend)} ยังไม่ถึงขั้นต่ำ ${fmtMoney(rule.minSpend)}` };
  }
  const actual = actualOf(row, m);
  const target = formatRuleValue(rule.metric, rule.value);
  if (actual == null) {
    // ต้นทุนต่อผล: ผลเป็น 0 (รู้แน่ว่าไม่มี) → ใช้เงินเกินเพดานแล้ว = ไม่ผ่าน · ยังไม่ถึง = รอดูต่อ
    if (m.kind === "cost" && row[m.count] === 0 && spend > 0) {
      if (rule.op === "gte") return { status: "pass", actual: null, text: `ยังไม่มี${m.noun} ต้นทุนต่อ${m.noun}สูงกว่า ${target}` };
      const budget = rule.value / (m.per ?? 1);
      return spend > budget
        ? { status: "fail", actual: null, text: `ใช้ไป ${fmtMoney(spend)} ยังไม่มี${m.noun} (เพดาน ${target} ต่อ${m.noun})` }
        : { status: "pending", actual: null, text: `ใช้ไป ${fmtMoney(spend)} ยังไม่มี${m.noun} · ยังไม่ถึงเพดาน ${target}` };
    }
    return { status: "nodata", actual: null, text: `ไม่มีข้อมูล${m.label}` };
  }
  const ok = rule.op === "gte" ? actual >= rule.value : actual <= rule.value;
  const shown = formatRuleValue(rule.metric, actual);
  if (ok) return { status: "pass", actual, text: `${m.label} ${shown} ${rule.op === "gte" ? "ถึงเกณฑ์" : "อยู่ในเพดาน"} ${target}` };
  return { status: "fail", actual, text: rule.op === "gte" ? `${m.label} ${shown} ต่ำกว่าเกณฑ์ ${target}` : `${m.label} ${shown} เกินเพดาน ${target}` };
}

/** selected: "none" = ไม่ใช้กฎ · "all" = ทุกกฎรวมกัน · id = กฎเดียว → null เมื่อไม่ใช้กฎ */
export function evaluateCreativeRules(row, rules = [], selected = "none") {
  if (!selected || selected === "none") return null;
  const chosen = selected === "all" ? rules : rules.filter((r) => r.id === selected);
  const results = chosen.map((rule) => ({ rule, ...evaluateCreativeRule(row, rule) })).filter((r) => r.status !== "na");
  if (!results.length) return { status: "na", results: [], text: "ไม่มีกฎที่เข้าข่ายชิ้นนี้" };
  const pick = (status) => results.filter((r) => r.status === status);
  const failed = pick("fail");
  if (failed.length) return { status: "fail", results, text: failed.map((r) => r.text).join(" · ") };
  const waiting = [...pick("pending"), ...pick("nodata")];
  if (waiting.length) return { status: pick("pending").length ? "pending" : "nodata", results, text: waiting.map((r) => r.text).join(" · ") };
  return { status: "pass", results, text: results.map((r) => r.text).join(" · ") };
}

export function creativeRuleSummary(rows = [], rules = [], selected = "none") {
  const out = { pass: 0, fail: 0, pending: 0, nodata: 0, na: 0, failSpend: 0 };
  for (const row of rows) {
    const result = evaluateCreativeRules(row, rules, selected);
    if (!result) continue;
    out[result.status] += 1;
    if (result.status === "fail") out.failSpend += row.spend ?? 0;
  }
  return out;
}

/** outcome: all · pass · fail · pending (รวมไม่มีข้อมูล) */
export function filterByRuleOutcome(rows = [], rules = [], selected = "none", outcome = "all") {
  if (!selected || selected === "none" || outcome === "all") return rows;
  return rows.filter((row) => {
    const status = evaluateCreativeRules(row, rules, selected)?.status;
    return outcome === "pending" ? status === "pending" || status === "nodata" : status === outcome;
  });
}
