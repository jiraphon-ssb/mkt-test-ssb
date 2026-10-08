/* โมเดลหน้า "บิล & กระทบยอด" (spec docs/superpowers/specs/2026-09-22-billing-recon.md)
   pure function — กิน cards (จาก useAdsData ซึ่งมี account_id ติดมาแล้ว) + connections + snapshots + reviews
   ตัวเลขคืนดิบทั้งหมด UI เป็นคนจัดรูป 2 ตำแหน่งไม่ปัด · สถานะ exception-based: ปกติ = เงียบ
   เงินใน snapshot เป็นสตางค์ (minor units จาก Graph) — แปลงเป็นบาทที่นี่ที่เดียว */

export const VAT_RATE = 0.07;
/* VAT ต่อแถวตัดสตางค์ (ไม่ปัด) แล้วยอดรวมบวกจากตัวที่แสดง — เดิมบวกดิบแล้วค่อยตัด หัวหน้า ฿32,339.91 แต่บวกแถวได้ ฿32,339.90
   (ทดสอบแบบใช้งานจริง 27 ก.ย.) · คิดเป็นสตางค์จำนวนเต็ม กันเศษ float */
const centsOf = (baht) => Math.trunc(Number((baht * 100).toFixed(4)));
function withVat(spend) {
  if (spend == null) return { vat: null, gross: null };
  const spendC = centsOf(spend), vatC = Math.trunc((spendC * Math.round(VAT_RATE * 100)) / 100);
  return { vat: vatC / 100, gross: (spendC + vatC) / 100 };
}
export const MATCH_PCT = 0.005;   // |ส่วนต่าง| ≤ 0.5% = ตรงกัน (เกณฑ์เดียวกับเขตปลอดภัย Pace Engine ฝั่งแคบ)
export const MINOR_PCT = 0.02;
const EPS = 1e-9;   // ต่างพอดี 0.50% เจอเศษ float เป็น 0.0050000000000000495 → ต้องนับว่าอยู่ในเกณฑ์ (ทดสอบละเอียดรอบ 2)    // ≤ 2% = ต่างเล็กน้อย (มักเป็นเรื่องวันคาบเกี่ยว/ปัดเศษบัตร)

import { matchAccountCharges, monthChargeSummary } from "./chargeMatch.js";
import { fmtMoney } from "../dash/charts/theme.js";   // ตัดทศนิยม 2 ตำแหน่ง ไม่ปัด (toLocaleString ปัด)

const baht = (cents) => (cents == null ? null : cents / 100);
/* cards เก็บ account_id แบบ "act_1234" (จาก ad_connections) แต่ Graph /me/adaccounts คืนเลขล้วน
   — normalize ที่เดียว ไม่งั้น join พลาดทั้งหน้า (บั๊กหน้าจริง 22 ก.ย.: ชื่อโชว์ act_… ยอดค้างเป็นขีดหมด) */
const normId = (v) => String(v ?? "").replace(/^act_/, "");

/** ผลตรวจที่บันทึก: กรอกยอดใบแจ้งยอดแล้วห่างค่าแอดไม่เกินเกณฑ์ "ตรงกัน" = match · นอกนั้น (หมายเหตุอย่างเดียว/ต่าง/ค่าแอดไม่รู้) = noted
    เดิมตัดสินจาก "ไม่กรอกอะไรเลย" ซึ่งฟอร์มไม่ยอมให้บันทึก → match ไม่เคยเกิด (ชุด D ข้อ 18) */
export function reviewVerdict(statement, spend) {
  if (statement == null || spend == null || !Number.isFinite(Number(statement)) || !Number.isFinite(Number(spend))) return "noted";
  if (spend <= 0) return Math.abs(statement) < 0.005 ? "match" : "noted";
  return Math.abs(statement - spend) / spend <= MATCH_PCT + EPS ? "match" : "noted";
}

