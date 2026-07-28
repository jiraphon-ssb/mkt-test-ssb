/* ============================================================
 Analytics — aggregation ทุกมิติสำหรับหน้า Dashboard
 pure function ทั้งไฟล์ · ฉีด nowClock ได้แบบ rules.ts · มีเทส
 ฐานข้อมูล: cards(metrics/brief) + status_history — ไม่แตะ localStorage เอง
 ============================================================ */
import { startOfWeekMon, addWeeks, addDays } from "../../foundation/utils/dates.js";
import { CONTENT_STAGES } from "./mktEngine.js";
import { brandAverageER, engagementRate, isAdsCard, isAlbum, nowISO, resultLabel,
  channelRuns, normalizeRunMetrics, channelKindOf } from "./mktRules.js";
/* ---------- ฐานการ์ด ---------- */
/** การ์ด phantom (id ขึ้นต้น hist_) มีไว้ให้ first-pass คำนวณได้เท่านั้น
  ไม่มี metrics/ประวัติจริง — ทุก aggregate ต้องตัดทิ้ง ไม่งั้นตัวเลขเพี้ยน */
export function isPhantomCard(c) {
  return c.id.startsWith("hist");
}
export function analyticsCards(cards) {
  return cards.filter((c) => !isPhantomCard(c));
}
const TH_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** n สัปดาห์ล่าสุด เรียงเก่า→ใหม่ สัปดาห์เริ่มวันจันทร์ (ตรงกับปฏิทินในแอพ)
  สัปดาห์สุดท้าย = สัปดาห์ที่ nowClock อยู่ */
export function lastNWeeks(n, nowClock = nowISO()) {
  const thisMonday = startOfWeekMon(nowClock);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = addWeeks(thisMonday, -i);
    const end = addWeeks(start, 1);
    out.push({
      start: start.toISOString(),
      end: end.toISOString(),
      label: `${start.getDate()} ${TH_MONTH_SHORT[start.getMonth()]}`,
    });
  }
  return out;
}
/** n สัปดาห์ที่ "จบแล้ว" — ไม่รวมสัปดาห์ปัจจุบันที่ยังวิ่งอยู่
  ใช้กับรายงาน/กราฟ: งานที่เพิ่งโพสต์สัปดาห์นี้ยังวัดผลไม่ได้ (SOP รอ 7 วัน)
  ถ้าเอาสัปดาห์ปัจจุบันมาด้วย แท่งสุดท้ายจะร่วงเป็นศูนย์ทุกครั้งจนดูเหมือนผลตก */
