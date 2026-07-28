/* AR read-model — pure compute over Sale OEM rows. Lives in foundation/data so
   the math sits in the data layer (กฎเหล็ก #2), NOT in React. No Supabase / no
   React imports → unit-testable. `today` is injected (ISO 'YYYY-MM-DD') so the
   forecast/aging are deterministic.

   AR never recognizes revenue (done at OEM). It only tracks cash not-yet-in:
     outstanding = order_total − Σ payments (design_deposit excluded — mirrors
     saleEngine.paidToOrder; foundation can't import a module, so it's re-stated).
   Spec: SSB_AR_Spec2.md §2 (expected receipt date) · §3 (outstanding) · §5.4 (aging). */

// AR-eligible work stages (แกน A canonical, Re-model เฟส 7 — เดิมอ่าน legacy stage
// first_payment/ready_to_ship/shipped ซึ่งถูกลบทิ้งแล้ว).
export const AR_MAIN_STAGES = ["production", "delivery", "done"];

export const AGING_BUCKETS = [
  { key: "0-30", label: "0–30 วัน", min: 0, max: 30 },
  { key: "31-60", label: "31–60 วัน", min: 31, max: 60 },
  { key: "61-90", label: "61–90 วัน", min: 61, max: 90 },
  { key: "90+", label: "เกิน 90 วัน", min: 91, max: Infinity },
];

// ---- date helpers (ISO 'YYYY-MM-DD' in/out) --------------------------------
// Parse + format in UTC so date math never shifts by the machine's timezone
// (the app runs in UTC+7; a local parse + toISOString would slip a day).
function addDays(iso, n) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + (Number(n) || 0));
  return d.toISOString().slice(0, 10);
}
function daysBetween(fromIso, toIso) {  // toIso − fromIso, in whole days
  if (!fromIso || !toIso) return null;
  return Math.round((new Date(toIso + "T00:00:00Z") - new Date(fromIso + "T00:00:00Z")) / 86400000);
}

// ---- per-deal compute ------------------------------------------------------
/* CANONICAL receipt math (Re-model แกน B — สูตรเดียว คำนวณที่เดียว, mirror ของ
   vw_pl_revenue/0047). Consumed by both AR and the OEM module (saleEngine
   re-exports this — modules may import foundation, not the reverse).
     received = Σ payment (ไม่ void)
              + Σ มัดจำ disposition='deduct' (ไม่ void)
              − Σ refund ที่อ้าง (void_of) งวดชำระ (ไม่ void)
   refund ที่อ้างมัดจำ = คืน liability — ไม่แตะ AR. */
export function receiptsToOrder(receipts = []) {
  const byId = new Map(receipts.map((r) => [r.id, r]));
  return receipts.reduce((sum, r) => {
    if (r.voided_by) return sum;
    const amt = Number(r.amount) || 0;
    if (r.receipt_type === "payment") return sum + amt;
    if ((r.receipt_type === "design_deposit" || r.receipt_type === "sample_deposit")
        && r.deposit_disposition === "deduct") return sum + amt;
    if (r.receipt_type === "refund") {
      const ref = r.void_of ? byId.get(r.void_of) : null;
      if (ref && ref.receipt_type === "payment") return sum - amt;
    }
    return sum;
  }, 0);
}
// paid toward the order — legacy name kept for AR callers
export function arPaid(payments = []) {
  return receiptsToOrder(payments);
}
export function arOutstanding(deal) {
  return (Number(deal.order_total) || 0) - arPaid(deal.payments);
}

// §2 — expected receipt date (heart of the forecast). normal + credit feed the
// SAME timeline, only the date rule differs.
export function expectedReceipt(deal) {
  const cd = Number(deal.credit_days) || 0;
  if (deal.pay_terms === "credit") {
    const base = deal.delivery_date || deal.job_due_date; // shipped→confirmed, else planned
    return base ? addDays(base, cd) : null;
  }
  // normal: collected before shipping → planned due (or the ship date if already shipped & owing)
  return deal.delivery_date || deal.job_due_date || null;
}

// §5.4 — aging (credit only, from the real ship date)
export function agingDays(deal, today) {
  if (deal.pay_terms !== "credit" || !deal.delivery_date) return null;
  return daysBetween(deal.delivery_date, today);
}
export function agingBucketKey(days) {
  if (days == null) return null;
  return (AGING_BUCKETS.find((b) => days >= b.min && days <= b.max) ?? AGING_BUCKETS[AGING_BUCKETS.length - 1]).key;
}

