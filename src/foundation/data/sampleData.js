/* Embedded sample data — Phase 1 fallback only.
   Shaped EXACTLY like the parsed Google-Sheets output the real cashflow app
   consumes: per company { monthly, weekly }, where every monthly field is a
   13-length array (index 0–11 = Jan–Dec, index 12 = year total) and weekly is
   a list of week rows. CONS = DD + SSB + TMK for every field (the accounting
   identity the real sheet holds). Jan–Jun 2026 only; June is the in-progress
   month so the burn/runway exclusion logic is exercised.

   NOTHING outside apiClient.js should import this file. When the real source
   (gviz CSV → Supabase) is wired in apiClient, it returns this same shape. */

const MONTHS_PRESENT = 6; // sample = Jan–Jun

// Pad an `mp`-month input array to 13 (later months null, index 12 = year total).
function pad13(arr, mp) {
  const a = Array(13).fill(null);
  let tot = 0;
  let any = false;
  for (let i = 0; i < mp; i++) {
    if (arr[i] != null) {
      a[i] = arr[i];
      tot += arr[i];
      any = true;
    }
  }
  a[12] = any ? tot : null;
  return a;
}

const sumN = (a, mp) => a.slice(0, mp).reduce((s, v) => s + (v || 0), 0);

// Build a full monthly object from raw line-item inputs + January opening cash.
// Derives the identities: opex = Σ5 OPEX, l4 = Σ5 obligations,
// cashOut = cogs+opex+l4, net = cashIn−cashOut, closing = opening+net.
// `mp` = months present (sample 6 = Jan–Jun; real data = year-to-date). Exported
// so the live (Supabase) cashflow path produces a byte-identical contract.
export function buildMonthly(inp, openingJan, mp = MONTHS_PRESENT) {
  const cashIn = pad13(inp.cashIn, mp);
  const cogs = pad13(inp.cogs, mp);
  const salary = pad13(inp.salary, mp);
  const director = pad13(inp.director, mp);
  const mkt = pad13(inp.mkt, mp);
  const selling = pad13(inp.selling, mp);
  const admin = pad13(inp.admin, mp);
  const debt = pad13(inp.debt, mp);
  const interest = pad13(inp.interest, mp);
  const tax = pad13(inp.tax, mp);
  const capex = pad13(inp.capex, mp);
  const ownerDraw = pad13(inp.ownerDraw, mp);

  const opex = Array(13).fill(null);
  const l4 = Array(13).fill(null);
  const cashOut = Array(13).fill(null);
  const net = Array(13).fill(null);
  const opening = Array(13).fill(null);
  const closing = Array(13).fill(null);

  let prevClose = openingJan;
  for (let i = 0; i < mp; i++) {
    opex[i] = salary[i] + director[i] + mkt[i] + selling[i] + admin[i];
    l4[i] = debt[i] + interest[i] + tax[i] + capex[i] + ownerDraw[i];
    cashOut[i] = cogs[i] + opex[i] + l4[i];
    net[i] = cashIn[i] - cashOut[i];
    opening[i] = prevClose;
    closing[i] = opening[i] + net[i];
    prevClose = closing[i];
  }
  opex[12] = sumN(opex, mp);
  l4[12] = sumN(l4, mp);
  cashOut[12] = sumN(cashOut, mp);
  net[12] = sumN(net, mp);
  opening[12] = openingJan;
  closing[12] = closing[mp - 1];

  return {
    opening, cashIn, cashOut, net, closing, cogs,
    salary, director, mkt, selling, admin, opex,
    debt, interest, tax, capex, ownerDraw, l4,
  };
}

// Derive weekly rows from a monthly object (4 weeks/month, last absorbs the
// remainder; opening/closing kept continuous). Mirrors the weekly tab shape.
function buildWeekly(monthly) {
  const out = [];
  let wk = 0;
  let prevClose = monthly.opening[0];
  for (let i = 0; i < MONTHS_PRESENT; i++) {
    const ci = monthly.cashIn[i];
    const co = monthly.cashOut[i];
    const ciQ = Math.round(ci * 0.25);
    const coQ = Math.round(co * 0.25);
    for (let w = 0; w < 4; w++) {
      wk++;
      const inW = w === 3 ? ci - ciQ * 3 : ciQ;
      const outW = w === 3 ? co - coQ * 3 : coQ;
      const netW = inW - outW;
      const opW = prevClose;
      const clW = opW + netW;
      out.push({
        wk, date: `สัปดาห์ที่ ${wk}`, mo: i + 1,
        opening: opW, cashIn: inW, cashOut: outW, net: netW, closing: clW,
      });
      prevClose = clW;
    }
  }
  return out;
}