/** spendKnown:false = ค่าแอดยังไม่รู้ (โหลดไม่สำเร็จ · ยังโหลด · ข้อมูลจำลอง) → ยอดรวมเป็น null ไม่ใช่ 0 */
/** charges = แถว ad_billing_charges (รายการที่ Meta ตัดบัตร) · today = ตัดค่าแอดหลังวันนี้ + รู้ว่าเดือนไหนเป็นเดือนปัจจุบัน */
export function buildBillingModel({ month, cards = [], connections = [], snapshots = [], reviews = [], brands = [], spendKnown = true, charges = [], today = null }) {
  const monthPrefix = String(month).slice(0, 7);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const snapByAccount = new Map(snapshots.map((s) => [normId(s.external_account_id), s]));

  /* review ล่าสุดต่อบัญชี — append-only จึงตัดสินด้วย created_at ใหม่สุด */
  const reviewByAccount = new Map();
  for (const r of reviews) {
    const account = normId(r.external_account_id);   // เดิม get ด้วยเลขดิบ set ด้วยเลข normalize → act_… ได้แถวสุดท้ายแทนล่าสุด (ชุด D)
    const current = reviewByAccount.get(account);
    if (!current || String(r.created_at) > String(current.created_at)) reviewByAccount.set(account, r);
  }

  /* ค่าแอดรายวันต่อบัญชี (ทุกวันที่โหลดไว้ ไม่เฉพาะเดือนนี้) — ใช้จัดสรรให้รายการตัดบัตรที่คร่อมเดือน */
  const dailyByAccount = new Map();
  for (const cardRow of cards) {
    const spend = Number(cardRow?.metrics?.spend);
    if (!cardRow?.account_id || !cardRow.fact_date || !Number.isFinite(spend)) continue;
    const accountId = normId(cardRow.account_id);
    const day = String(cardRow.fact_date).slice(0, 10);
    const map = dailyByAccount.get(accountId) ?? new Map();
    map.set(day, (map.get(day) ?? 0) + spend);
    dailyByAccount.set(accountId, map);
  }
  const chargesByAccount = new Map();
  /* รายการจาก Meta activities มีชนิด (29 ก.ย.): นับเป็นยอดตัดเฉพาะ "charge" · แถวเก่าไม่มีชนิด (อัปโหลด/อีเมล) = ยอดตัด
     ตัดไม่ผ่าน/ปฏิเสธ/chargeback/คืนเงิน ไม่ใช่เงินที่ออกจริง → ไม่เข้าการแมท แต่เก็บไว้เตือนเฉพาะของเดือนที่ดู */
  const problems = { failed: [], refund: [] };
  const monthChargeCents = new Map();   // บัญชี → { cents, count } ของรายการตัดสำเร็จในเดือนที่ดู (ใช้กับบัญชีนอกระบบ)
  for (const c of charges) {
    const kind = c.raw?.kind ?? "charge";
    if (kind !== "charge") {
      if (String(c.charge_date ?? "").startsWith(monthPrefix)) {
        if (["failed", "declined", "chargeback"].includes(kind)) problems.failed.push(Number(c.amount) || 0);
        else if (kind === "refund") problems.refund.push(Number(c.amount) || 0);
      }
      continue;
    }
    const accountId = normId(c.external_account_id);
    if (String(c.charge_date ?? "").startsWith(monthPrefix) && Number.isFinite(Number(c.amount))) {
      const agg = monthChargeCents.get(accountId) ?? { cents: 0, count: 0 };
      monthChargeCents.set(accountId, { cents: agg.cents + Math.round(Number(c.amount) * 100), count: agg.count + 1 });
    }
    chargesByAccount.set(accountId, [...(chargesByAccount.get(accountId) ?? []), {
      date: String(c.charge_date ?? "").slice(0, 10), amount: Number(c.amount), reference: c.reference ?? null,
      vat: c.raw?.vat ?? null,   // ตัวแกะไฟล์ใส่ VAT แยกไว้ใน raw ถ้าไฟล์มีคอลัมน์ภาษี
    }]);
  }
  const current = today != null && String(today).slice(0, 7) === monthPrefix;
  /* เดือนที่ผ่านมาแล้ว: ยอดค้างใน snapshot เป็นของ "วันนี้" ไม่ใช่ของเดือนนั้น → ไม่แสดง (ตรวจรอบ 28 ก.ย.: บิล ส.ค. ขึ้นยอดค้าง ฿40,639.08 ของวันนี้) */
  const pastMonth = today != null && monthPrefix < String(today).slice(0, 7);
  const balanceOf = (snap) => (pastMonth ? null : baht(snap?.balance_cents));
  // วันล่าสุดที่ระบบดึงค่าแอดแล้ว (ทุกบัญชี) — ใช้แยก "ค่าแอดยังดึงไม่ครบ" ออกจาก "Meta ตัดเกิน" (ชุด D)
  const dataThrough = cards.reduce((max, c) => { const d = String(c?.fact_date ?? "").slice(0, 10); return d > max ? d : max; }, "") || null;

  /* รวม spend เดือนต่อบัญชี + ต่อแคมเปญ จาก cards (fact_date ยึด prefix เดือน) */
  const spendByAccount = new Map();
  for (const cardRow of cards) {
    if (!cardRow?.account_id || !String(cardRow.fact_date ?? "").startsWith(monthPrefix)) continue;
    const spend = Number(cardRow.metrics?.spend);
    if (!Number.isFinite(spend)) continue;
    const accountId = normId(cardRow.account_id);
    const acc = spendByAccount.get(accountId) ?? { spend: 0, campaigns: new Map() };
    acc.spend += spend;
    const name = cardRow.campaign ?? "ไม่ระบุแคมเปญ";
    acc.campaigns.set(name, (acc.campaigns.get(name) ?? 0) + spend);
    spendByAccount.set(accountId, acc);
  }

  const rows = [];

  for (const connection of connections) {
    const account = normId(connection.external_account_id);
    const acc = spendByAccount.get(account) ?? { spend: 0, campaigns: new Map() };
    const snap = snapByAccount.get(account) ?? null;
    const review = reviewByAccount.get(account) ?? null;
    const statement = review?.statement_amount != null ? Number(review.statement_amount) : null;
    const spend = acc.spend;
    const diff = statement == null ? null : statement - spend;
    const diffPct = statement == null || spend <= 0 ? null : Math.abs(diff) / spend;
    /* ค่าแอด 0: ไม่มีตัวหาร (diffPct null) — เดิม null <= 0.005 เป็นจริง จึงขึ้น "ตรงกัน" ทั้งที่ statement มีเงิน (ชุด A ข้อ 8) */
    const status = statement == null ? "nostatement"
      : spend <= 0 ? (Math.abs(statement) < 0.005 ? "match" : "review")
      : diffPct <= MATCH_PCT + EPS ? "match"
      : diffPct <= MINOR_PCT + EPS ? "minor"
      : "review";
    const accountStatus = snap?.account_status ?? null;
    /* แมทรายการตัดบัตร (สเปก 2026-09-26) — ยังไม่นำเข้าไฟล์ของบัญชีนี้ = null ("—") ไม่ใช่ตรงกัน */
    const accountCharges = chargesByAccount.get(account) ?? [];
    const chargeMatch = accountCharges.length ? matchAccountCharges({
      // ยอดค้างใน snapshot เป็นของ "ตอนนี้" — เทียบได้เฉพาะเดือนปัจจุบัน (ดูเดือนเก่าแล้วเอายอดค้างวันนี้มาเทียบ = เพี้ยน · ชุด D)
      charges: accountCharges, daily: dailyByAccount.get(account) ?? new Map(), balance: current ? baht(snap?.balance_cents) : null, today: today ?? undefined, dataThrough,
    }) : null;
    const charge = chargeMatch ? monthChargeSummary(chargeMatch, monthPrefix, { current }) : null;
    /* ค่าแอดถูกตัดถึงวันไหน (วันสุดท้ายที่รายการของเดือนนี้ครอบคลุม) — ส่วนต่างกับค่าแอดส่วนใหญ่คือช่วงหลังวันนี้ที่ยังไม่ถึงรอบตัด */
    const coveredThrough = (charge?.charges ?? []).reduce((max, c) => (c.coverTo && (!max || c.coverTo > max) ? c.coverTo : max), null);
    const flag = status === "review" ? { text: "ต้องตรวจ", tone: "rose" }
      : charge?.overCount > 0 ? { text: "Meta ตัดเกินค่าแอด", tone: "rose" }
      : charge?.status === "review" ? { text: "ยอดค้างไม่ตรง", tone: "amber" }
      : charge?.vatCheckCount > 0 ? { text: "เช็ก VAT", tone: "amber" }   // เกินเฉพาะเมื่อยอดตัดไม่รวม VAT (ทดสอบละเอียดรอบ 2)
      : accountStatus != null && accountStatus !== 1 ? { text: "บัญชีมีปัญหา", tone: "amber" }
      : null;
    rows.push({
      external_account_id: account,
      accountName: connection.account_name || snap?.account_name || account,
      brandName: brandName.get(connection.brand_id) ?? connection.brand_id ?? "",
      brandId: connection.brand_id || null,   // รางบัญชี/ตารางใช้โลโก้แบรนด์ (BrandMark) แบบหน้าภาพรวม
      connected: true,
      spend,
      ...withVat(spend),
      campaigns: [...acc.campaigns.entries()].map(([name, campaignSpend]) => ({
        name, spend: campaignSpend, share: spend > 0 ? campaignSpend / spend : 0,
      })).sort((a, b) => b.spend - a.spend),
      balance: balanceOf(snap),
      accountStatus,
      statement, diff, diffPct, status, flag, review, charge, chargeMatch, coveredThrough,
    });
  }

  /* บัญชีใน snapshot ที่ไม่ได้เชื่อมเข้าระบบ = เงินอาจออกโดย dashboard มองไม่เห็น */
  const connected = new Set(connections.map((c) => normId(c.external_account_id)));
  const offSystemIdle = [], offSystemUnknown = [];
  /* ค่าแอดยังไม่รู้ = ไม่รู้ด้วยว่าบัญชีไหนเชื่อม (รายชื่อสกัดจาก cards) → ห้ามตัดสินว่านอกระบบ
     เดิมระหว่างโหลดทุกบัญชีขึ้น "เงินออกนอกระบบ" แดงทั้งหน้า (เจอบนหน้าจริง · ชุด D) */
  /* บัญชีที่ถูกตัดบัตรแต่ไม่มีทั้งการเชื่อมและ snapshot ก็ต้องขึ้น — เงินออกจริง (29 ก.ย.) */
  const offSources = [...snapshots, ...[...monthChargeCents.keys()]
    .filter((id) => !connected.has(id) && !snapshots.some((s) => normId(s.external_account_id) === id))
    .map((id) => ({ external_account_id: id, account_name: null }))];
  for (const snap of spendKnown ? offSources : []) {
    const account = normId(snap.external_account_id);
    if (connected.has(account)) continue;
    const offCharge = monthChargeCents.get(account) ?? null;
    /* ยอดเดือนจริงจาก Meta insights (ads-cron เก็บไว้ใน month_spend) — ไม่ใช่ delta ประมาณ
       ไม่มีคีย์เดือนนั้น = ยังไม่เคยเก็บ ต้องเป็น null ("ไม่รู้") ห้ามเป็น 0 ("ไม่ได้ใช้") */
    const cents = snap.month_spend?.[monthPrefix];
    const spend = cents == null ? null : baht(cents);
    /* เดือนนี้ใช้ ฿0 และไม่มียอดค้าง = ไม่มีอะไรให้ตรวจ → รวมเป็นบรรทัดเดียว ไม่ขึ้นเป็นแถว (ชุด D ข้อ 18)
       ยอดไม่รู้ (null) ยังขึ้นเป็นแถว — ไม่รู้ ≠ ไม่ได้ใช้ */
    if (spend === 0 && !(balanceOf(snap) > 0) && !offCharge) {
      offSystemIdle.push({ external_account_id: account, accountName: snap.account_name || account });
      continue;
    }
    /* เดือนที่ผ่านมาแล้วและไม่มียอดของเดือนนั้นในระบบ = ไม่มีอะไรให้ตรวจ → บรรทัดเดียว (ตรวจรอบ 28 ก.ย.) · เดือนนี้ยังขึ้นแถว (ไม่รู้ ≠ ไม่ได้ใช้) */
    if (pastMonth && spend == null && !offCharge) {
      offSystemUnknown.push({ external_account_id: account, accountName: snap.account_name || account });
      continue;
    }
    rows.push({
      external_account_id: account,
      accountName: snap.account_name || account,
      brandName: "",
      brandId: null,
      connected: false,
      spend,
      ...withVat(spend),
      campaigns: [],
      balance: balanceOf(snap),
      accountStatus: snap.account_status ?? null,
      statement: null, diff: null, diffPct: null,
      status: "offsystem",
      /* ถูกตัดบัตร = เงินออกแน่แล้ว ชัดกว่ายอดใช้ (29 ก.ย.: ส.ค. Finix2/JD2 ถูกตัด ฿7,832.93 แต่หน้าเงียบ) */
      flag: offCharge ? { text: "ถูกตัดบัตรนอกระบบ", tone: "rose" } : spend > 0 ? { text: "เงินออกนอกระบบ", tone: "rose" } : null,
      charge: offCharge ? { charged: offCharge.cents / 100, count: offCharge.count, charges: [] } : null,
      coveredThrough: null,
      review: reviewByAccount.get(account) ?? null,
    });
  }

  /* "ควรทำ" ต่อบัญชี — คอลัมน์เดียวกับตารางแบรนด์หน้าภาพรวม: บอกขั้นต่อไปเป็นคำกริยา ไม่ใช่แค่ป้ายสถานะ (29 ก.ย.) */
  for (const r of rows) {
    const flagText = r.flag?.text;
    r.action = !r.connected && (r.charge || r.spend > 0) ? { text: "เชื่อมบัญชีเข้าระบบ", tone: "rose" }
      : r.status === "review" ? { text: "เทียบใบแจ้งยอดอีกครั้ง", tone: "rose" }
      : flagText === "Meta ตัดเกินค่าแอด" ? { text: "ตรวจใบเสร็จใน Billing hub", tone: "rose" }
      : flagText === "ยอดค้างไม่ตรง" ? { text: "เทียบยอดค้างใน Billing hub", tone: "amber" }
      : flagText === "เช็ก VAT" ? { text: "เช็กใบกำกับ VAT", tone: "amber" }
      : flagText === "บัญชีมีปัญหา" ? { text: "ตรวจสถานะบัญชีใน Meta", tone: "amber" }
      : r.review ? { text: "ตรวจแล้ว", tone: "emerald" }
      : { text: "ตามรอบตัดบัตร", tone: "zinc" };
  }

  /* เรียง: มีป้ายก่อน (แดงก่อนเหลือง) แล้วตามยอดมาก→น้อย */
  const severity = (r) => (r.flag?.tone === "rose" ? 0 : r.flag?.tone === "amber" ? 1 : 2);
  rows.sort((a, b) => severity(a) - severity(b) || (b.spend ?? 0) - (a.spend ?? 0));

  const connectedRows = rows.filter((r) => r.connected);
  const offSystemSpend = rows.filter((r) => !r.connected && r.spend > 0).reduce((sum, r) => sum + r.spend, 0);
  const sumOf = (key) => (spendKnown ? connectedRows.reduce((sum, r) => sum + r[key], 0) : null);
  const sumCents = (key) => (spendKnown ? connectedRows.reduce((sum, r) => sum + Math.round(r[key] * 100), 0) / 100 : null);   // แถวเป็นสตางค์ลงตัวแล้ว
  const totals = {
    spend: sumOf("spend"),
    vat: sumCents("vat"),
    gross: sumCents("gross"),
    statement: connectedRows.reduce((sum, r) => sum + (r.statement ?? 0), 0),
    // ยังไม่มี snapshot สักบัญชี = ไม่รู้ยอดค้าง ต้องเป็น null (โชว์ ฿0.00 = โกหก)
    balance: connectedRows.some((r) => r.balance != null) ? connectedRows.reduce((sum, r) => sum + (r.balance ?? 0), 0) : null,
    offSystemSpend,
    // ยังไม่มีไฟล์ตัดบัตรสักบัญชี = null ("—") ไม่ใช่ ฿0.00
    charged: connectedRows.some((r) => r.charge) ? connectedRows.reduce((sum, r) => sum + (r.charge?.charged ?? 0), 0) : null,
  };

  /* สมการ "ทำไมสองยอดไม่เท่ากัน" (29 ก.ย.) — ค่าแอดของเดือน → ยอดตัดบัตรทั้งหมดของเดือน (ทุกบัญชี)
     ใช้ alloc ของแต่ละรายการ (ค่าแอดรายวันที่รายการจ่าย) · afterMonth คิดเป็นเศษเหลือ → สมการลงตัวทุกสตางค์เสมอ
     แบ่งตามลำดับค่าแอดรายวัน — วันที่ตัดบัตรคร่อมเวลาในวันเป็นค่าประมาณ */
  const offChargedC = rows.filter((r) => !r.connected && r.charge).reduce((n, r) => n + Math.round(r.charge.charged * 100), 0);
  const monthStart = `${monthPrefix}-01`;
  /* สมการต่อแถว (29 ก.ย. รื้อตามหน้าอื่น: เลือกบัญชีในรางซ้ายแล้ว hero ต้องมีสมการของบัญชีนั้น) · ภาพรวม = ผลรวมเป็นสตางค์ */
  const zero = { spendC: 0, chargedC: 0, prevC: 0, unmatchedC: 0, vatC: 0, afterC: 0, offC: 0 };
  const total = { ...zero };
  const toBaht = (x) => ({ spend: x.spendC / 100, afterMonth: x.afterC / 100, fromPrev: x.prevC / 100, unmatched: x.unmatchedC / 100,
    vatCharged: x.vatC / 100, offSystem: x.offC / 100, charged: (x.chargedC + x.offC) / 100 });
  for (const r of rows) {
    if (!r.connected) {
      const offC = r.charge ? Math.round(r.charge.charged * 100) : 0;
      r.bridge = { spend: null, afterMonth: null, fromPrev: 0, unmatched: 0, vatCharged: 0, offSystem: offC / 100, charged: offC / 100 };
      r.billedShare = null;
      total.offC += offC;
      continue;
    }
    const x = { ...zero, spendC: centsOf(r.spend) };
    for (const c of r.charge?.charges ?? []) {
      const amountC = Math.round(c.amount * 100);
      x.chargedC += amountC;
      x.vatC += amountC - Math.round((c.net ?? c.amount) * 100);
      x.unmatchedC += Math.round((c.uncovered ?? 0) * 100);
      x.prevC += Math.round((c.alloc ?? []).filter((a) => a.day < monthStart).reduce((n, a) => n + a.amount, 0) * 100);
    }
    x.afterC = x.spendC - (x.chargedC - x.prevC - x.unmatchedC - x.vatC);   // เศษเหลือ → สมการลงตัวทุกสตางค์
    r.bridge = spendKnown ? toBaht(x) : null;
    /* ค่าแอดเดือนนี้ที่ถูกตัดแล้ว (ส่วนที่ไม่ใช่ "ยังไม่ถึงรอบตัด") — แถบในรางซ้าย/hero */
    r.billedShare = spendKnown && x.spendC > 0 ? (x.spendC - x.afterC) / x.spendC : null;
    for (const k of Object.keys(zero)) total[k] += x[k];
  }
  const bridge = spendKnown ? toBaht(total) : null;
  const billedShare = spendKnown && total.spendC > 0 ? (total.spendC - total.afterC) / total.spendC : null;

  /* alerts — exception-based: เดือนเรียบร้อย = [] */
  const alerts = [];
  const offAccounts = rows.filter((r) => !r.connected && r.flag);
  const offCharged = rows.filter((r) => !r.connected && r.charge);
  if (offCharged.length) alerts.push({ key: "offsystem", tone: "rose",
    text: `บัญชีนอกระบบถูกตัดบัตร ${fmtMoney(offChargedC / 100)} — ${offCharged.map((r) => r.accountName).join(" · ")} ยังไม่ได้เชื่อมเข้าระบบ` });
  else if (offAccounts.length) alerts.push({ key: "offsystem", tone: "rose",
    text: `เงินออกนอกระบบ ${fmtMoney(offSystemSpend)} — ${offAccounts.map((r) => r.accountName).join(" · ")} ยังไม่ได้เชื่อมเข้าระบบ` });
  const overRows = rows.filter((r) => r.charge?.overCount > 0);
  if (overRows.length) {
    const count = overRows.reduce((n, r) => n + r.charge.overCount, 0);
    const amount = overRows.reduce((n, r) => n + r.charge.overAmount, 0);
    alerts.push({ key: "chargeOver", tone: "rose",
      text: `Meta ตัดเกินค่าแอดที่ระบบเห็น ${count} รายการ ${fmtMoney(amount)} — ระบบดึงค่าแอดบางวันขาด หรือมีการใช้เงินที่ระบบไม่เห็น` });
  }
  const sumList = (list) => list.reduce((n, a) => n + Math.round(a * 100), 0) / 100;
  if (problems.failed.length) alerts.push({ key: "chargeFailed", tone: "rose",
    text: `ตัดบัตรไม่ผ่าน ${problems.failed.length} ครั้ง ${fmtMoney(sumList(problems.failed))} — ตรวจบัตร/วิธีชำระเงินใน Billing hub ก่อนแอดหยุด` });
  if (problems.refund.length) alerts.push({ key: "chargeRefund", tone: "amber",
    text: `Meta คืนเงิน ${problems.refund.length} รายการ ${fmtMoney(sumList(problems.refund))}` });
  const reviewCount = rows.filter((r) => r.status === "review").length;
  if (reviewCount) alerts.push({ key: "review", tone: "rose", text: `ส่วนต่างเกินเกณฑ์ ${reviewCount} บัญชี` });
  const badStatus = rows.filter((r) => r.accountStatus != null && r.accountStatus !== 1);
  if (badStatus.length) alerts.push({ key: "accountStatus", tone: "amber",
    text: `บัญชีมีปัญหา ${badStatus.length} บัญชี (${badStatus.map((r) => r.accountName).join(" · ")}) — เสี่ยงแอดหยุดวิ่ง` });

  const [y, m] = String(month).split("-").map(Number);
  const rangeLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("th-TH", { month: "short", year: "numeric", timeZone: "UTC" });

  return { month, rangeLabel, rows, totals, alerts, offSystemIdle, offSystemUnknown, pastMonth, current, bridge, billedShare };
}

