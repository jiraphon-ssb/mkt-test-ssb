/* แถบบอกที่มาของตัวเลขบนหน้า ads (pure · เทสใน tests/adsSourceStrip.test.js)
   หน้าหนึ่งใช้ตัวเลขจาก 3 ระบบ: ค่าแอดจาก Meta · ยอดขาย TD·JD·TA จากระบบขายพี่ทัช · ยอดขาย JUNTAKARN จากระบบ TMK
   แถบเดิมบอกความสดของ Meta อย่างเดียว แล้วเขียนคำว่า "Meta Pilot" ซึ่งไม่ได้บอกอะไรกับคนอ่าน
   กติกา: ไม่รู้ ≠ ศูนย์ · ทุกป้ายต้องมีตัวหนังสือบอกสถานะ ไม่ใช้สีเป็นข้อมูลเดียว */
import { SALE_BRAND_BY_CODE, SALES_SOURCE_BRANDS } from "../../../../supabase/functions/_shared/salesFacts.js";
import { JK_BRAND_ID, JK_SOURCE } from "../../../../supabase/functions/_shared/jkFacts.js";

const SSB_BRAND_IDS = SALES_SOURCE_BRANDS.map((code) => SALE_BRAND_BY_CODE[code]);
const SSB_SOURCE = "crm";
const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/* ทีมกรอกยอดของเมื่อวานตอนเช้า — ขาดได้ 1 วันถือว่าปกติ เกิน 2 วันคือมีอะไรค้าง */
const SALES_OK_LAG = 2;

const dayLabel = (iso) => ISO.test(String(iso ?? ""))
  ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00`))
  : null;
const lagDays = (iso, today) => (ISO.test(String(iso ?? "")) && ISO.test(String(today ?? ""))
  ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / DAY) : null);

const latestOf = (rows, keep) => {
  let latest = null;
  for (const row of rows ?? []) {
    if (!keep(row)) continue;
    const day = String(row?.fact_date ?? "");
    if (ISO.test(day) && (latest === null || day > latest)) latest = day;
  }
  return latest;
};

/** ป้ายของแหล่งยอดขายหนึ่งแหล่ง — ไม่มีแถวเลย = ยังไม่มีข้อมูล (ไม่ใช่ 0) */
function salesChip({ key, label, latest, today, waitingText }) {
  if (!latest) return { key, label, value: waitingText, tone: "muted", fresh: null };
  const lag = lagDays(latest, today);
  return {
    key, label, fresh: latest,
    value: `ถึง ${dayLabel(latest)}${lag === 0 ? " (วันนี้)" : lag === 1 ? " (เมื่อวาน)" : ""}`,
    tone: lag != null && lag > SALES_OK_LAG ? "warn" : "ok",
  };
}

/** ป้ายทั้งแถบ: ค่าแอด Meta · ยอดขายพี่ทัช · ยอดขาย JUNTAKARN · เป้าเดือนนี้ */
export function sourceChips({ summary = {}, sales = [], salesGoals = [], today = null, month = null } = {}) {
  const ym = month ?? String(today ?? "").slice(0, 7);
  const metaLag = lagDays(summary.to, today);
  const chips = [{
    key: "meta",
    label: "ค่าแอด Meta",
    value: [summary.accounts ? `${summary.accounts} บัญชี` : "ยังไม่มีบัญชี", summary.to ? `ถึง ${dayLabel(summary.to)}` : "ยังไม่มีข้อมูล"].join(" · "),
    tone: !summary.accounts || !summary.to ? "muted" : metaLag != null && metaLag > 1 ? "warn" : "ok",
    fresh: summary.to ?? null,
  }];

  chips.push(salesChip({
    key: "sales", label: "ยอดขาย TD · JD · TA", today,
    latest: latestOf(sales, (row) => (row?.source ?? SSB_SOURCE) === SSB_SOURCE && SSB_BRAND_IDS.includes(row?.brand_id)),
    waitingText: "ยังไม่มีข้อมูล",
  }));
  chips.push(salesChip({
    key: "jk", label: "ยอดขาย JUNTAKARN", today,
    latest: latestOf(sales, (row) => row?.source === JK_SOURCE && row?.brand_id === JK_BRAND_ID),
    waitingText: "รอเชื่อมแหล่งข้อมูล",
  }));

  /* เป้าเดือนนี้ — ตัวเลขเทียบเป้าทั้งหน้าอยู่กับเป้าของเดือนนี้ ถ้าขาดแบรนด์ไหนต้องรู้ตรงนี้ ไม่ใช่ไปเจอตอนอ่านกราฟ */
  const withGoal = new Set((salesGoals ?? [])
    .filter((goal) => String(goal?.month ?? "").slice(0, 7) === ym && SSB_BRAND_IDS.includes(goal?.brand_id))
    .map((goal) => goal.brand_id));
  chips.push({
    key: "goals", label: "เป้าเดือนนี้", fresh: null,
    value: withGoal.size ? `${withGoal.size}/${SSB_BRAND_IDS.length} แบรนด์` : "ยังไม่ตั้งเป้า",
    tone: withGoal.size === SSB_BRAND_IDS.length ? "ok" : withGoal.size ? "warn" : "muted",
  });
  return chips;
}

/** ที่มาของแต่ละตัวเลขบนหน้า — เขียนเป็นประโยคที่อ่านออก (ของเดิมเป็นชุดคำคั่นจุดที่แยกไม่ออกว่าอะไรคู่กับอะไร) */
export const SOURCE_LEGEND = [
  { from: "ระบบขาย", metrics: "ยอดขาย · เป้า · funnel · คนทักที่ทีมกรอก" },
  { from: "Meta", metrics: "ค่าแอด · การซื้อ · คนทักจากแอด · Creative" },
];

/** หัวแถบ: บอกว่ากำลังดูของจริง และแหล่งไหนยังไม่พร้อม */
export function stripVerdict(chips = []) {
  const bad = chips.filter((chip) => chip.tone === "warn");
  const waiting = chips.filter((chip) => chip.tone === "muted");
  if (bad.length) return { state: "warn", text: `ข้อมูลจริง · ${bad.map((chip) => chip.label).join(" · ")} ยังไม่สด` };
  if (waiting.length) return { state: "muted", text: `ข้อมูลจริง · ยังไม่มี ${waiting.map((chip) => chip.label).join(" · ")}` };
  return { state: "ok", text: "ข้อมูลจริง · ทุกแหล่งสดและครบ" };
}
