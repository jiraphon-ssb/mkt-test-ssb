/* ============================================================
   adsCampaigns — ตัวเลขของหน้า "แคมเปญ" (pure · มีเทส)
   ต่อยอด adsOverview.js: การ์ดรายวัน (campaign/creative) → แถวแคมเปญต่อ แบรนด์×แพลตฟอร์ม
   งบแคมเปญ = งบแพลตฟอร์ม × สัดส่วน (mock) · ROAS ที่นี่คือ attribution (revenue ของแคมเปญ ÷ spend)
   ============================================================ */
import { fmtNum, fmtMoney, fmtPct, trunc2 } from "./dash/charts/theme.js";
import { DECISION_LABEL, FATIGUE_LABEL } from "./ads/glossary.js";
import {
  ACTION_RULES, adFactRows, adPlatformOf, adsCreativeRows, brandCplIndex, cplKey, adsDailySeries, fillDailySeries, budgetOf, budgetPace,
  change, decideAction, deliveryOf, normalizeAdPlatform, roasOf, share,
} from "./adsOverview.js";

export const NO_CAMPAIGN = "ไม่ระบุแคมเปญ";
const DAY_MS = 86_400_000;

const campaignOf = (c) => c.campaign ?? c.brief?.campaign ?? NO_CAMPAIGN;
/** คีย์แคมเปญเดียวกับแถว campaignRows (แบรนด์ × แพลตฟอร์ม × ชื่อ) — ใช้กรองการ์ดของแคมเปญที่ผ่านตัวกรองไปทำมุมกลุ่มเป้าหมาย */
export const campaignKeyOf = (c) => `${c.brand_id}|${adPlatformOf(c)}|${campaignOf(c)}`;

/** ผลรวมดิบของกลุ่มการ์ด — ค่าแอดหรือผลลัพธ์ขาดใบเดียว = complete:false (ห้ามเดา)
    รายได้ไม่รู้ไม่นับว่าไม่ครบ (ตรวจรอบละเอียด 26 ก.ย.): บัญชีที่ไม่วัดมูลค่าการซื้อ/มุมยอดใหม่ ทำให้ทุกแคมเปญ "รอข้อมูล" ถาวร
    รายได้ไม่รู้แค่ทำให้ ROAS เป็น null */
function rollup(cards) {
  const t = { spend: 0, leads: 0, revenue: 0, impressions: 0, clicks: 0, linkClicks: null, linkImpressions: 0, linkSpend: 0, reach: 0, complete: cards.length > 0 };
  for (const c of cards) {
    const m = c.metrics ?? {};
    if (m.spend == null || m.leads == null) t.complete = false;
    t.spend += m.spend ?? 0; t.leads += m.leads ?? 0;
    t.revenue = t.revenue == null || m.revenue == null ? null : t.revenue + m.revenue;   // ไม่รู้แม้ใบเดียว = null ไม่ใช่ ฿0
    t.impressions += m.impressions ?? 0; t.clicks += m.clicks ?? m.link_clicks ?? 0; t.reach += m.reach ?? 0;
    /* ไม่มีเลย = null (ห้ามเดาจากคลิกทั้งหมด) · ตัวหารนับเฉพาะวันที่มีข้อมูลคลิกลิงก์ (ชุด A ข้อ 15 — ข้อมูลเก่าไม่มีช่องนี้) */
    if (m.link_clicks != null) { t.linkClicks = (t.linkClicks ?? 0) + m.link_clicks; t.linkImpressions += m.impressions ?? 0; t.linkSpend += m.spend ?? 0; }
  }
  return t;
}