export function lastCompletedWeeks(n, nowClock = nowISO()) {
  return lastNWeeks(n + 1, nowClock).slice(0, n);
}
/** ช่วงทั้งหมดที่ buckets ครอบ (ใช้เป็น range หลักของหน้า) */
export function weeksRange(weeks) {
  return { start: weeks[0].start, end: weeks[weeks.length - 1].end };
}
/** ช่วงก่อนหน้าที่ยาวเท่ากัน — ใช้ทำ delta เทียบ */
export function previousRange(r) {
  const span = new Date(r.end).getTime() - new Date(r.start).getTime();
  return {
    start: new Date(new Date(r.start).getTime() - span).toISOString(),
    end: r.start,
  };
}
export function inRange(iso, r) {
  if (!iso)
    return false;
  const t = new Date(iso).getTime();
  return t >= new Date(r.start).getTime() && t < new Date(r.end).getTime();
}
/** จุดเวลาที่ใช้ bucket การ์ดในมิติเวลา — วันโพสต์จริง; งาน ads ไม่มีวันโพสต์ ใช้วันวัดผล */
export function cardAnchorISO(c) {
  return c.brief.publish_at ?? c.metrics?.measured_at ?? null;
}
/** การ์ดที่ "วัดผลแล้ว" (มี metrics ครบพอคำนวณ ER) และ anchor อยู่ในช่วง */
export function measuredInRange(cards, r) {
  return analyticsCards(cards).filter((c) => engagementRate(c.metrics) != null && inRange(cardAnchorISO(c), r));
}
export function kpiSummary(cards, r) {
  const done = measuredInRange(cards, r);
  let reach = 0, engagement = 0, leads = 0, spend = 0, adsLeads = 0;
  for (const c of done) {
    const m = c.metrics;
    reach += m.reach ?? 0;
    engagement += m.engagement ?? 0;
    leads += m.leads ?? 0;
    if (isAdsCard(c) && m.spend != null) {
      spend += m.spend;
      adsLeads += m.leads ?? 0;
    }
  }
  return {
    produced: done.length,
    reach, engagement, leads, spend,
    er: reach > 0 ? engagement / reach : null,
    cpl: spend > 0 && adsLeads > 0 ? spend / adsLeads : null,
  };
}
/** % เปลี่ยนแปลงเทียบช่วงก่อน — ฐานเป็น 0/ไม่มีข้อมูล = null (ไม่โชว์ delta หลอกๆ) */
export function pctDelta(cur, prev) {
  if (cur == null || prev == null || prev === 0)
    return null;
  return (cur - prev) / prev;
}
export function weeklySeries(cards, weeks) {
  return weeks.map((week) => {
    const k = kpiSummary(cards, week);
    return { week, produced: k.produced, reach: k.reach, engagement: k.engagement, leads: k.leads, er: k.er, spend: k.spend };
  });
}
/** trend แยกกลุ่ม (เช่น ER รายสัปดาห์ต่อ brand) — groupOf คืน null = ไม่นับ */
export function weeklySeriesBy(cards, weeks, groupOf) {
  const groups = new Map();
  for (const c of analyticsCards(cards)) {
    const g = groupOf(c);
    if (g == null)
      continue;
    if (!groups.has(g))
      groups.set(g, []);
    groups.get(g).push(c);
  }
  const out = new Map();
  for (const [g, gc] of groups)
    out.set(g, weeklySeries(gc, weeks));
  return out;
}
/**
* สรุปตัวเลขต่อค่าในมิติที่เลือก จากการ์ดวัดผลแล้วในช่วง
* - channel: การ์ดหลายช่องทางนับให้ทุกช่อง → ยอดรวมข้าม channel มากกว่ายอดจริง (ระบุใน UI ด้วย)
* - allCards ใช้คำนวณ brandAverageER สำหรับป้ายผล (ฐานทั้งระบบ ไม่ใช่แค่ในช่วง)
*/
/**
 * รวมตัวเลขตามมิติที่เลือก
 * @param {any[]} cards
 * @param {any[]} allCards
 * @param {"brand"|"pillar"|"channel"|"owner"|"kind"} dim
 * @param {any} r
 * @param {any[]} [channels]  ตั้งค่าช่องทาง — จำเป็นเฉพาะ dim "channel" (รู้ชนิดเพื่อแปลงตัวเลข)
 */
