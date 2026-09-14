/* safeReturnTo — ทางกลับหลัง OAuth ต้องอยู่ใน origin ของแอปเท่านั้น
   ตรวจด้วย URL parser (ไม่ใช่ string prefix) เพราะ "/\\evil.com" หรือ "/\t/evil.com" ผ่าน startsWith("/") แต่ parser อ่านเป็น host อื่น
   เป็น .js (ไม่ใช่ .ts) เพื่อให้ Deno และ vitest ใช้ไฟล์เดียวกัน — มีเทสใน tests/adsReturnTo.test.js */
export const DEFAULT_RETURN_TO = "/mkt/ads?panel=settings";

export function safeReturnTo(value, appOrigin) {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_RETURN_TO;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return DEFAULT_RETURN_TO;      // control chars / backslash = พยายามหลอก parser
  let base;
  try { base = new URL(appOrigin); } catch { return DEFAULT_RETURN_TO; }
  let url;
  try { url = new URL(value, base); } catch { return DEFAULT_RETURN_TO; }
  if (url.origin !== base.origin) return DEFAULT_RETURN_TO;
  if (!url.pathname.startsWith("/mkt/")) return DEFAULT_RETURN_TO;         // กลับได้เฉพาะหน้าในโมดูล ads/marketing
  return url.pathname + url.search + url.hash;
}

/** รหัสข้อผิดพลาดที่อนุญาตให้ออกไปถึงเบราว์เซอร์ (M2) — อย่างอื่นรวมเป็นรหัสกลาง ไม่รั่วข้อความ Postgres/Meta */
export const PUBLIC_ERROR_CODES = new Set([
  "STATE_MISSING", "STATE_INVALID_OR_EXPIRED", "CODE_MISSING", "TOKEN_EXCHANGE_FAILED",
  "ADS_READ_NOT_GRANTED", "ACCOUNT_DISCOVERY_FAILED", "access_denied",
  "AUTH_REQUIRED", "TEAM_LEAD_REQUIRED", "PROVIDER_NOT_SUPPORTED", "AUTHORIZATION_ID_REQUIRED", "NOT_FOUND", "METHOD_NOT_ALLOWED",
]);
export function publicErrorCode(error, fallback) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return PUBLIC_ERROR_CODES.has(message) ? message : fallback;
}
