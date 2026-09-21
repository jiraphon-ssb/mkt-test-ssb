/* ============================================================
   adsOverview — ตัวเลขของหน้า "ค่าแอด" (pure · มีเทส)
   กติกาโมดูล: ไม่คิดเลขในหน้าจอ — หน้าจออ่านผลจากที่นี่อย่างเดียว
   ใช้ fact ที่ระบบมี: spend · leads · reach · engagement · revenue (mock)
   งบ = data.ad_budgets (mock ราย แบรนด์×ช่องทาง×เดือน) — ยังไม่มี = แสดง "ยังไม่ตั้งงบ" ไม่เดา
   ============================================================ */

import { fmtNum, fmtMoney } from "./dash/charts/theme.js";
import { adsRollup, analyticsCards, cardAnchorISO, inRange } from "./mktAnalytics.js";
import { creativeAssetOf } from "./ads/metaCreativeContract.js";

/** อัตราส่วนแบบปลอดภัย — ตัวหาร 0 หรือค่าว่างคืน null (null ≠ 0) */
export const share = (a, b) => (a == null || b == null || b <= 0 ? null : a / b);

/** ROAS = รายได้ ÷ ค่าแอด — ค่าแอด 0/ว่าง หรือรายได้ว่าง คืน null */
export const roasOf = (revenue, spend) => (spend == null || spend <= 0 || revenue == null ? null : revenue / spend);

/** เลือกฐานยอดขายให้ทุก aggregate ใช้ฟิลด์เดียวกัน
    ยอดใหม่ต้องมีค่าจากต้นทางจริง; ถ้าไม่มีให้เป็น null แทนการเดาหรือใช้ยอดรวมแทน */
export function revenueBasisCards(cards, basis = "total", { mockFallback = false } = {}) {
  if (basis !== "new") return cards;
  return cards.map((card) => ({
    ...card,
    metrics: card.metrics ? {
      ...card.metrics,
      revenue: card.metrics.new_revenue ??
        ((mockFallback || card.id?.startsWith("ma_")) && card.metrics.revenue != null ? Math.round(card.metrics.revenue * 0.62) : null),
    } : card.metrics,
  }));
}

