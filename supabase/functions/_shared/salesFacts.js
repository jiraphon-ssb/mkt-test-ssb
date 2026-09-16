/* ยอดขายจริงจากระบบขายของพี่ทัช (ssbgroup-platform) → หน้า ads — pure · เทสใน tests/salesFacts.test.js
   แหล่งข้อมูล: RPC sale_dashboard_facts (ตัวเดียวกับแดชบอร์ดขาย) + ตาราง sale_goal / sale_target — อ่านด้วย secret key
   นิยามยอดขาย = ยืนยันออเดอร์ ณ วันจ่ายงวดแรก (revenue_recognized_date) ตรงกับ P&L และตรงกับที่เป้าของพี่ทัชใช้วัด
   กติกา: ยอดจริงมาถึงระดับ "แบรนด์ × วัน" เท่านั้น แยกรายโฆษณาไม่ได้ · ไม่มีข้อมูล = null ไม่ใช่ 0 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_START = /^\d{4}-\d{2}-01$/;
const PLATFORM_KEY = /^[a-z0-9_]{1,24}$/;
/* ช่องทางคนทักของระบบขายเป็นรายการตายตัว (INQUIRY_CHANNELS: FB · Line) แต่คอลัมน์ฝั่งนั้นเป็นข้อความอิสระ ≤24 ตัว
   รับเฉพาะรหัสสั้นๆ — ถ้าวันหนึ่งมีคนพิมพ์ชื่อ/เบอร์ลงไป จะไม่ถูกคัดลอกมาให้ทุกคนในระบบ marketing เห็น */
const CHANNEL_KEY = /^[A-Za-z0-9_]{1,16}$/;

/** รหัสแบรนด์ฝั่งระบบขาย → brand id ฝั่ง marketing (ดู orgConfig ของ ssbgroup-platform: JD = JK Design, JK = JUNTAKARN) */
export const SALE_BRAND_BY_CODE = { TD: "b_td", JD: "b_jk", TA: "b_ta", JK: "b_jt" };   // SF (SAIFAH) ยังไม่มีในระบบ ads

/** แบรนด์ที่ใช้ระบบพี่ทัชเป็นแหล่งข้อมูล — JK (JUNTAKARN) ข้อมูลจริงอยู่อีกโปรเจกต์ Supabase
    ห้ามเพิ่ม JK ตรงนี้: ระบบพี่ทัชมีแถวของ JK อยู่บ้างแต่ไม่ครบ (ไม่มีคนทักเลยสักวัน) และพอต่อแหล่งของ JK จะนับซ้ำ */
export const SALES_SOURCE_BRANDS = ["TD", "JD", "TA"];

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const money = (value) => Math.round(value * 100) / 100;
const count = (value) => Math.max(0, Math.trunc(num(value) ?? 0));
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** แบ่งช่วงวันเป็นก้อนละ size วัน (รวมหัวท้าย) — PostgREST คืนไม่เกิน 1,000 แถวต่อครั้ง ถ้าขอทีเดียวจะได้ข้อมูลขาดแบบเงียบ */
export function factWindows(from, to, size = 3) {
  if (!ISO.test(String(from ?? "")) || !ISO.test(String(to ?? "")) || from > to) return [];
  const step = Math.max(1, Math.trunc(Number(size) || 1));
  const out = [];
  for (let start = from; start <= to; start = addDays(start, step)) {
    const end = addDays(start, step - 1);
    out.push({ from: start, to: end < to ? end : to });
  }
  return out;
}

/** แถว sale_dashboard_facts → แถว business_daily_facts ครบทุกวัน×แบรนด์ในช่วง (วันไม่มีเหตุการณ์ = 0)
    ต้องครบทุกช่อง เพราะยอดแก้ย้อนหลังได้ (ถอนยืนยัน/ยกเลิก) — ถ้าเขียนเฉพาะวันที่มีเหตุการณ์ วันที่ยอดหายไปจะค้างตัวเลขเก่า
    นิยามตาม kind ของพี่ทัช: inq คนทัก · lead ลีด · won ได้ออเดอร์(เริ่มออกแบบ) · book ยืนยันออเดอร์ = ยอดขาย
    · pay เงินเข้าสุทธิ · canc ยกเลิก · lost/nosale ไม่เก็บ (หลุดแทบไม่มีคนกด · งานไม่ใช่ยอดขายไม่เกี่ยวกับแอด)
    ยอดขายไม่หักยกเลิก — sale_goal_period ของพี่ทัชวัดเป้าจาก book ล้วน ถ้าหักเองเลขจะไม่ตรงหน้าเป้า */
