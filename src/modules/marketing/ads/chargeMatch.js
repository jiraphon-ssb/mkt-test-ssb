/* แมทรายการตัดบัตร Meta ↔ ค่าแอดที่ระบบนับ (สเปก docs/superpowers/specs/2026-09-26-charge-match-design.md)
   pure · ไม่ขึ้นกับรูปแบบไฟล์ — ตัวแกะไฟล์ (เฟสถัดไป) แปลงเป็น { date, amount, vat?, reference } ก่อนส่งเข้ามา

   Meta ตัดบัตรเมื่อยอดค้างถึงเพดาน — แต่ละครั้งเก็บค่าแอดที่ค้างทั้งหมดจนถึงเวลาตัด ซึ่งเราไม่รู้ว่าเป็นตอนไหนของวัน
   รอบแรก (26 ก.ย.) จัดสรรค่าแอดรายวันให้ทีละรายการ → เดาเวลาในวันผิดแล้วเตือน "ตัดเกิน" ทั้งที่ไม่เกิน (ทดสอบละเอียด 27 ก.ย.)
   รอบนี้เทียบ "ยอดสะสม" แทน:
   - รายการแรกที่มีข้อมูลค่าแอด (anchor · วัน D0) = จุดตั้งต้น — ค่าแอดของ D0 ที่เหลือหลังตัดอยู่ได้ตั้งแต่ 0 ถึงทั้งวัน
   - รายการหลังจากนั้น: ยอดตัดสะสมถึงวัน D ต้องไม่เกิน ค่าแอด (D0, D] + ค่าแอดทั้งวัน D0 → เกิน = ตัดเกินแน่ๆ (ยอดที่พิสูจน์ได้)
     ต่ำกว่าได้ เพราะค่าแอดของวัน D หลังเวลาตัดยังไม่ถูกเก็บ
   - ยังไม่ถูกตัด = ช่วง [ค่าแอดหลัง D0 − ยอดตัดหลัง D0, + ค่าแอดทั้งวัน D0] เทียบยอดค้างใน Meta
   ข้อแลก: ตัดเกินไม่เกินค่าแอดหนึ่งวัน (ของวันแรก) จับไม่ได้ — ดีกว่าเตือนผิดจนคนเลิกเชื่อ */

import { VAT_RATE } from "./billingModel.js";

const EPS = 1e-6;
const clean = (x) => Math.round(x * 1e6) / 1e6;                       // ล้างเศษทศนิยมลอย (1070 ÷ 1.07 = 999.999…) — ไม่ใช่การปัดสตางค์
const overTol = (net) => Math.max(net * 0.005, 1);                    // ต่าง ≤ 0.5% หรือ ≤ ฿1 = ปัดเศษ ไม่ใช่ตัดเกิน
const balanceTol = (value) => Math.max(Math.abs(value) * 0.02, 100);  // ยอดค้างขยับระหว่างรอบดึงได้
const lastIdxOnOrBefore = (days, day) => { let idx = -1; for (let k = 0; k < days.length && days[k] <= day; k++) idx = k; return idx; };

/* รายการวันเดียวกันรวมเป็นกลุ่ม (เรียงเลขอ้างอิงในกลุ่ม) → ผลไม่ขึ้นกับลำดับแถวที่ฐานข้อมูลคืนมา */
function groupByDate(list) {
  const map = new Map();
  for (const c of list) map.set(c.date, [...(map.get(c.date) ?? []), c]);
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, items]) => ({ date, items: items.sort((x, y) => String(x.reference ?? "").localeCompare(String(y.reference ?? "")) || x.amount - y.amount) }));
}