export function rollupBy(cards, allCards, dim, r, channels = []) {
  const done = measuredInRange(cards, r);
  /* มิติ "ช่องทาง" ต้องอ่านตัวเลขรายช่องทางจริง
     เดิมวน brief.channels แล้วบวก "ยอดรวมทั้งใบ" เข้าไปทุกช่องทาง — การ์ดที่ลง 3 ช่องทาง
     ถูกนับ reach ซ้ำ 3 รอบ ตารางช่องทางจึงเฟ้อมาตลอด */
  if (dim === "channel") return rollupByChannel(done, allCards, channels);
  const keysOf = (c) => {
    switch (dim) {
      case "brand": return [c.brand_id];
      case "pillar": return c.pillar ? [c.pillar] : [];
      case "channel": return c.brief.channels;
      case "owner": return [c.owner_id];
      /* ชนิดชิ้นงาน — คิดจาก brief ไม่ได้เก็บเป็นคอลัมน์ (ตรงกับ kindOf ของหน้างาน) */
      case "kind": return [c.brief.format === "video" ? "video" : isAlbum(c.brief) ? "album" : "single"];
    }
  };
  const acc = new Map();
  for (const c of done) {
    const m = c.metrics;
    const label = resultLabel(c, brandAverageER(allCards, c.brand_id, c.id));
    for (const key of keysOf(c)) {
      let row = acc.get(key);
      if (!row) {
        row = { key, n: 0, reach: 0, engagement: 0, leads: 0, er: null, spend: 0, cpl: null, labels: { green: 0, yellow: 0, red: 0 } };
        acc.set(key, row);
      }
      row.n += 1;
      row.reach += m.reach ?? 0;
      row.engagement += m.engagement ?? 0;
      row.leads += m.leads ?? 0;
      if (isAdsCard(c) && m.spend != null)
        row.spend += m.spend;
      if (label)
        row.labels[label] += 1;
    }
  }
  for (const row of acc.values()) {
    row.er = row.reach > 0 ? row.engagement / row.reach : null;
    row.cpl = row.spend > 0 && row.leads > 0 ? row.spend / row.leads : null;
  }
  // เรียงงานเยอะ→น้อย ให้อ่านง่าย
  return [...acc.values()].sort((a, b) => b.n - a.n);
}
/** รวมตัวเลขรายช่องทางจริง — หนึ่งการ์ดกระจายตามที่แต่ละช่องทางทำได้ ไม่ใช่ยอดรวมทั้งใบ */
function rollupByChannel(done, allCards, channels) {
  const acc = new Map();
  for (const c of done) {
    const label = resultLabel(c, brandAverageER(allCards, c.brand_id, c.id));
    const runs = channelRuns(c);
    /* งานเก่าที่บันทึกไว้ก่อนแยกรายช่องทาง (backfill ย้อนหลัง) มีแต่ยอดรวม
       → เฉลี่ยเท่ากันทุกช่องทาง ดีกว่าทิ้งข้อมูลทั้งก้อน และยังไม่นับซ้ำ */
    const noRunData = runs.every((r) => {
      const v = normalizeRunMetrics(r, channelKindOf(channels, r.channel));
      return v.reach == null && v.engagement == null && v.leads == null;
    });
    const share = noRunData && runs.length > 0 ? 1 / runs.length : 0;
    for (const run of runs) {
      const v = share > 0
        ? {
          reach: c.metrics?.reach == null ? null : c.metrics.reach * share,
          engagement: c.metrics?.engagement == null ? null : c.metrics.engagement * share,
          leads: c.metrics?.leads == null ? null : c.metrics.leads * share,
          spend: c.metrics?.spend == null ? null : c.metrics.spend * share,
        }
        : normalizeRunMetrics(run, channelKindOf(channels, run.channel));
      if (v.reach == null && v.engagement == null && v.leads == null)
        continue;                                   /* ช่องทางที่ยังไม่กรอก ไม่นับเป็นชิ้นงานที่วัดแล้ว */
      let row = acc.get(run.channel);
      if (!row) {
        row = { key: run.channel, n: 0, reach: 0, engagement: 0, leads: 0, er: null, spend: 0, cpl: null, labels: { green: 0, yellow: 0, red: 0 } };
        acc.set(run.channel, row);
      }
      row.n += 1;
      row.reach += v.reach ?? 0;
      row.engagement += v.engagement ?? 0;
      row.leads += v.leads ?? 0;
      if (isAdsCard(c) && v.spend != null) row.spend += v.spend;
      if (label) row.labels[label] += 1;
    }
  }
  for (const row of acc.values()) {
    row.er = row.reach > 0 ? row.engagement / row.reach : null;
    row.cpl = row.spend > 0 && row.leads > 0 ? row.spend / row.leads : null;
  }
  return [...acc.values()].sort((a, b) => b.n - a.n);
}

const median = (xs) => {
  if (xs.length === 0)
    return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
/** ลำดับ history ต่อการ์ด (ข้าม record from===to = audit ปิดงาน ไม่ใช่การย้ายขั้น) */
function movesByCard(cards, history) {
  const ids = new Set(analyticsCards(cards).map((c) => c.id));
  const by = new Map();
  for (const h of history) {
    if (!ids.has(h.card_id))
      continue;
    if (h.from_status === h.to_status)
      continue; // archive audit
    if (!by.has(h.card_id))
      by.set(h.card_id, []);
    by.get(h.card_id).push(h);
  }
  for (const list of by.values()) {
    list.sort((a, b) => new Date(a.moved_at).getTime() - new Date(b.moved_at).getTime());
  }
  return by;
}
export function stageFlows(cards, history, r) {
  const by = movesByCard(cards, history);
  const entered = new Map();
  const durations = new Map();
  for (const list of by.values()) {
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (!inRange(h.moved_at, r))
        continue;
      if (!entered.has(h.to_status))
        entered.set(h.to_status, new Set());
      entered.get(h.to_status).add(h.card_id);
      const next = list[i + 1];
      if (next) {
        const days = (new Date(next.moved_at).getTime() - new Date(h.moved_at).getTime()) / 86_400_000;
        if (!durations.has(h.to_status))
          durations.set(h.to_status, []);
        durations.get(h.to_status).push(days);
      }
    }
  }
  return CONTENT_STAGES.map((s) => {
    const ds = durations.get(s.id) ?? [];
    return {
      status: s.id,
      entered: entered.get(s.id)?.size ?? 0,
      avgDays: ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null,
      medianDays: median(ds),
    };
  });
}
/** เวลาทั้งวงจร: record แรกของการ์ด → เข้าขั้น published
  การ์ดโดนตีกลับแล้ววนใหม่ นับเวลาจริงรวมรอบวน */
