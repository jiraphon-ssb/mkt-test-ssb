/* แกะไฟล์ค่าแอดจาก Ads Manager → ค่าแอดรายวันระดับบัญชี (pure · ไม่ยุ่ง network/DOM)
   spec: docs/superpowers/specs/2026-10-08-ads-multi-provider-import-design.md

   กติกาแกนกลาง: **ตัวเลขเพี้ยนเงียบๆ แย่กว่าไม่มีข้อมูล**
   - ไม่เดาชื่อคอลัมน์ — หาไม่เจอคือหยุดแล้วบอกว่าไฟล์มีอะไร
   - ช่องค่าแอดว่าง = ข้ามแถว ไม่เติม 0 (ศูนย์จริงกับไม่รู้ ไม่ใช่เรื่องเดียวกัน)
   - วันอนาคต = ปฏิเสธ
   - วันเดียวกันหลายแถว (ไฟล์ระดับแคมเปญ) = รวมยอด แล้วรายงานว่ารวมไปกี่วัน

   ชื่อคอลัมน์มาจากไฟล์ export จริงเท่านั้น ห้ามเติมจากการเดา
   - openai: ยืนยันจากไฟล์จริงของ TEAMDEE (8 ต.ค. 69) — มี BOM นำหน้า ค่าในเครื่องหมายคำพูดทุกช่อง
   - google: ยังไม่มีไฟล์ตัวอย่างที่มีคอลัมน์ค่าใช้จ่าย (ไฟล์แรกที่ได้มามีแต่ CPC เฉลี่ย) */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNS = {
  openai: { date: ["date"], spend: ["spend"] },
  /* google: ยืนยันจากรายงานแคมเปญรายวันจริงของ TEAMDEE (9 ต.ค. 69 · หน้าจอภาษาไทย · UTF-8 คั่นด้วยคอมมา)
     ไฟล์นี้มีแถวสรุปซ้อนหลายชุด (ทั้งหมด: แคมเปญ / บัญชี / การค้นหา …) แยกรายวันด้วย — รวมทุกแถวจะได้ยอดราว 4 เท่า
     → นับเฉพาะแถวที่มีชื่อแคมเปญจริง (campaign) และเทียบยอดกับแถวสรุปของไฟล์เอง (accountTotal) ก่อนยอมรับ
     ชื่อคอลัมน์อังกฤษ (day/cost/campaign) ยังไม่เคยเห็นไฟล์จริง ใส่ไว้ตามชื่อมาตรฐานของ Google Ads */
  google: {
    date: ["วัน", "day"], spend: ["ค่าใช้จ่าย", "cost"],
    campaign: ["แคมเปญ", "campaign"], currency: ["รหัสสกุลเงิน", "currency code"],
    accountTotal: ["ทั้งหมด: บัญชี", "total: account"],
  },
};
const blank = (value) => { const v = String(value ?? "").trim(); return v === "" || v === "--"; };

/** CSV ที่มีเครื่องหมายคำพูดและคอมมาในค่า — แกะเองเพื่อไม่พึ่ง dependency ใหม่ */
function splitRow(line) {
  const out = []; let cur = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
    } else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

