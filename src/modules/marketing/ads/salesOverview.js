/* Overview ads ยึดยอดจริงและเป้าจากระบบขายของพี่ทัช (ข้อ 3–4 ของแผน docs/superpowers/plans/2026-09-17-sales-data-rollout.md)
   pure · เทสใน tests/salesOverview.test.js
   กติกา: ค่าแอดยังเป็นของ Meta (ระดับแพลตฟอร์ม/แคมเปญยังเป็น Meta attribute ได้) แต่ระดับแบรนด์และภาพรวม
   ยอดขาย · ROAS · %Ads · CPL · CAC ต้องมาจากระบบขาย · ไม่มีข้อมูล = null พร้อมเหตุผล ห้ามโชว์ 0 แทน */
import { fmtInt } from "../dash/charts/theme.js";
import { budgetPace, change, revenuePace, roasOf, share } from "../adsOverview.js";
import { FUNNEL_STAGE_KEYS, LEADS_TRACKED_SINCE, metricCoverage } from "./salesFacts.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const positive = (value) => { const n = num(value); return n !== null && n > 0 ? n : null; };
const dateLabel = (iso) => {
  try { return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`)); }
  catch { return iso; }
};

/** เป้าระบบขายของเดือนนั้น → เป้าที่ goalsFor ใช้ (หน่วยเดียวกับ normalizeTargets: pctAds เป็นสัดส่วน 0–1)
    CPL ใช้เพดาน (caps.cpl) ก่อน เพราะเป็นเส้นที่หน้าเป้าหมายของพี่ทัชบอกว่า "ต้องคุม" · ไม่มีค่อยใช้ CPL ที่ต้องทำได้ */
export function goalTargetsByBrand(goalRows = [], month) {
  const out = new Map();
  for (const goal of goalRows ?? []) {
    if (!goal?.brand_id || String(goal.month ?? "").slice(0, 10) !== month) continue;
    out.set(goal.brand_id, {
      roas: positive(goal.roas),
      pctAds: positive(goal.pct_ads_new),
      cpl: positive(goal.caps?.cpl) ?? positive(goal.cpl),
      inquiries: positive(goal.inquiry_target),
      qualified: positive(goal.leads_target),
      deposits: positive(goal.deposits_target),
      closed: positive(goal.orders_target),
    });
  }
  return out;
}

const COUNT_KEYS = ["inquiries", "qualified", "deposits", "closed"];
const RATIO_WEIGHT = { roas: "budget", pctAds: "revenue", cpl: "inquiries" };

/** เป้าภาพรวมจากเป้ารายแบรนด์ — จำนวนรวมกัน · อัตราส่วนถ่วงน้ำหนัก (ROAS ด้วยงบ · %Ads ด้วยเป้ายอด · CPL ด้วยเป้าคนทัก)
    แบรนด์ที่ "ยังไม่ตั้งเป้าเลย" ไม่นับเป็นตัวถ่วง (JUNTAKARN ยังไม่มีแถวใน ad_sales_goals — ถ้านับด้วยเป้ารวมจะหายทั้งกระดาน)
    แต่แบรนด์ที่ตั้งเป้าแล้วขาดบางตัว เป้ารวมตัวนั้นยังเป็น null (รวมบางแบรนด์แล้วเรียกว่าภาพรวมจะหลอกตา)
    ผู้เรียกต้องบอกบนจอว่าเป้ารวมไม่รวมแบรนด์ไหน (summary.targetExcluded) */
export function combineGoalTargets(all = []) {
  const list = (all ?? []).filter((item) => item?.targets && Object.values(item.targets).some((value) => value != null));
  const out = {};
  for (const key of COUNT_KEYS) {
    out[key] = list.length && list.every((item) => item.targets?.[key] != null) ? list.reduce((n, item) => n + item.targets[key], 0) : null;
  }
  for (const [key, weightKey] of Object.entries(RATIO_WEIGHT)) {
    if (!list.length || list.some((item) => item.targets?.[key] == null)) { out[key] = null; continue; }
    const weights = list.map((item) => positive(item.weights?.[weightKey]));
    const weighted = weights.every((w) => w != null);
    const total = weighted ? weights.reduce((a, b) => a + b, 0) : list.length;
    out[key] = list.reduce((n, item, i) => n + item.targets[key] * (weighted ? weights[i] : 1), 0) / total;
  }
  return out;
}

/** งบ Meta และเป้ายอดของเดือน จากเป้าระบบขาย — รูปเดียวกับ plansFromTargets เดิม เพื่อให้ตัวคำนวณ pace ใช้ต่อได้
    งบ Meta = งบแพลตฟอร์ม meta ที่ตั้งในหน้าเป้าหมาย (ไม่หารเฉลี่ยอีกแล้ว) · ไม่มี = ยังไม่ตั้งเป้า */
export function plansFromSalesGoals({ goals = [], month, basis = "total" } = {}) {
  const adBudgets = [];
  const salesTargets = [];
  for (const goal of goals ?? []) {
    if (!goal?.brand_id || String(goal.month ?? "").slice(0, 7) !== month) continue;
    const pct = num(goal.platform_pct?.meta);
    const metaBudget = positive(goal.platform_budgets?.meta)
      ?? (positive(goal.ad_budget) != null && pct != null ? goal.ad_budget * pct / 100 : null);   // ไม่ปัด
    if (metaBudget != null) adBudgets.push({ brand_id: goal.brand_id, channel: "Meta Ads", month, amount: metaBudget });
    const target = basis === "new" ? positive(goal.sales_new_target) : positive(goal.sales_target);
    if (target != null) salesTargets.push({ brand_id: goal.brand_id, month, amount: target });
  }
  return { adBudgets, salesTargets };
}

/** ยอดจริงรายแบรนด์ในช่วงวัน (from–to รวมหัวท้าย) — แบรนด์ที่ไม่มีแถวเลย = ไม่มีคีย์ */
export function salesFactsByBrand(facts = [], { from, to, today = null } = {}) {
  const out = new Map();
  for (const fact of facts ?? []) {
    const day = fact?.fact_date;
    if (!fact?.brand_id || !ISO.test(String(day ?? "")) || (from && day < from) || (to && day > to)) continue;
    const s = out.get(fact.brand_id) ?? { revenue: 0, revenueNew: 0, orders: 0, ordersNew: 0, leads: 0, leadsNew: 0, inquiries: 0, inquiryFilledDays: 0, days: 0, deposits: 0, depositValue: 0, cash: 0, cancelled: 0 };
    s.revenue += num(fact.gross_revenue) ?? 0;
    s.revenueNew += num(fact.revenue_new) ?? 0;
    s.orders += num(fact.orders) ?? 0;
    s.ordersNew += num(fact.orders_new) ?? 0;
    s.leads += num(fact.qualified_leads) ?? 0;
    s.leadsNew += num(fact.leads_new) ?? 0;
    s.inquiries += num(fact.inquiries) ?? 0;
    if (fact.inquiry_filled === true) s.inquiryFilledDays += 1;
    if (day < LEADS_TRACKED_SINCE) s.leadsBeforeTracked = true;
    // วันนี้ยังไม่จบ ทีมยังไม่กรอก = ไม่นับเป็นวัน (ตัวหาร "ทีมกรอก x/y วัน")
    if (fact.inquiry_filled === true || day !== today) s.days += 1;
    s.deposits += num(fact.deposits) ?? 0;
    s.depositValue += num(fact.deposit_value) ?? 0;
    s.cash += num(fact.cash_received) ?? 0;
    s.cancelled += num(fact.cancelled) ?? 0;
    out.set(fact.brand_id, s);
  }
  // Lead ช่วงที่มีวันก่อนระบบขายเก็บจริง = ไม่รู้ (ยอดจาก sheet ที่ย้ายเข้ามาไม่ตรงวัน)
  for (const s of out.values()) if (s.leadsBeforeTracked) { s.leads = null; s.leadsNew = null; }
  return out;
}

/** ทับตัวเลขระดับแบรนด์ด้วยยอดจริง · salesSource: sales (มีข้อมูล) | none (มีแหล่งแต่ช่วงนี้ไม่มีแถว) | waiting (ยังไม่มีแหล่ง) */
export function applySalesToBrands(rows = [], { sales = new Map(), prevSales = new Map(), basis = "total", sourceBrandIds = [] } = {}) {
  return rows.map((row) => {
    const elapsed = row.pace?.expected ?? null;
    const s = sourceBrandIds.includes(row.id) ? sales.get(row.id) ?? null : null;
    const salesSource = !sourceBrandIds.includes(row.id) ? "waiting" : s ? "sales" : "none";
    if (!s) {
      return {
        ...row, salesSource, revenue: null, revenueNew: null, prevRevenue: null, revPct: null, revChangePct: null,
        revPace: revenuePace(null, row.revTarget ?? null, elapsed), roas: null, roasNew: null, pctAds: null, cpl: null, cac: null,
        salesLeads: null, salesOrders: null,
      };
    }
    const p = prevSales.get(row.id) ?? null;
    const pick = (x) => (basis === "new" ? x.revenueNew : x.revenue);
    const revenue = pick(s);
    const prevRevenue = p ? pick(p) : null;
    return {
      ...row,
      salesSource,
      revenue,
      revenueNew: s.revenueNew,
      prevRevenue,
      revChangePct: change(revenue, prevRevenue),
      revPct: share(revenue, row.revTarget ?? null),
      revPace: revenuePace(revenue, row.revTarget ?? null, elapsed),
      roas: roasOf(revenue, row.spend),
      roasNew: roasOf(s.revenueNew, row.spend),
      pctAds: share(row.spend, s.revenueNew),     // %Ads ต่อยอดลูกค้าใหม่ — นิยามเดียวกับหน้าเป้าหมายของพี่ทัช
      cpl: share(row.spend, s.leads),
      cac: share(row.spend, s.ordersNew),
      salesLeads: s.leads,
      salesOrders: s.orders,
    };
  });
}

/** ภาพรวม: รวมเฉพาะแบรนด์ที่มียอดจริง และบอกว่าไม่รวมใคร (ไม่ปล่อยทั้งหน้าเป็น — เพราะแบรนด์เดียวยังไม่มีแหล่ง) */
export function applySalesToSummary(summary = {}, rows = [], asOf) {
  const included = rows.filter((row) => row.salesSource === "sales");
  const allOrNull = (pick) => included.length && included.every((row) => pick(row) != null) ? included.reduce((n, row) => n + pick(row), 0) : null;
  /* เป้าและงบ: บวกเฉพาะแบรนด์ที่ตั้งไว้ แล้วบอกชื่อแบรนด์ที่ไม่รวมบนจอ
     (ถ้าใช้ all-or-null แบรนด์เดียวที่ยังไม่ตั้งเป้าจะทำให้เป้ารวมหายทั้งแถว — เจอตอนต่อ JUNTAKARN 18 ก.ย.) */
  const sumSome = (pick) => { const values = included.map(pick).filter((value) => value != null); return values.length ? values.reduce((a, b) => a + b, 0) : null; };
  const missing = (pick) => included.filter((row) => pick(row) == null).map((row) => row.name);
  const revenue = included.length ? included.reduce((n, row) => n + row.revenue, 0) : null;
  const revTarget = sumSome((row) => row.revTarget);
  const budget = sumSome((row) => row.budget);
  // ยอดเดือนก่อน: ห้ามบวกบางแบรนด์ — ตัวตั้งกับตัวเทียบจะคนละฐาน (%เทียบเดือนก่อนจะเพี้ยน) → ขาดแบรนด์ไหนก็เทียบไม่ได้
  const prevRevenue = allOrNull((row) => row.prevRevenue);
  const includedSpend = included.reduce((n, row) => n + (row.spend ?? 0), 0);
  const revPace = budgetPace(revenue, revTarget, asOf);
  return {
    ...summary,
    revenue, revTarget, budget, prevRevenue,
    revPct: share(revenue, revTarget),
    revPace,
    revPctOfExpected: share(revenue, revPace.expectedSpend),
    revChangePct: change(revenue, prevRevenue),
    // กล่องงบ Meta ใช้ค่าแอดทุกแบรนด์ (อาร์ตยืนยัน 17 ก.ย.) — งบคงเหลือ/เฉลี่ย/คาดใช้ ต้องคิดจากยอดเดียวกับหัวกล่อง
    pace: budgetPace(summary.spend ?? includedSpend, budget, asOf),
    pctAds: included.length ? share(includedSpend, included.reduce((n, row) => n + (row.revenueNew ?? 0), 0)) : null,
    targetExcluded: missing((row) => row.revTarget),
    budgetExcluded: missing((row) => row.budget),
    prevExcluded: missing((row) => row.prevRevenue),
    excluded: rows.filter((row) => row.salesSource !== "sales").map((row) => row.name),
    excludedWaiting: rows.filter((row) => row.salesSource === "waiting").map((row) => row.name),
    excludedNoData: rows.filter((row) => row.salesSource === "none").map((row) => row.name),
  };
}

/** funnel จริงจากระบบขาย ในรูปเดียวกับ adsSalePipeline (SalePipeline ใช้ต่อได้) · คนทักบอกทั้งทีมกรอกและจากแอด Meta */
export function salesPipeline({ sales = null, prevSales = null, metaInquiries = null, spend = null, prevSpend = null, basis = "total", depositsSince = null, from = null, to = null, waiting = false, stages = FUNNEL_STAGE_KEYS } = {}) {
  const none = waiting ? "รอเชื่อมแหล่งข้อมูล" : "ยังไม่มีข้อมูล";
  /* แบรนด์ที่ระบบขายต้นทางไม่มีบางขั้น (JUNTAKARN: ไม่มี Lead และมัดจำ) — ขั้นนั้นต้องเป็น "—" พร้อมเหตุผล ไม่ใช่ 0
     และอัตราผ่านของขั้นถัดไปต้องข้ามขั้นที่ไม่มี ไม่งั้นหารด้วยศูนย์แล้วได้ "—" ทั้งเส้น */
  const MISSING_STAGE = "ระบบขายของแบรนด์นี้ไม่มีขั้นนี้";
  const has = (key) => stages.includes(key);
  const only = (key, value) => (has(key) ? value : null);
  const inquiriesOf = (s) => (s && s.inquiryFilledDays > 0 ? s.inquiries : null);
  const depositsOf = (s) => {
    if (!s || !depositsSince) return null;
    return (to ?? from ?? depositsSince) < depositsSince ? null : s.deposits;
  };
  const revenueOf = (s) => (s ? (basis === "new" ? s.revenueNew : s.revenue) : null);

  const inquiries = only("inquiries", inquiriesOf(sales));
  const leads = only("qualified", sales ? sales.leads : null);
  const deposits = only("deposits", depositsOf(sales));
  const orders = only("closed", sales ? sales.orders : null);
  /* ค่าของขั้นก่อนหน้าที่ "มีอยู่จริง" ใช้เป็นตัวหารของอัตราผ่าน */
  const valueOf = { inquiries, qualified: leads, deposits, closed: orders };
  const previousStage = (key) => {
    const order = FUNNEL_STAGE_KEYS.filter((item) => has(item));
    const at = order.indexOf(key);
    return at > 0 ? valueOf[order[at - 1]] : null;
  };

  const inquirySub = [
    metaInquiries != null ? `จากแอด Meta ${fmtInt(metaInquiries)}` : null,
    !sales ? none : sales.inquiryFilledDays === 0 ? "ทีมยังไม่กรอก" : sales.inquiryFilledDays < sales.days ? `ทีมกรอก ${sales.inquiryFilledDays}/${sales.days} วัน` : null,
  ].filter(Boolean).join(" · ");
  const depositSub = !sales ? none
    : !depositsSince ? "ยังไม่มีข้อมูล"
      : deposits == null ? `ยังไม่มีข้อมูล (มีตั้งแต่ ${dateLabel(depositsSince)})`
        : from && from < depositsSince ? `มีข้อมูลตั้งแต่ ${dateLabel(depositsSince)}` : null;

  const stageItems = [
    { key: "inquiries", label: "คนทัก (ทีมกรอก)", value: inquiries, before: inquiriesOf(prevSales), sub: inquirySub || null },
    { key: "qualified", label: "Lead", value: leads, before: only("qualified", prevSales ? prevSales.leads : null), conv: share(leads, previousStage("qualified")),
      sub: !has("qualified") ? MISSING_STAGE : !sales ? none : leads == null ? `มีข้อมูลตั้งแต่ ${dateLabel(LEADS_TRACKED_SINCE)} (ก่อนหน้านั้นกรอกใน sheet)` : null },
    { key: "deposits", label: "ได้ออเดอร์", value: deposits, before: only("deposits", depositsOf(prevSales)), conv: share(deposits, previousStage("deposits")),
      sub: has("deposits") ? depositSub : MISSING_STAGE },
    { key: "closed", label: "ยืนยันออเดอร์", value: orders, before: only("closed", prevSales ? prevSales.orders : null), conv: share(orders, previousStage("closed")), sub: sales ? null : none },
  ].map((stage) => ({ sense: "higher", fmt: "int", conv: null, ...stage }));
  const rated = stageItems.filter((stage) => stage.conv != null);
  // มีขั้นที่คิด % ได้แค่ขั้นเดียว (ระบบขาย 2 ขั้นอย่าง JUNTAKARN) = ไม่มี "หล่นแรงสุด" ให้เทียบ
  const worstKey = rated.length > 1 ? rated.reduce((a, b) => (b.conv < a.conv ? b : a)).key : null;
  const metaNote = "คิดจากค่าแอด Meta";

  return {
    estimated: false,
    worstKey,
    items: [
      ...stageItems,
      { key: "roas", label: "ROAS", value: roasOf(revenueOf(sales), spend), before: roasOf(revenueOf(prevSales), prevSpend), sense: "higher", fmt: "roas", sub: sales ? metaNote : none },
      { key: "pctAds", label: "%Ads", value: share(spend, sales?.revenueNew ?? null), before: share(prevSpend, prevSales?.revenueNew ?? null), sense: "lower", fmt: "pct1", sub: sales ? `ต่อยอดลูกค้าใหม่ · ${metaNote}` : none },
      { key: "cpl", label: "CPL", value: share(spend, leads), before: has("qualified") ? share(prevSpend, prevSales?.leads ?? null) : null, sense: "lower", fmt: "money",
        sub: !has("qualified") ? MISSING_STAGE : sales ? `ต่อ Lead ในระบบขาย · ${metaNote}` : none },
      { key: "cac", label: "CAC", value: share(spend, sales?.ordersNew ?? null), before: share(prevSpend, prevSales?.ordersNew ?? null), sense: "lower", fmt: "money", sub: sales ? `ต่อลูกค้าใหม่ · ${metaNote}` : none },
    ],
  };
}

/** หน้าแคมเปญ: ยอดจริงของแบรนด์ที่อยู่ในขอบเขต — ROAS/%Ads หารด้วยค่าแอดของแบรนด์ที่มียอดเท่านั้น
    (ยอดระดับแคมเปญยังเป็นของ Meta · ยอดจริงมาถึงแค่แบรนด์×วัน) · ไม่มีแบรนด์ไหนมียอด = null ไม่ใช่ ฿0 */
export function campaignSalesSummary({ sales = [], brandIds = [], spendByBrand = {}, names = {}, from, to, sourceBrandIds = [], basis = "total" } = {}) {
  const byBrand = salesFactsByBrand(sales, { from, to });
  const included = brandIds.filter((id) => sourceBrandIds.includes(id) && byBrand.has(id));
  const excludedWaiting = brandIds.filter((id) => !sourceBrandIds.includes(id)).map((id) => names[id] ?? id);
  const excludedNoData = brandIds.filter((id) => sourceBrandIds.includes(id) && !byBrand.has(id)).map((id) => names[id] ?? id);
  if (!included.length) return { basis, revenue: null, revenueTotal: null, revenueNew: null, orders: null, spend: null, roas: null, pctAds: null, excludedWaiting, excludedNoData };
  const sum = (pick) => included.reduce((n, id) => n + (pick(id) ?? 0), 0);
  const revenueTotal = sum((id) => byBrand.get(id).revenue);
  const revenueNew = sum((id) => byBrand.get(id).revenueNew);
  const spend = sum((id) => num(spendByBrand[id]));
  // ปุ่ม ยอดใหม่/ยอดรวม: การ์ดและ ROAS ใช้ฐานเดียวกับที่เลือก · %Ads หารยอดลูกค้าใหม่เสมอ (นิยามเป้าของระบบขาย)
  const revenue = basis === "new" ? revenueNew : revenueTotal;
  return {
    basis, revenue, revenueTotal, revenueNew, orders: sum((id) => byBrand.get(id).orders), spend,
    roas: roasOf(revenue, spend), pctAds: share(spend, revenueNew),
    excludedWaiting, excludedNoData,
  };
}

/** แท็บของกราฟแนวโน้มที่ต้องใช้ระบบขาย (ตัวอื่น CTR/CPC/CPM ฯลฯ ยังเป็นของ Meta) */
export const SALES_TREND_KEYS = ["revenue", "roas", "inquiry", "leads", "deposits", "orders", "cpl", "cac", "pctAds"];
/** ตัวที่ต้องหารด้วยค่าแอด Meta */
export const SPEND_TREND_KEYS = ["roas", "cpl", "cac", "pctAds"];

/** ค่าของกราฟแนวโน้มช่วงหนึ่ง (วันเดียวหรือทั้งช่วง) จากระบบขาย — นิยามเดียวกับ hero และ funnel ด้านบน
    ROAS = ยอดขาย ÷ ค่าแอด Meta · CPL = ค่าแอด Meta ÷ Lead · CAC = ค่าแอด ÷ ออเดอร์ลูกค้าใหม่ · %Ads = ค่าแอด ÷ ยอดใหม่
    คนทักนับเฉพาะวันที่ทีมกรอก · ได้ออเดอร์ก่อนวันแรกที่ระบบขายมีข้อมูล = null (ไม่มีประวัติสเตจ ไม่ใช่ 0)
    ไม่มีแถว = null (วันที่ยังไม่ sync ไม่ใช่ยอด 0) · key อื่น = undefined ให้ผู้เรียกใช้ของ Meta
    coverage = ผลของ metricCoverage(sales) ส่งมาได้เพื่อไม่ต้องคิดซ้ำทุกจุดบนกราฟ */
export function salesTrendValue({ sales = [], key, brandIds = [], spend = null, basis = "total", from, to, coverage = null } = {}) {
  if (!SALES_TREND_KEYS.includes(key)) return undefined;
  const byBrand = salesFactsByBrand(sales, { from, to });
  const ids = brandIds.filter((id) => byBrand.has(id));
  if (!ids.length) return null;
  const rows = ids.map((id) => byBrand.get(id));
  const sum = (pick) => rows.reduce((n, row) => n + (pick(row) ?? 0), 0);
  const revenue = sum((row) => (basis === "new" ? row.revenueNew : row.revenue));
  switch (key) {
    case "revenue": return revenue;
    case "roas": return roasOf(revenue, spend);
    case "leads": return rows.some((row) => row.leads == null) ? null : sum((row) => row.leads);
    case "orders": return sum((row) => row.orders);
    case "cpl": return rows.some((row) => row.leads == null) ? null : share(spend, sum((row) => row.leads));
    case "cac": return share(spend, sum((row) => row.ordersNew));
    case "pctAds": return share(spend, sum((row) => row.revenueNew));
    case "deposits": {
      const since = coverage ?? metricCoverage(sales);
      const ready = ids.every((id) => {
        const start = since.get(id)?.deposits ?? null;
        return start != null && (to ?? from) >= start;
      });
      return ready ? sum((row) => row.deposits) : null;
    }
    default: {
      const filled = rows.filter((row) => row.inquiryFilledDays > 0);
      return filled.length ? filled.reduce((n, row) => n + row.inquiries, 0) : null;
    }
  }
}

const CHANNEL_LABELS = { FB: "Facebook", Line: "LINE", LINE: "LINE", IG: "Instagram", TT: "TikTok", other: "อื่นๆ" };
/* ระบบขายพี่ทัชเก็บ FB/Line · ระบบ TMK เก็บ Facebook/LINE — ยุบเป็นคีย์เดียวก่อนรวม ไม่งั้นได้สองแถวชื่อเดียวกันและยอดถูกผ่าครึ่ง */
const CHANNEL_CANON = { Facebook: "FB", FB: "FB", LINE: "Line", Line: "Line", Instagram: "IG", IG: "IG", TikTok: "TT", TT: "TT" };
const canonChannel = (channel) => CHANNEL_CANON[channel] ?? channel;

/** funnel แยกช่องทางที่ลูกค้าทัก (channel_funnel ของระบบขาย) — ตอบว่าลูกค้าจากช่องไหนปิดการขายได้ดีกว่า
    คนทักนับเฉพาะวันที่ทีมกรอก · Lead ก่อน LEADS_TRACKED_SINCE = null · ได้ออเดอร์ก่อนวันเริ่มเก็บ = null (กติกาเดียวกับ funnel รวม) */
export function channelFunnel(facts = [], { brandIds = [], from, to, depositsSince = null, stages = FUNNEL_STAGE_KEYS } = {}) {
  const hasLead = stages.includes("qualified");
  const hasDeposit = stages.includes("deposits");
  const lanes = new Map();
  let leadsBefore = false;
  for (const fact of facts ?? []) {
    const day = fact?.fact_date;
    if (!brandIds.includes(fact?.brand_id) || !ISO.test(String(day ?? "")) || (from && day < from) || (to && day > to)) continue;
    if (day < LEADS_TRACKED_SINCE) leadsBefore = true;
    for (const [rawChannel, lane] of Object.entries(fact.channel_funnel ?? {})) {
      const channel = canonChannel(rawChannel);
      const c = lanes.get(channel) ?? { channel, inquiries: null, leads: 0, deposits: 0, orders: 0 };
      if (fact.inquiry_filled === true) c.inquiries = (c.inquiries ?? 0) + (num(lane?.inquiries) ?? 0);
      c.leads += num(lane?.leads) ?? 0;
      c.deposits += num(lane?.deposits) ?? 0;
      c.orders += num(lane?.orders) ?? 0;
      lanes.set(channel, c);
    }
  }
  const depositsKnown = Boolean(depositsSince) && (from ?? to ?? "") >= depositsSince;
  const totalOrders = [...lanes.values()].reduce((n, c) => n + c.orders, 0);
  return [...lanes.values()].map((c) => {
    // ระบบขายที่ไม่มีขั้นนั้น (JUNTAKARN ไม่มี Lead/มัดจำ) = null → หน้าจอขึ้น "—" ไม่ใช่ 0
    const leads = !hasLead ? null : leadsBefore ? null : c.leads;
    const deposits = !hasDeposit ? null : depositsKnown ? c.deposits : null;
    return {
      channel: c.channel, label: CHANNEL_LABELS[c.channel] ?? c.channel,
      inquiries: c.inquiries, leads, deposits, orders: c.orders,
      leadRate: share(leads, c.inquiries), depositRate: share(deposits, leads),
      // funnel 2 ขั้น: ปิดการขายเทียบจากคนทัก (ไม่มี Lead ให้เทียบ)
      closeRate: hasLead ? share(c.orders, leads) : share(c.orders, c.inquiries),
      closeBasis: hasLead ? "leads" : "inquiries",
      orderShare: share(c.orders, totalOrders),
    };
  }).sort((a, b) => b.orders - a.orders);
}
