/* รายงานประชุม — เรียงตามคำถามที่ที่ประชุมถาม ใช้ตัวเลขชุดเดียวกับ Overview (buildOverviewModel) · แคมเปญ (buildCampaignsModel) · Creative (adsCreativeRows)
   ไม่มีข้อมูล = null (หน้าจอขึ้น "—" พร้อมเหตุผล) ห้ามแทนด้วย 0 · ทุกตัวเลขเงินแสดง 2 ตำแหน่งแบบตัด (ตัวจัดรูปแบบกลาง) */
import { change } from "../adsOverview.js";
import { fmtInt, fmtMoney, fmtNum, fmtPct } from "../dash/charts/theme.js";

/** ใช้เงินเกินเท่านี้แล้วยังไม่มีการซื้อ = ควรคุย · ต่ำกว่านี้ยังเร็วไปที่จะสรุป */
export const CREATIVE_MIN_SPEND = 1000;

const signed = (n, fmt) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "-" : ""}${fmt(Math.abs(n))}`);
const signedPct = (n) => (n == null ? null : `${n > 0 ? "+" : ""}${fmtNum(n, 2)}%`);
const itemOf = (overview, key) => overview.overallPipeline?.items?.find((item) => item.key === key) ?? null;

/** คำถาม: ยอดขายเป็นยังไง ถึงเป้าไหม สิ้นเดือนจะได้เท่าไร */
export function reportSales(overview) {
  const s = overview.summary ?? {};
  const month = Boolean(overview.monthView);
  return {
    revenue: s.revenue ?? null, prevRevenue: s.prevRevenue ?? null, change: s.revChangePct ?? null,
    target: month ? s.revTarget ?? null : null, pctOfTarget: month ? s.revPct ?? null : null,
    expectedToDate: month ? s.revPace?.expectedSpend ?? null : null,
    forecast: month ? s.revPace?.forecast ?? null : null,
    forecastGap: month ? s.revPace?.forecastOver ?? null : null,
    monthView: month, excluded: s.excludedWaiting ?? [],
  };
}

/** คำถาม: ใช้งบไปเท่าไร คุ้มไหม — ค่าแอด + ROAS %Ads CPL CAC เทียบช่วงก่อนและเป้า */
export function reportEfficiency(overview) {
  const s = overview.summary ?? {};
  const goals = overview.goals?.overall ?? {};
  const goalOf = (key) => (goals[key]?.state === "set" ? { tone: goals[key].tone, text: goals[key].text, target: goals[key].target } : null);
  const rows = [{ key: "spend", label: "ค่าแอด", value: s.spend ?? null, before: s.prevSpend ?? null, change: s.spendChangePct ?? change(s.spend, s.prevSpend), sense: "lower", fmt: "money", goal: null }];
  for (const key of ["roas", "pctAds", "cpl", "cac"]) {
    const item = itemOf(overview, key);
    rows.push({
      key, label: item?.label ?? key.toUpperCase(), value: item?.value ?? null, before: item?.before ?? null,
      change: change(item?.value ?? null, item?.before ?? null), sense: item?.sense ?? "higher", fmt: item?.fmt ?? "money", goal: goalOf(key),
    });
  }
  return rows;
}

/** คำถาม: ลูกค้าหล่นตรงไหน */
export function reportFunnel(overview) {
  const keys = ["inquiries", "qualified", "deposits", "closed"];
  const stages = keys.map((key) => itemOf(overview, key)).filter(Boolean)
    .map((item) => ({ key: item.key, label: item.label, value: item.value ?? null, before: item.before ?? null, change: change(item.value ?? null, item.before ?? null), conv: item.conv ?? null, sub: item.sub ?? null }));
  const at = stages.findIndex((stage) => stage.key === overview.overallPipeline?.worstKey);
  const worst = at > 0 ? { label: stages[at].label, from: stages[at - 1].label, conv: stages[at].conv } : null;
  return { stages, worst };
}

/** คำถาม: อะไรทำให้ตัวเลขเปลี่ยน — ส่วนต่างรายแบรนด์ (ยอดขาย · ค่าแอด) เรียงจากผลกระทบมากสุด */
export function reportDrivers(overview) {
  const brands = overview.brands ?? [];
  const deltas = (pick) => brands
    .map((b) => ({ id: b.id, name: b.name, value: pick(b).now, before: pick(b).before }))
    .filter((r) => r.value != null && r.before != null)
    .map((r) => ({ ...r, delta: r.value - r.before }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const revenue = deltas((b) => ({ now: b.salesSource === "waiting" ? null : b.revenue, before: b.prevRevenue }));
  const spend = deltas((b) => ({ now: b.spend, before: b.prevSpend }));
  const total = (rows) => (rows.length ? rows.reduce((n, r) => n + r.delta, 0) : null);
  return { revenue, spend, revenueTotalDelta: total(revenue), spendTotalDelta: total(spend) };
}

/** คำถาม: แคมเปญไหนต้องทำอะไร */
export function reportCampaigns(rows = []) {
  const counts = {};
  for (const row of rows) { const tag = row.decision?.tag ?? "wait"; counts[tag] = (counts[tag] ?? 0) + 1; }
  const actions = rows.filter((row) => ["stop", "fix"].includes(row.decision?.tag)).sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));
  const movers = rows.filter((row) => row.prev?.spend != null && row.spend != null)
    .map((row) => ({ ...row, delta: row.spend - row.prev.spend }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
  return {
    counts,
    actions: actions.slice(0, 5), actionCount: actions.length,
    actionSpend: actions.reduce((n, row) => n + (row.spend ?? 0), 0),
    topSpend: [...rows].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0)).slice(0, 3),
    movers,
  };
}

/** คำถาม: ครีเอทีฟไหนคุ้ม ไหนเปลือง (การซื้อ = ของ Meta) */
export function reportCreatives(rows = []) {
  const known = rows.filter((row) => row.purchases != null);
  const best = known.filter((row) => row.purchases > 0 && (row.spend ?? 0) >= CREATIVE_MIN_SPEND).sort((a, b) => a.cpa - b.cpa).slice(0, 3);
  const burning = known.filter((row) => row.purchases === 0 && (row.spend ?? 0) >= CREATIVE_MIN_SPEND).sort((a, b) => b.spend - a.spend);
  const tired = rows.filter((row) => row.fatigue);
  return {
    tracksPurchases: known.length > 0,
    best,
    noPurchase: burning.slice(0, 3), noPurchaseCount: burning.length,
    noPurchaseSpend: burning.reduce((n, row) => n + row.spend, 0),
    fatigue: { count: tired.length, spend: tired.reduce((n, row) => n + (row.spend ?? 0), 0) },
  };
}

/** สรุป 1 นาที — ประโยคสั้นๆ ตอบคำถามหลัก · tone: emerald ดี · amber ต้องคุย · rose ต้องตัดสินใจ · zinc ข้อมูลประกอบ */
export function reportHeadline({ sales, efficiency, funnel, drivers, campaigns, creatives, compareLabel }) {
  const lines = [];
  if (sales) {
    const parts = [`ยอดขาย ${fmtMoney(sales.revenue)}${sales.change != null ? ` (${signedPct(sales.change)} เทียบ${compareLabel})` : ""}`];
    if (sales.pctOfTarget != null) parts.push(`ทำได้ ${fmtPct(sales.pctOfTarget)} ของเป้า`);
    if (sales.forecast != null) parts.push(`คาดสิ้นเดือน ${fmtMoney(sales.forecast)}${sales.forecastGap != null ? ` ${sales.forecastGap < 0 ? "ต่ำกว่า" : "เหนือ"}เป้า ${fmtMoney(Math.abs(sales.forecastGap))}` : ""}`);
    const tone = sales.forecastGap != null ? (sales.forecastGap < 0 ? "rose" : "emerald") : sales.change == null ? "zinc" : sales.change < 0 ? "amber" : "emerald";
    lines.push({ key: "sales", tone, text: parts.join(" · ") });
  }
  if (efficiency?.length) {
    const by = Object.fromEntries(efficiency.map((row) => [row.key, row]));
    const goalText = (row) => (row?.goal ? ` (${row.goal.text})` : "");
    const parts = [`ค่าแอด ${fmtMoney(by.spend?.value)}${by.spend?.change != null ? ` (${signedPct(by.spend.change)})` : ""}`];
    if (by.roas?.value != null) parts.push(`ROAS ${fmtNum(by.roas.value, 2)}×${goalText(by.roas)}`);
    if (by.pctAds?.value != null) parts.push(`%Ads ${fmtPct(by.pctAds.value)}${goalText(by.pctAds)}`);
    const tones = efficiency.map((row) => row.goal?.tone).filter(Boolean);
    const tone = tones.includes("rose") || tones.includes("amber") ? "amber" : tones.includes("emerald") ? "emerald" : "zinc";
    lines.push({ key: "spend", tone, text: parts.join(" · ") });
  }
  const top = drivers?.revenue?.[0];
  if (top) lines.push({ key: "driver", tone: "zinc", text: `ยอดขายเปลี่ยนมากสุดจาก ${top.name} (${signed(top.delta, fmtMoney)})` });
  if (funnel?.worst) lines.push({ key: "funnel", tone: "amber", text: `ลูกค้าหล่นมากสุดช่วง ${funnel.worst.from} → ${funnel.worst.label} (ผ่าน ${fmtPct(funnel.worst.conv)})` });
  if (campaigns) {
    const stop = campaigns.counts?.stop ?? 0, fix = campaigns.counts?.fix ?? 0;
    lines.push(stop + fix
      ? { key: "campaigns", tone: stop ? "rose" : "amber", text: `แคมเปญ${[stop ? `ควรพิจารณาหยุด ${fmtInt(stop)}` : null, fix ? `ควรแก้ ${fmtInt(fix)}` : null].filter(Boolean).join(" · ")} (ค่าแอดรวม ${fmtMoney(campaigns.actionSpend)})` }
      : { key: "campaigns", tone: "zinc", text: ["ไม่มีแคมเปญที่ควรหยุดหรือแก้ตามกฎ", ...[["watch", "ติดตาม"], ["wait", "รอข้อมูล"], ["scale", "พิจารณาสเกล"], ["gate", "ติด Gate"]].filter(([tag]) => campaigns.counts?.[tag]).map(([tag, label]) => `${label} ${fmtInt(campaigns.counts[tag])}`)].join(" · ") });
  }
  if (creatives) {
    const parts = [];
    if (creatives.tracksPurchases && creatives.noPurchase?.length) parts.push(`ครีเอทีฟใช้เงินเกิน ฿${fmtInt(CREATIVE_MIN_SPEND)} แต่ยังไม่มีการซื้อ ${fmtInt(creatives.noPurchaseCount ?? creatives.noPurchase.length)} ชิ้น (${fmtMoney(creatives.noPurchaseSpend)})`);
    if (creatives.fatigue?.count) parts.push(`เริ่มล้า ${fmtInt(creatives.fatigue.count)} ชิ้น`);
    if (parts.length) lines.push({ key: "creatives", tone: "amber", text: parts.join(" · ") });
  }
  return lines;
}
