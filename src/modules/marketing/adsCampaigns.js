/* ============================================================
   adsCampaigns — ตัวเลขของหน้า "แคมเปญ" (pure · มีเทส)
   ต่อยอด adsOverview.js: การ์ดรายวัน (campaign/creative) → แถวแคมเปญต่อ แบรนด์×แพลตฟอร์ม
   งบแคมเปญ = งบแพลตฟอร์ม × สัดส่วน (mock) · ROAS ที่นี่คือ attribution (revenue ของแคมเปญ ÷ spend)
   ============================================================ */
import {
  ACTION_RULES, adFactRows, adPlatformOf, adsCreativeRows, adsDailySeries, budgetOf, budgetPace,
  change, deliveryOf, roasOf, share,
} from "./adsOverview.js";

export const NO_CAMPAIGN = "ไม่ระบุแคมเปญ";

const campaignOf = (c) => c.campaign ?? c.brief?.campaign ?? NO_CAMPAIGN;

/** ผลรวมดิบของกลุ่มการ์ด — ฟิลด์ผลลัพธ์ขาดใบเดียว = complete:false (ห้ามเดา) */
function rollup(cards) {
  const t = { spend: 0, leads: 0, revenue: 0, impressions: 0, clicks: 0, reach: 0, complete: cards.length > 0 };
  for (const c of cards) {
    const m = c.metrics ?? {};
    if (m.spend == null || m.leads == null || m.revenue == null) t.complete = false;
    t.spend += m.spend ?? 0; t.leads += m.leads ?? 0; t.revenue += m.revenue ?? 0;
    t.impressions += m.impressions ?? 0; t.clicks += m.clicks ?? m.link_clicks ?? 0; t.reach += m.reach ?? 0;
  }
  return t;
}

export function campaignRows(cards, range, { brands = [], adBudgets = [], campaignBudgets = [], today, prevRange = null } = {}) {
  const month = today.slice(0, 7);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const groups = new Map();
  const groupKey = (c) => `${c.brand_id}|${adPlatformOf(c)}|${campaignOf(c)}`;
  for (const c of adFactRows(cards, range)) {
    const key = groupKey(c);
    if (!groups.has(key)) groups.set(key, { key, brandId: c.brand_id, brand: brandName.get(c.brand_id) ?? c.brand_id, platform: adPlatformOf(c), name: campaignOf(c), cards: [] });
    groups.get(key).cards.push(c);
  }
  const prevByKey = new Map();
  if (prevRange) for (const c of adFactRows(cards, prevRange)) { const k = groupKey(c); prevByKey.set(k, [...(prevByKey.get(k) ?? []), c]); }
  const scopeSpend = [...groups.values()].reduce((n, g) => n + rollup(g.cards).spend, 0);

  return [...groups.values()].map((g) => {
    const m = rollup(g.cards);
    const meta = campaignBudgets.find((r) => r.brand_id === g.brandId && r.channel === g.platform && r.campaign === g.name && r.month === month) ?? null;
    const platformBudget = budgetOf(g.brandId, g.platform, month, adBudgets);
    const budget = meta && platformBudget != null ? Math.round(platformBudget * meta.share) : null;
    const p = rollup(prevByKey.get(g.key) ?? []);
    const prev = { spend: prevRange ? p.spend : null, leads: prevRange ? p.leads : null, cpl: prevRange ? share(p.spend, p.leads) : null, roas: prevRange ? roasOf(p.revenue, p.spend) : null };
    const daily = adsDailySeries(g.cards, range);
    const cpl = share(m.spend, m.leads), roas = roasOf(m.revenue, m.spend);
    return {
      key: g.key, brandId: g.brandId, brand: g.brand, platform: g.platform, name: g.name,
      objective: meta?.objective ?? null, status: meta?.status ?? "unknown",
      spend: m.spend, spendShare: share(m.spend, scopeSpend), budget, pace: budgetPace(m.spend, budget, today),
      leads: m.leads, revenue: m.revenue, cpl, roas, pctAds: share(m.spend, m.revenue),
      ...deliveryOf(m),
      complete: m.complete, days: daily.filter((d) => d.spend > 0).length,
      prev, delta: { spend: change(m.spend, prev.spend), leads: change(m.leads, prev.leads), cpl: change(cpl, prev.cpl), roas: change(roas, prev.roas) },
      series: { days: daily.map((d) => d.day), spend: daily.map((d) => d.spend), leads: daily.map((d) => d.leads), cpl: daily.map((d) => d.cpl), roas: daily.map((d) => d.roas) },
      creatives: adsCreativeRows(g.cards, range, brands, ACTION_RULES),
    };
  }).sort((a, b) => b.spend - a.spend);
}