export function campaignRows(cards, range, { brands = [], adBudgets = [], campaignBudgets = [], today, prevRange = null, roasFromMeta = true, dataThrough = null } = {}) {
  const brandCpl = brandCplIndex(cards, range);   // ค่าเฉลี่ยแบรนด์ชุดเดียวทั้งระบบ (ตรวจรอบละเอียด 26 ก.ย.)
  const month = today.slice(0, 7);
  /* จังหวะงบต้องคิดจากค่าแอด "เดือนนี้" เสมอ (1 ของเดือน → วันนี้) ไม่ใช่ค่าแอดของช่วงที่เลือกบนจอ
     ไม่งั้นเลือกช่วงสั้น (เช่น 7 วัน) แล้วจังหวะจะเพี้ยนเทียบกับงบเต็มเดือน — เหมือนที่ Overview ทำ */
  const monthRange = { start: new Date(`${month}-01T00:00:00`).toISOString(), end: new Date(new Date(`${today}T00:00:00`).getTime() + DAY_MS).toISOString() };
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const groups = new Map();
  const groupKey = campaignKeyOf;
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

  const rows = [...groups.values()].map((g) => {
    const m = rollup(g.cards);
    const meta = campaignBudgets.find((r) => r.brand_id === g.brandId && normalizeAdPlatform(r.channel) === g.platform && r.campaign === g.name && r.month === month) ?? null;
    const platformBudget = budgetOf(g.brandId, g.platform, month, adBudgets);
    const rawBudget = meta && platformBudget != null ? platformBudget * meta.share : null;   // ไม่ปัด — เงินแสดงทศนิยมตามจริง
    // งบ ≤ 0 (หรือไม่ใช่ตัวเลข) ถือว่าไม่มีงบ — เหมือนไม่มี meta เลย (F9)
    const budget = rawBudget != null && Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : null;
    const monthCards = monthByKey.get(g.key) ?? [];
    const monthSpend = monthCards.length ? rollup(monthCards).spend : null;
    const p = rollup(prevByKey.get(g.key) ?? []);
    const prev = { spend: prevRange ? p.spend : null, leads: prevRange ? p.leads : null, cpl: prevRange ? share(p.spend, p.leads) : null, roas: prevRange ? roasOf(p.revenue, p.spend) : null,
      frequency: prevRange ? share(p.impressions, p.reach) : null };
    const daily = adsDailySeries(g.cards, range);
    /* ROAS: Meta ไม่เห็นยอด (รายได้ 0/ไม่รู้) = null ไม่ใช่ 0.00x — กติกาเดียวกับครีเอทีฟ (สเปก 2026-09-26) */
    const cpl = share(m.spend, m.leads), roas = m.revenue > 0 ? roasOf(m.revenue, m.spend) : null;
    const delivery = deliveryOf(m);
    return {
      key: g.key, brandId: g.brandId, brand: g.brand, platform: g.platform, name: g.name,
      objective: meta?.objective ?? null, status: meta?.status ?? "unknown",
      spend: m.spend, spendShare: share(m.spend, scopeSpend), budget, monthSpend, pace: budgetPace(monthSpend, budget, today),
      leads: m.leads, revenue: m.revenue, cpl, roas, pctAds: share(m.spend, m.revenue),
      ...delivery, linkClicks: m.linkClicks, linkCtr: share(m.linkClicks, m.linkImpressions), linkCpc: share(m.linkSpend, m.linkClicks),
      complete: m.complete, days: daily.filter((d) => d.spend > 0).length, lastSpendDay: lastSpendOf(daily),
      prev, delta: { spend: change(m.spend, prev.spend), leads: change(m.leads, prev.leads), cpl: change(cpl, prev.cpl), roas: change(roas, prev.roas), frequency: change(delivery.frequency, prev.frequency) },
      series: (() => { const full = fillDailySeries(daily, range); return { days: full.map((d) => d.day), spend: full.map((d) => d.spend), leads: full.map((d) => d.leads), cpl: full.map((d) => d.cpl), roas: full.map((d) => (d.revenue > 0 ? d.roas : null)) }; })()   /* Meta ไม่เห็นยอด = ไม่มีจุด ตรงกับหัวที่ขึ้น "—" (ทดสอบละเอียด 27 ก.ย.) */,
      creatives: adsCreativeRows(g.cards, range, brands, ACTION_RULES, { roasFromMeta, brandCpl }),   // เทียบเฉลี่ยแบรนด์ ไม่ใช่เฉพาะแคมเปญนี้
    };
  }).sort((a, b) => b.spend - a.spend);
  /* CPL เทียบค่าเฉลี่ยแบรนด์ (ก่อนค้นหา/กรองในหน้า) · แคมเปญที่ไม่รู้ผลลัพธ์ครบ = ไม่มีอัตราเทียบ (ห้ามเดา) */
  return withIdleDays(rows, lastSpendIndex(cards, campaignKeyOf), dataThrough).map((r) => {
    const avg = brandCpl.get(cplKey(r.brandId, r.platform)) ?? null;
    return { ...r, brandCpl: avg, cplRatio: r.complete && r.cpl != null && avg ? r.cpl / avg : null };
  });
}

