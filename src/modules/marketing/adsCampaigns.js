/* ============================================================
   adsCampaigns — ตัวเลขของหน้า "แคมเปญ" (pure · มีเทส)
   ต่อยอด adsOverview.js: การ์ดรายวัน (campaign/creative) → แถวแคมเปญต่อ แบรนด์×แพลตฟอร์ม
   งบแคมเปญ = งบแพลตฟอร์ม × สัดส่วน (mock) · ROAS ที่นี่คือ attribution (revenue ของแคมเปญ ÷ spend)
   ============================================================ */
import {
  ACTION_RULES, adFactRows, adPlatformOf, adsCreativeRows, adsDailySeries, fillDailySeries, budgetOf, budgetPace,
  change, decideAction, deliveryOf, normalizeAdPlatform, roasOf, share,
} from "./adsOverview.js";

export const NO_CAMPAIGN = "ไม่ระบุแคมเปญ";
const DAY_MS = 86_400_000;

const campaignOf = (c) => c.campaign ?? c.brief?.campaign ?? NO_CAMPAIGN;

/** ผลรวมดิบของกลุ่มการ์ด — ฟิลด์ผลลัพธ์ขาดใบเดียว = complete:false (ห้ามเดา) */
function rollup(cards) {
  const t = { spend: 0, leads: 0, revenue: 0, impressions: 0, clicks: 0, reach: 0, complete: cards.length > 0 };
  for (const c of cards) {
    const m = c.metrics ?? {};
    if (m.spend == null || m.leads == null || m.revenue == null) t.complete = false;
    t.spend += m.spend ?? 0; t.leads += m.leads ?? 0;
    t.revenue = t.revenue == null || m.revenue == null ? null : t.revenue + m.revenue;   // ไม่รู้แม้ใบเดียว = null ไม่ใช่ ฿0
    t.impressions += m.impressions ?? 0; t.clicks += m.clicks ?? m.link_clicks ?? 0; t.reach += m.reach ?? 0;
  }
  return t;
}

export function campaignRows(cards, range, { brands = [], adBudgets = [], campaignBudgets = [], today, prevRange = null } = {}) {
  const month = today.slice(0, 7);
  /* จังหวะงบต้องคิดจากค่าแอด "เดือนนี้" เสมอ (1 ของเดือน → วันนี้) ไม่ใช่ค่าแอดของช่วงที่เลือกบนจอ
     ไม่งั้นเลือกช่วงสั้น (เช่น 7 วัน) แล้วจังหวะจะเพี้ยนเทียบกับงบเต็มเดือน — เหมือนที่ Overview ทำ */
  const monthRange = { start: new Date(`${month}-01T00:00:00`).toISOString(), end: new Date(new Date(`${today}T00:00:00`).getTime() + DAY_MS).toISOString() };
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
  const monthByKey = new Map();
  for (const c of adFactRows(cards, monthRange)) { const k = groupKey(c); monthByKey.set(k, [...(monthByKey.get(k) ?? []), c]); }
  const scopeSpend = [...groups.values()].reduce((n, g) => n + rollup(g.cards).spend, 0);

  return [...groups.values()].map((g) => {
    const m = rollup(g.cards);
    const meta = campaignBudgets.find((r) => r.brand_id === g.brandId && normalizeAdPlatform(r.channel) === g.platform && r.campaign === g.name && r.month === month) ?? null;
    const platformBudget = budgetOf(g.brandId, g.platform, month, adBudgets);
    const rawBudget = meta && platformBudget != null ? Math.round(platformBudget * meta.share) : null;
    // งบ ≤ 0 (หรือไม่ใช่ตัวเลข) ถือว่าไม่มีงบ — เหมือนไม่มี meta เลย (F9)
    const budget = rawBudget != null && Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : null;
    const monthCards = monthByKey.get(g.key) ?? [];
    const monthSpend = monthCards.length ? rollup(monthCards).spend : null;
    const p = rollup(prevByKey.get(g.key) ?? []);
    const prev = { spend: prevRange ? p.spend : null, leads: prevRange ? p.leads : null, cpl: prevRange ? share(p.spend, p.leads) : null, roas: prevRange ? roasOf(p.revenue, p.spend) : null };
    const daily = adsDailySeries(g.cards, range);
    const cpl = share(m.spend, m.leads), roas = roasOf(m.revenue, m.spend);
    return {
      key: g.key, brandId: g.brandId, brand: g.brand, platform: g.platform, name: g.name,
      objective: meta?.objective ?? null, status: meta?.status ?? "unknown",
      spend: m.spend, spendShare: share(m.spend, scopeSpend), budget, monthSpend, pace: budgetPace(monthSpend, budget, today),
      leads: m.leads, revenue: m.revenue, cpl, roas, pctAds: share(m.spend, m.revenue),
      ...deliveryOf(m),
      complete: m.complete, days: daily.filter((d) => d.spend > 0).length,
      prev, delta: { spend: change(m.spend, prev.spend), leads: change(m.leads, prev.leads), cpl: change(cpl, prev.cpl), roas: change(roas, prev.roas) },
      series: (() => { const full = fillDailySeries(daily, range); return { days: full.map((d) => d.day), spend: full.map((d) => d.spend), leads: full.map((d) => d.leads), cpl: full.map((d) => d.cpl), roas: full.map((d) => d.roas) }; })(),
      creatives: adsCreativeRows(g.cards, range, brands, ACTION_RULES),
    };
  }).sort((a, b) => b.spend - a.spend);
}

