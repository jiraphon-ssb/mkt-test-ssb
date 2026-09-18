/* รหัสจาก Edge Functions ads-sync / ads-connections → ข้อความไทยบนหน้าจอ (pure · มีเทส) */
const TEXT = {
  AUTH_REQUIRED: "ต้องเข้าสู่ระบบก่อน",
  TEAM_LEAD_REQUIRED: "เฉพาะหัวหน้าทีมเท่านั้น",
  MEMBER_REQUIRED: "บัญชีนี้ยังไม่ได้ผูกกับโปรไฟล์ทีม ให้หัวหน้าทีมผูกให้ก่อน",
  FUNCTION_UNREACHABLE: "เรียกระบบหลังบ้านไม่ได้ ตรวจอินเทอร์เน็ต หรือเว็บนี้ยังไม่อยู่ในรายชื่อ origin ที่อนุญาต",
  OAUTH_START_FAILED: "เริ่มเชื่อม Meta ไม่สำเร็จ ลองใหม่อีกครั้ง",
  OAUTH_STATUS_FAILED: "ตรวจสถานะการเชื่อม Meta ไม่สำเร็จ",
  DISCONNECT_FAILED: "ยกเลิกการเชื่อมไม่สำเร็จ ลองใหม่อีกครั้ง",
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
  META_TOKEN_EXPIRING: "การเชื่อม Meta ใกล้หมดอายุ — กด “เชื่อมบัญชี” ใหม่ในหน้าตั้งค่าก่อนถึงกำหนด ไม่งั้นข้อมูลจะหยุดเข้า",
  SYNC_EMPTY_RESULT: "Meta ตอบกลับว่าไม่มีข้อมูลในช่วงนี้ ทั้งที่เคยมีอยู่ — ระบบไม่เขียนทับของเดิมและจะลองใหม่รอบหน้า",
  SYNC_WRITE_FAILED: "บันทึกยอดลงฐานไม่สำเร็จ ยอดเดิมยังอยู่ครบ",
  RECONCILE_FAILED: "ตรวจยอดไม่สำเร็จ ลองใหม่อีกครั้ง",
  CREATIVE_SYNC_FAILED: "ดึง Creative ไม่สำเร็จ ยอดยังอยู่ครบ ลองใหม่ภายหลัง",
  SYNC_RANGE_INVALID: "ช่วงวันที่ขอดึงไม่ถูกต้อง",
  CURSOR_INVALID: "ตำแหน่งดึง Creative ต่อไม่ถูกต้อง ลองดึงใหม่",
  AD_ID_INVALID: "รหัสโฆษณาไม่ถูกต้อง",
  AD_NOT_FOUND: "ไม่พบโฆษณานี้ในข้อมูลของบัญชี กดดึงข้อมูลใหม่ก่อน",
  PREVIEW_FORMAT_INVALID: "รูปแบบตัวอย่างไม่รองรับ",
  PREVIEW_UNAVAILABLE: "Meta ไม่ส่งตัวอย่างของโฆษณานี้ (อาจถูกลบหรือไม่รองรับตำแหน่งนี้) ลองรูปแบบอื่น",
  META_TOO_MUCH_DATA: "Meta ขอให้ลดปริมาณข้อมูลต่อคำขอ ลองดึงช่วงสั้นลง",
  ACCOUNT_NOT_AUTHORIZED: "บัญชีนี้ไม่อยู่ในบัญชีที่คุณเชื่อม OAuth",
  ACCOUNT_MAPPED_TWICE: "บัญชีเดียวกันผูกหลายแบรนด์ ยอดจะนับซ้ำ",
  ACCOUNT_NOT_ACTIVE: "บัญชีโฆษณานี้ถูกปิดใช้งานใน Meta",
  ACCOUNT_ID_INVALID: "Account ID ต้องเป็น act_ ตามด้วยตัวเลข",
  MAPPINGS_INVALID: "ข้อมูล mapping ไม่ถูกต้อง",
  // ── ระบบขาย (sales-sync) ──
  SUPERSEDED_PURCHASE_FIX: "ยกเลิกรอบนี้ — ดึงใหม่แล้วหลังแก้การนับยอด purchase (15–16 ก.ย.)",
  STALE_RUN: "รอบค้างเกินเวลา ระบบปิดให้แล้ว รอบถัดไปดึงช่วงนี้ใหม่",
  SALES_API_NOT_CONFIGURED: "ยังไม่ได้ตั้ง SALES_API_URL / SALES_API_KEY ใน Edge Function Secrets",
  SALES_READ_FAILED: "อ่านข้อมูลจากระบบขายไม่สำเร็จ — กด “ตรวจการเชื่อมต่อ” เพื่อดูว่าคีย์หรือ URL มีปัญหาไหม",
  SALES_RESPONSE_INVALID: "ระบบขายตอบกลับผิดรูป ยังไม่ได้บันทึกอะไร",
  SALES_PAGE_LIMIT: "ข้อมูลวันเดียวของระบบขายเกินเพดานที่ดึงได้ต่อครั้ง ยังไม่ได้บันทึกอะไร",
  SALES_COLUMN_LEAK: "ระบบขายส่งข้อมูลเกินที่ขอ (อาจมีข้อมูลลูกค้าติดมา) — หยุดไว้ก่อน ไม่ได้บันทึกอะไร",
  SALES_EMPTY_RESULT: "ระบบขายตอบว่าไม่มีข้อมูลทั้งช่วง — ระบบไม่เขียนทับของเดิม น่าจะเป็นเรื่องสิทธิ์ของคีย์",
  SALES_WRITE_FAILED: "บันทึกยอดขายลงฐานไม่สำเร็จ ยอดเดิมยังอยู่ครบ",
  SALES_GOALS_FAILED: "ยอดขายเข้าแล้ว แต่อ่านเป้าจากระบบขายไม่สำเร็จ",
  SALES_GOALS_WRITE_FAILED: "ยอดขายเข้าแล้ว แต่บันทึกเป้าไม่สำเร็จ",
  SALES_RANGE_INVALID: "ช่วงวันที่ไม่ถูกต้อง",
  SALES_RANGE_TOO_LONG: "ดึงย้อนหลังได้ครั้งละไม่เกิน 93 วัน",
  SALES_SYNC_CRASHED: "ดึงยอดขายหยุดกลางทาง ยังไม่ได้บันทึกอะไรเพิ่ม ลองใหม่อีกครั้ง",
  SALES_SYNC_FAILED: "ดึงยอดขายไม่สำเร็จ",
  SALES_CHECK_FAILED: "ตรวจการเชื่อมต่อระบบขายไม่สำเร็จ",
  SALES_INVENTORY_FAILED: "สำรวจแหล่งข้อมูลของระบบขายไม่สำเร็จ",
  // ── ยอดขาย JUNTAKARN จากระบบ TMK Operation (เฟส JK ของ sales-sync) ──
  JK_MISSING: "ระบบ TMK ยังไม่มีฟังก์ชัน jk_ads_daily_facts — ต้องรันไฟล์ SQL ในโปรเจกต์ TMK ก่อน",
  JK_NO_PERMISSION: "คีย์ที่ตั้งไว้เรียกฟังก์ชันของระบบ TMK ไม่ได้ (ต้องเป็น service role key ของโปรเจกต์ TMK)",
  JK_BAD_KEY: "JK_API_KEY ผิด หมดอายุ หรือไม่ใช่ของโปรเจกต์ TMK",
  JK_ERROR: "เรียกระบบ TMK ไม่สำเร็จ — ตรวจ JK_API_URL ว่าเป็น URL ของโปรเจกต์ TMK",
  JK_OPEN: "ระบบ TMK ตอบกลับผิดรูป ยอด JUNTAKARN ยังไม่ได้บันทึก",
  JK_COLUMN_LEAK: "ระบบ TMK ส่งคอลัมน์เกินที่ขอ — หยุดไว้ก่อน ไม่ได้บันทึกยอด JUNTAKARN",
  JK_EMPTY_RESULT: "ระบบ TMK คืนวันไม่ครบทั้งช่วง — ไม่เขียนทับของเดิม ยอด JUNTAKARN ยังเป็นของรอบก่อน",
  JK_WRITE_FAILED: "บันทึกยอด JUNTAKARN ลงฐานไม่สำเร็จ ยอดเดิมยังอยู่ครบ",
  JK_FAILED: "ดึงยอด JUNTAKARN ไม่สำเร็จ ยอดของแบรนด์อื่นไม่กระทบ",
  NEEDS_RECONNECT: "ต้องเชื่อม Meta ใหม่เพื่อให้สิทธิ์อ่านเพจ",
  DEADLINE: "หมดเวลาก่อนทำครบ รอบหน้าจะทำต่อ",
  PIPELINE_FAILED: "รอบนี้ไม่สำเร็จ",
};

/** error ของ supabase.functions.invoke → รหัส: body { error } · ส่งไม่ถึง function = FUNCTION_UNREACHABLE */
export async function functionErrorCode(error, fallback) {
  if (error?.name === "FunctionsFetchError" || error?.name === "FunctionsRelayError") return "FUNCTION_UNREACHABLE";
  try {
    const body = await error?.context?.json?.();
    if (typeof body?.error === "string") return body.error;
  } catch { /* body ไม่ใช่ JSON */ }
  return fallback;
}

export function adsErrorText(error, fallback = "ทำรายการไม่สำเร็จ") {
  const code = typeof error === "string" ? error : error?.code ?? error?.message;
  if (TEXT[code]) return TEXT[code];
  if (/supabase/i.test(String(code ?? ""))) return "ยังไม่ได้เชื่อม Supabase (โหมดเดโม)";
  return fallback;
}
