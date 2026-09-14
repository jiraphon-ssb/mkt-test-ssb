/* ผลลัพธ์ที่ ads-oauth-callback ส่งกลับมาทาง query string (?oauth=success&accounts=N | ?oauth=error&reason=…)
   pure: แปลง search string → ข้อความ toast + tab ที่ควรเปิด · null เมื่อไม่มี param */
const REASONS = {
  STATE_MISSING: "ลิงก์เชื่อมต่อไม่ครบ ลองกดเชื่อมบัญชีใหม่",
  STATE_INVALID_OR_EXPIRED: "ลิงก์เชื่อมต่อหมดอายุ (10 นาที) ลองกดเชื่อมบัญชีใหม่",
  CODE_MISSING: "Meta ไม่ส่งรหัสยืนยันกลับมา ลองใหม่อีกครั้ง",
  TOKEN_EXCHANGE_FAILED: "แลก token กับ Meta ไม่สำเร็จ ตรวจ App ID/Secret และ Redirect URI",
  ADS_READ_NOT_GRANTED: "ยังไม่ได้ให้สิทธิ์อ่านโฆษณา (ads_read) กดเชื่อมใหม่แล้วยืนยันสิทธิ์",
  ACCOUNT_DISCOVERY_FAILED: "เชื่อมแล้วแต่ดึงรายชื่อ Ad Account ไม่ได้ ตรวจสิทธิ์ใน Business Settings",
  access_denied: "ยกเลิกการเชื่อมต่อจากฝั่ง Meta",
};

export function oauthResultMessage(search = "") {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const status = params.get("oauth");
  if (status === "success") {
    const accounts = Number(params.get("accounts") ?? 0);
    return { kind: "ok", tab: "sources", text: accounts > 0 ? `เชื่อม Meta Ads แล้ว · พบ ${accounts} บัญชีโฆษณา` : "เชื่อม Meta Ads แล้ว แต่ยังไม่พบบัญชีโฆษณา ตรวจสิทธิ์ใน Business Settings" };
  }
  if (status === "error") {
    const reason = params.get("reason") ?? "";
    return { kind: "bad", tab: "sources", text: REASONS[reason] ?? `เชื่อม Meta ไม่สำเร็จ: ${reason || "ไม่ทราบสาเหตุ"}` };
  }
  return null;
}

/** ลบ param ผลลัพธ์ออกจาก URL หลังแสดงแล้ว (กัน toast เด้งซ้ำตอน refresh) */
export function stripOAuthParams(href) {
  const url = new URL(href);
  ["oauth", "reason", "accounts"].forEach((key) => url.searchParams.delete(key));
  return url.pathname + (url.search ? url.search : "") + url.hash;
}