export function factsToDailyRows(facts = [], { from, to, brands = SALES_SOURCE_BRANDS } = {}) {
  const grid = new Map();
  for (const { from: start, to: end } of factWindows(from, to, 3650)) {
    for (let day = start; day <= end; day = addDays(day, 1)) {
      for (const code of brands) {
        const brandId = SALE_BRAND_BY_CODE[code];
        if (!brandId) continue;
        grid.set(`${code}|${day}`, {
          brand_id: brandId, fact_date: day, source: "crm", external_record_id: `${code}|${day}`,
          inquiries: 0, inquiries_by_channel: {}, inquiry_filled: false, channel_funnel: {},
          qualified_leads: 0, leads_new: 0, deposits: 0, deposit_value: 0,
          orders: 0, orders_new: 0, gross_revenue: 0, revenue_new: 0, refunds: 0,
          cash_received: 0, cancelled: 0, cancelled_value: 0,
        });
      }
    }
  }
  const FUNNEL_STEP = { inq: "inquiries", lead: "leads", won: "deposits", book: "orders" };
  for (const fact of facts ?? []) {
    const row = grid.get(`${fact?.brand}|${fact?.day}`);
    if (!row) continue;
    const n = count(fact.n);
    const amount = num(fact.amount) ?? 0;
    const channel = CHANNEL_KEY.test(String(fact.channel ?? "")) ? String(fact.channel) : "other";
    const step = FUNNEL_STEP[fact.kind];
    if (step) {
      const lane = row.channel_funnel[channel] ?? (row.channel_funnel[channel] = { inquiries: 0, leads: 0, deposits: 0, orders: 0 });
      lane[step] += n;
    }
    switch (fact.kind) {
      case "inq": {
        row.inquiries += n;
        row.inquiries_by_channel[channel] = (row.inquiries_by_channel[channel] ?? 0) + n;
        row.inquiry_filled = true;
        break;
      }
      case "lead":
        row.qualified_leads += n;
        if (fact.is_new === true) row.leads_new += n;
        break;
      case "won":
        row.deposits += n;
        row.deposit_value += amount;
        break;
      case "book":
        row.orders += n;
        row.gross_revenue += Math.max(0, amount);
        if (fact.is_new === true) { row.orders_new += n; row.revenue_new += Math.max(0, amount); }
        break;
      case "pay":
        row.cash_received += amount;
        break;
      case "canc":
        row.cancelled += n;
        row.cancelled_value += Math.max(0, amount);
        break;
      default:
        break;
    }
  }
  return [...grid.values()].map((row) => ({
    ...row,
    deposit_value: money(row.deposit_value), gross_revenue: money(row.gross_revenue), revenue_new: money(row.revenue_new),
    cash_received: money(row.cash_received), cancelled_value: money(row.cancelled_value),
  }));
}

/** หยิบเฉพาะคีย์ที่รู้จักและเป็นตัวเลข แล้วเปลี่ยนชื่อ — กันข้อความ/โน้ตหลุดเข้ามากับ jsonb */
const pickNumbers = (source, mapping) => {
  const out = {};
  if (!source || typeof source !== "object") return out;
  for (const [from, to] of Object.entries(mapping)) {
    const value = num(source[from]);
    if (value !== null) out[to] = value;
  }
  return out;
};

const sumOrNull = (...values) => {
  const present = values.map(num).filter((value) => value !== null);
  return present.length ? present.reduce((total, value) => total + value, 0) : null;
};

/** เป้าจากระบบพี่ทัช → แถว ad_sales_goals · ลำดับเดียวกับหน้าประวัติเป้าของพี่ทัช: sale_goal (ใหม่ มีเวอร์ชัน) ก่อน
    ไม่มีค่อยใช้ sale_target (แบบเก่า 6 ตัว ไม่มีงบแอด/CPL/ROAS) · version 0 = มาจากแบบเก่า */