// Element-wise CONS = DD + SSB + TMK (null only where all three are null).
export function consolidate(monthlies) {
  const fields = Object.keys(monthlies[0]);
  const out = {};
  for (const f of fields) {
    out[f] = Array(13).fill(null);
    for (let i = 0; i < 13; i++) {
      const vals = monthlies.map((m) => m[f][i]);
      out[f][i] = vals.every((v) => v == null)
        ? null
        : vals.reduce((s, v) => s + (v || 0), 0);
    }
  }
  return out;
}

/* ── Raw per-company inputs (baht) ──────────────────────────────────────── */

const DD_MONTHLY = buildMonthly({
  cashIn:    [2500000, 2700000, 2400000, 2900000, 2800000, 1700000],
  cogs:      [1200000, 1300000, 1150000, 1380000, 1340000, 820000],
  salary:    [300000, 300000, 310000, 315000, 320000, 320000],
  director:  [150000, 150000, 150000, 150000, 150000, 150000],
  mkt:       [180000, 210000, 170000, 230000, 205000, 95000],
  selling:   [80000, 85000, 78000, 92000, 88000, 42000],
  admin:     [60000, 62000, 59000, 66000, 63000, 31000],
  debt:      [120000, 120000, 120000, 120000, 120000, 0],
  interest:  [30000, 29000, 28000, 27000, 26000, 0],
  tax:       [40000, 0, 0, 55000, 0, 0],
  capex:     [0, 120000, 0, 0, 180000, 0],
  ownerDraw: [50000, 50000, 50000, 50000, 50000, 0],
}, 3000000);

const SSB_MONTHLY = buildMonthly({
  cashIn:    [1800000, 1900000, 2000000, 1850000, 2100000, 1300000],
  cogs:      [950000, 1000000, 1050000, 980000, 1100000, 650000],
  salary:    [220000, 220000, 225000, 230000, 235000, 235000],
  director:  [120000, 120000, 120000, 120000, 120000, 120000],
  mkt:       [150000, 160000, 155000, 165000, 170000, 80000],
  selling:   [60000, 62000, 64000, 61000, 68000, 33000],
  admin:     [45000, 46000, 47000, 46000, 49000, 24000],
  debt:      [90000, 90000, 90000, 90000, 90000, 0],
  interest:  [22000, 21000, 20000, 19000, 18000, 0],
  tax:       [30000, 0, 0, 40000, 0, 0],
  capex:     [0, 80000, 0, 0, 100000, 0],
  ownerDraw: [40000, 40000, 40000, 40000, 40000, 0],
}, 2200000);

const TMK_MONTHLY = buildMonthly({
  cashIn:    [900000, 850000, 950000, 880000, 1000000, 600000],
  cogs:      [520000, 500000, 560000, 520000, 600000, 360000],
  salary:    [180000, 182000, 185000, 188000, 190000, 190000],
  director:  [90000, 90000, 90000, 90000, 90000, 90000],
  mkt:       [120000, 130000, 125000, 140000, 135000, 70000],
  selling:   [40000, 42000, 41000, 44000, 46000, 22000],
  admin:     [35000, 36000, 35000, 37000, 38000, 19000],
  debt:      [70000, 70000, 70000, 70000, 70000, 0],
  interest:  [18000, 17500, 17000, 16500, 16000, 0],
  tax:       [15000, 0, 0, 20000, 0, 0],
  capex:     [0, 60000, 0, 0, 90000, 0],
  ownerDraw: [30000, 30000, 30000, 30000, 30000, 0],
}, 1100000);

const CONS_MONTHLY = consolidate([DD_MONTHLY, SSB_MONTHLY, TMK_MONTHLY]);

/** The full dataset, keyed by tab — identical shape to the real parsed output. */
export function sampleCashflow() {
  return {
    CONS: { name: "รวม 3 บริษัท", monthly: CONS_MONTHLY, weekly: null },
    DD: { name: "DD FINIX", monthly: DD_MONTHLY, weekly: buildWeekly(DD_MONTHLY) },
    SSB: { name: "SSB", monthly: SSB_MONTHLY, weekly: buildWeekly(SSB_MONTHLY) },
    TMK: { name: "TMK", monthly: TMK_MONTHLY, weekly: buildWeekly(TMK_MONTHLY) },
  };
}
