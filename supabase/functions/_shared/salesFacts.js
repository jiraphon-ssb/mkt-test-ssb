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

/* ── ความครบของข้อมูล ────────────────────────────────────────────────────── */

const COVERAGE_METRICS = ["inquiries", "qualified_leads", "deposits", "orders", "gross_revenue"];

/** Lead ก่อนวันนี้กรอกใน sheet แล้วย้ายเข้าระบบขายทีหลัง (ยอดพุ่ง 180 วันที่ 31 ส.ค. · อาร์ตยืนยัน 17 ก.ย. 2569)
    → ถือว่ามีข้อมูล Lead จริงตั้งแต่วันนี้ ก่อนหน้านั้น = ไม่รู้ เทียบไม่ได้ */
export const LEADS_TRACKED_SINCE = "2026-09-01";
const TRACKED_SINCE = { qualified_leads: LEADS_TRACKED_SINCE };

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
  for (const entry of out.values()) {
    for (const [metric, since] of Object.entries(TRACKED_SINCE)) if (entry[metric] !== null && entry[metric] < since) entry[metric] = since;
  }
  return out;
}

/** ขั้นของเส้นทางขายมาตรฐาน (ตรงกับ key ใน salesPipeline) */
export const FUNNEL_STAGE_KEYS = ["inquiries", "qualified", "deposits", "closed"];

/* แบรนด์ที่ระบบขายต้นทางไม่ได้บันทึกครบทุกขั้น — ขั้นที่ไม่มีต้องขึ้น "—" พร้อมเหตุผล ห้ามขึ้น 0
   b_jt (JUNTAKARN) ใช้ระบบ TMK Operation ซึ่งมีแค่ "คนทัก" (tmk_sales_funnel) กับ "ยืนยันออเดอร์" (tmk_mp_orders)
   ไม่มีสเตจ Lead และไม่มีประเภทจ่ายแบบมัดจำ (ข้อตกลงอาร์ต 18 ก.ย. 2569) */
export const BRAND_FUNNEL_STAGES = { b_jt: ["inquiries", "closed"] };

export const funnelStagesOf = (brandId) => BRAND_FUNNEL_STAGES[brandId] ?? FUNNEL_STAGE_KEYS;

/* แบรนด์ที่มีแหล่งยอดขายบนหน้าจอ = 3 แบรนด์ของพี่ทัช + JUNTAKARN (ระบบ TMK Operation)
   ต่างจาก SALES_SOURCE_BRANDS ซึ่งเป็น "รหัสที่ขอจาก RPC ของพี่ทัช" — ห้ามใส่ JK ลงตัวนั้น (ระบบพี่ทัชมีแถว JK ไม่ครบ จะนับซ้ำ) */
export const SALES_SOURCE_BRAND_IDS = [...SALES_SOURCE_BRANDS.map((code) => SALE_BRAND_BY_CODE[code]), "b_jt"];