/** ประเมินทุกรายการภายใต้สมมติฐาน VAT หนึ่งแบบ (netOf = ยอดสุทธิไม่รวม VAT) */
function evaluate(groups, days, spends, { today, dataThrough, netOf }) {
  const firstDay = days[0] ?? null;
  const lastDay = dataThrough ?? days[days.length - 1] ?? null;
  const spendOn = (day) => { const k = days.indexOf(day); return k < 0 ? 0 : spends[k]; };
  const spendBetween = (after, upTo) => days.reduce((n, d, k) => (d > after && d <= upTo ? n + spends[k] : n), 0);
  const total = spends.reduce((n, v) => n + v, 0);
  const anchorIdx = firstDay ? groups.findIndex((g) => g.date >= firstDay) : -1;
  const anchor = anchorIdx >= 0 ? groups[anchorIdx] : null;
  const pendingDay = (date) => (today && date >= today) || (lastDay && date > lastDay);
  const netItems = (g) => g.items.map((c) => ({ ...c, net: clean(netOf(c)) }));
  const out = [];

  // ก่อนช่วงข้อมูลค่าแอด = ตรวจไม่ได้ ไม่ใช่ตัดเกิน
  for (const g of anchorIdx < 0 ? groups : groups.slice(0, anchorIdx)) {
    for (const c of netItems(g)) out.push({ ...c, covered: 0, uncovered: c.net, coverFrom: null, coverTo: null, alloc: [], status: "nodata" });
  }
  if (!anchor) return { charges: out, unbilledMin: clean(total), unbilledMax: clean(total), anchorDate: null, laterNet: 0, lo: null, hi: null };

  /* ช่วงค่าแอดที่แต่ละรายการครอบคลุม (ไว้แสดง "ครอบคลุมค่าแอด d1–d2") — จัดสรรตามลำดับ ใช้ประกอบการอ่านเท่านั้น
     สถานะตัดเกินตัดสินจากยอดสะสมด้านล่าง ไม่ใช่จากการจัดสรรนี้ */
  const rem = spends.slice();
  const end = lastIdxOnOrBefore(days, anchor.date);
  const anchorItems = netItems(anchor);
  let back = end;
  for (const c of anchorItems) {
    let want = c.net, from = null, to = null;
    const alloc = [];   // ค่าแอดรายวันที่รายการนี้จ่าย (ก่อน VAT) — หน้าต่างรายละเอียดบิล + สมการกระทบยอด (29 ก.ย.)
    while (want > EPS && back >= 0) {
      const take = Math.min(rem[back], want);
      if (take > EPS) { rem[back] -= take; want -= take; to ??= days[back]; from = days[back]; alloc.unshift({ day: days[back], amount: clean(take) }); }
      if (rem[back] <= EPS) back -= 1;
    }
    const uncovered = clean(Math.max(0, want));
    // ข้อมูลค่าแอดย้อนไม่ถึงยอดรายการแรก = nodata (ไม่รู้ว่ารอบบิลเริ่มเมื่อไหร่)
    out.push({ ...c, covered: clean(c.net - uncovered), uncovered, coverFrom: from, coverTo: to, alloc, status: uncovered > overTol(c.net) ? "nodata" : "ok" });
  }
  // ช่วงที่แสดง: ต่อจากจุดที่รายการแรกย้อนกินถึง (ก่อนหน้านั้น = รอบบิลก่อนหน้าที่ไม่อยู่ในไฟล์)
  for (let k = 0; k < end; k++) rem[k] = 0;
  let ptr = end >= 0 && rem[end] > EPS ? end : end + 1;

  const d0Spend = spendOn(anchor.date);
  /* เศษของวันแรกที่ยังไม่ถูกตัด: มากสุดทั้งวัน · น้อยสุด = ค่าแอดวันแรกส่วนที่รายการแรกเก็บไม่ไหว
     (รายการแรกเก็บค่าแอดของวันนั้นได้ไม่เกินยอดตัวเอง — ตัด 100,000 วันที่ใช้ 180,807.37 = ค้างอย่างน้อย 80,807.37) */
  const d0LeftMin = Math.max(0, d0Spend - anchorItems.reduce((n, c) => n + c.net, 0));
  let cumNet = 0, flagged = 0;
  for (const g of groups.slice(anchorIdx + 1)) {
    const items = netItems(g);
    const groupNet = items.reduce((n, c) => n + c.net, 0);
    cumNet += groupNet;
    const room = spendBetween(anchor.date, g.date) + d0Spend;          // ค่าแอดมากสุดที่ยอดตัดสะสมถึงวันนี้เก็บได้
    const excess = Math.max(0, cumNet - room - flagged);
    const groupOver = excess > overTol(groupNet) ? excess : 0;
    if (groupOver > 0) flagged += groupOver;
    const short = pendingDay(g.date) ? "pending" : "over";
    // ยอดเกินของกลุ่มลงที่รายการท้ายสุดก่อน (รายการที่ทำให้ยอดสะสมทะลุ)
    let leftOver = groupOver;
    const perItem = items.map(() => 0);
    for (let i = items.length - 1; i >= 0 && leftOver > EPS; i--) { const take = Math.min(items[i].net, leftOver); perItem[i] = take; leftOver -= take; }
    const limit = lastIdxOnOrBefore(days, g.date);
    items.forEach((c, i) => {
      let want = c.net - perItem[i], from = null, to = null;
      const alloc = [];
      for (let k = ptr; k <= limit && want > EPS; k++) {
        const take = Math.min(rem[k], want);
        if (take > EPS) { rem[k] -= take; want -= take; from ??= days[k]; to = days[k]; alloc.push({ day: days[k], amount: clean(take) }); }
        if (rem[k] <= EPS && k === ptr) ptr = k + 1;
      }
      const uncovered = clean(perItem[i]);
      out.push({ ...c, covered: clean(c.net - uncovered), uncovered, coverFrom: from, coverTo: to, alloc, status: uncovered > EPS ? short : "ok" });
    });
  }

  /* ขอบเขตยอดสะสมของรายการที่ข้อมูลครบแล้ว (ไม่นับวันที่ค่าแอดยังดึงไม่ครบ) — ใช้เดาว่ายอดตัดรวม VAT ไหม
     ยอดตัดหลัง D0 ถึงรายการสุดท้าย (DL) ≥ ค่าแอด (D0, DL) ที่ไม่รวมวัน DL · ≤ ค่าแอด (D0, DL] + ทั้งวัน D0 */
  const settled = groups.slice(anchorIdx + 1).filter((g) => !pendingDay(g.date));
  const lastSettled = settled[settled.length - 1]?.date ?? null;
  const settledNet = settled.reduce((n, g) => n + g.items.reduce((m, c) => m + netOf(c), 0), 0);
  const laterNet = groups.slice(anchorIdx + 1).reduce((n, g) => n + g.items.reduce((m, c) => m + netOf(c), 0), 0);
  const after = spendBetween(anchor.date, lastDay ?? anchor.date);
  return {
    charges: out, anchorDate: anchor.date, laterNet: clean(laterNet), settledNet: clean(settledNet),
    lo: lastSettled ? spendBetween(anchor.date, lastSettled) - spendOn(lastSettled) + d0LeftMin : null,
    hi: lastSettled ? spendBetween(anchor.date, lastSettled) + d0Spend : null,
    unbilledMin: clean(Math.max(0, after + d0LeftMin - laterNet)),
    /* ค่าแอดวันที่ยังดึงไม่เข้า (ข้อมูลถึงก่อนวันนี้) ไม่รู้ว่าเท่าไร → เพดานไม่รู้ เทียบยอดค้างได้แค่ขั้นต่ำ
       เดิมคิดเพดานจากข้อมูลที่มี → ยอดค้างจริงเกินเพดานแล้วขึ้น "ยอดค้างไม่ตรง" ผิด (ทดสอบละเอียดรอบ 2: 44% ของเคสที่ข้อมูลช้า 1 วัน) */
    unbilledMax: today && lastDay && lastDay < today ? null : clean(Math.max(0, after + d0Spend - laterNet)),
  };
}

