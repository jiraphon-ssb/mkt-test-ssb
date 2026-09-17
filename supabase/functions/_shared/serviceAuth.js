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

/** ref ของโปรเจกต์จาก SUPABASE_URL — https://<ref>.supabase.co */
export function projectRefOf(url) {
  const host = String(url ?? "").replace(/^https?:\/\//, "").split("/")[0];
  const ref = host.split(".")[0];
  return /^[a-z0-9]{16,}$/i.test(ref) ? ref : null;
}

/** ผู้เรียกเป็น service role ไหม
    ทางลัด: ตรงกับคีย์ใน env (รองรับคีย์รูปแบบใหม่ที่ไม่ใช่ JWT)
    ทางรอง: JWT ที่ gateway ตรวจลายเซ็นมาแล้ว — ต้องเป็น role service_role ของ "โปรเจกต์นี้" และยังไม่หมดอายุ
    เงื่อนไข ref + exp มีไว้กันกรณีเผลอ deploy แบบ --no-verify-jwt: token ที่ปั้นเองจะไม่ผ่านง่ายๆ
    (ฟังก์ชันเหล่านี้ต้อง deploy โดยเปิด verify_jwt เสมอ — ห้ามใส่ --no-verify-jwt) */
export function isServiceRoleToken(token, { serviceKey = "", projectUrl = "", now = Date.now() } = {}) {
  if (!token) return false;
  if (sameSecret(token, serviceKey)) return true;
  const claims = jwtClaims(token);
  if (claims?.role !== "service_role") return false;
  const exp = Number(claims.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return false;
  const ref = projectRefOf(projectUrl);
  return Boolean(ref) && claims.ref === ref;
}

/** ป้ายผู้สั่งของรอบดึงข้อมูล — มีผู้ใช้ = กดเอง · service role = ตัวตั้งเวลา
    เว้นแต่คนสั่งผ่าน service key เอง (ดึงย้อนหลังด้วย pg_net/curl) ให้ส่ง { trigger: "manual" } มา
    ไม่งั้นประวัติจะขึ้น "อัตโนมัติ" ทั้งที่มีคนสั่ง */
export function runTriggerOf(user, body) {
  if (user) return "manual";
  return body?.trigger === "manual" ? "manual" : "cron";
}