// overdue flag: still owing past the point it should have been collected.
// normal = shipped-but-owing, or planned due already passed (the §6.1 red flag);
// credit = past its expected (delivery + credit_days).
export function isOverdue(deal, today, expected) {
  if (arOutstanding(deal) <= 0) return false;
  const exp = expected ?? expectedReceipt(deal);
  if (deal.pay_terms === "credit") return exp != null && exp < today;
  if (deal.delivery_date) return true;                 // normal, shipped, still owing
  return exp != null && exp < today;                   // normal, planned due passed
}

// enrich one row with all AR figures (the shape the UI consumes)
export function enrichArDeal(deal, today) {
  const outstanding = arOutstanding(deal);
  const expected = expectedReceipt(deal);
  const ageD = agingDays(deal, today);
  return {
    ...deal,
    paid: arPaid(deal.payments),
    outstanding,
    terms: deal.pay_terms === "credit" ? "credit" : "normal",
    expected_date: expected,
    is_forecast: !deal.delivery_date,                  // not shipped yet → still a projection
    aging_days: ageD,
    aging_bucket: deal.pay_terms === "credit" && deal.delivery_date ? agingBucketKey(ageD) : null,
    overdue: isOverdue(deal, today, expected),
    followup: deal.followup ?? null,                   // collection status (0013), null if none
  };
}

// AR-eligible = booked stage + still owing + NOT written off (หนี้สูญ stays in
// the deal but drops out of live AR — spec §5.3).
export function arEligible(deals, today) {
  return (deals ?? [])
    .filter((d) => AR_MAIN_STAGES.includes(d.main_stage) && arOutstanding(d) > 0 && d.followup?.status !== "หนี้สูญ")
    .map((d) => enrichArDeal(d, today));
}

// ---- aggregations (consume ALREADY-enriched deals) -------------------------
export function arKpis(enriched, today) {
  const total = enriched.reduce((a, d) => a + d.outstanding, 0);
  const within7 = enriched
    .filter((d) => !d.overdue && d.expected_date && daysBetween(today, d.expected_date) >= 0 && daysBetween(today, d.expected_date) <= 7)
    .reduce((a, d) => a + d.outstanding, 0);
  const overdue = enriched.filter((d) => d.overdue).reduce((a, d) => a + d.outstanding, 0);
  return { totalOutstanding: total, count: enriched.length, within7, overdue };
}

// forecast timeline. weekly = rolling 7-day windows from `today` (W0=this week,
// W1=next…); monthly = calendar month. Overdue + unknown-date are split out
// (they're not future projections).
export function buildForecast(enriched, today, granularity = "week") {
  const future = enriched.filter((d) => !d.overdue && d.expected_date);
  const overdue = enriched.filter((d) => d.overdue);
  const unknown = enriched.filter((d) => !d.overdue && !d.expected_date);
  const buckets = new Map();
  for (const d of future) {
    let key, sort, weekIndex = null;
    if (granularity === "month") {
      key = d.expected_date.slice(0, 7); sort = key;
    } else {
      weekIndex = Math.max(0, Math.floor(daysBetween(today, d.expected_date) / 7));
      key = "W" + weekIndex; sort = String(weekIndex).padStart(3, "0");
    }
    const b = buckets.get(key) ?? { key, sort, weekIndex, total: 0, count: 0 };
    b.total += d.outstanding; b.count += 1;
    buckets.set(key, b);
  }
  return {
    granularity,
    buckets: [...buckets.values()].sort((a, b) => a.sort.localeCompare(b.sort)),
    overdue: { total: overdue.reduce((a, d) => a + d.outstanding, 0), count: overdue.length },
    unknown: { total: unknown.reduce((a, d) => a + d.outstanding, 0), count: unknown.length },
  };
}

// aging summary — credit, shipped only (those have a real clock running)
export function buildAging(enriched) {
  const out = AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, total: 0, count: 0 }));
  for (const d of enriched) {
    if (d.terms !== "credit" || !d.delivery_date || d.aging_days == null) continue;
    const i = AGING_BUCKETS.findIndex((b) => d.aging_days >= b.min && d.aging_days <= b.max);
    if (i >= 0) { out[i].total += d.outstanding; out[i].count += 1; }
  }
  return out;
}