const norm = (s) => String(s ?? "").replace(/^﻿/, "").trim().toLowerCase();
/** ล้างคอมมาคั่นหลักและสัญลักษณ์/รหัสสกุลเงิน เหลือแต่ตัวเลข */
const toNumber = (raw) => {
  const cleaned = String(raw ?? "").replace(/[^\d.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
const isoDayToday = () => new Date().toISOString().slice(0, 10);

/**
 * @returns {{rows: {fact_date: string, spend: number}[], errors: string[], skipped: number, mergedDays: number, columns: string[]}}
 */
export function parseSpendCsv(text, providerId, { today = isoDayToday() } = {}) {
  const empty = { rows: [], errors: [], skipped: 0, mergedDays: 0, columns: [], currency: null, fileTotal: null };
  const spec = COLUMNS[providerId];
  if (!spec) return { ...empty, errors: [`ยังไม่รองรับไฟล์ของ ${providerId} — ยังไม่ได้ตั้งค่ารูปแบบไฟล์ของช่องทางนี้`] };

  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { ...empty, errors: ["ไฟล์ว่าง ไม่มีข้อมูลให้นำเข้า"] };

  /* หาแถวหัวตาราง — ไฟล์ของบางเจ้ามีบรรทัดชื่อรายงาน/ช่วงวันก่อนหัวตารางจริง
     เลือกแถวแรกที่มีครบทั้งคอลัมน์วันและคอลัมน์ค่าแอด */
  let head = null, headAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]).map(norm);
    if (spec.date.some((c) => cells.includes(c)) && spec.spend.some((c) => cells.includes(c))) { head = cells; headAt = i; break; }
  }
  if (!head) {
    const first = splitRow(lines[0]).map((c) => norm(c)).filter(Boolean);
    return {
      ...empty, columns: first,
      errors: [`ไม่พบคอลัมน์ที่ต้องใช้ — ไฟล์นี้มีคอลัมน์: ${first.join(", ") || "(ไม่มีหัวตาราง)"} · ต้องมีคอลัมน์วัน (${spec.date.join(" หรือ ")}) และคอลัมน์ค่าใช้จ่าย (${spec.spend.join(" หรือ ")})`],
    };
  }

  const dateAt = head.findIndex((c) => spec.date.includes(c));
  const spendAt = head.findIndex((c) => spec.spend.includes(c));
  const campaignAt = spec.campaign ? head.findIndex((c) => spec.campaign.includes(c)) : -1;
  const currencyAt = spec.currency ? head.findIndex((c) => spec.currency.includes(c)) : -1;
  /* ไฟล์ที่มีแถวสรุปปน ต้องมีคอลัมน์ชื่อแคมเปญไว้แยกแถวจริงออกจากแถวสรุป — ไม่มี = แยกไม่ได้ ห้ามเดา */
  if (spec.campaign && campaignAt < 0) {
    return { ...empty, columns: head.filter(Boolean),
      errors: [`ไม่พบคอลัมน์ชื่อแคมเปญ (${spec.campaign.join(" หรือ ")}) — ไฟล์นี้มีแถวสรุปปนอยู่ ถ้าไม่มีคอลัมน์นี้จะแยกแถวจริงไม่ได้และยอดจะซ้ำ`] };
  }
  const byDay = new Map();
  const errors = [];
  const currencies = new Set();
  let skipped = 0, merged = 0, future = 0, fileTotal = null;

  for (const line of lines.slice(headAt + 1)) {
    const cells = splitRow(line);
    // แถวสรุปทั้งบัญชี (ไม่มีวัน) = ยอดที่ไฟล์บอกเองว่ารวมได้เท่าไร ใช้ตรวจทานตอนท้าย
    if (spec.accountTotal && blank(cells[dateAt]) && cells.some((cell) => spec.accountTotal.includes(norm(cell)))) {
      fileTotal = toNumber(cells[spendAt]);
      continue;
    }
    if (campaignAt >= 0 && blank(cells[campaignAt])) continue;   // แถวสรุป ไม่ใช่แคมเปญจริง
    if (currencyAt >= 0 && !blank(cells[currencyAt])) currencies.add(String(cells[currencyAt]).trim().toUpperCase());
    const day = norm(cells[dateAt]).slice(0, 10);
    if (!ISO_DAY.test(day)) { skipped += 1; continue; }
    if (day > today) { future += 1; continue; }
    const spend = toNumber(cells[spendAt]);
    if (spend === null) { skipped += 1; continue; }   // ช่องว่าง = ไม่รู้ ห้ามนับเป็น 0
    if (byDay.has(day)) merged += 1;
    byDay.set(day, (byDay.get(day) ?? 0) + spend);
  }

  if (future > 0) errors.push(`ข้าม ${future} แถวที่เป็นวันอนาคต — ไฟล์น่าจะมาจากช่วงวันที่ตั้งผิด`);
  if (byDay.size === 0 && errors.length === 0) errors.push("ไม่มีแถวที่ใช้ได้ในไฟล์นี้");
  if (currencies.size > 1) return { ...empty, columns: head.filter(Boolean), errors: [`ไฟล์มีหลายสกุลเงินปนกัน (${[...currencies].join(", ")}) — ระบบไม่แปลงค่าเงินเอง`] };
  /* ตรวจทานกับยอดที่ไฟล์สรุปไว้เอง — ไม่ตรง = เราอ่านรูปแบบไฟล์ผิด (เช่น Google เพิ่มแถวสรุปชนิดใหม่) ห้ามนำเข้า
     ข้ามการตรวจเมื่อมีแถววันอนาคตถูกตัดออก เพราะยอดสรุปของไฟล์รวมแถวพวกนั้นไว้ */
  const parsedTotal = Math.round([...byDay.values()].reduce((n, v) => n + v, 0) * 100) / 100;
  if (fileTotal !== null && future === 0 && Math.abs(parsedTotal - fileTotal) > 0.01) {
    return { ...empty, columns: head.filter(Boolean),
      errors: [`ยอดที่อ่านได้ (${parsedTotal.toFixed(2)}) ไม่ตรงกับยอดรวมของไฟล์ (${fileTotal.toFixed(2)}) — รูปแบบไฟล์อาจเปลี่ยน ยังไม่นำเข้า`] };
  }

  const rows = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    // ปัดเศษทศนิยมลอยจากการบวก (219.87 + 216.26 ต้องได้ 436.13 ไม่ใช่ 436.13000000000005)
    .map(([fact_date, spend]) => ({ fact_date, spend: Math.round(spend * 100) / 100 }));

  return { rows, errors, skipped, mergedDays: merged, columns: head.filter(Boolean), currency: [...currencies][0] ?? null, fileTotal };
}