/**
 * charges: [{ date:'YYYY-MM-DD', amount, vat?, reference }] ของบัญชีเดียว
 * daily: { 'YYYY-MM-DD': spend } หรือ Map · balance: ยอดค้างใน Meta (บาท · null = ไม่รู้/ไม่ใช่เดือนปัจจุบัน) · today
 * dataThrough: วันล่าสุดที่ระบบดึงค่าแอดแล้ว (ทั้งระบบ) — ไม่ส่ง = ใช้วันสุดท้ายของบัญชีนี้
 */
export function matchAccountCharges({ charges = [], daily = {}, balance = null, today, dataThrough = null }) {
  const entries = (daily instanceof Map ? [...daily] : Object.entries(daily))
    .filter(([day, v]) => (!today || day <= today) && Number.isFinite(Number(v)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const days = entries.map(([d]) => d), spends = entries.map(([, v]) => Number(v));

  /* ทำความสะอาด: ไม่มียอด = ไม่ใช่รายการ (เดิม Number(null) = ฿0) · VAT ว่าง = ไม่รู้ · เลขอ้างอิงซ้ำ (นำเข้าซ้ำ) นับครั้งเดียว */
  const seen = new Set();
  const list = [];
  for (const c of charges) {
    if (!c?.date || c.amount == null || c.amount === "" || !Number.isFinite(Number(c.amount))) continue;
    /* ซ้ำ = เลขอ้างอิง + วัน + ยอดตรงกันหมด (นำเข้าไฟล์ซ้ำ) · เลขเดียวกันแต่ยอดต่าง = เก็บทั้งคู่ให้คนเห็น
       เดิมเก็บแถวแรกที่เจอ → ผลขึ้นกับลำดับแถวจากฐานข้อมูล (ทดสอบละเอียดรอบ 2) */
    if (c.reference != null && c.reference !== "") { const key = `${c.reference}|${c.date}|${Number(c.amount)}`; if (seen.has(key)) continue; seen.add(key); }
    const vat = c.vat == null || c.vat === "" || !Number.isFinite(Number(c.vat)) ? null : Number(c.vat);
    list.push({ ...c, amount: Number(c.amount), vat });
  }
  const groups = groupByDate(list);
  const opts = { today, dataThrough };
  const grossOf = (mode, net) => (mode === "excluded" ? net : net * (1 + VAT_RATE));
  const maxOrInf = (v) => (v == null ? Infinity : v);   // เพดานไม่รู้ (ข้อมูลยังดึงไม่ครบ) = เทียบได้แค่ขั้นต่ำ
  const unbilledFits = (res, mode) => balance != null
    && balance >= grossOf(mode, res.unbilledMin) - balanceTol(balance) && balance <= grossOf(mode, maxOrInf(res.unbilledMax)) + balanceTol(balance);

  let vatMode, result, vatAmbiguous = false;   // แยกไม่ออกว่ารวม VAT ไหม — หน้าจอต้องบอก
  let excludedIfUnsure = null;                 // ผลแบบไม่รวม VAT ไว้ติดป้าย "เกินถ้าไม่คิด VAT"
  if (list.some((c) => c.vat != null)) {
    vatMode = "given";
    result = evaluate(groups, days, spends, { ...opts, netOf: (c) => c.amount - (c.vat ?? 0) });
  } else {
    const excluded = evaluate(groups, days, spends, { ...opts, netOf: (c) => c.amount });
    const included = evaluate(groups, days, spends, { ...opts, netOf: (c) => c.amount / (1 + VAT_RATE) });
    /* แบบไหน "เป็นไปได้": ทุกรายการที่ข้อมูลครบต้องไม่เกินเพดานสะสม (ไม่ใช่แค่ยอดรวมท้ายสุด) และยอดสะสมไม่ต่ำกว่าขั้นต่ำ
       ทดสอบละเอียดรอบ 2 (จำลอง 17,282 เคส): เช็กแค่ท้ายสุด → บัญชีรวม VAT ถูกเดาเป็นไม่รวม แล้วรายการกลางขึ้นตัดเกินแดงผิด
       และบัญชีไม่รวม VAT ที่ถูกตัดเกินไม่เกิน ~7% ถูกเดาเป็น "รวม VAT" แล้วเงียบ */
    const overOf = (res) => res.charges.filter((c) => c.status === "over").length;
    const fits = (res) => overOf(res) === 0 && (res.lo == null || res.settledNet >= res.lo - overTol(res.settledNet));
    const exc = fits(excluded), inc = fits(included);
    const excBal = unbilledFits(excluded, "excluded"), incBal = unbilledFits(included, "included");
    if (exc && inc) {                       // ได้ทั้งคู่: ยอดค้างชี้ขาดได้ก็ใช้ ไม่งั้นบอกว่าแยกไม่ออก (ไม่มีรายการเกินทั้งสองแบบอยู่แล้ว)
      vatMode = incBal && !excBal ? "included" : "excluded";
      vatAmbiguous = incBal === excBal;
    } else if (inc && !exc) {               // ได้เฉพาะแบบรวม VAT: เชื่อเมื่อยอดค้างยืนยันเท่านั้น
      if (incBal && !excBal) vatMode = "included";
      else { vatMode = "excluded"; vatAmbiguous = true; excludedIfUnsure = excluded; }
    } else vatMode = "excluded";            // ได้เฉพาะไม่รวม / ไม่ได้ทั้งคู่ = รายงานตรงๆ ไม่ให้ VAT บัง
    result = vatMode === "included" ? included : excluded;
    /* แยกไม่ออกและแบบไม่รวม VAT มีรายการเกิน: ตัดสินด้วยแบบรวม VAT (ไม่เตือนแดงผิด)
       รายการที่เกินเฉพาะเมื่อไม่คิด VAT = "vatcheck" (เหลือง: ถ้าบัญชีนี้ไม่คิด VAT แปลว่าตัดเกิน) · เกินแม้คิด VAT = over */
    if (excludedIfUnsure) {
      const incByKey = new Map(included.charges.map((c) => [`${c.reference}|${c.date}|${c.amount}`, c]));
      result = { ...excluded, charges: excluded.charges.map((c) => {
        if (c.status !== "over") return c;
        const inc = incByKey.get(`${c.reference}|${c.date}|${c.amount}`);
        return inc?.status === "over" ? { ...c, uncovered: clean(inc.uncovered * (1 + VAT_RATE)) } : { ...c, status: "vatcheck" };
      }) };
    }
  }
  /* ฐานเดียวกับยอดที่ตัด (ชุด D ข้อ 11): ยอดเกินแปลงกลับเป็นยอดรวม VAT ตามสัดส่วนของรายการ
     ยังไม่ถูกตัดเทียบยอดค้างใน Meta ในฐานเดียวกัน (รวม VAT เมื่อบัญชีตัดแบบรวม VAT) */
  const chargesOut = result.charges.map((c) => ({ ...c, uncoveredGross: c.net > 0 ? clean((c.uncovered * c.amount) / c.net) : clean(c.uncovered) }));
  const over = chargesOut.filter((c) => c.status === "over");
  const toBalanceBasis = (v) => (v == null ? null : vatMode === "excluded" ? v : clean(v * (1 + VAT_RATE)));
  const unbilledMin = toBalanceBasis(result.unbilledMin), unbilledMax = toBalanceBasis(result.unbilledMax);
  const balanceGap = balance == null ? null
    // แยก VAT ไม่ออก = ยอดค้างเข้าแบบใดแบบหนึ่งก็ถือว่าตรง
    : vatAmbiguous ? !(unbilledFits(evaluate(groups, days, spends, { ...opts, netOf: (c) => c.amount }), "excluded") || unbilledFits(evaluate(groups, days, spends, { ...opts, netOf: (c) => c.amount / (1 + VAT_RATE) }), "included"))
    : balance < unbilledMin - balanceTol(unbilledMin) || (unbilledMax != null && balance > unbilledMax + balanceTol(unbilledMax));
  return {
    vatMode, vatAmbiguous, charges: chargesOut,
    unbilledMin, unbilledMax, unbilled: unbilledMin,
    balance, balanceGap,
    overCount: over.length, overAmount: clean(over.reduce((n, c) => n + c.uncoveredGross, 0)),
  };
}

/** สรุปรายเดือนของบัญชี (แถวตาราง) · current = เดือนปัจจุบัน (มียอดค้างให้เทียบ) */
export function monthChargeSummary(match, month, { current = false } = {}) {
  // "2026-1" / Date ก็ต้องได้เดือนถูก — เดิม "2026-1" ไปจับ ต.ค.–พ.ย. ด้วย (ทดสอบละเอียดรอบ 2)
  const raw = month instanceof Date ? month.toISOString().slice(0, 7) : String(month);
  const [yy, mm] = raw.split("-");
  const prefix = `${yy}-${String(Number(mm)).padStart(2, "0")}`;
  const inMonth = (match?.charges ?? []).filter((c) => c.date.startsWith(prefix));
  const over = inMonth.filter((c) => c.status === "over");
  const status = !inMonth.length ? "nocharges"
    : over.length ? "review"
    : current && match.balanceGap ? "review"
    : "match";
  return {
    charged: clean(inMonth.reduce((n, c) => n + c.amount, 0)),
    chargedNet: clean(inMonth.reduce((n, c) => n + c.net, 0)),
    count: inMonth.length, overCount: over.length, overAmount: clean(over.reduce((n, c) => n + c.uncoveredGross, 0)),
    pendingCount: inMonth.filter((c) => c.status === "pending").length,
    vatCheckCount: inMonth.filter((c) => c.status === "vatcheck").length,
    status, charges: inMonth,
  };
}

/** ช่วงวันที่โหลดรายการตัดบัตรของเดือนที่ดู: ย้อน 2 เดือนเป็นจุดตั้งต้น (from) ถึงก่อนวันแรกของเดือนถัดไป (before)
    โหลดเฉพาะเดือนเดียว = รายการแรกของเดือนย้อนไปกินค่าแอดเดือนก่อน จับตัดเกินไม่ได้ (ทดสอบละเอียด 27 ก.ย.) */
export function chargeWindow(monthIso, lookbackMonths = 2) {
  const [y, m] = String(monthIso).slice(0, 7).split("-").map(Number);
  const iso = (year, month) => new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  return { from: iso(y, m - lookbackMonths), before: iso(y, m + 1) };
}
