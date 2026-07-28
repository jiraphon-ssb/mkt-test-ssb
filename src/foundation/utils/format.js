/* Shared formatting helpers — money + Thai dates.
   Used by every module so figures render identically everywhere. */

/* Round to satang; show 2 decimals only when there's a real fraction
   (มีเศษถึงแสดง): 3500 -> "3,500", 332401.87 -> "332,401.87" */
const grouped = (v) => {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return Number.isInteger(n)
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Thai Baht, grouped, satang when present: 2450000 -> "฿2,450,000" */
export const baht = (v) => "฿" + grouped(v);

/** Bare grouped amount without the ฿ symbol: 420000 -> "420,000" */
export const amount = (v) => grouped(v);

export const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/**
 * Relative Thai time for feeds/notifications: "เมื่อกี้" · "5 นาทีที่แล้ว" ·
 * "3 ชม.ที่แล้ว" · "เมื่อวาน" · เก่ากว่านั้น → วันที่ไทยสั้น. Date หรือ ISO string.
 */
export const timeAgo = (input) => {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "เมื่อกี้";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  if (s < 172800) return "เมื่อวาน";
  return thaiDate(d);
};

/**
 * Thai short date. Accepts a Date or ISO string.
 * thaiDate("2026-06-17") -> "17 มิ.ย."
 * thaiDate("2026-06-17", { year: true }) -> "17 มิ.ย. 2569"  (Buddhist year)
 */
export const thaiDate = (input, { year = false } = {}) => {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = THAI_MONTHS_SHORT[d.getMonth()];
  if (!year) return `${day} ${month}`;
  return `${day} ${month} ${d.getFullYear() + 543}`;
};