export function goalRowsToSalesGoals({ goals = [], targets = [], brands = SALES_SOURCE_BRANDS } = {}) {
  const out = new Map();
  for (const row of goals ?? []) {
    const brandId = brands.includes(row?.brand) ? SALE_BRAND_BY_CODE[row.brand] : null;
    const month = String(row?.month ?? "").slice(0, 10);
    if (!brandId || !MONTH_START.test(month)) continue;
    const version = Math.trunc(num(row.version) ?? 0);
    const key = `${brandId}|${month}`;
    if ((out.get(key)?.version ?? -1) >= version) continue;
    const t = row.targets && typeof row.targets === "object" ? row.targets : {};
    const platformBudgets = {};
    for (const platform of Array.isArray(row.ads?.platforms) ? row.ads.platforms : []) {
      const budget = num(platform?.budget);
      if (PLATFORM_KEY.test(String(platform?.key ?? "")) && budget !== null) platformBudgets[platform.key] = budget;
    }
    const inputs = row.inputs && typeof row.inputs === "object" ? row.inputs : {};
    const a = inputs.assumptions && typeof inputs.assumptions === "object" ? inputs.assumptions : {};
    const platformPct = {};
    for (const [platform, pct] of Object.entries(row.ads?.split && typeof row.ads.split === "object" ? row.ads.split : {})) {
      if (PLATFORM_KEY.test(platform) && num(pct) !== null) platformPct[platform] = num(pct);
    }
    out.set(key, {
      brand_id: brandId, month, version, goal_source: "sale_goal",
      sales_target: num(t.sales_total) ?? sumOrNull(t.sales_new, t.sales_old),
      sales_new_target: num(t.sales_new), sales_old_target: num(t.sales_old),
      orders_target: sumOrNull(t.orders_new, t.orders_old), deposits_target: sumOrNull(t.design_new, t.design_old),
      leads_target: sumOrNull(t.leads_new, t.leads_old), inquiry_target: num(t.inquiry),
      ad_budget: num(t.ad_budget), cpl: num(t.cpl), cac: num(t.cac), roas: num(t.roas),
      platform_budgets: platformBudgets,
      // หน้าเป้าหมายของพี่ทัช: %Ads ต่อยอดใหม่ · ต้นทุนต่อทัก · ทัก→Lead · เพดานที่ต้องคุม (หยิบเฉพาะคีย์ตัวเลขที่รู้จัก)
      pct_ads_new: num(t.pct_ads_new), cpi: num(t.cpi), i2l: num(t.i2l),
      caps: pickNumbers(t.caps, { cpl: "cpl", cpi: "cpi", i2l: "i2l" }),
      assumptions: pickNumbers(a, { aovN: "aov_new", aovO: "aov_old", l2dN: "lead_to_deposit_new", l2dO: "lead_to_deposit_old", d2oN: "deposit_to_order_new", d2oO: "deposit_to_order_old" }),
      share_new: num(inputs.share_new), other_cost: num(row.ads?.other_cost), platform_pct: platformPct,
    });
  }
  const legacy = new Map();
  for (const row of targets ?? []) {
    const brandId = brands.includes(row?.brand) ? SALE_BRAND_BY_CODE[row.brand] : null;
    const month = String(row?.month ?? "").slice(0, 10);
    if (!brandId || !MONTH_START.test(month)) continue;
    const key = `${brandId}|${month}`;
    const metrics = legacy.get(key) ?? { brandId, month };
    metrics[row.metric] = num(row.amount);
    legacy.set(key, metrics);
  }
  for (const [key, m] of legacy) {
    if (out.has(key)) continue;   // เดือนที่มี sale_goal แล้ว แบบเก่าไม่มีสิทธิ์ทับ
    out.set(key, {
      brand_id: m.brandId, month: m.month, version: 0, goal_source: "sale_target",
      sales_target: sumOrNull(m.sales_new, m.sales_old), sales_new_target: m.sales_new ?? null, sales_old_target: m.sales_old ?? null,
      orders_target: m.orders ?? null, deposits_target: m.design ?? null, leads_target: m.leads ?? null, inquiry_target: m.inquiry ?? null,
      ad_budget: null, cpl: null, cac: null, roas: null, platform_budgets: {},
      pct_ads_new: null, cpi: null, i2l: null, caps: {}, assumptions: {}, share_new: null, other_cost: null, platform_pct: {},
    });
  }
  return [...out.values()];
}

