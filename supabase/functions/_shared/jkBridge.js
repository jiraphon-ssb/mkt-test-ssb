/* สะพานไประบบ TMK Operation (ยอดขาย JUNTAKARN) — ประกอบ URL ของ RPC และแบ่งช่วงวัน
   สถานะประตู/ชนิดคีย์ใช้ของเดิมร่วมกับสะพานพี่ทัช (doorState / describeSalesKey ใน salesBridge.js)
   ขอเฉพาะ JK_FACT_COLUMNS เสมอ — ข้อมูลลูกค้าไม่ข้ามระบบ (ตัดตั้งแต่ฝั่งขอ ไม่ใช่ดึงมาแล้วทิ้ง) */
import { JK_FACT_COLUMNS } from "./jkFacts.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const baseOf = (url) => String(url ?? "").trim().replace(/\/+$/, "");
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function jkFactsUrl(url, from, to) {
  if (!ISO.test(String(from ?? "")) || !ISO.test(String(to ?? ""))) throw new Error("DATE_INVALID");
  const target = new URL(`${baseOf(url)}/rest/v1/rpc/jk_ads_daily_facts`);
  target.searchParams.set("select", JK_FACT_COLUMNS.join(","));
  return target.toString();
}

/** 1 แถว/วัน → ก้อนละ 31 วันยังห่างเพดาน 1,000 แถวของ PostgREST มาก */
export function jkWindows(from, to, size = 31) {
  if (!ISO.test(String(from ?? "")) || !ISO.test(String(to ?? "")) || from > to) return [];
  const step = Math.max(1, Math.trunc(Number(size) || 1));
  const out = [];
  for (let start = from; start <= to; start = addDays(start, step)) {
    const end = addDays(start, step - 1);
    out.push({ from: start, to: end < to ? end : to });
  }
  return out;
}
