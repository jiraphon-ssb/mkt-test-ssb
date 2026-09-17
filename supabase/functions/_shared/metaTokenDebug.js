/* วันหมดอายุ token Meta จาก /debug_token (pure · เทสใน tests/metaTokenDebug.test.js)
   ทำไมต้องมี: ตอนแลก token อายุยาว Meta ไม่ส่ง expires_in มาทุกครั้ง → expires_at เป็น null → เตือนล่วงหน้าไม่ได้
   Meta บอกเวลาเป็นวินาที · 0 = ไม่หมดอายุ · สิทธิ์เข้าถึงข้อมูล (data_access_expires_at) หมดก่อนได้ และหมดแล้วดึงข้อมูลไม่ได้เหมือนกัน */

const CHECK_EVERY_MS = 24 * 3_600_000;

/** URL มีแค่ input_token · app token (App ID|App Secret) ส่งทาง header ไม่ให้ secret ไปโผล่ใน URL/log */
export function debugTokenRequest({ version, inputToken, appId, appSecret }) {
  const url = new URL(`https://graph.facebook.com/${version}/debug_token`);
  url.searchParams.set("input_token", inputToken);
  return { url: url.toString(), headers: { Authorization: `Bearer ${appId}|${appSecret}` } };
}

const epochIso = (value) => {
  if (value === 0) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return new Date(value * 1000).toISOString();
};

/** คำตอบ debug_token → วันหมดอายุ · ผิดรูป/ไม่มี is_valid = null (ผู้เรียกต้องไม่เขียนทับของเดิม) */
export function tokenExpiryFromDebug(payload) {
  const data = payload?.data;
  if (!data || payload?.error || typeof data.is_valid !== "boolean") return null;
  const expiresAt = epochIso(data.expires_at ?? 0);
  const dataAccessExpiresAt = epochIso(data.data_access_expires_at ?? 0);
  if (expiresAt === undefined || dataAccessExpiresAt === undefined) return null;
  const effectiveExpiresAt = [expiresAt, dataAccessExpiresAt].filter(Boolean).sort()[0] ?? null;
  return { valid: data.is_valid, expiresAt, dataAccessExpiresAt, effectiveExpiresAt };
}

/** ถึงเวลาตรวจไหม: ยังไม่รู้วันหมดอายุ หรือตรวจล่าสุดเกิน 24 ชม. */
export function tokenCheckDue(authorization, now = Date.now()) {
  if (!authorization?.expires_at) return true;
  const last = Date.parse(authorization.last_verified_at ?? "");
  return !Number.isFinite(last) || now - last >= CHECK_EVERY_MS;
}

/** ผลตรวจ → ค่าที่เขียนลง ad_provider_authorizations · ตรวจไม่ได้ = null */
export function authorizationTokenPatch(result, nowIso) {
  if (!result) return null;
  if (!result.valid) return { status: "expired", last_verified_at: nowIso };
  return { expires_at: result.effectiveExpiresAt, last_verified_at: nowIso };
}
