/* รหัสจาก Edge Functions ads-sync / ads-connections → ข้อความไทยบนหน้าจอ (pure · มีเทส) */
const TEXT = {
  AUTH_REQUIRED: "ต้องเข้าสู่ระบบก่อน",
  TEAM_LEAD_REQUIRED: "เฉพาะหัวหน้าทีมเท่านั้น",
  CONNECTION_NOT_FOUND: "ไม่พบบัญชีนี้ในระบบ ลองบันทึกหน้าตั้งค่าอีกครั้ง",
  CONNECTION_NOT_READY: "บัญชียังไม่พร้อม ต้องเชื่อม OAuth และบันทึก mapping ก่อน",
  AUTHORIZATION_NOT_READY: "การเชื่อม Meta หมดอายุหรือถูกยกเลิก ต้องเชื่อมใหม่",
  SYNC_ALREADY_RUNNING: "บัญชีนี้กำลังดึงข้อมูลอยู่ รอสักครู่",
  META_RATE_LIMIT: "Meta จำกัดจำนวนคำขอชั่วคราว ลองใหม่ภายหลัง",
  META_TOKEN_INVALID: "สิทธิ์ Meta หมดอายุ ต้องเชื่อมบัญชีใหม่",
  META_PERMISSION: "บัญชีนี้ไม่ได้ให้สิทธิ์ ads_read กับผู้ที่เชื่อม",
  META_TEMPORARY: "Meta ขัดข้องชั่วคราว ลองใหม่ภายหลัง",
  META_API_ERROR: "Meta ปฏิเสธคำขอ ตรวจ Account ID และสิทธิ์",
  META_RESPONSE_INVALID: "ข้อมูลจาก Meta ผิดรูป ยังไม่ได้บันทึกยอด",
  META_TOO_MANY_PAGES: "ข้อมูลช่วงนี้ใหญ่เกิน ลดจำนวนวันย้อนหลังแล้วลองใหม่",
  INSIGHT_ROW_INVALID: "ข้อมูลจาก Meta ผิดรูป ยังไม่ได้บันทึกยอด",
  SYNC_WRITE_FAILED: "บันทึกยอดลงฐานไม่สำเร็จ ยอดเดิมยังอยู่ครบ",
  ACCOUNT_NOT_AUTHORIZED: "บัญชีนี้ไม่อยู่ในบัญชีที่คุณเชื่อม OAuth",
  ACCOUNT_MAPPED_TWICE: "บัญชีเดียวกันผูกหลายแบรนด์ ยอดจะนับซ้ำ",
  ACCOUNT_NOT_ACTIVE: "บัญชีโฆษณานี้ถูกปิดใช้งานใน Meta",
  ACCOUNT_ID_INVALID: "Account ID ต้องเป็น act_ ตามด้วยตัวเลข",
  MAPPINGS_INVALID: "ข้อมูล mapping ไม่ถูกต้อง",
};

export function adsErrorText(error, fallback = "ทำรายการไม่สำเร็จ") {
  const code = typeof error === "string" ? error : error?.code ?? error?.message;
  if (TEXT[code]) return TEXT[code];
  if (/supabase/i.test(String(code ?? ""))) return "ยังไม่ได้เชื่อม Supabase (โหมดเดโม)";
  return fallback;
}
