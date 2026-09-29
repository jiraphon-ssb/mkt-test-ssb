/* รายการบิล (29 ก.ย.) — 1 แถว = การตัดบัตร 1 ครั้งของ Meta (ใบเสร็จ 1 ใบใน Billing hub)
   ต่างจากตารางกระทบยอด: รวมทุกบัญชี (รวมนอกระบบ) และทุกชนิด (สำเร็จ/ไม่ผ่าน/คืนเงิน) — ให้ฝ่ายบัญชีไล่ตามใบเสร็จได้ทีละใบ
   pure function · เงินคิดเป็นสตางค์ · ตัวเลขคืนดิบ UI จัดรูปเอง */
import { trunc2 } from "../dash/charts/theme.js";

export const BILL_KIND_TEXT = {
  charge: "สำเร็จ", failed: "ไม่ผ่าน", declined: "ถูกปฏิเสธ", refund: "คืนเงิน",
  chargeback: "ถูกเรียกเงินคืน (chargeback)", chargeback_reversal: "ยกเลิก chargeback",
};
export const BILL_KIND_TONE = { charge: "emerald", failed: "rose", declined: "rose", chargeback: "rose", refund: "amber", chargeback_reversal: "zinc" };

const normId = (v) => String(v ?? "").replace(/^act_/, "");
const cents = (n) => Math.round(Number(n) * 100);
/* เลขรายการที่ระบบสร้างเอง ("ชนิด:เวลา" ตอน Meta ไม่ให้ transaction_id) ไม่ใช่เลขบนใบเสร็จ — ห้ามโชว์ให้เข้าใจผิด */
const transactionIdOf = (reference, kind) => (!reference || String(reference).startsWith(`${kind}:`) ? null : String(reference));

/** ลิงก์ Billing hub ของบัญชี — ลิงก์ใบเสร็จรายใบรออาร์ตส่งตัวอย่าง URL จาก Billing hub */
export const billingHubUrl = (accountId) => `https://business.facebook.com/billing_hub/payment_activity?asset_id=${normId(accountId)}`;

/**
 * charges: แถว ad_billing_charges (โหลดย้อน 2 เดือน — กรองเฉพาะเดือนที่ดูที่นี่)
 * rows: model.rows ของหน้ากระทบยอด (ชื่อบัญชี/แบรนด์ + ผลแมทช่วงค่าแอด) · snapshots: ชื่อบัญชีที่ไม่มีแถว
 * account: กรองบัญชีเดียว (null = ทั้งหมด)
 */