/* ---------- ป้ายตัดสินใจ — ต่อจาก decideAction เดิม + เป้าแบรนด์จากหน้าตั้งค่า + Gate งบ ----------
   ลำดับ: รอข้อมูล → หยุด → ตรวจแก้ (ล้า/กฎ/เป้าแบรนด์) → Gate → สเกล → ติดตาม · ทุกป้ายมี why + next */
const MIN_DAYS = 3, MIN_LEADS = 5;
const TONE = { wait: "zinc", stop: "rose", fix: "amber", gate: "amber", scale: "emerald", watch: "zinc", good: "emerald", idle: "zinc", sells: "zinc" };
const TAG = Object.fromEntries(Object.entries(TONE).map(([tag, tone]) => [tag, { label: DECISION_LABEL[tag], tone }]));   // คำจาก glossary กลาง (ชุด C)
const tagOf = (tag, why, next, basis) => ({ tag, ...TAG[tag], why, next, ...(basis ? { basis } : {}) });
const CPL_HIGH = 1.5, CPL_LOW = 0.8;
/* ทดสอบแบบใช้งานจริง 27 ก.ย. (อาร์ต "แก้เลยตามนี้"): แพงกว่าเฉลี่ยตั้งแต่ 2.5 เท่า = ควรหยุด ไม่ใช่แค่ควรแก้
   CTR ลิงก์ต่ำกว่า 1% = คนเห็นแต่ไม่คลิก → ปัญหาอยู่ที่ชิ้นงาน/ข้อความ · ไม่มีค่าแอด 3 วันล่าสุด = หยุดใช้เงินแล้ว */
const CPL_STOP = 2.5, LOW_LINK_CTR = 0.01, IDLE_DAYS = 3;
const shortDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

/** วันล่าสุดที่มีค่าแอด (null = ไม่มีเลย) */
function lastSpendOf(daily) {
  const days = daily.filter((d) => d.spend > 0).map((d) => d.day).sort();
  return days.length ? days[days.length - 1] : null;
}
/* "หยุดใช้เงินแล้ว" = สถานะตอนนี้ (ตรวจรอบ 27 ก.ย. ดึก): วันใช้เงินล่าสุดดูทุกวันที่มีข้อมูล ไม่ใช่เฉพาะช่วงที่เลือก
   (ดูเดือนก่อน: แคมเปญที่กลับมาใช้เงินแล้วไม่นับว่าหยุด) และเทียบกับวันล่าสุดที่มีค่าแอดทั้งระบบ (dataThrough)
   ไม่ใช่เฉพาะแถวที่กรองอยู่ (กรองเหลือแบรนด์ที่หยุดทั้งบัญชี = เดิมไม่มีใครขึ้นป้าย) */