/* ---------- ป้ายตัดสินใจ — ต่อจาก decideAction เดิม + เป้าแบรนด์จากหน้าตั้งค่า + Gate งบ ----------
   ลำดับ: รอข้อมูล → หยุด → ตรวจแก้ (ล้า/กฎ/เป้าแบรนด์) → Gate → สเกล → ติดตาม · ทุกป้ายมี why + next */
const MIN_DAYS = 3, MIN_LEADS = 5;
const TAG = {
  wait:  { label: "รอข้อมูล",     tone: "zinc" },
  stop:  { label: "พิจารณาหยุด",  tone: "rose" },
  fix:   { label: "ตรวจแก้",      tone: "amber" },
  gate:  { label: "ติด Gate",     tone: "amber" },
  scale: { label: "พิจารณาสเกล",  tone: "emerald" },
  watch: { label: "ติดตาม",       tone: "zinc" },
};
const tagOf = (tag, why, next) => ({ tag, ...TAG[tag], why, next });

export function campaignDecision(row, targets = null, rules = ACTION_RULES) {
  if (!row.complete) return tagOf("wait", "ข้อมูลผลลัพธ์ยังไม่ครบทุกวัน", "รอ sync/กรอกผลให้ครบก่อนตัดสิน");
  if (row.days < MIN_DAYS) return tagOf("wait", `รันมา ${row.days} วัน (ต้องครบ ${MIN_DAYS} วัน)`, "รอให้ครบวันขั้นต่ำ");
  const wasted = row.spend > rules.wasteSpend && row.leads === 0;
  if (row.leads < MIN_LEADS && !wasted) return tagOf("wait", `ผลลัพธ์ ${row.leads} ยังน้อยกว่า ${MIN_LEADS}`, "รอผลเพิ่มก่อนสรุป");
  const fatigue = (row.creatives ?? []).some((c) => c.fatigue);
  const base = decideAction({ spend: row.spend, leads: row.leads, roas: row.roas, cpl: row.cpl, fatigue, complete: true }, rules);
  if (base.action === "Stop") return tagOf("stop", base.why, base.next);
  if (base.action === "Fix") return tagOf("fix", base.why, base.next);
  /* เป้าแบรนด์จากหน้าตั้งค่า (0 = ยังไม่ตั้ง) — ชนะกฎกลางเมื่อตั้งไว้ */
  if (targets?.cpl > 0 && row.cpl != null && row.cpl > targets.cpl)
    return tagOf("fix", `CPL ${Math.round(row.cpl).toLocaleString("th-TH")} เกินเป้าแบรนด์ ${targets.cpl.toLocaleString("th-TH")}`, "ลดต้นทุนก่อนเติมงบ: กลุ่มเป้าหมาย/ชิ้นงาน/ข้อเสนอ");
  if (targets?.roas > 0 && row.roas != null && row.roas < targets.roas)
    return tagOf("fix", `ROAS ${row.roas.toFixed(1)}x ต่ำกว่าเป้าแบรนด์ ${targets.roas}x`, "แก้ข้อเสนอหรือหน้าปลายทางก่อน");
  if (base.action === "Scale") {
    const p = row.pace ?? {};
    if (p.used != null && (p.remaining <= 0 || p.used > p.expected + 0.1))
      return tagOf("gate", p.remaining <= 0 ? "ผลดีแต่งบแคมเปญหมดแล้ว" : "ผลดีแต่ใช้งบเร็วกว่าจังหวะเดือน", "ขอเพิ่มงบ/โยกงบจากตัวที่ควรหยุดก่อน แล้วค่อยสเกล");
    return tagOf("scale", base.why, base.next);
  }
  return tagOf("watch", base.why, base.next);
}