export function buildBillList({ month, charges = [], rows = [], snapshots = [], account = null }) {
  const prefix = String(month).slice(0, 7);
  const rowOf = new Map(rows.map((r) => [normId(r.external_account_id), r]));
  const snapName = new Map(snapshots.map((s) => [normId(s.external_account_id), s.account_name]));
  /* ช่วงค่าแอดที่ครอบคลุม — จาก chargeMatch ของบัญชีที่เชื่อม (บัญชีนอกระบบไม่มีค่าแอดรายวันให้แมท) */
  const coverOf = new Map();
  for (const r of rows) for (const c of r.charge?.charges ?? []) {
    coverOf.set(`${normId(r.external_account_id)}|${c.reference}|${c.date}`, c);
  }

  const all = [];
  for (const c of charges) {
    const date = String(c.charge_date ?? "").slice(0, 10);
    if (!date.startsWith(prefix) || c.amount == null || !Number.isFinite(Number(c.amount))) continue;
    const accountId = normId(c.external_account_id);
    const kind = c.raw?.kind ?? "charge";   // แถวเก่า (อัปโหลด/อีเมล) ไม่มีชนิด = ตัดสำเร็จ
    const row = rowOf.get(accountId);
    const cover = kind === "charge" ? coverOf.get(`${accountId}|${c.reference ?? null}|${date}`) : null;
    all.push({
      key: `${accountId}|${c.reference ?? ""}|${date}`,
      date, eventTime: c.raw?.event_time ?? null,
      accountId, accountName: row?.accountName || snapName.get(accountId) || accountId,
      brandName: row?.brandName ?? "", connected: row?.connected ?? false,
      amount: Number(c.amount), currency: c.raw?.currency ?? "THB",
      reference: c.reference ?? null, transactionId: transactionIdOf(c.reference, kind),
      kind, coverFrom: cover?.coverFrom ?? null, coverTo: cover?.coverTo ?? null, coverStatus: cover?.status ?? null,
      net: cover?.net ?? null, uncovered: cover?.uncovered ?? null, alloc: cover?.alloc ?? [],
      uncoveredGross: cover?.uncoveredGross ?? null,   // ยอดเกินฐานเดียวกับยอดตัด — ป้าย "ตัดเกินค่าแอด ฿…" ในแถวใบเสร็จ
      // Meta เก็บ VAT แล้ว (บัญชีไม่มีเลขผู้เสียภาษี) = ไม่ต้องยื่น ภ.พ.36 ซ้ำ · บัญชีนอกระบบ/ไม่รู้ = ถือว่าต้องยื่น
      vatIncluded: row?.chargeMatch?.vatMode === "included",
    });
  }
  // ใหม่สุดก่อน (เหมือน Billing hub) · วันเดียวกันใช้เวลาจริงของเหตุการณ์
  all.sort((a, b) => (a.date === b.date ? String(b.eventTime ?? "").localeCompare(String(a.eventTime ?? "")) : a.date < b.date ? 1 : -1));

  const charged = new Map();
  for (const i of all) if (i.kind === "charge") charged.set(i.accountId, (charged.get(i.accountId) ?? 0) + cents(i.amount));
  const accounts = [...new Map(all.map((i) => [i.accountId, { id: i.accountId, name: i.accountName, brandName: i.brandName, connected: i.connected }])).values()]
    .sort((a, b) => (charged.get(b.id) ?? 0) - (charged.get(a.id) ?? 0));

  const items = account ? all.filter((i) => i.accountId === normId(account)) : all;
  const sumOf = (kinds) => { const list = items.filter((i) => kinds.includes(i.kind)); return [list.length, list.reduce((n, i) => n + cents(i.amount), 0) / 100]; };
  const [chargedCount, chargedSum] = sumOf(["charge"]);
  const [failedCount, failed] = sumOf(["failed", "declined", "chargeback"]);
  const [refundCount, refund] = sumOf(["refund"]);
  // ส่วนของบัญชีนอกระบบ — การ์ด "Meta ตัดจริง" นับเฉพาะบัญชีที่เชื่อม ยอดรวมสองที่ต่างกันต้องอธิบายได้บนหน้า
  const offSystemCharged = items.filter((i) => i.kind === "charge" && !i.connected).reduce((n, i) => n + cents(i.amount), 0) / 100;
  /* VAT ภ.พ.36 = 7% ของยอดที่จ่ายจริง (ตัดสำเร็จ) ของบัญชีที่ Meta ไม่ได้เก็บ VAT · ตัดสตางค์ไม่ปัด
     คิดจากยอดจ่าย ไม่ใช่ค่าแอดที่ระบบนับ (เดิมการ์ด VAT 7% คิดจากค่าแอด — ผิดฐาน · 29 ก.ย.) */
  const vatBaseC = items.filter((i) => i.kind === "charge" && !i.vatIncluded).reduce((n, i) => n + cents(i.amount), 0);
  const vat36 = Math.trunc((vatBaseC * 7) / 100) / 100;
  return { items, accounts, totals: { count: items.length, chargedCount, charged: chargedSum, offSystemCharged, failedCount, failed, refundCount, refund, vat36 } };
}

/* ข้อความขึ้นต้น = + - @ tab CR → ใส่ ' นำหน้า กัน Excel ตีเป็นสูตร (security-review 29 ก.ย. · ชื่อบัญชีมาจาก Meta) — ยอดเงินเป็นตัวเลขบวกเสมอ ไม่ผ่านตรงนี้ */
const esc = (v) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const BILL_CSV_HEAD = ["วันที่", "บัญชี", "เลขบัญชี", "แบรนด์", "เลขรายการ", "ยอด (บาท)", "สกุลเงิน", "สถานะ", "ครอบคลุมค่าแอด"];

/** CSV ให้ฝ่ายบัญชี — เรียงเก่า→ใหม่แบบสมุดบัญชี · ยอดทศนิยม 2 ตำแหน่งไม่ปัด ไม่มีคอมมา · มี BOM ให้ Excel อ่านไทย */
export function billListCsv(items = []) {
  const body = [...items].sort((a, b) => (a.date === b.date ? String(a.eventTime ?? "").localeCompare(String(b.eventTime ?? "")) : a.date < b.date ? -1 : 1))
    .map((i) => [
      i.date, i.accountName, i.accountId, i.brandName, i.transactionId ?? "",
      trunc2(i.amount).toFixed(2), i.currency, BILL_KIND_TEXT[i.kind] ?? i.kind,
      i.coverFrom ? (i.coverFrom === i.coverTo ? i.coverFrom : `${i.coverFrom} ถึง ${i.coverTo}`) : "",
    ].map(esc).join(","));
  return "﻿" + [BILL_CSV_HEAD.join(","), ...body].join("\n");
}