/** เปลี่ยนแปลงเป็น % เทียบช่วงก่อน — ฐาน 0 คืน null เพราะเทียบไม่ได้ */
export function change(now, before) {
  if (now == null || before == null || before === 0) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

/** รายได้รวม (mock) ของงานยิงแอดในช่วง */
export function adsRevenue(cards, range) {
  const rows = adFactRows(cards, range);
  if (rows.length === 0 || rows.some((c) => c.metrics?.revenue == null)) return null;
  return rows.reduce((n, c) => n + c.metrics.revenue, 0);
}

/** แถวข้อมูล ads ในช่วง แม้ฟิลด์บางตัวจะยังไม่ถูกกรอก (ใช้ตรวจ coverage) */
export function adFactRows(cards, range) {
  return analyticsCards(cards).filter((c) => c.track === "project" && adPlatformOf(c) != null && inRange(cardAnchorISO(c), range));
}

const completeSum = (rows, pick) => {
  if (rows.length === 0) return 0;
  if (rows.some((r) => pick(r) == null)) return null;
  return rows.reduce((n, r) => n + pick(r), 0);
};

/* ---------- ตัวกรองช่องทาง ---------- */
/** แพลตฟอร์มซื้อโฆษณา — แยกจาก placement/content channel */
export const AD_PLATFORMS = ["Meta Ads", "Google Ads", "TikTok Ads", "Shopee Ads"];
export function normalizeAdPlatform(raw) {
  if (["Facebook", "Instagram", "IG", "Reels", "Meta", "Meta Ads"].includes(raw)) return "Meta Ads";
  if (["TikTok", "TikTok Ads"].includes(raw)) return "TikTok Ads";
  if (["Google", "Google Ads", "YouTube Ads"].includes(raw)) return "Google Ads";
  if (["Shopee", "Shopee Ads"].includes(raw)) return "Shopee Ads";
  return null;
}
export function adPlatformOf(c) {
  return normalizeAdPlatform(c.ad_platform ?? c.brief?.ad_platform ?? c.brief?.channels?.[0] ?? null);
}

const resultLabelOf = (platform) => platform === "Shopee Ads" ? "ออเดอร์" : platform === "Google Ads" ? "คอนเวอร์ชัน" : "ลีด";

/** แพลตฟอร์มที่มีค่าแอดในช่วง ต่อแบรนด์ → Map(brandId → [platform เรียงชื่อ]) (ใช้แบ่งงบ/เป้าจากหน้าตั้งค่า) */
export function adChannelsByBrand(cards, range) {
  const acc = new Map();
  for (const c of adFactRows(cards, range)) {
    const platform = adPlatformOf(c);
    if (!platform || !(c.metrics?.spend > 0)) continue;
    if (!acc.has(c.brand_id)) acc.set(c.brand_id, new Set());
    acc.get(c.brand_id).add(platform);
  }
  return new Map([...acc].map(([brand, set]) => [brand, [...set].sort()]));
}

/** กรองการ์ดเฉพาะช่องทางที่เลือก — "all" = ไม่กรอง · กรองเฉพาะใบ ads (ใบอื่นปล่อยผ่าน
    เพื่อให้ตัวเลข reach/engagement ที่ไม่ใช่ ads ไม่หายไปโดยไม่ตั้งใจ) */
export function filterByChannel(cards, channel) {
  if (!channel || channel === "all") return cards;
  const platform = normalizeAdPlatform(channel);
  return cards.filter((c) => c.track !== "project" || adPlatformOf(c) === platform);
}

/** รายชื่อช่องทางที่มีงาน ads จริง เรียงตามค่าแอดรวมมาก→น้อย (ไว้ทำตัวกรอง) */
export function adsChannelList(cards) {
  const spend = new Map();
  for (const c of analyticsCards(cards)) {
    if (c.track !== "project" || c.metrics?.spend == null) continue;
    const ch = adPlatformOf(c);
    if (!ch) continue;
    spend.set(ch, (spend.get(ch) ?? 0) + c.metrics.spend);
  }
  return [...spend.entries()].sort((a, b) => b[1] - a[1]).map(([ch]) => ch);
}

/* ---------- KPI แถวบน — %Ads · ROAS · Spend · Conversions ---------- */
/** 4 ตัวหลักของหน้า พร้อมค่าช่วงก่อนไว้เทียบ · lower=true คือยิ่งต่ำยิ่งดี */
export function adsKpis(cards, range, prev) {
  const nowRows = adFactRows(cards, range), beforeRows = adFactRows(cards, prev);
  const revNow = adsRevenue(cards, range), revBefore = adsRevenue(cards, prev);
  const spendNow = completeSum(nowRows, (c) => c.metrics?.spend);
  const spendBefore = completeSum(beforeRows, (c) => c.metrics?.spend);
  const leadsNow = completeSum(nowRows, (c) => c.metrics?.leads);
  const leadsBefore = completeSum(beforeRows, (c) => c.metrics?.leads);
  const sumMetric = (rows, field) => completeSum(rows, (c) => c.metrics?.[field]);
  const impressionSum = sumMetric(nowRows, "impressions");
  const impressions = impressionSum > 0 ? impressionSum : null;
  const reach = sumMetric(nowRows, "reach");
  const clickSum = completeSum(nowRows, (c) => c.metrics?.clicks ?? c.metrics?.link_clicks);
  const clicks = impressions == null ? null : clickSum;
  const latest = nowRows.map((c) => c.metrics?.measured_at).filter(Boolean).sort().at(-1) ?? null;
  const known = (field) => nowRows.filter((c) => c.metrics?.[field] != null).length;
  return {
    spend: { value: spendNow, before: spendBefore, lower: false },
    roas: { value: roasOf(revNow, spendNow), before: roasOf(revBefore, spendBefore), lower: false },
    conversions: { value: leadsNow, before: leadsBefore, lower: false },
    pctAds: { value: share(spendNow, revNow), before: share(spendBefore, revBefore), lower: true },
    cpl: { value: share(spendNow, leadsNow), before: share(spendBefore, leadsBefore), lower: true },
    reach: { value: reach, before: sumMetric(beforeRows, "reach"), lower: false },
    delivery: {
      impressions, reach, clicks,
      frequency: share(impressions, reach),
      cpm: impressions > 0 ? (spendNow / impressions) * 1000 : null,
      ctr: share(clicks, impressions),
      cpc: share(spendNow, clicks),
    },
    quality: {
      rows: nowRows.length,
      latest,
      spend: nowRows.length ? known("spend") / nowRows.length : null,
      revenue: nowRows.length ? known("revenue") / nowRows.length : null,
      leads: nowRows.length ? known("leads") / nowRows.length : null,
    },
  };
}

/* ---------- กราฟรายสัปดาห์ ---------- */
/** ค่าแอดรายสัปดาห์ (แท่ง) + CPL (เส้น) — สัปดาห์ที่ยังไม่มีลีดคืน cpl = null */
export function adsWeekly(cards, weeks) {
  return weeks.map((w) => {
    const a = adsRollup(cards, w);
    return { label: w.label, spend: a.spend, leads: a.leads, cpl: a.cpl };
  });
}

/** รายการที่ควรตรวจ เรียงปัญหาก่อน แล้วตามด้วยค่าใช้จ่ายมากสุด */
export function adsDecisionRows(cards, range, brands = []) {
  const brandNames = new Map(brands.map((b) => [b.id, b.name]));
  const rows = adFactRows(cards, range).map((c) => {
    const spend = c.metrics?.spend;
    const leads = c.metrics?.leads;
    const revenue = c.metrics?.revenue;
    const channel = adPlatformOf(c);
    const resultLabel = resultLabelOf(channel);
    const cpl = share(spend, leads);
    const roas = roasOf(revenue, spend);
    let severity = 0, reason = "ติดตามผล";
    if (spend != null && spend > 0 && leads === 0) { severity = 3; reason = `ใช้เงินแล้ว ยังไม่มี${resultLabel}`; }
    else if (spend == null || leads == null || revenue == null) { severity = 2; reason = "ข้อมูลผลลัพธ์ยังไม่ครบ"; }
    else if (cpl != null && cpl > 500) { severity = 2; reason = `ต้นทุนต่อ${resultLabel}สูง`; }
    else if (roas != null && roas < 2) { severity = 1; reason = "ROAS ต่ำ"; }
    return {
      id: c.id, title: c.title, brand: brandNames.get(c.brand_id) ?? c.brand_id,
      channel, resultLabel, spend, leads, cpl, roas, severity, reason,
    };
  });
  return rows.sort((a, b) => b.severity - a.severity || (b.spend ?? -1) - (a.spend ?? -1));
}

/* ---------- สัดส่วนรายช่องทาง (โดนัทบนหัว) ---------- */
/** ช่องทางที่มีค่าแอดจริง เรียงมาก→น้อย พร้อมสัดส่วนของยอดรวม */
export function adsByChannel(cards, allCards, range, channels = []) {
  void allCards; void channels;
  const rows = adsChannelBreakdown(cards, range).filter((r) => r.spend > 0);
  const total = rows.reduce((n, r) => n + r.spend, 0);
  return {
    total,
    rows: rows
      .map((r) => ({ key: r.key, spend: r.spend, leads: r.leads, cpl: share(r.spend, r.leads), share: share(r.spend, total) }))
      .sort((a, b) => b.spend - a.spend),
  };
}

/* ---------- แยกช่องทางจากการ์ด ads โดยตรง (พก revenue มาด้วย) ----------
   งาน ads หนึ่งใบผูกช่องทางเดียว (ตาม seed) — จับกลุ่มตรงจากใบ ได้ revenue รายช่องทาง
   ซึ่ง rollupByChannel เดิมไม่พก มาได้ */
function adsChannelBreakdown(cards, range) {
  const acc = new Map();
  for (const r of adsRollup(cards, range).rows) {
    const ch = adPlatformOf(r.card);
    if (!ch) continue;
    let row = acc.get(ch);
    if (!row) {
      row = { key: ch, spend: 0, leads: 0, revenue: 0, impressions: 0, clicks: 0, reach: 0, camp: new Map() };
      acc.set(ch, row);
    }
    const m = r.card.metrics ?? {};
    row.spend += r.spend;
    row.leads += r.leads;
    row.revenue = row.revenue == null || m.revenue == null ? null : row.revenue + m.revenue;   // ไม่รู้แม้ใบเดียว = รวมไม่ได้ (null ≠ ฿0)
    row.impressions += m.impressions ?? 0;
    row.clicks += m.clicks ?? m.link_clicks ?? 0;
    row.reach += m.reach ?? 0;
    /* แคมเปญย่อย — ใบไหนไม่ระบุ จัดเข้า "ไม่ระบุแคมเปญ" ไม่ทิ้งเงิน */
    const name = r.card.campaign ?? r.card.brief?.campaign ?? "ไม่ระบุแคมเปญ";
    const cur = row.camp.get(name) ?? { name, spend: 0, leads: 0, revenue: 0 };
    cur.spend += r.spend;
    cur.leads += r.leads;
    cur.revenue = cur.revenue == null || m.revenue == null ? null : cur.revenue + m.revenue;
    row.camp.set(name, cur);
  }
  return [...acc.values()].map(({ camp, ...row }) => ({
    ...row,
    resultLabel: resultLabelOf(row.key),
    campaigns: [...camp.values()]
      .map((c) => ({ ...c, cpl: c.leads > 0 ? c.spend / c.leads : null, roas: roasOf(c.revenue, c.spend) }))
      .sort((a, b) => b.spend - a.spend),
  }));
}

/** ตัวเลขการส่ง (delivery) ที่มีเฉพาะระดับแพลตฟอร์ม — ชั้นแบรนด์ไม่มี จึงไม่ซ้ำกัน */
export function deliveryOf({ spend, impressions, clicks, reach }) {
  return {
    impressions: impressions || null,
    clicks: clicks || null,
    reach: reach || null,
    ctr: share(clicks, impressions),
    cpc: share(spend, clicks),
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    frequency: share(impressions, reach),
  };
}

/** ชุดตัวเลขรายวันของช่วง — ใช้วาด sparkline (วันที่ไม่มีค่าแอดคืน null ไม่ใช่ 0) */
export function adsDailySeries(cards, range) {
  const byDay = new Map();
  for (const c of adFactRows(cards, range)) {
    const iso = cardAnchorISO(c);
    if (!iso) continue;
    const k = dayKey(iso);
    const cur = byDay.get(k) ?? { day: k, spend: 0, leads: 0, revenue: 0, impressions: 0, clicks: 0, reach: 0 };
    const m = c.metrics ?? {};
    cur.spend += m.spend ?? 0;
    cur.leads += m.leads ?? 0;
    cur.revenue = cur.revenue == null || m.revenue == null ? null : cur.revenue + m.revenue;
    cur.impressions += m.impressions ?? 0;
    cur.clicks += m.clicks ?? m.link_clicks ?? 0;
    cur.reach += m.reach ?? 0;
    byDay.set(k, cur);
  }
  return [...byDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => ({
      ...d,
      cpl: d.leads > 0 ? d.spend / d.leads : null,
      roas: roasOf(d.revenue, d.spend),
      ctr: share(d.clicks, d.impressions),
      cpc: share(d.spend, d.clicks),
      cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : null,
      frequency: share(d.impressions, d.reach),
    }));
}

/** เติมวันที่ไม่มีข้อมูลในช่วงให้ครบทุกวัน (ทุกค่าเป็น null ไม่ใช่ 0) — กราฟรายวันต้องมีแกนเวลาจริง ไม่ยุบวันที่หายไปให้ชิดกัน */
const EMPTY_DAY = { spend: null, leads: null, revenue: null, impressions: null, clicks: null, reach: null, cpl: null, roas: null, ctr: null, cpc: null, cpm: null, frequency: null };
export function fillDailySeries(series, range) {
  const byDay = new Map(series.map((d) => [d.day, d]));
  const out = [];
  for (const t = new Date(range.start); t < new Date(range.end); t.setDate(t.getDate() + 1)) {
    const k = dayKey(t.toISOString());
    out.push(byDay.get(k) ?? { day: k, ...EMPTY_DAY });
  }
  return out;
}

/* ---------- งบราย แบรนด์×ช่องทาง×เดือน ---------- */
/** งบที่ตั้งไว้ของช่องทางนั้นในเดือนนั้น — ไม่มี = null (ไม่เดา) */
export function budgetOf(brandId, channel, month, adBudgets = []) {
  const row = adBudgets.find((b) => b.brand_id === brandId && normalizeAdPlatform(b.channel) === normalizeAdPlatform(channel) && b.month === month);
  return row ? row.amount : null;
}

/* ---------- จังหวะใช้งบเดือน (run-rate เชิงเส้น) ----------
   today = "YYYY-MM-DD" · เทียบ "ใช้ไปแล้ว" กับ "ควรใช้ ณ วันนี้" แล้วคาดยอดสิ้นเดือน
   งบไม่มี/0 → used/remaining/forecastOver = null (ยังประเมินเทียบเพดานไม่ได้) */
export function budgetPace(spend, budget, today) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)), day = Number(today.slice(8, 10));
  const daysInMonth = new Date(y, m, 0).getDate();
  const elapsed = Math.min(Math.max(day, 1), daysInMonth);
  const expected = elapsed / daysInMonth;                 // สัดส่วนวันที่ผ่านไปของเดือน
  if (spend == null || !Number.isFinite(spend)) {
    return {
      used: null, expected, expectedSpend: budget > 0 ? budget * expected : null,
      vsPace: null, remaining: null, average: null, forecast: null, forecastOver: null,
      daysLeft: daysInMonth - elapsed, requiredDaily: null, daysToExhaust: null,
    };
  }
  const average = spend / elapsed;                         // ค่าแอดเฉลี่ย/วัน จนถึงวันนี้
  const forecast = average * daysInMonth;                  // คาดค่าแอดสิ้นเดือน (ถ้าใช้จังหวะนี้ต่อ)
  const daysLeft = daysInMonth - elapsed;
  if (budget == null || budget <= 0) {
    return { used: null, expected, expectedSpend: null, vsPace: null, remaining: null, average, forecast, forecastOver: null, daysLeft, requiredDaily: null, daysToExhaust: null };
  }
  const remaining = budget - spend;
  return {
    used: spend / budget,                                 // ใช้ไปกี่ % ของงบ
    expected,
    expectedSpend: budget * expected,                     // ควรใช้ไปแล้วเท่าไร ณ วันนี้ (เป็นบาท)
    vsPace: spend - budget * expected,                    // เร็ว(+)/ช้า(−) กว่าจังหวะกี่บาท — กันคนต้องคิดเลขเอง
    remaining,                                            // เหลือ (ติดลบ = เกินงบแล้ว)
    average,
    forecast,
    forecastOver: forecast - budget,                      // >0 = คาดว่าจะเกินงบสิ้นเดือน
    daysLeft,
    requiredDaily: daysLeft > 0 ? Math.max(0, remaining) / daysLeft : null,
    daysToExhaust: average > 0 && remaining > 0 ? remaining / average : remaining <= 0 ? 0 : null,
  };
}

