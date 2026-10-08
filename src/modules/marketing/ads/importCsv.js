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
  // เติมเมื่อได้ไฟล์จริงที่มีคอลัมน์ค่าใช้จ่าย — จนกว่าจะถึงตอนนั้น parse แล้วได้ error ที่อ่านรู้เรื่อง
  google: { date: ["day", "date", "วัน", "วันที่"], spend: ["cost", "ค่าใช้จ่าย"] },
};

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
  const empty = { rows: [], errors: [], skipped: 0, mergedDays: 0, columns: [] };
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
  const byDay = new Map();
  const errors = [];
  let skipped = 0, merged = 0, future = 0;

  for (const line of lines.slice(headAt + 1)) {
    const cells = splitRow(line);
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

  const rows = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    // ปัดเศษทศนิยมลอยจากการบวก (219.87 + 216.26 ต้องได้ 436.13 ไม่ใช่ 436.13000000000005)
    .map(([fact_date, spend]) => ({ fact_date, spend: Math.round(spend * 100) / 100 }));

  return { rows, errors, skipped, mergedDays: merged, columns: head.filter(Boolean) };
}