/** รวมยอดจริงต่อแบรนด์ในช่วงที่หน้าจอกำลังดู — แบรนด์ที่ไม่มีข้อมูลจะไม่มีคีย์ (ไม่ใช่ 0) */
export function salesRevenueByBrand(facts = [], { from, to } = {}) {
  const out = new Map();
  for (const fact of facts ?? []) {
    const day = fact?.fact_date ?? fact?.factDate;
    if (typeof day !== "string" || !ISO.test(day)) continue;
    if ((from && day < from) || (to && day > to)) continue;
    const brandId = fact.brand_id ?? fact.brandId;
    if (!brandId) continue;
    const current = out.get(brandId) ?? { revenue: 0, orders: 0, days: 0 };
    current.revenue += (num(fact.gross_revenue ?? fact.grossRevenue) ?? 0) - (num(fact.refunds) ?? 0);
    current.orders += Math.trunc(num(fact.orders) ?? 0);
    current.days += 1;
    out.set(brandId, current);
  }
  return out;
}

/** ผูกค่าแอดของแบรนด์กับยอดขายจริง → ROAS · AOV · CAC (ขาดข้างใดข้างหนึ่ง = null) */
export function realRoasRows(brandSpend = [], salesByBrand = new Map()) {
  return (brandSpend ?? []).map((entry) => {
    const sales = salesByBrand.get(entry.brandId) ?? null;
    const spend = num(entry.spend);
    const revenue = sales ? sales.revenue : null;
    const orders = sales ? sales.orders : null;
    const usable = spend !== null && spend > 0;
    return {
      ...entry,
      spend,
      revenue,
      orders,
      roas: usable && revenue !== null ? revenue / spend : null,
      aov: orders ? revenue / orders : null,
      cac: usable && orders ? spend / orders : null,
      hasSales: Boolean(sales),
    };
  });
}

/** เทียบ funnel: คนทักที่ Meta นับ กับคนที่เข้าระบบขายจริง — ขาดข้างใดข้างหนึ่ง = null ไม่เดาแทน */
export function funnelCompareRows(brands = [], facts = [], range = {}) {
  const byBrand = new Map();
  for (const fact of facts ?? []) {
    const day = fact?.fact_date ?? fact?.factDate;
    if (typeof day !== "string" || !ISO.test(day)) continue;
    if ((range.from && day < range.from) || (range.to && day > range.to)) continue;
    const brandId = fact.brand_id ?? fact.brandId;
    if (!brandId) continue;
    const current = byBrand.get(brandId) ?? { inquiries: 0, leads: 0, deposits: 0, orders: 0, revenue: 0 };
    current.inquiries += Math.trunc(num(fact.inquiries) ?? 0);
    current.leads += Math.trunc(num(fact.qualified_leads ?? fact.qualifiedLeads) ?? 0);
    current.deposits += Math.trunc(num(fact.deposits) ?? 0);
    current.orders += Math.trunc(num(fact.orders) ?? 0);
    current.revenue += (num(fact.gross_revenue ?? fact.grossRevenue) ?? 0) - (num(fact.refunds) ?? 0);
    byBrand.set(brandId, current);
  }
  return (brands ?? []).map((entry) => {
    const crm = byBrand.get(entry.brandId) ?? null;
    const spend = num(entry.spend);
    const metaLeads = num(entry.metaLeads);
    return {
      ...entry,
      metaLeads,
      inquiries: crm ? crm.inquiries : null,
      leads: crm ? crm.leads : null,
      deposits: crm ? crm.deposits : null,
      orders: crm ? crm.orders : null,
      revenue: crm ? crm.revenue : null,
      reachedSystem: crm && metaLeads ? crm.inquiries / metaLeads : null,      // คนทักที่ Meta นับ → เข้าระบบขายกี่ %
      cpl: spend && crm?.leads ? spend / crm.leads : null,                     // ค่าต่อ "ลีดจริง" ไม่ใช่ลีดที่ Meta นับ
      cac: spend && crm?.orders ? spend / crm.orders : null,
    };
  });
}