/** ป้ายสถานะจังหวะใช้งบ — คำ + โทน (สีคู่กับคำเสมอ) */
export function paceStatus(pace) {
  if (pace.used == null) return { text: "ยังไม่ตั้งงบ", tone: "zinc" };
  if (pace.remaining < 0) return { text: "เกินงบ", tone: "rose" };
  if (pace.used > pace.expected + 0.1) return { text: "ใช้เร็วกว่าแผน", tone: "amber" };
  if (pace.used < pace.expected - 0.1) return { text: "ใช้ช้ากว่าแผน", tone: "zinc" };
  return { text: "ตามแผน", tone: "emerald" };
}

/** จัดกลุ่มจังหวะใช้งบ ไว้ทำตัวกรองสถานะ
    over = เกินงบ/ใช้เร็วกว่าแผน · onplan = ตามแผน · under = ใช้ช้ากว่าแผน · unset = ยังไม่ตั้งงบ */
export function paceGroup(pace) {
  if (pace.used == null) return "unset";
  if (pace.remaining < 0 || pace.used > pace.expected + 0.1) return "over";
  if (pace.used < pace.expected - 0.1) return "under";
  return "onplan";
}

/* ---------- แบรนด์ × ช่องทาง (การ์ดเกจงบ) ----------
   ทุกอย่างคิดบน "เดือนนี้" (monthRange) เพราะงบเป็นราย 'เดือน' — ตัวเลือกช่วงเวลาบนหัว
   ไม่ขยับบล็อกนี้ · คืนทุกแบรนด์ (ที่ยังไม่ใช้เงินก็เห็นว่ายังไม่ใช้) เรียงตามค่าแอด */
