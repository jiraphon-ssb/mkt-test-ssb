/* ตัวจัดรูปที่หน้าบิลใช้ร่วมกัน (ตาราง · ใบเสร็จ · หน้าต่างรายละเอียดบิล) — ตัวเลข 2 ตำแหน่งไม่ปัด */
import { fmtMoney } from "../dash/charts/theme.js";

export const money = (n) => (n == null ? "—" : fmtMoney(n));
export const dayTh = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
export const monthTh = (iso) => new Date(`${String(iso).slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "short", timeZone: "UTC" });
export const coverText = (c) => (!c?.coverFrom ? null : c.coverFrom === c.coverTo ? dayTh(c.coverFrom) : `${dayTh(c.coverFrom)} – ${dayTh(c.coverTo)}`);
/** เวลาไทยของเหตุการณ์ ("2026-09-26T09:56:29+0000" → 16:56) — วันเดียวกันตัดหลายครั้ง ต้องแยกได้ว่าใบไหน */
export const timeTh = (eventTime) => {
  const ms = Date.parse(String(eventTime ?? "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isFinite(ms) ? new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16) : null;
};
/** เลขรายการ 35 ตัวย่อเหลือหัว-ท้าย (ตัวเต็มอยู่ในหน้าต่างรายละเอียด + ปุ่มคัดลอก + CSV) */
export const shortRef = (id) => (!id ? null : id.length > 14 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id);
/** ส่วนต่างมีเครื่องหมายเสมอ (+/−) ไม่ใส่ ฿ ซ้ำ */
export const signed = (n) => (n == null ? "—" : `${n >= 0 ? "+" : "−"}${fmtMoney(Math.abs(n))}`);