/* ── เป้าที่หน้าจออ่านจาก ad_sales_goals ─────────────────────────────────── */

/** แถวเป้าจากระบบขาย → Map brandId → เป้าเวอร์ชันล่าสุด */
export function goalsFromSales(rows = []) {
  const out = new Map();
  for (const row of rows ?? []) {
    const brandId = SALE_BRAND_BY_CODE[row?.brand];
    if (!brandId) continue;
    const version = Math.trunc(num(row.version) ?? 0);
    if ((out.get(brandId)?.version ?? -1) > version) continue;
    out.set(brandId, {
      month: typeof row.month === "string" ? row.month.slice(0, 10) : null,
      version,
      salesTarget: num(row.sales_target ?? row.salesTarget),
      adBudget: num(row.ad_budget ?? row.adBudget),
      cpl: num(row.cpl),
      cac: num(row.cac),
      roas: num(row.roas),
      leadsTarget: num(row.leads_target ?? row.leadsTarget),
      ordersTarget: num(row.orders_target ?? row.ordersTarget),
    });
  }
  return out;
}

/** เป้าที่จะใช้แสดง: ระบบขายมาก่อนเสมอ · ไม่มีก็ใช้ที่ตั้งในหน้านี้ · ไม่มีทั้งคู่ = ไม่มีเป้า (ไม่ใช่ 0) */
export function goalSource(brandId, salesGoals = new Map(), settingsGoal = null) {
  const goal = salesGoals?.get?.(brandId) ?? null;
  if (goal) {
    return {
      source: "sales", month: goal.month, version: goal.version,
      revenue: goal.salesTarget, budget: goal.adBudget, roas: goal.roas, cpl: goal.cpl, cac: goal.cac,
      leads: goal.leadsTarget, orders: goal.ordersTarget,
    };
  }
  if (settingsGoal && (settingsGoal.revenue != null || settingsGoal.budget != null)) {
    return { source: "settings", month: null, version: null, revenue: settingsGoal.revenue ?? null, budget: settingsGoal.budget ?? null, roas: settingsGoal.roas ?? null, cpl: settingsGoal.cpl ?? null, cac: null, leads: settingsGoal.leads ?? null, orders: null };
  }
  return { source: "none", month: null, version: null, revenue: null, budget: null, roas: null, cpl: null, cac: null, leads: null, orders: null };
}

/* ── ความครบของข้อมูล ────────────────────────────────────────────────────── */

const COVERAGE_METRICS = ["inquiries", "qualified_leads", "deposits", "orders", "gross_revenue"];

/** วันแรกที่แต่ละตัวชี้วัดมีข้อมูลจริง ต่อแบรนด์ — ก่อนวันนั้นหน้าจอต้องบอก "ยังไม่มีข้อมูล" ไม่ใช่ 0
    เหตุ: ระบบขายไม่มีประวัติสเตจก่อน 1 ก.ย. ("ได้ออเดอร์" เป็น 0 ทุกวัน) และบางเดือนทีมไม่ได้กรอกคนทักเลย
    คนทักนับจากวันที่ทีมกรอก (inquiry_filled) ไม่ใช่วันที่ค่ามากกว่า 0 */
export function metricCoverage(facts = []) {
  const out = new Map();
  for (const fact of facts ?? []) {
    const brandId = fact?.brand_id ?? fact?.brandId;
    const day = fact?.fact_date ?? fact?.factDate;
    if (!brandId || typeof day !== "string" || !ISO.test(day)) continue;
    const entry = out.get(brandId) ?? Object.fromEntries(COVERAGE_METRICS.map((metric) => [metric, null]));
    for (const metric of COVERAGE_METRICS) {
      const has = metric === "inquiries" ? fact.inquiry_filled === true : (num(fact[metric]) ?? 0) > 0;
      if (has && (entry[metric] === null || day < entry[metric])) entry[metric] = day;
    }
    out.set(brandId, entry);
  }
  return out;
}