const ALL_TIME = { start: "1970-01-01T00:00:00.000Z", end: "2100-01-01T00:00:00.000Z" };
function lastSpendIndex(cards, keyOf) {
  const byKey = new Map();
  for (const c of adFactRows(cards, ALL_TIME)) {
    if (!((c.metrics?.spend ?? 0) > 0)) continue;
    const k = keyOf(c);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(c);
  }
  return new Map([...byKey].map(([k, list]) => [k, lastSpendOf(adsDailySeries(list, ALL_TIME))]));
}
/** วันล่าสุดที่มีค่าแอดในการ์ดทั้งหมด (ส่งการ์ดทั้งระบบ ไม่ใช่ที่กรองแล้ว) — ใช้เป็น dataThrough ของ campaignRows/audienceRows */
export const latestSpendDay = (cards) => [...lastSpendIndex(cards, () => "all").values()][0] ?? null;
/** idleDays = จำนวนวันจากค่าแอดล่าสุดของแถว ถึงวันล่าสุดที่มีค่าแอด (ข้อมูลดึงวันละครั้ง — เทียบกับวันที่ข้อมูลมีจริง ไม่ใช่วันนี้) */
function withIdleDays(rows, lastByKey = new Map(), dataThrough = null) {
  const withLast = rows.map((r) => ({ ...r, lastSpendDay: lastByKey.get(r.key) ?? r.lastSpendDay }));
  const through = dataThrough ?? ([...lastByKey.values(), ...withLast.map((r) => r.lastSpendDay)].filter(Boolean).sort().pop() ?? null);
  return withLast.map((r) => ({ ...r, idleDays: through && r.lastSpendDay ? Math.max(0, Math.round((Date.parse(through) - Date.parse(r.lastSpendDay)) / DAY_MS)) : null }));
}
/** ควรแก้อะไร — ดูจากสาเหตุ: เห็นซ้ำมาก → เปลี่ยนชิ้นงาน · ไม่ค่อยคลิก → ปรับชิ้นงาน/ข้อความ · ยังคลิกดี → ปรับกลุ่มเป้าหมาย */
function fixNext(row, rules = ACTION_RULES) {
  if (row.frequency != null && row.frequency >= rules.fatigueFreq) return `เปลี่ยนชิ้นงาน — คนกลุ่มเดิมเห็นซ้ำเฉลี่ย ${fmtNum(row.frequency, 2)} ครั้ง`;
  if (row.linkCtr == null) return "ปรับกลุ่มเป้าหมายหรือชิ้นงาน";
  if (row.linkCtr < LOW_LINK_CTR) return `ปรับชิ้นงาน/ข้อความ — CTR ลิงก์ ${fmtPct(row.linkCtr)} คนเห็นแต่ไม่ค่อยคลิก`;
  return "ปรับกลุ่มเป้าหมาย — ชิ้นงานยังมีคนคลิก แต่ได้ผลลัพธ์แพง";
}
/* ตรวจรอบ 27 ก.ย. ดึก: แคมเปญ retarget ที่ Meta เห็นยอดขาย ROAS 3.06× ขึ้น "ควรหยุด" เพราะ CPL แพง
   → ข้อมูลจริง: Meta เห็นยอดขายและ ROAS ถึงจุดคุ้ม (fixRoas) = ห้ามตัดสินหยุด/แก้จาก CPL อย่างเดียว */
const metaSells = (row, rules) => row.roas != null && row.roas >= rules.fixRoas;
const sellsTag = (row, costWhy) => tagOf("sells", `${costWhy} แต่ Meta เห็นยอดขาย ROAS ${fmtNum(row.roas, 2)}×`,
  "อย่าเพิ่งปิด — เทียบยอดขายจริงของแบรนด์ในหน้าภาพรวมก่อน แล้วค่อยลดต้นทุน");
/** ป้ายแพงกว่าเฉลี่ย: ≥ 2.5 เท่า ควรหยุด · 1.5–2.5 เท่า ควรแก้ตามสาเหตุ (ใช้ทั้งแคมเปญและกลุ่มเป้าหมาย) · ขายได้ = แพงแต่ขายได้ */
function costlyTag(row, avg, ratio, stopNext, rules) {
  const why = `CPL ${fmtMoney(row.cpl)} แพงกว่าเฉลี่ยแบรนด์ ${fmtMoney(avg)} อยู่ ${fmtPct(ratio - 1)}`;
  if (metaSells(row, rules)) return sellsTag(row, why);
  return ratio >= CPL_STOP ? tagOf("stop", why, stopNext, "average") : tagOf("fix", why, fixNext(row, rules), "average");
}
/** แถวที่ไม่มีค่าแอด 3 วันล่าสุด: ป้ายควรแก้/ควรหยุดไม่มีความหมายแล้ว → บอกว่าหยุดใช้เงินแล้ว พร้อมเหตุผลเดิมไว้ตัดสินตอนจะเปิดใหม่ */
function idleAware(row, d) {
  if (!(row.idleDays >= IDLE_DAYS) || !["fix", "stop", "sells"].includes(d.tag)) return d;
  // แพงแต่ขายได้ที่ปิดไปแล้ว: "อย่าเพิ่งปิด" ใช้ไม่ได้ — บอกว่าขายได้ไว้ตัดสินตอนจะเปิดใหม่ (ตรวจรอบ 27 ก.ย. ดึก)
  const next = d.tag === "sells" ? "ตัวนี้ Meta เห็นยอดขาย — เทียบยอดขายจริงของแบรนด์ก่อนตัดสิน" : d.next;
  return tagOf("idle", `ใช้เงินล่าสุด ${shortDay(row.lastSpendDay)} · ก่อนหยุด ${d.why}`, `ถ้าจะเปิดใหม่: ${next}`);
}
/** ตัด 2 ตำแหน่งแบบเดียวกับ fmtNum (ล้างเศษ float ก่อน) — ใช้ตัดสินเพดานให้ตรงกับตัวเลขบนจอ */
// trunc2 ใช้ตัวกลางใน theme.js (ค่าเดียวกับที่ fmtNum แสดง)

