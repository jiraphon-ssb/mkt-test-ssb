/* ผู้เรียกเป็น service role ไหม (pg_cron → ads-cron → ads-sync) — pure · เทสใน tests/serviceAuth.test.js
   ฟังก์ชันที่เปิด verify_jwt ไว้: แพลตฟอร์มตรวจลายเซ็น JWT ให้แล้วก่อนถึงโค้ดเรา → เชื่อ claim role ได้
   ยังเทียบกับคีย์ใน env เป็นทางลัดไว้ก่อน เผื่อคีย์รูปแบบใหม่ที่ไม่ใช่ JWT */
export function bearerToken(header) {
  return String(header ?? "").replace(/^Bearer\s+/i, "").trim();
}

export function jwtClaims(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const json = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

const sameSecret = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);   // เวลาคงที่ ไม่ให้เดาทีละตัวอักษร
  return diff === 0;
};

export function isServiceRoleToken(token, serviceKey, now = Date.now()) {
  if (!token) return false;
  if (sameSecret(token, serviceKey)) return true;
  const claims = jwtClaims(token);
  if (claims?.role !== "service_role") return false;
  return !Number.isFinite(Number(claims.exp)) || Number(claims.exp) * 1000 > now;
}