export function ideaToPublishedCycle(cards, history, r) {
  const by = movesByCard(cards, history);
  const cycles = [];
  for (const list of by.values()) {
    const pub = list.find((h) => h.to_status === "published");
    if (!pub || !inRange(pub.moved_at, r))
      continue;
    const first = list[0];
    cycles.push((new Date(pub.moved_at).getTime() - new Date(first.moved_at).getTime()) / 86_400_000);
  }
  return {
    n: cycles.length,
    avgDays: cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null,
    medianDays: median(cycles),
  };
}
/* ---------- Heatmap วัน×เวลาโพสต์ ---------- */
/** slot 2 ชั่วโมง 08:00–22:00 = 7 ช่อง (local time — ตรงกับปฏิทินในแอพ) */
export const HEAT_SLOTS = 7;
export const HEAT_START_HOUR = 8;
export function publishHeatmap(cards, r) {
  const acc = new Map();
  for (const c of measuredInRange(cards, r)) {
    if (!c.brief.publish_at)
      continue;
    const d = new Date(c.brief.publish_at);
    const dow = (d.getDay() + 6) % 7; // Date.getDay(): 0=อาทิตย์ → แปลงเป็น 0=จันทร์
    const slot = Math.floor((d.getHours() - HEAT_START_HOUR) / 2);
    if (slot < 0 || slot >= HEAT_SLOTS)
      continue;
    const key = `${dow}:${slot}`;
    if (!acc.has(key))
      acc.set(key, { n: 0, er: [] });
    const cell = acc.get(key);
    cell.n += 1;
    const er = engagementRate(c.metrics);
    if (er != null)
      cell.er.push(er);
  }
  const out = [];
  for (const [key, v] of acc) {
    const [dow, slot] = key.split(":").map(Number);
    out.push({
      dow, slot, n: v.n,
      avgER: v.er.length ? v.er.reduce((a, b) => a + b, 0) / v.er.length : null,
    });
  }
  return out;
}
export function adsRollup(cards, r) {
  const rows = analyticsCards(cards)
    .filter((c) => isAdsCard(c) && c.metrics?.spend != null && inRange(cardAnchorISO(c), r))
    .map((c) => {
    const spend = c.metrics.spend;
    const leads = c.metrics.leads ?? 0;
    return { card: c, spend, leads, cpl: leads > 0 ? spend / leads : null };
  })
    .sort((a, b) => b.spend - a.spend);
  const spend = rows.reduce((a, x) => a + x.spend, 0);
  const leads = rows.reduce((a, x) => a + x.leads, 0);
  return { spend, leads, cpl: spend > 0 && leads > 0 ? spend / leads : null, rows };
}
/* ---------- util วันที่สำหรับเทส/seed ---------- */
export { addDays };

/* ============================================================
 สูตรที่เวิร์ค — กลุ่ม แบรนด์×pillar×ชนิด ที่ ER เฉลี่ยชนะค่าเฉลี่ยแบรนด์ตัวเอง
 เกณฑ์: อย่างน้อย 3 งานที่วัดผลแล้ว (น้อยกว่านั้นถือว่าฟลุก) และชนะ ≥5%
 ใช้ทั้งหน้าคลังและ Dashboard — สูตรต้องออกมาตรงกันเสมอ
 ============================================================ */
export function topFormulas(closedCards, limit = 3) {
  const er = (m) => (m && m.reach > 0 && m.engagement != null ? m.engagement / m.reach : null);
  const kindOf = (b) => (b.format === "video" ? "video" : isAlbum(b) ? "album" : "single");
  const brandAgg = new Map(), groupAgg = new Map();
  for (const c of closedCards) {
    const e = er(c.metrics);
    if (e == null) continue;
    const b = brandAgg.get(c.brand_id) ?? { sum: 0, n: 0 };
    b.sum += e; b.n += 1; brandAgg.set(c.brand_id, b);
    if (!c.pillar) continue;
    const key = `${c.brand_id}|${c.pillar}|${kindOf(c.brief)}`;
    const g = groupAgg.get(key) ?? { sum: 0, n: 0 };
    g.sum += e; g.n += 1; groupAgg.set(key, g);
  }
  const out = [];
  for (const [key, g] of groupAgg) {
    if (g.n < 3) continue;
    const [brand_id, pillar, kind] = key.split("|");
    const base = brandAgg.get(brand_id);
    const brandAvg = base.sum / base.n;
    const avg = g.sum / g.n;
    if (brandAvg > 0 && avg / brandAvg >= 1.05)
      out.push({ brand_id, pillar, kind, n: g.n, er: avg, ratio: avg / brandAvg });
  }
  return out.sort((a, b) => b.ratio - a.ratio).slice(0, limit);
}