/* roasFromMeta = false (ข้อมูลจริง): ROAS รายแคมเปญเป็นยอดที่ Meta เห็น ซึ่งแคมเปญทักแชทแทบเป็นศูนย์ (CPL ฿40–90 แต่ ROAS 0.1x)
   ใช้ตัดสินจะขึ้น "พิจารณาหยุด" กับแคมเปญที่ได้คนทักถูกที่สุด → ไม่ใช้ ROAS เลยทั้งทางหยุด/แก้/สเกล
   ยอดขายจริงมาถึงแค่ระดับแบรนด์ จึงยังไม่แนะนำสเกลจากแคมเปญ (คนทักถูก ≠ ขายได้) */
export function campaignDecision(row, targets = null, rules = ACTION_RULES, opts = {}) {
  return idleAware(row, decideCampaign(row, targets, rules, opts));
}
function decideCampaign(row, targets, rules, { roasFromMeta = true } = {}) {
  if (!row.complete) return tagOf("wait", "ข้อมูลผลลัพธ์ยังไม่ครบทุกวัน", "รอ sync/กรอกผลให้ครบก่อนตัดสิน");
  if (row.days < MIN_DAYS) return tagOf("wait", `รันมา ${row.days} วัน (ต้องครบ ${MIN_DAYS} วัน)`, "รอให้ครบวันขั้นต่ำ");
  const wasted = row.spend > rules.wasteSpend && row.leads === 0;
  if (row.leads < MIN_LEADS && !wasted) return tagOf("wait", `ผลลัพธ์ ${row.leads} ยังน้อยกว่า ${MIN_LEADS}`, "รอผลเพิ่มก่อนสรุป");
  /* ล้าทั้งแคมเปญ = ครีเอทีฟที่ล้ากินค่าแอดเกินครึ่ง (ไม่มีค่าแอดรายชิ้น = นับตามจำนวนชิ้น) */
  const creatives = row.creatives ?? [];
  const creativeSpend = creatives.reduce((n, c) => n + (c.spend ?? 0), 0);
  const fatigueShare = creatives.length === 0 ? 0 : creativeSpend > 0
    ? creatives.filter((c) => c.fatigue).reduce((n, c) => n + (c.spend ?? 0), 0) / creativeSpend
    : creatives.filter((c) => c.fatigue).length / creatives.length;
  const fatigue = fatigueShare > (rules.fatigueSpendShare ?? 0.5);
  const roas = roasFromMeta ? row.roas : null;
  const base = decideAction({ spend: row.spend, leads: row.leads, roas, cpl: row.cpl, fatigue, complete: true }, rules);
  if (base.action === "Stop") return tagOf("stop", base.why, base.next);
  /* ต้นทุนเกินเกณฑ์ ฿500 (ไม่ใช่ล้า) แต่ขายได้ = แพงแต่ขายได้ · ล้ายังเป็นควรแก้ เพราะปัญหาอยู่ที่ชิ้นงาน */
  if (base.action === "Fix" && !fatigue && !roasFromMeta && metaSells(row, rules)) return sellsTag(row, base.why);
  if (base.action === "Fix") return tagOf("fix", fatigue && base.why.includes("เห็นซ้ำ") ? `ครีเอทีฟที่เริ่มล้า (ความถี่สูง/CTR ตก) กินค่าแอด ${fmtPct(fatigueShare)} ของแคมเปญ` : base.why, base.next);
  /* เป้าแบรนด์จากหน้าตั้งค่า (0 = ยังไม่ตั้ง) — ชนะกฎกลางเมื่อตั้งไว้ */
  // เทียบที่ความละเอียดเดียวกับที่แสดง (ตัด 2 ตำแหน่ง) — เดิม ฿50.006 ขึ้น "฿50.00 เกินเป้าแบรนด์ ฿50.00" (ทดสอบละเอียดรอบ 2)
  if (targets?.cpl > 0 && row.cpl != null && trunc2(row.cpl) > targets.cpl && !roasFromMeta && metaSells(row, rules))
    return sellsTag(row, `CPL ${fmtMoney(row.cpl)} เกินเป้าแบรนด์ ${fmtMoney(targets.cpl)}`);
  if (targets?.cpl > 0 && row.cpl != null && trunc2(row.cpl) > targets.cpl)
    return tagOf("fix", `CPL ${fmtMoney(row.cpl)} เกินเป้าแบรนด์ ${fmtMoney(targets.cpl)}`, fixNext(row, rules));
  if (roasFromMeta && targets?.roas > 0 && row.roas != null && trunc2(row.roas) < targets.roas)
    return tagOf("fix", `ROAS ${fmtNum(row.roas, 2)}× ต่ำกว่าเป้าแบรนด์ ${fmtNum(targets.roas, 2)}×`, "แก้ข้อเสนอหรือหน้าปลายทางก่อน");
  /* เทียบค่าเฉลี่ยแบรนด์เมื่อยังไม่ตั้งเป้า CPL · ข้อมูลจริง: เป้าที่ส่งมาคือเพดานจากระบบขาย (เช็กไปแล้วด้านบน) ไม่ใช่เป้า จึงยังเทียบค่าเฉลี่ยต่อ */
  const avgRule = (!roasFromMeta || !(targets?.cpl > 0)) && row.cplRatio != null && row.brandCpl != null;
  if (avgRule && row.cplRatio >= CPL_HIGH) return costlyTag(roasFromMeta ? { ...row, roas: null } : row, row.brandCpl, row.cplRatio, "ปิดแคมเปญนี้ แล้วย้ายงบไปแคมเปญที่ CPL ต่ำกว่า", rules);
  if (base.action === "Scale") {
    const p = row.pace ?? {};
    if (p.used != null && (p.remaining <= 0 || p.used > p.expected + 0.1))
      return tagOf("gate", p.remaining <= 0 ? "ผลดีแต่งบแคมเปญหมดแล้ว" : "ผลดีแต่ใช้งบเร็วกว่าจังหวะเดือน", "ขอเพิ่มงบ/โยกงบจากตัวที่ควรหยุดก่อน แล้วค่อยสเกล");
    return tagOf("scale", base.why, base.next);
  }
  if (avgRule && row.cplRatio <= CPL_LOW)
    return tagOf("good", `CPL ${fmtMoney(row.cpl)} ถูกกว่าเฉลี่ยแบรนด์ ${fmtMoney(row.brandCpl)} อยู่ ${fmtPct(1 - row.cplRatio)}`, "ดูยอดขายของแบรนด์ในหน้าภาพรวม ประกอบก่อนเติมงบ", "average");
  if (!roasFromMeta) return tagOf("watch", "CPL อยู่ในเกณฑ์ · ยังไม่มียอดขายรายแคมเปญ จึงยังไม่แนะนำสเกล", "ดูยอดขายของแบรนด์ในหน้าภาพรวม ประกอบก่อนเติมงบ");
  return tagOf("watch", base.why, base.next);
}