export const SAVED_VIEWS = [
  { key: "all",           label: "ทั้งหมด",        test: () => true },
  { key: "scale",         label: "ควรสเกล",        test: (r) => r.decision.tag === "scale" },
  { key: "fix",           label: "ต้องตรวจแก้",    test: (r) => r.decision.tag === "fix" },
  { key: "spendNoResult", label: "ใช้เงินไม่มีผล",  test: (r) => r.decision.tag === "stop" && r.leads === 0 },
  { key: "fatigue",       label: "เสี่ยงล้า",       test: (r) => (r.creatives ?? []).some((c) => c.fatigue) },
  { key: "wait",          label: "รอข้อมูล",       test: (r) => r.decision.tag === "wait" },
  { key: "gate",          label: "ติด Gate",       test: (r) => r.decision.tag === "gate" },
];
export const applyView = (rows, key) => rows.filter(SAVED_VIEWS.find((v) => v.key === key)?.test ?? (() => true));

/** ยอดรวมของ "ทุกแถวที่กรอง" — อัตราส่วนคิดจาก Σ · งบ = Σ ของแถวที่มีงบ (ไม่ต้องครบทุกแถว), null เมื่อไม่มีแถวไหนมีงบเลย */
export function campaignTotals(rows) {
  const spend = rows.reduce((n, r) => n + r.spend, 0);
  const leads = rows.reduce((n, r) => n + r.leads, 0);
  const revenue = rows.some((r) => r.revenue == null) ? null : rows.reduce((n, r) => n + r.revenue, 0);
  const budgetRows = rows.filter((r) => r.budget != null);
  const budget = budgetRows.length ? budgetRows.reduce((n, r) => n + r.budget, 0) : null;
  return {
    count: rows.length, spend, budget, budgetRows: budgetRows.length, leads, revenue,
    cpl: share(spend, leads), roas: roasOf(revenue, spend), pctAds: share(spend, revenue),
    reviewSpend: rows.filter((r) => ["fix", "stop"].includes(r.decision?.tag)).reduce((n, r) => n + r.spend, 0),
    waiting: rows.filter((r) => r.decision?.tag === "wait").length,
  };
}

/** ผลรวมค่าแอด/จำนวนแคมเปญ ทั้งรวมและแยกตามแบรนด์ — ย้ายเลขที่เคยบวกในหน้าจอมาไว้ที่นี่ (F8) */
export function campaignsByBrand(rows) {
  const total = { spend: 0, count: 0 };
  const byBrand = {};
  for (const r of rows) {
    total.spend += r.spend;
    total.count += 1;
    const b = byBrand[r.brandId] ?? (byBrand[r.brandId] = { spend: 0, count: 0 });
    b.spend += r.spend;
    b.count += 1;
  }
  return { total, byBrand };
}

/** คิด spendShare ใหม่จาก Σ ค่าแอดของแถวที่ส่งเข้ามาเท่านั้น (เช่นหลังกรองแบรนด์/ค้นหา)
    ให้ % ในตารางรวมกันได้ 100% ของสิ่งที่เห็นจริงบนจอ (F11) */
export function withSpendShare(rows) {
  const total = rows.reduce((n, r) => n + r.spend, 0);
  return rows.map((r) => ({ ...r, spendShare: share(r.spend, total) }));
}

/** เรียงคอลัมน์ — null ท้ายเสมอไม่ว่าทิศไหน */
export function sortCampaigns(rows, key, dir = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return typeof x === "string" ? sign * x.localeCompare(y, "th") : sign * (x - y);
  });
}
