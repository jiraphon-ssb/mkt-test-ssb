/* รายละเอียดบิล 1 ใบ (29 ก.ย.) — "บิลนี้จ่ายค่าอะไรไปบ้าง"
   บิลจ่ายค่าแอดหลายวัน (alloc จาก chargeMatch · ยอดก่อน VAT) → แต่ละวันแบ่งให้โฆษณาตามสัดส่วนค่าแอดของวันนั้น
   วันที่บิลจ่ายแค่บางส่วน (ตัดกลางวัน) ไม่รู้ว่าโฆษณาไหนวิ่งก่อน-หลัง → แบ่งตามสัดส่วนทั้งวัน (ค่าประมาณ ต้องบอกบนหน้าจอ)
   pure · เงินคิดเป็นสตางค์ แบ่งเศษแบบเศษเหลือมากสุด → ผลรวมแคมเปญ = ยอดที่ครอบคลุมพอดี */
import { mediaView } from "../creatives/creativeMedia.js";

const normId = (v) => String(v ?? "").replace(/^act_/, "");
const UNKNOWN = "ไม่ทราบแคมเปญ";

/** แบ่ง totalCents ให้ weights (float) ตามสัดส่วน — ปัดลงแล้วแจกเศษให้ตัวที่เศษเหลือมากสุด */
function splitCents(weights, totalCents) {
  const sum = weights.reduce((n, w) => n + w, 0);
  if (!(sum > 0)) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * totalCents);
  const out = raw.map(Math.floor);
  let left = totalCents - out.reduce((n, v) => n + v, 0);
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i] += 1; left -= 1; } });
  return out;
}

/**
 * item: { accountId, amount (ยอดตัด), net (ก่อน VAT), uncovered, alloc: [{ day, amount }] }
 * cards: แถวค่าแอดรายวันต่อโฆษณา (useAdsData) — กรองบัญชีที่นี่
 */
export function billBreakdown({ item, cards = [] }) {
  const account = normId(item?.accountId);
  const alloc = (item?.alloc ?? []).filter((a) => a.amount > 0);
  const byDay = new Map();
  for (const c of cards) {
    const spend = Number(c?.metrics?.spend);
    if (normId(c?.account_id) !== account || !Number.isFinite(spend) || spend <= 0) continue;
    const day = String(c.fact_date ?? "").slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), c]);
  }

  const days = [];
  const campaigns = new Map();   // name → { weight, ads: Map(key → { weight, ... }) }
  const bucket = (name) => campaigns.get(name) ?? campaigns.set(name, { weight: 0, ads: new Map() }).get(name);
  for (const a of alloc) {
    const rows = byDay.get(a.day) ?? [];
    const daySpend = rows.reduce((n, c) => n + Number(c.metrics.spend), 0);
    days.push({ day: a.day, amount: a.amount, daySpend, whole: daySpend > 0 && a.amount >= daySpend - 0.005 });
    // วันที่บิลจ่ายแต่ไม่มีแถวรายโฆษณา (ข้อมูลรายวันไม่ครบ) — ไม่ทิ้งเงิน รวมไว้ที่ "ไม่ทราบแคมเปญ"
    if (!(daySpend > 0)) { bucket(UNKNOWN).weight += a.amount; continue; }
    const ratio = a.amount / daySpend;
    for (const c of rows) {
      const part = Number(c.metrics.spend) * ratio;
      const camp = bucket(c.campaign || "ไม่ระบุแคมเปญ");
      camp.weight += part;
      const key = c.ad_id || c.creative || "ไม่ระบุโฆษณา";
      const ad = camp.ads.get(key) ?? { key, name: c.creative || c.ad_id || "ไม่ระบุโฆษณา", adSet: c.ad_group ?? null, thumb: null, weight: 0 };
      ad.weight += part;
      ad.thumb ??= mediaView(c.creative_data).items[0]?.src ?? null;
      camp.ads.set(key, ad);
    }
  }

  const coveredC = Math.round(alloc.reduce((n, a) => n + a.amount, 0) * 100);
  const campList = [...campaigns.entries()];
  const campC = splitCents(campList.map(([, v]) => v.weight), coveredC);
  const list = campList.map(([name, v], i) => {
    const ads = [...v.ads.values()];
    const adC = splitCents(ads.map((ad) => ad.weight), campC[i]);
    return {
      name, amount: campC[i] / 100, share: coveredC > 0 ? campC[i] / coveredC : 0,
      ads: ads.map((ad, j) => ({ key: ad.key, name: ad.name, adSet: ad.adSet, thumb: ad.thumb, amount: adC[j] / 100 }))
        .sort((x, y) => y.amount - x.amount),
    };
  }).sort((x, y) => y.amount - x.amount);

  const amountC = Math.round(Number(item?.amount ?? 0) * 100);
  const netC = Math.round(Number(item?.net ?? item?.amount ?? 0) * 100);
  const uncoveredC = Math.round(Number(item?.uncovered ?? 0) * 100);
  /* ส่วนที่จับคู่วันไม่ได้แต่อยู่ในเกณฑ์ปัดเศษ (chargeMatch ไม่ถือเป็นตัดเกิน) — ต้องมีบรรทัดของตัวเอง ไม่งั้นบรรทัดบนหน้าต่างรวมไม่ถึงยอดบิล
     (จริง 29 ก.ย.: JD1 บิล ฿66,400.00 จับคู่ได้ ฿66,249.18 ส่วนต่าง ฿150.82 ไม่มีที่ไป) */
  const unallocatedC = Math.max(0, netC - coveredC - uncoveredC);
  return { days, campaigns: list, covered: coveredC / 100, vat: (amountC - netC) / 100, uncovered: uncoveredC / 100, unallocated: unallocatedC / 100 };
}