/* ---------- กลุ่มเป้าหมาย (สเปก 2026-09-26 campaign-page-audience) ----------
   ข้อมูลจริง: แทบทุกแคมเปญมีชุดโฆษณาชุดเดียว แต่ชื่อชุด (= กลุ่มเป้าหมาย) ถูกใช้ซ้ำข้ามแคมเปญ
   → รวมการ์ดรายวันตาม แบรนด์ × แพลตฟอร์ม × ad_group เพื่อตอบว่า "กลุ่มไหนได้คนทักถูก" · แคมเปญหลายชุด = แบ่งตามชุดจริง */
export const NO_ADSET = "ไม่ระบุชุดโฆษณา";
const audienceKeyOf = (c) => `${c.brand_id}|${adPlatformOf(c)}|${c.ad_group || NO_ADSET}`;
export function audienceRows(cards, range, { brands = [], brandCpl = null, dataThrough = null } = {}, rules = ACTION_RULES) {
  const avgIndex = brandCpl ?? brandCplIndex(cards, range);   // หน้าแคมเปญส่งค่าเฉลี่ยจากขอบเขตเต็ม — ไม่ขยับตามคำค้น/ตัวกรองสถานะ
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const groups = new Map();
  for (const c of adFactRows(cards, range)) {
    const name = c.ad_group || NO_ADSET;
    const key = audienceKeyOf(c);
    if (!groups.has(key)) groups.set(key, { key, brandId: c.brand_id, brand: brandName.get(c.brand_id) ?? c.brand_id, platform: adPlatformOf(c), name, cards: [], byCampaign: new Map() });
    const g = groups.get(key);
    g.cards.push(c);
    const camp = campaignOf(c);
    g.byCampaign.set(camp, [...(g.byCampaign.get(camp) ?? []), c]);
  }
  const total = [...groups.values()].reduce((n, g) => n + rollup(g.cards).spend, 0);
  /* ไม่มีค่าแอดในช่วงนี้ = ไม่ขึ้น (ผลลัพธ์ตกค้างที่ไม่ได้จ่ายเงินทำให้ CPL ฿0.00 หลอกตา — เห็นจริง 26 ก.ย.) */
  const rows = [...groups.values()].filter((g) => rollup(g.cards).spend > 0).map((g) => {
    const m = rollup(g.cards);
    return {
      key: g.key, brandId: g.brandId, brand: g.brand, platform: g.platform, name: g.name,
      spend: m.spend, leads: m.leads, cpl: share(m.spend, m.leads), roas: m.revenue > 0 ? roasOf(m.revenue, m.spend) : null, impressions: m.impressions, reach: m.reach,
      linkClicks: m.linkClicks, linkCtr: share(m.linkClicks, m.linkImpressions), frequency: share(m.impressions, m.reach),
      spendShare: share(m.spend, total), complete: m.complete, ...(() => { const daily = adsDailySeries(g.cards, range); return { days: daily.filter((d) => d.spend > 0).length, lastSpendDay: lastSpendOf(daily) }; })(),
      campaigns: [...g.byCampaign].map(([name, list]) => { const t = rollup(list); return { name, spend: t.spend, leads: t.leads, cpl: share(t.spend, t.leads) }; })
        .sort((a, b) => b.spend - a.spend),
    };
  });
  /* คำแนะนำ: เกณฑ์เดียวกับแคมเปญ (CPL เทียบเฉลี่ยแบรนด์) · ไม่รู้ผลลัพธ์ = รอข้อมูล (ห้ามเดาเป็น 0 แล้วบอกให้หยุด)
     ผลลัพธ์น้อยยังไม่สรุป · ใช้เงินแล้วไม่มีผลจริง = พิจารณาหยุด */
  return withIdleDays(rows, lastSpendIndex(cards, audienceKeyOf), dataThrough).map((r) => {
    const brandCpl = avgIndex.get(cplKey(r.brandId, r.platform)) ?? null;
    const cplRatio = r.complete && r.cpl != null && brandCpl > 0 ? r.cpl / brandCpl : null;   // ไม่มีค่าเฉลี่ย = ไม่เทียบ
    let decision;
    if (!r.complete) decision = tagOf("wait", "ข้อมูลผลลัพธ์ยังไม่ครบทุกวัน", "รอ sync ให้ครบก่อนตัดสิน");
    // ลำดับเดียวกับ campaignDecision: วันขั้นต่ำก่อน แล้วค่อยดูใช้เงินไม่มีผล (ทดสอบละเอียดรอบ 2)
    else if (r.days < MIN_DAYS) decision = tagOf("wait", `รันมา ${r.days} วัน (ต้องครบ ${MIN_DAYS} วัน)`, "รอให้ครบวันขั้นต่ำ");
    else if (r.leads === 0 && r.spend > rules.wasteSpend) decision = tagOf("stop", `ใช้เงินไปแล้ว ${fmtMoney(r.spend)} ยังไม่ได้ผลลัพธ์`, "หยุดกลุ่มนี้ แล้วย้ายงบไปกลุ่มที่ได้ผล");
    else if (r.leads < MIN_LEADS) decision = tagOf("wait", `ผลลัพธ์ ${r.leads} ยังน้อยกว่า ${MIN_LEADS}`, "รอผลเพิ่มก่อนสรุป");
    else if (cplRatio != null && cplRatio >= CPL_HIGH) decision = costlyTag(r, brandCpl, cplRatio, "ปิดกลุ่มนี้ แล้วย้ายงบไปกลุ่มที่ CPL ต่ำกว่า", rules);
    else if (cplRatio != null && cplRatio <= CPL_LOW) decision = tagOf("good", `CPL ${fmtMoney(r.cpl)} ถูกกว่าเฉลี่ยแบรนด์ ${fmtMoney(brandCpl)} อยู่ ${fmtPct(1 - cplRatio)}`, "ลองเพิ่มงบให้กลุ่มนี้ในแคมเปญที่ CPL ดีสุด · ดูยอดขายแบรนด์ประกอบ", "average");
    else decision = tagOf("watch", cplRatio == null ? "ยังไม่มีค่าเฉลี่ยแบรนด์ให้เทียบ" : "CPL ใกล้ค่าเฉลี่ยแบรนด์", "ดูต่อ");
    return { ...r, brandCpl, cplRatio, decision: idleAware(r, decision) };
  }).sort((a, b) => b.spend - a.spend);
}

