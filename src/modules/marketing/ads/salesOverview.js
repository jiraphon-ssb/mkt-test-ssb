/* Overview ads ยึดยอดจริงและเป้าจากระบบขายของพี่ทัช (ข้อ 3–4 ของแผน docs/superpowers/plans/2026-09-17-sales-data-rollout.md)
   pure · เทสใน tests/salesOverview.test.js
   กติกา: ค่าแอดยังเป็นของ Meta (ระดับแพลตฟอร์ม/แคมเปญยังเป็น Meta attribute ได้) แต่ระดับแบรนด์และภาพรวม
   ยอดขาย · ROAS · %Ads · CPL · CAC ต้องมาจากระบบขาย · ไม่มีข้อมูล = null พร้อมเหตุผล ห้ามโชว์ 0 แทน */
import { fmtInt } from "../dash/charts/theme.js";
import { budgetPace, change, revenuePace, roasOf, share } from "../adsOverview.js";
import { metricCoverage } from "./salesFacts.js";

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
    แบรนด์ไหนไม่มีตัวใด เป้ารวมตัวนั้น = null (รวมบางแบรนด์แล้วเรียกว่าภาพรวมจะหลอกตา) */
export function combineGoalTargets(list = []) {
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
    // วันนี้ยังไม่จบ ทีมยังไม่กรอก = ไม่นับเป็นวัน (ตัวหาร "ทีมกรอก x/y วัน")
    if (fact.inquiry_filled === true || day !== today) s.days += 1;
    s.deposits += num(fact.deposits) ?? 0;
    s.depositValue += num(fact.deposit_value) ?? 0;
    s.cash += num(fact.cash_received) ?? 0;
    s.cancelled += num(fact.cancelled) ?? 0;
    out.set(fact.brand_id, s);
  }
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
  const revenue = included.length ? included.reduce((n, row) => n + row.revenue, 0) : null;
  const revTarget = allOrNull((row) => row.revTarget);
  const budget = allOrNull((row) => row.budget);
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
    excluded: rows.filter((row) => row.salesSource !== "sales").map((row) => row.name),
    excludedWaiting: rows.filter((row) => row.salesSource === "waiting").map((row) => row.name),
    excludedNoData: rows.filter((row) => row.salesSource === "none").map((row) => row.name),
  };
}

/** funnel จริงจากระบบขาย ในรูปเดียวกับ adsSalePipeline (SalePipeline ใช้ต่อได้) · คนทักบอกทั้งทีมกรอกและจากแอด Meta */
export function salesPipeline({ sales = null, prevSales = null, metaInquiries = null, spend = null, prevSpend = null, basis = "total", depositsSince = null, from = null, to = null, waiting = false } = {}) {
  const none = waiting ? "รอเชื่อมแหล่งข้อมูล" : "ยังไม่มีข้อมูล";
  const inquiriesOf = (s) => (s && s.inquiryFilledDays > 0 ? s.inquiries : null);
  const depositsOf = (s) => {
    if (!s || !depositsSince) return null;
    return (to ?? from ?? depositsSince) < depositsSince ? null : s.deposits;
  };
  const revenueOf = (s) => (s ? (basis === "new" ? s.revenueNew : s.revenue) : null);

  const inquiries = inquiriesOf(sales);
  const leads = sales ? sales.leads : null;
  const deposits = depositsOf(sales);
  const orders = sales ? sales.orders : null;

  const inquirySub = [
    metaInquiries != null ? `จากแอด Meta ${fmtInt(metaInquiries)}` : null,
    !sales ? none : sales.inquiryFilledDays === 0 ? "ทีมยังไม่กรอก" : sales.inquiryFilledDays < sales.days ? `ทีมกรอก ${sales.inquiryFilledDays}/${sales.days} วัน` : null,
  ].filter(Boolean).join(" · ");
  const depositSub = !sales ? none
    : !depositsSince ? "ยังไม่มีข้อมูล"
      : deposits == null ? `ยังไม่มีข้อมูล (มีตั้งแต่ ${dateLabel(depositsSince)})`
        : from && from < depositsSince ? `มีข้อมูลตั้งแต่ ${dateLabel(depositsSince)}` : null;

  const stages = [
    { key: "inquiries", label: "คนทัก (ทีมกรอก)", value: inquiries, before: inquiriesOf(prevSales), sub: inquirySub || null },
    { key: "qualified", label: "Lead", value: leads, before: prevSales ? prevSales.leads : null, conv: share(leads, inquiries), sub: sales ? null : none },
    { key: "deposits", label: "ได้ออเดอร์", value: deposits, before: depositsOf(prevSales), conv: share(deposits, leads), sub: depositSub },
    { key: "closed", label: "ยืนยันออเดอร์", value: orders, before: prevSales ? prevSales.orders : null, conv: share(orders, deposits), sub: sales ? null : none },
  ].map((stage) => ({ sense: "higher", fmt: "int", conv: null, ...stage }));
  const rated = stages.filter((stage) => stage.conv != null);
  const worstKey = rated.length ? rated.reduce((a, b) => (b.conv < a.conv ? b : a)).key : null;
  const metaNote = "คิดจากค่าแอด Meta";

  return {
    estimated: false,
    worstKey,
    items: [
      ...stages,
      { key: "roas", label: "ROAS", value: roasOf(revenueOf(sales), spend), before: roasOf(revenueOf(prevSales), prevSpend), sense: "higher", fmt: "roas", sub: sales ? metaNote : none },
      { key: "pctAds", label: "%Ads", value: share(spend, sales?.revenueNew ?? null), before: share(prevSpend, prevSales?.revenueNew ?? null), sense: "lower", fmt: "pct1", sub: sales ? `ต่อยอดลูกค้าใหม่ · ${metaNote}` : none },
      { key: "cpl", label: "CPL", value: share(spend, leads), before: share(prevSpend, prevSales?.leads ?? null), sense: "lower", fmt: "money", sub: sales ? `ต่อ Lead ในระบบขาย · ${metaNote}` : none },
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
    case "leads": return sum((row) => row.leads);
    case "orders": return sum((row) => row.orders);
    case "cpl": return share(spend, sum((row) => row.leads));
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