/* หน้าบิลกระทบยอดกับการตัดบัตรของ Meta เท่านั้น (chargeMatch สร้างบนกติกาเพดานการตัดของ Meta)
   ค่าแอด Google/ChatGPT เข้าระบบทางการนำเข้าไฟล์และไม่มีรายการตัดบัตรคู่กัน — ปล่อยเข้ามาแล้วจะขึ้นเป็นบัญชี
   "นอกระบบ" ทั้งที่ไม่ผิด · การ์ดเก่าที่ไม่มีฟิลด์ source ถือว่าเป็น Meta (ก่อนมีหลาย provider มีแต่ Meta) */
export function metaCardsOnly(cards = []) {
  return cards.filter((cardRow) => (cardRow?.source ?? "meta") === "meta");
}

/** รายการบัญชีที่เชื่อม สกัดจาก cards (มี account_id + brand_id ติดมาแล้ว) — ไม่ต้องดึง ad_connections แยก */
export function connectionsFromCards(cards = []) {
  const seen = new Map();
  for (const cardRow of cards) {
    const accountId = normId(cardRow.account_id);
    if (!accountId || seen.has(accountId)) continue;
    seen.set(accountId, { external_account_id: accountId, brand_id: cardRow.brand_id ?? "", account_name: "" });
  }
  return [...seen.values()];
}