export function adsByBrandChannel(cards, monthRange, brands, adBudgets = [], today = null, salesTargets = [], prevMonthRange = null) {
  const asOf = (today ?? monthRange.end).slice(0, 10);
  const month = asOf.slice(0, 7);
  return brands
    .map((b) => {
      const mine = analyticsCards(cards).filter((c) => c.brand_id === b.id);
      const channels = adsChannelBreakdown(mine, monthRange)
        .map((c) => {
          const budget = budgetOf(b.id, c.key, month, adBudgets);
          const revTarget = salesTargetOf(b.id, month, salesTargets, c.key);
          return {
            ...c,
            revTarget,
            revPct: share(c.revenue, revTarget),
            cpl: c.leads > 0 ? c.spend / c.leads : null,
            roas: roasOf(c.revenue, c.spend),
            pctAds: share(c.spend, c.revenue),
            delivery: deliveryOf(c),
            cplSeries: adsDailySeries(filterByChannel(mine, c.key), monthRange).map((d) => d.cpl),
            budget,
            pace: budgetPace(c.spend, budget, asOf),
          };
        })
        .sort((x, y) => y.spend - x.spend);
      /* ไม่มีช่องทางเลยในช่วงนี้ = "ยังไม่มีข้อมูล" ไม่ใช่ "ได้ศูนย์" — ต้องเป็น null
         ไม่งั้นแบรนด์ที่ยังไม่ซิงก์จะขึ้น ฿0 พร้อมป้ายแดง "ช้ากว่าแผน" เหมือนแบรนด์ที่ขายไม่ได้จริง */
      const empty = channels.length === 0;
      const spend = empty ? null : channels.reduce((n, c) => n + c.spend, 0);
      const sumRevenue = (rows) => rows.some((c) => c.revenue == null) ? null : rows.reduce((n, c) => n + c.revenue, 0);
      const revenue = empty ? null : sumRevenue(channels);
      const leads = empty ? null : channels.reduce((n, c) => n + c.leads, 0);
      // ยอดงบรวมใช้ได้ต่อเมื่อทุกช่องทางมีงบ ห้ามรวมเฉพาะช่องที่กรอกแล้วเพราะจะทำให้ pace แบรนด์เพี้ยน
      const budget = channels.length > 0 && channels.every((c) => c.budget != null)
        ? channels.reduce((n, c) => n + c.budget, 0)
        : null;
      const revTarget = salesTargetOf(b.id, month, salesTargets);
      const pace = budgetPace(spend, budget, asOf);
      /* เทียบเดือนก่อน — ยอดขายล้วน (ค่าแอดอยู่ชั้นแพลตฟอร์ม จะได้ไม่ซ้ำกัน) */
      const prevRows = prevMonthRange ? adsChannelBreakdown(mine, prevMonthRange) : null;
      const prevRevenue = prevRows ? sumRevenue(prevRows) : null;
      const prevSpend = prevRows ? prevRows.reduce((n, c) => n + c.spend, 0) : null;
      return {
        id: b.id, name: b.name, color: b.color, logo: b.logo, spend, revenue, leads,
        revTarget,
        revPct: share(revenue, revTarget),
        /* จังหวะทำยอดของแบรนด์ — เทียบ "ที่ควรได้ ณ วันนี้" */
        revPace: revenuePace(revenue, revTarget, pace.expected),
        prevRevenue,
        revChangePct: change(revenue, prevRevenue),
        prevSpend,
        spendChangePct: change(spend, prevSpend),
        roasSeries: adsDailySeries(mine, monthRange).map((d) => d.roas),
        roas: roasOf(revenue, spend),
        pctAds: share(spend, revenue),   // ค่าแอดกี่ % ของยอดขายแบรนด์ (รวมทุกแพลตฟอร์ม)
        budget,
        pace,
        channels,
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

/* ---------- กรวยผลจากค่าแอด ---------- */
/** Reach → Engagement → Leads ของงานที่ยิงแอด · ชี้ขั้นที่หล่นแรงสุดให้เอง */
export function adsFunnel(cards, range, prev = null) {
  const build = (r) => {
    const rows = adFactRows(cards, r);
    if (!rows.length) return { spend: 0, values: [null, null, null, null], estimated: false };
    /* ขั้น Lead/มัดจำ/ออเดอร์ เคยคิดจากอัตราส่วนคงที่ (0.65 · 0.15 · 0.8) ซึ่งทำให้ "หล่นแรงสุด"
       ชี้ที่มัดจำเสมอไม่ว่าข้อมูลจริงเป็นอย่างไร — ตัดออกแล้ว ขั้นไหนไม่มีข้อมูลจริง = null
       จนกว่าจะเชื่อมระบบขาย (ดู docs/superpowers/specs/2026-09-16-sales-revenue-bridge.md) */
    let estimated = false;
    const totals = [null, null, null, null];
    const add = (i, value) => { if (value != null) totals[i] = (totals[i] ?? 0) + value; };
    for (const c of rows) {
      const m = c.metrics ?? {};
      const inquiry = m.inquiries ?? m.chats ?? m.leads;
      if (m.qualified_leads == null || m.deposits == null || m.closed_orders == null) estimated = true;
      add(0, inquiry);
      add(1, m.qualified_leads);
      add(2, m.deposits);
      add(3, m.closed_orders);
    }
    const spend = completeSum(rows, (c) => c.metrics?.spend);
    return { spend, values: totals, estimated };
  };
  const now = build(range), before = prev ? build(prev) : null;
  const defs = [
    ["inquiries", "คนทัก", "เริ่มสนทนาจากโฆษณา"],
    ["qualified", "Lead", "ผ่านการคัดกรอง"],
    ["deposits", "มัดจำ", "มีรายการชำระแล้ว"],
    ["closed", "ออเดอร์ปิดแล้ว", "ยืนยันและชำระมัดจำแล้ว"],
  ];
  const stages = defs.map(([key, label, hint], i) => ({
    key, label, hint, value: now.values[i],
    rate: i === 0 ? 1 : share(now.values[i], now.values[i - 1]),
    cost: share(now.spend, now.values[i]),
    lost: i === 0 ? null : now.values[i - 1] - now.values[i],
    before: before?.values[i] ?? null,
  }));
  /* ขั้นที่อัตราแปลงต่ำสุด (ไม่นับฐาน) = คอขวดของกรวย — จอชี้ให้เอง คนไม่ต้องไล่เทียบ */
  const rated = stages.filter((st, i) => i > 0 && st.rate != null);
  const worstKey = rated.length ? rated.reduce((a, b) => (b.rate < a.rate ? b : a)).key : null;
  return { stages, estimated: now.estimated, worstKey };
}

/* ---------- ยอดขายเทียบเป้า (เดือนปัจจุบัน) ----------
   คณิตเดียวกับจังหวะใช้งบ: สะสม vs เป้า · ควรถึงไหน ณ วันนี้ · คาดปิดเดือน · ต้องทำอีกเท่าไร
   เป้ามาจาก data.sales_targets (mock ราย แบรนด์×เดือน) — ไม่มีเป้า = null ไม่เดา */
/** จังหวะทำยอดจากเป้ารายได้ — ได้กี่ % ของที่ควรได้ ณ วันนี้ (elapsed = สัดส่วนวันที่ผ่านไป) */
export function revenuePace(revenue, target, elapsed) {
  const expectedToDate = target == null ? null : target * elapsed;
  /* คาดปิดเดือน (run-rate เชิงเส้น) — ไม่ต้องมีเป้าก็คาดได้ แต่ "เกิน/ขาดเป้า" ต้องมีเป้า */
  const forecast = revenue == null || !(elapsed > 0) ? null : revenue / elapsed;
  return {
    expectedToDate,
    pctOfExpected: share(revenue, expectedToDate),
    behind: revenue == null || expectedToDate == null ? null : expectedToDate - revenue,
    forecast,
    forecastVsTarget: forecast == null || target == null ? null : forecast - target,  // + เกินเป้า / − ขาดเป้า
  };
}

export function salesTargetOf(brandId, month, targets = [], channel = null) {
  const rows = targets.filter((t) => t.brand_id === brandId && t.month === month
    && (channel == null || (t.channel ?? null) === channel));
  if (rows.length === 0) return null;
  return rows.reduce((n, t) => n + t.amount, 0);   /* ไม่ระบุช่องทาง = รวมทุกช่องทางของแบรนด์ */
}

/** ยอดขายสะสมเดือนนี้เทียบเป้ารวมของแบรนด์ในขอบเขต */
export function adsSalesVsTarget(cards, monthRange, brands, targets = [], today = null) {
  const asOf = (today ?? monthRange.end).slice(0, 10);
  const month = asOf.slice(0, 7);
  const ids = new Set(brands.map((b) => b.id));
  const scoped = analyticsCards(cards).filter((c) => ids.has(c.brand_id));
  const revenue = adsRevenue(scoped, monthRange);
  const amounts = brands.map((b) => salesTargetOf(b.id, month, targets));
  const target = amounts.some((a) => a == null) || amounts.length === 0
    ? null                                   /* เป้าไม่ครบทุกแบรนด์ = รวมไม่ได้ */
    : amounts.reduce((n, a) => n + a, 0);
  return { revenue, target, pace: budgetPace(revenue ?? 0, target, asOf), complete: revenue != null };
}

/* ---------- ยอดขายรายวัน (สะสม) ---------- */
const dayKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** ยอดขายรายวันในช่วง + ยอดสะสม — ไล่ครบทุกวันแม้วันที่ไม่มียอด (เส้นสะสมต้องไม่ขาด) */
export function adsDailyRevenue(cards, range) {
  const byDay = new Map();
  for (const c of adFactRows(cards, range)) {
    const iso = cardAnchorISO(c);
    if (!iso) continue;
    const k = dayKey(iso);
    byDay.set(k, (byDay.get(k) ?? 0) + (c.metrics?.revenue ?? 0));
  }
  const out = [];
  const end = new Date(range.end);
  let cum = 0;
  for (const d = new Date(range.start); d < end; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d.toISOString());
    const revenue = byDay.get(k) ?? 0;
    cum += revenue;
    out.push({ day: k, revenue, cumulative: cum });
  }
  return out;
}

/* ---------- จังหวะทำยอด (เทียบเป้า + เทียบช่วงก่อน) ----------
   แกนหลักคือ "ได้กี่ % ของที่ควรได้ ณ วันนี้" ไม่ใช่ % ของเป้าทั้งเดือน
   เพราะต้นเดือน % ของเป้าย่อมต่ำเสมอ — ดูแล้วตัดสินใจอะไรไม่ได้ */
export function adsSalesPace(cards, monthRange, brands, targets = [], today = null, prevRange = null) {
  const base = adsSalesVsTarget(cards, monthRange, brands, targets, today);
  const ids = new Set(brands.map((b) => b.id));
  const scoped = analyticsCards(cards).filter((c) => ids.has(c.brand_id));
  const daily = adsDailyRevenue(scoped, monthRange);
  const prevDaily = prevRange ? adsDailyRevenue(scoped, prevRange) : [];
  const days = daily.length;
  const revenue = base.revenue;
  const expectedToDate = base.target == null ? null : base.target * base.pace.expected;
  const prevTotal = prevDaily.length ? prevDaily[prevDaily.length - 1].cumulative : null;
  const prevAtSameDay = prevDaily.length ? (prevDaily[Math.min(days, prevDaily.length) - 1]?.cumulative ?? null) : null;
  return {
    ...base,
    days,
    daily,
    prevDaily,
    avgPerDay: days > 0 && revenue != null ? revenue / days : null,
    expectedToDate,
    /** ได้กี่ % ของที่ควรได้ ณ วันนี้ — ตัวเลขหลักบนเกจ */
    pctOfExpected: share(revenue, expectedToDate),
    /** ช้ากว่าแผนเท่าไร (บวก = ยังขาด) */
    behind: revenue == null || expectedToDate == null ? null : expectedToDate - revenue,
    needPerDay: base.pace.remaining == null || base.pace.daysLeft <= 0
      ? null
      : Math.max(0, base.pace.remaining) / base.pace.daysLeft,
    runRate: base.pace.forecast,
    pctOfMonth: base.pace.used,
    prev: {
      total: prevTotal,
      atSameDay: prevAtSameDay,
      delta: revenue == null || prevAtSameDay == null ? null : revenue - prevAtSameDay,
      changePct: change(revenue, prevTotal),
    },
  };
}

/** ป้ายสถานะจังหวะทำยอด — อิง % ของที่ควรได้วันนี้ (สีคู่กับคำเสมอ) */
export function salesPaceStatus(pctOfExpected) {
  if (pctOfExpected == null) return { text: "ยังประเมินไม่ได้", tone: "zinc" };
  if (pctOfExpected >= 1) return { text: "ตามแผน", tone: "emerald" };
  if (pctOfExpected >= 0.85) return { text: "ใกล้เป้า", tone: "amber" };
  return { text: "ช้ากว่าแผน", tone: "rose" };
}

/* ---------- กราฟจังหวะเดือน (สะสมจริง vs เส้นเป้า/งบ + คาดการณ์) ----------
   ตอบ "หลุดแผนตั้งแต่วันไหน · กำลังไล่ทันหรือถ่างออก · งบจะหมดวันไหน"
   monthRange = ตั้งแต่ต้นเดือนถึงวันนี้ (ข้อมูลจริง) · แกนกราฟลากเต็มเดือนเสมอ */
export function adsCompanyPaceChart(cards, monthRange, today, revTarget = null, budget = null) {
  const asOf = today.slice(0, 10);
  const y = Number(asOf.slice(0, 4)), m = Number(asOf.slice(5, 7)), day = Number(asOf.slice(8, 10));
  const daysInMonth = new Date(y, m, 0).getDate();
  const elapsed = Math.min(Math.max(day, 1), daysInMonth);
  const revDaily = adsDailyRevenue(cards, monthRange);
  const spendDaily = adsDailySeries(cards, monthRange);
  let sc = 0;
  const spendCumRaw = spendDaily.map((d) => (sc += d.spend ?? 0));
  const fill = (raw) => Array.from({ length: daysInMonth }, (_, i) =>
    (i < elapsed ? raw[Math.min(i, raw.length - 1)] ?? 0 : null));
  const revCum = fill(revDaily.map((d) => d.cumulative));
  const spendCum = fill(spendCumRaw);
  /* เส้นคาดการณ์ต่อจากจุดจริงวันนี้ (run-rate เชิงเส้น) — เริ่มที่วันนี้เพื่อให้เส้นต่อกัน */
  const proj = (cum) => {
    const last = cum[elapsed - 1] ?? 0;
    const avg = last / elapsed;
    return Array.from({ length: daysInMonth }, (_, i) =>
      (i < elapsed - 1 ? null : last + avg * (i - (elapsed - 1))));
  };
  const revProj = proj(revCum);
  const spendProj = proj(spendCum);
  const targetLine = revTarget == null ? null
    : Array.from({ length: daysInMonth }, (_, i) => revTarget * ((i + 1) / daysInMonth));
  const budgetLine = budget == null ? null : Array.from({ length: daysInMonth }, () => budget);
  /* วันงบหมด — วันแรกที่สะสมจริง (หรือคาดการณ์) ถึงเพดานงบ */
  let exhaustDay = null;
  if (budget != null && budget > 0) {
    for (let i = 0; i < daysInMonth; i++) {
      const v = i < elapsed ? spendCum[i] : spendProj[i];
      if (v != null && v >= budget) { exhaustDay = i + 1; break; }
    }
  }
  return {
    days: Array.from({ length: daysInMonth }, (_, i) => i + 1),
    daysInMonth, elapsed,
    revCum, spendCum, revProj, spendProj, targetLine, budgetLine, exhaustDay,
  };
}

/* ---------- สัดส่วนค่าแอดตามแบรนด์ (แถบแบ่งสี) ----------
   part-to-whole ≤5 ชิ้น · ตัดแบรนด์ที่ยังไม่ใช้เงิน · เลขจริงอยู่ที่ legend ไม่ใช่ในแถบ */
export function adsSpendShareByBrand(brandRows) {
  const rows = brandRows.filter((r) => r.spend > 0).sort((a, b) => b.spend - a.spend);
  const total = rows.reduce((n, r) => n + r.spend, 0);
  return {
    total,
    rows: rows.map((r) => ({ id: r.id, name: r.name, color: r.color, spend: r.spend, share: share(r.spend, total) })),
  };
}

/* ---------- สรุประดับบริษัท (แถวบนสุด) ----------
   คิดต่อจากแถวของ adsByBrandChannel โดยตรง — เลขหัวกับเลขรายแบรนด์มาจากก้อนเดียวกัน ไม่มีทางเหลื่อม
   เป้า/งบ "รวมไม่ได้" ถ้าบางแบรนด์ยังไม่ตั้ง (รวมเฉพาะที่กรอกแล้วจะทำให้ % เพี้ยน) */
export function adsCompanySummary(brandRows, today) {
  const asOf = today.slice(0, 10);
  const total = (pick) => brandRows.reduce((n, r) => n + (pick(r) ?? 0), 0);
  const allOrNull = (pick) => (brandRows.length > 0 && brandRows.every((r) => pick(r) != null)
    ? brandRows.reduce((n, r) => n + pick(r), 0)
    : null);
  const revenue = brandRows.some((r) => r.revenue == null) ? null : total((r) => r.revenue);
  const spend = total((r) => r.spend);
  const revTarget = allOrNull((r) => r.revTarget);
  const budget = allOrNull((r) => r.budget);
  const prevRevenue = allOrNull((r) => r.prevRevenue);
  const prevSpend = allOrNull((r) => r.prevSpend);
  /* กลุ่มสถานะจังหวะทำยอด — ปัญหาขึ้นก่อน (rose → amber → emerald → zinc) ข้ามกลุ่มว่าง */
  const byTone = new Map();
  for (const r of brandRows) {
    const st = salesPaceStatus(r.revPace?.pctOfExpected ?? null);
    if (!byTone.has(st.tone)) byTone.set(st.tone, { ...st, brands: [] });
    byTone.get(st.tone).brands.push({ id: r.id, name: r.name, color: r.color, logo: r.logo });
  }
  const revPace = budgetPace(revenue, revTarget, asOf); // expectedSpend = ควรได้ ณ วันนี้ · vsPace = นำ/ตามแผนกี่บาท
  return {
    brands: brandRows.length,
    revenue, revTarget,
    revPct: share(revenue, revTarget),
    revPace,
    /* ได้กี่ % ของที่ควรได้ ณ วันนี้ — เลขเดียวกับเกจรายแบรนด์ แต่คิดจากยอดรวม */
    revPctOfExpected: share(revenue, revPace.expectedSpend),
    prevRevenue,
    revChangePct: change(revenue, prevRevenue),
    prevSpend,
    spendChangePct: change(spend, prevSpend),
    spend, budget,
    pace: budgetPace(spend, budget, asOf),
    byStatus: ["rose", "amber", "emerald", "zinc"].map((t) => byTone.get(t)).filter(Boolean),
  };
}

/* ---------- เกณฑ์ตัดสินใจ Scale / Fix / Stop ----------
   ตั้งไว้ที่เดียว ปรับได้เมื่อเกณฑ์ธุรกิจเปลี่ยน — หน้าจอไม่ตัดสินเอง */
export const ACTION_RULES = {
  scaleRoas: 3,          // ROAS ตั้งแต่นี้ = ของดี ควรเติมงบ
  fixRoas: 2,            // ต่ำกว่านี้ = ยังไม่คุ้ม ต้องแก้ก่อนเติมเงิน
  stopRoas: 1,           // ต่ำกว่านี้ = จ่ายมากกว่าที่ได้กลับ ควรหยุด
  wasteSpend: 500,       // ใช้เงินเกินนี้แล้วยังไม่มีผลลัพธ์เลย = หยุด
  highCpl: 500,          // ต้นทุนต่อผลลัพธ์สูงกว่านี้ = ต้องแก้
  fatigueFreq: 2.5,      // คนกลุ่มเดิมเห็นซ้ำเกินนี้ = เริ่มล้า
  fatigueCtrDrop: 0.25,  // CTR ครึ่งหลังตกจากครึ่งแรกเกินนี้ = เริ่มล้า
  fatigueMinImpressions: 1000, // แต่ละครึ่งต้องเห็นอย่างน้อยเท่านี้ CTR ตกถึงนับ — ตัวเลขน้อยแกว่งเกิน 25% ได้เอง (เคยติดธงล้า 24 แคมเปญ)
  fatigueSpendShare: 0.5,      // แคมเปญล้าเมื่อครีเอทีฟที่ล้ากินค่าแอดเกินสัดส่วนนี้ ไม่ใช่ชิ้นเล็กชิ้นเดียว
};

/** ตัดสินว่าควรทำอะไรต่อ — คืนทั้งคำสั่ง เหตุผล และสิ่งที่ควรลงมือ */
export function decideAction(row, rules = ACTION_RULES) {
  const { spend, leads, roas, cpl, fatigue, complete } = row;
  if (!complete) {
    return { action: "ข้อมูลไม่ครบ", tone: "zinc", rank: 2,
      why: "ยังกรอกผลลัพธ์ไม่ครบ", next: "เติมข้อมูลผลลัพธ์ให้ครบก่อน ค่อยตัดสินใจ" };
  }
  if (spend > rules.wasteSpend && leads === 0) {
    return { action: "Stop", tone: "rose", rank: 4,
      why: `ใช้เงินไปแล้ว ${fmtMoney(spend)} ยังไม่ได้ผลลัพธ์เลย`,
      next: "ปิดตัวนี้ แล้วย้ายงบไปตัวที่ยังได้ผล" };
  }
  if (roas != null && roas < rules.stopRoas) {
    return { action: "Stop", tone: "rose", rank: 4,
      why: `ROAS ${fmtNum(roas, 2)}x — ได้กลับน้อยกว่าที่จ่าย`, next: "ปิดก่อน แล้วตรวจว่ากลุ่มเป้าหมายหรือข้อเสนอผิดตรงไหน" };
  }
  if (fatigue) {
    return { action: "Fix", tone: "amber", rank: 3,
      why: "คนกลุ่มเดิมเห็นซ้ำจน CTR ตก", next: "เปลี่ยนชิ้นงานใหม่ หรือขยายกลุ่มเป้าหมาย" };
  }
  if (roas != null && roas < rules.fixRoas) {
    return { action: "Fix", tone: "amber", rank: 3,
      why: `ROAS ${fmtNum(roas, 2)}x — ยังไม่ถึงจุดคุ้ม`, next: "ลองแก้ข้อเสนอหรือหน้าปลายทางก่อนเติมงบ" };
  }
  if (cpl != null && cpl > rules.highCpl) {
    return { action: "Fix", tone: "amber", rank: 3,
      why: `ต้นทุนต่อผลลัพธ์ ${fmtMoney(cpl)} สูงกว่าเกณฑ์`,
      next: "แคบกลุ่มเป้าหมาย หรือเปลี่ยนชิ้นงานให้ตรงคนมากขึ้น" };
  }
  if (roas != null && roas >= rules.scaleRoas) {
    return { action: "Scale", tone: "emerald", rank: 1,
      why: `ROAS ${fmtNum(roas, 2)}x — คุ้มกว่าเกณฑ์`, next: "เติมงบทีละน้อย แล้วดูว่า CPL ยังนิ่งไหม" };
  }
  return { action: "ติดตาม", tone: "zinc", rank: 0, why: "ผลอยู่ในช่วงปกติ", next: "ดูต่ออีก 2–3 วัน ยังไม่ต้องแตะ" };
}

/* ---------- ครีเอทีฟ: ตัวไหนเวิร์ค · ควรทำอะไรต่อ ----------
   จับกลุ่มตามชิ้นงานจริง (แบรนด์ × แพลตฟอร์ม × ครีเอทีฟ) เพราะนั่นคือหน่วยที่ลงมือแก้ได้
   "เริ่มล้า" ดูจากความถี่สูง หรือ CTR ครึ่งหลังตกจากครึ่งแรก */
export function adsCreativeRows(cards, range, brands = [], rules = ACTION_RULES) {
  const names = new Map(brands.map((b) => [b.id, b.name]));
  const mid = new Date((new Date(range.start).getTime() + new Date(range.end).getTime()) / 2).toISOString();
  const acc = new Map();
  for (const c of adFactRows(cards, range)) {
    const asset = creativeAssetOf(c.creative_data ?? c.ad_creative);
    const creative = c.creative ?? asset?.name ?? c.brief?.creative ?? "ไม่ระบุชิ้นงาน";
    const platform = adPlatformOf(c);
    /* ชื่อโฆษณาซ้ำกันได้ จึงยึดโพสต์จริงก่อน แล้วค่อย Meta creative/ad id
       mock เก่าที่ไม่มี id จึงค่อยรวมตามชื่อ */
    const stableId = asset?.storyId
      ? `${asset.connectionId ?? c.connection_id ?? ""}:story:${asset.storyId}`
      : asset?.instagramMediaId
        ? `${asset.connectionId ?? c.connection_id ?? ""}:instagram:${asset.instagramMediaId}`
        : asset?.creativeId
        ? `${asset.connectionId ?? c.connection_id ?? ""}:creative:${asset.creativeId}`
        : (asset?.adId || c.ad_id)
          ? `${asset?.connectionId ?? c.connection_id ?? ""}:ad:${asset?.adId ?? c.ad_id}`
          : `name:${creative}`;
    const key = `${c.brand_id}|${platform}|${stableId}`;
    let row = acc.get(key);
    if (!row) {
      row = {
        key, creative, platform, brandId: c.brand_id, brand: names.get(c.brand_id) ?? c.brand_id,
        campaigns: new Set(), resultEvents: new Set(), resultLabels: new Set(), currencies: new Set(), asset,
        spend: 0, leads: 0, revenue: 0, purchases: undefined, impressions: 0, clicks: 0, reach: 0,
        early: { imp: 0, clk: 0 }, late: { imp: 0, clk: 0 }, complete: true,
      };
      acc.set(key, row);
    }
    if (!row.asset && asset) row.asset = asset;
    const m = c.metrics ?? {};
    if (m.spend == null || m.leads == null || m.revenue == null) row.complete = false;
    row.campaigns.add(c.campaign ?? c.brief?.campaign ?? "ไม่ระบุแคมเปญ");
    if (c.result_event ?? m.result_event) row.resultEvents.add(c.result_event ?? m.result_event);
    if (c.result_label ?? m.result_label) row.resultLabels.add(c.result_label ?? m.result_label);
    if (c.currency) row.currencies.add(c.currency);
    row.spend += m.spend ?? 0;
    row.leads += m.leads ?? 0;
    row.revenue = row.revenue == null || m.revenue == null ? null : row.revenue + m.revenue;
    // การซื้อ: แถวไหนไม่รู้ (บัญชีไม่วัด) ทั้งชิ้น = ไม่รู้ ไม่ใช่ 0 (กติกาเดียวกับยอด)
    row.purchases = row.purchases === null || m.purchases == null ? null : (row.purchases ?? 0) + m.purchases;
    row.impressions += m.impressions ?? 0;
    row.clicks += m.clicks ?? m.link_clicks ?? 0;
    row.reach += m.reach ?? 0;
    const half = (cardAnchorISO(c) ?? "") < mid ? row.early : row.late;
    half.imp += m.impressions ?? 0;
    half.clk += m.clicks ?? m.link_clicks ?? 0;
  }
  return [...acc.values()].map(({ early, late, campaigns, resultEvents, resultLabels, currencies, ...row }) => {
    const ctr = share(row.clicks, row.impressions);
    const ctrEarly = share(early.clk, early.imp), ctrLate = share(late.clk, late.imp);
    const ctrDrop = ctrEarly == null || ctrLate == null || ctrEarly === 0 ? null : (ctrEarly - ctrLate) / ctrEarly;
    const enoughVolume = early.imp >= (rules.fatigueMinImpressions ?? 0) && late.imp >= (rules.fatigueMinImpressions ?? 0);
    /* reach รายวันบวกข้ามวันไม่ได้ในความหมาย unique reach ทั้งช่วง
       อัตรานี้จึงเป็นค่าเฉลี่ยรายวันแบบถ่วงด้วย reach ไม่ใช่ period frequency ของ Meta */
    const frequency = share(row.impressions, row.reach);
    const fatigue = (frequency != null && frequency > rules.fatigueFreq)
      || (enoughVolume && ctrDrop != null && ctrDrop > rules.fatigueCtrDrop);
    const base = {
      ...row,
      campaigns: [...campaigns],
      resultEvents: [...resultEvents], resultLabels: [...resultLabels], currencies: [...currencies],
      resultLabel: resultLabels.size === 1 ? [...resultLabels][0] : resultLabels.size > 1 ? "ผลลัพธ์หลายแบบ" : "ผลลัพธ์",
      currency: currencies.size === 1 ? [...currencies][0] : currencies.size > 1 ? null : "THB",
      ctr, ctrEarly, ctrLate, ctrDrop, frequency, fatigue,
      cpc: share(row.spend, row.clicks),
      cpl: row.leads > 0 ? row.spend / row.leads : null,
      cpa: row.purchases > 0 ? row.spend / row.purchases : null,
      cpm: row.impressions > 0 ? (row.spend / row.impressions) * 1000 : null,
      roas: roasOf(row.revenue, row.spend),
    };
    return { ...base, ...decideAction(base, rules) };
  }).sort((a, b) => b.rank - a.rank || b.spend - a.spend);
}


/* ---------- กระดานตัวชี้วัดและแนวโน้ม ----------
   หนึ่งการ์ดต่อหนึ่งตัวชี้วัดของขอบเขต+ช่วงที่เลือก พร้อม series รายวันไว้วาดเส้น
   กติกา: สรุปไม่ได้ = คืน null พร้อม "เหตุผล" เสมอ — ห้ามเดา ห้ามโชว์เลขที่ซ้ำกับการ์ดอื่น */
export function adsMetricBoard(cards, range, prev = null) {
  const build = (r) => {
    const rows = adFactRows(cards, r);
    const platforms = [...new Set(rows.map(adPlatformOf).filter(Boolean))];
    const resultTypes = [...new Set(platforms.map(resultLabelOf))];
    const plain = (pick) => {
      const total = rows.reduce((n, c) => n + (pick(c.metrics ?? {}) ?? 0), 0);
      return total > 0 ? total : null;
    };
    const spend = completeSum(rows, (c) => c.metrics?.spend);
    const revenue = adsRevenue(rows, r);
    const leads = completeSum(rows, (c) => c.metrics?.leads);
    const impressions = plain((m) => m.impressions);
    const clicks = plain((m) => m.clicks ?? m.link_clicks);
    const reach = plain((m) => m.reach);
    /* คนทัก: นับเฉพาะฟิลด์จริง — fallback เป็นลีดจะได้เลขซ้ำกับการ์ด Leads */
    const realInquiry = rows.filter((c) => (c.metrics?.inquiries ?? c.metrics?.chats) != null);
    const inquiry = realInquiry.length === rows.length && rows.length > 0
      ? realInquiry.reduce((n, c) => n + (c.metrics.inquiries ?? c.metrics.chats), 0)
      : null;
    /* CPR: ผลลัพธ์คนละชนิดรวมกันไม่ได้ · เป็นลีดล้วน = เลขเดียวกับ CPL ไม่โชว์ซ้ำ */
    let cpr = null, cprReason = null;
    if (rows.length === 0) cprReason = "ไม่มีรายการในช่วงนี้";
    else if (resultTypes.length > 1) cprReason = "ผลลัพธ์หลายชนิด (ลีด/ออเดอร์/คอนเวอร์ชัน) รวมกันไม่ได้";
    else if (resultTypes[0] === "ลีด") cprReason = "ผลลัพธ์ตอนนี้คือลีดทั้งหมด — ค่าเดียวกับ CPL";
    else {
      const results = plain((m) => (resultTypes[0] === "ออเดอร์" ? m.orders : m.conversions));
      cpr = share(spend, results);
      if (cpr == null) cprReason = "ข้อมูลผลลัพธ์ยังไม่ครบ";
    }
    const single = platforms.length === 1;
    return {
      rows: rows.length, platforms, single,
      spend, revenue, leads, impressions, clicks, reach, inquiry, cpr, cprReason,
      roas: roasOf(revenue, spend),
      cpl: share(spend, leads),
      ctr: share(clicks, impressions),
      cpc: share(spend, clicks),
      cpm: impressions > 0 && spend != null ? (spend / impressions) * 1000 : null,
      frequency: single ? share(impressions, reach) : null,
    };
  };
  const now = build(range);
  const before = prev ? build(prev) : null;
  const days = adsDailySeries(cards, range);
  const prevDays = prev ? adsDailySeries(cards, prev) : [];
  const line = (field) => days.map((d) => d[field] ?? null);
  const prevLine = (field) => prevDays.map((d) => d[field] ?? null);
  const empty = now.rows === 0 ? "ไม่มีรายการในช่วงนี้" : null;
  const crossPlatform = "คนอาจซ้ำกันข้ามแพลตฟอร์ม — ดูได้เมื่อเลือกช่องทางเดียว";
  const card = (key, label, thai, sense, fmt, value, over = {}) => ({
    key, label, thai, sense, fmt, value,
    before: before?.[key] ?? null,
    series: line(key), prevSeries: prevLine(key),
    reason: null, ...over,
  });
  return [
    card("spend", "Spend", "เงินโฆษณา", "neutral", "money", now.spend,
      { reason: now.spend == null ? empty ?? "ข้อมูลค่าแอดยังไม่ครบทุกใบ" : null }),
    card("roas", "ROAS", "ผลตอบแทนค่าแอด", "higher", "roas", now.roas,
      { reason: now.roas == null ? empty ?? "ข้อมูลรายได้ยังไม่ครบ สรุปผลตอบแทนไม่ได้" : null }),
    card("inquiry", "Inquiry", "คนทัก", "higher", "int", now.inquiry,
      { series: [], prevSeries: [], reason: now.inquiry == null ? empty ?? "ยังไม่เก็บคนทักแยกจากลีด — กันเลขซ้ำกับ Leads" : null }),
    card("leads", "Leads", "ลีดจากแอด", "higher", "int", now.leads,
      { reason: now.leads == null ? empty ?? "ข้อมูลลีดยังไม่ครบทุกใบ" : null }),
    card("cpl", "CPL", "ต้นทุนต่อลีด", "lower", "money", now.cpl,
      { reason: now.cpl == null ? empty ?? "ยังไม่มีลีดในช่วงนี้" : null }),
    card("cpr", "CPR", "ต้นทุนต่อผลลัพธ์", "lower", "money", now.cpr,
      { series: [], prevSeries: [], reason: now.cprReason }),
    card("ctr", "CTR", "อัตราคลิกลิงก์", "higher", "pct2", now.ctr,
      { reason: now.ctr == null ? empty ?? "ไม่มีข้อมูลการแสดงผล/คลิก" : null }),
    card("cpc", "CPC", "ต้นทุนต่อคลิก", "lower", "money", now.cpc,
      { reason: now.cpc == null ? empty ?? "ไม่มีข้อมูลคลิก" : null }),
    card("cpm", "CPM", "ต้นทุนต่อพันครั้งที่เห็น", "lower", "money", now.cpm,
      { reason: now.cpm == null ? empty ?? "ไม่มีข้อมูลการแสดงผล" : null }),
    card("reach", "Reach", "คนเห็นโฆษณา", "neutral", "compact", now.single ? now.reach : null,
      { reason: now.single ? (now.reach == null ? empty ?? "ไม่มีข้อมูล Reach" : null) : crossPlatform }),
    card("frequency", "Frequency", "ความถี่เฉลี่ย", "neutral", "freq", now.frequency,
      { reason: now.frequency == null ? (now.single ? empty ?? "ไม่มีข้อมูล Reach" : crossPlatform) : null }),
    card("impressions", "Impressions", "จำนวนแสดงผล", "neutral", "compact", now.impressions,
      { reason: now.impressions == null ? empty ?? "ไม่มีข้อมูลการแสดงผล" : null }),
    card("clicks", "Clicks", "คลิกลิงก์", "higher", "int", now.clicks,
      { reason: now.clicks == null ? empty ?? "ไม่มีข้อมูลคลิก" : null }),
  ];
}

/* ---------- Sale pipeline (แนวนอน) ----------
   ตัวเลขหลักของเส้นทางขาย + ROAS/%Ads พร้อมค่าช่วงก่อนไว้บอก "ดีขึ้น/แย่ลง"
   ใช้ได้ทั้งระดับขอบเขตและรายแบรนด์ — ส่ง cards ที่กรองแล้วเข้ามา */
export function adsSalePipeline(cards, range, prev = null) {
  const f = adsFunnel(cards, range, prev);
  const ratio = (r) => {
    const rows = adFactRows(cards, r);
    const spend = completeSum(rows, (c) => c.metrics?.spend);
    const revenue = adsRevenue(cards, r);
    return { roas: roasOf(revenue, spend), pctAds: share(spend, revenue) };
  };
  const now = ratio(range);
  const before = prev ? ratio(prev) : { roas: null, pctAds: null };
  /* อัตราแปลงจากขั้นก่อน (ขั้นแรกไม่มี) + ขั้นที่แปลงต่ำสุด = จุดที่หล่นแรงสุดของเส้นทางขาย */
  const stageItems = f.stages.map((st, i) => ({
    key: st.key, label: st.label, value: st.value, before: st.before, sense: "higher", fmt: "int",
    conv: i === 0 ? null : st.rate,
  }));
  const withConv = stageItems.filter((s) => s.conv != null);
  const worstKey = withConv.length ? withConv.reduce((a, b) => (b.conv < a.conv ? b : a)).key : null;
  return {
    estimated: f.estimated,
    worstKey,
    items: [
      ...stageItems,
      { key: "roas", label: "ROAS", value: now.roas, before: before.roas, sense: "higher", fmt: "roas" },
      { key: "pctAds", label: "%Ads", value: now.pctAds, before: before.pctAds, sense: "lower", fmt: "pct1" },
    ],
  };
}