/* ชื่อตัวกรองชุดเดียวกับการ์ด "วันนี้ต้องดู" ด้านบน (รีวิว UX 25 ก.ย.: เดิมการ์ดเขียน "เพิ่มงบได้ 12" แต่ชิปเขียน "ควรสเกล 12"
   กลุ่มเดียวกันสองชื่อ คนอ่านนึกว่าเป็นคนละเรื่อง) */
export const SAVED_VIEWS = [
  { key: "all",           label: "ทั้งหมด",        test: () => true },
  { key: "stop",          label: DECISION_LABEL.stop,  test: (r) => r.decision.tag === "stop" },
  { key: "fix",           label: DECISION_LABEL.fix,   test: (r) => r.decision.tag === "fix" },
  { key: "scale",         label: DECISION_LABEL.scale, test: (r) => r.decision.tag === "scale" },
  { key: "fatigue",       label: FATIGUE_LABEL,        test: (r) => (r.creatives ?? []).some((c) => c.fatigue) },
  { key: "good",          label: DECISION_LABEL.good,  test: (r) => r.decision.tag === "good" },
  { key: "wait",          label: DECISION_LABEL.wait,  test: (r) => r.decision.tag === "wait" },
  { key: "gate",          label: DECISION_LABEL.gate,  test: (r) => r.decision.tag === "gate" },
  { key: "sells",         label: DECISION_LABEL.sells, test: (r) => r.decision.tag === "sells" },
  { key: "idle",          label: DECISION_LABEL.idle,  test: (r) => r.decision.tag === "idle" },
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

/** แถวที่ลิงก์ ?open=<ชื่อแคมเปญ> ขอให้เปิด — ไม่เจอ = null (เงียบ ไม่ error) · ลิงก์มาจากหน้าต่างครีเอทีฟ (สเปก 2026-09-25) */
export const openKeyFor = (rows = [], name = "") => (name ? rows.find((row) => row.name === name)?.key ?? null : null);
