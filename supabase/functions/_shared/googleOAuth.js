/* OAuth ของ Google Ads — ส่วนที่คิดได้โดยไม่ต้องต่อเน็ต (pure · เทสใน tests/googleOAuth.test.js)
   ตัว Edge Function เป็นคนยิง fetch และเก็บ token ที่เข้ารหัสแล้ว — ไฟล์นี้ไม่แตะทั้งเครือข่ายและฐานข้อมูล

   เก็บอะไรไว้ที่ไหน: ad_provider_authorizations.token_ciphertext เก็บ **refresh token**
   (ของ Meta เก็บ access token อายุยาว แต่ Google ให้ access token อายุ 1 ชม. — ตัวที่อยู่ยาวคือ refresh token)
   access token ขอใหม่ตอนจะดึงข้อมูลทุกครั้ง ไม่เก็บลงฐาน

   กับดักที่ต้องกันไว้ตั้งแต่ต้น: ถ้าไม่ใส่ access_type=offline และ prompt=consent
   Google จะ "ต่อสำเร็จ" แต่ไม่ส่ง refresh token มา → วันรุ่งขึ้นดึงข้อมูลไม่ได้และหาสาเหตุยากมาก */

export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export function googleAuthorizeUrl({ clientId, redirectUri, state }) {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_ADS_SCOPE);
  url.searchParams.set("access_type", "offline");   // ขอ refresh token
  url.searchParams.set("prompt", "consent");        // บังคับให้ส่ง refresh token มาแม้เคยยินยอมแล้ว
  url.searchParams.set("state", state);
  return url.toString();
}

const form = (fields) => new URLSearchParams(fields).toString();

export function googleTokenExchange({ clientId, clientSecret, code, redirectUri }) {
  return {
    url: TOKEN_ENDPOINT,
    body: form({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  };
}

export function googleTokenRefresh({ clientId, clientSecret, refreshToken }) {
  return {
    url: TOKEN_ENDPOINT,
    body: form({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  };
}

/** refreshToken เป็น null ได้ — ตอนต่ออายุ Google ไม่ส่งมาใหม่ ผู้เรียกต้องเก็บของเดิมไว้ ห้ามทับด้วยค่าว่าง */
export function parseGoogleTokenResponse(payload, { now = Date.now() } = {}) {
  if (!payload?.access_token) {
    throw new Error(`แลก token กับ Google ไม่สำเร็จ: ${payload?.error ?? "ไม่มี access_token ในคำตอบ"}`);
  }
  const expiresIn = Number(payload.expires_in);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: Number.isFinite(expiresIn) ? new Date(now + expiresIn * 1000).toISOString() : null,
    scopes: String(payload.scope ?? "").split(" ").filter(Boolean),
  };
}

/** ขอ access token สดจาก refresh token (Google ให้ access token อายุ 1 ชม. จึงต้องขอใหม่ทุกครั้งก่อนดึงข้อมูล)
    refresh token ใช้ไม่ได้แล้ว (ถูกเพิกถอน/ผู้ใช้ถอนสิทธิ์) = TOKEN_EXPIRED เพื่อให้หน้าจอชวนเชื่อมใหม่
    ไม่ใช่ error ทั่วไปที่ชวนให้ไปไล่บั๊ก */
export async function refreshGoogleAccessToken({ clientId, clientSecret, refreshToken, fetch }) {
  const request = googleTokenRefresh({ clientId, clientSecret, refreshToken });
  const response = await fetch(request.url, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: request.body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error("TOKEN_EXPIRED"), { code: "TOKEN_EXPIRED", detail: payload?.error ?? null });
  return parseGoogleTokenResponse(payload);
}

/** ถอนสิทธิ์ที่ฝั่ง Google จริง — ลบแถวในฐานอย่างเดียวไม่พอ สิทธิ์จะยังค้างอยู่ในบัญชี Google ของผู้ใช้ */
export function googleRevokeRequest(token) {
  return { url: "https://oauth2.googleapis.com/revoke", body: new URLSearchParams({ token }).toString() };
}
