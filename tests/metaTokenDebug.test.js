/* วันหมดอายุ token Meta จาก /debug_token — ใช้แทน expires_in ที่ Meta ไม่ส่งมาตอนแลก token อายุยาว */
import { describe, expect, it } from "vitest";
import { authorizationTokenPatch, debugTokenRequest, tokenCheckDue, tokenExpiryFromDebug } from "../supabase/functions/_shared/metaTokenDebug.js";

const NOW = Date.parse("2026-09-17T12:00:00Z");
const sec = (iso) => Math.floor(Date.parse(iso) / 1000);

describe("debugTokenRequest", () => {
  it("ส่ง app token ใน header ไม่ใส่ app secret ใน URL · มีแค่ input_token ใน query", () => {
    const req = debugTokenRequest({ version: "v26.0", inputToken: "USER_TOKEN", appId: "123", appSecret: "SECRET" });
    const url = new URL(req.url);
    expect(url.origin + url.pathname).toBe("https://graph.facebook.com/v26.0/debug_token");
    expect([...url.searchParams.keys()]).toEqual(["input_token"]);
    expect(req.url).not.toContain("SECRET");
    expect(req.headers.Authorization).toBe("Bearer 123|SECRET");
  });
});

describe("tokenExpiryFromDebug", () => {
  it("วันหมดอายุจริง = ตัวที่มาก่อนระหว่าง token กับสิทธิ์เข้าถึงข้อมูล", () => {
    const out = tokenExpiryFromDebug({ data: { is_valid: true, expires_at: sec("2026-11-10T00:00:00Z"), data_access_expires_at: sec("2026-10-20T00:00:00Z") } });
    expect(out).toEqual({ valid: true, expiresAt: "2026-11-10T00:00:00.000Z", dataAccessExpiresAt: "2026-10-20T00:00:00.000Z", effectiveExpiresAt: "2026-10-20T00:00:00.000Z" });
  });

  it("expires_at = 0 แปลว่าไม่หมดอายุ → ใช้วันหมดสิทธิ์เข้าถึงข้อมูลแทน", () => {
    const out = tokenExpiryFromDebug({ data: { is_valid: true, expires_at: 0, data_access_expires_at: sec("2026-12-01T00:00:00Z") } });
    expect(out).toMatchObject({ expiresAt: null, effectiveExpiresAt: "2026-12-01T00:00:00.000Z" });
  });

  it("ไม่หมดทั้งคู่ = effective null (ไม่เดาวัน)", () => {
    expect(tokenExpiryFromDebug({ data: { is_valid: true, expires_at: 0, data_access_expires_at: 0 } }).effectiveExpiresAt).toBeNull();
  });

  it("token ใช้ไม่ได้แล้ว = valid false", () => {
    expect(tokenExpiryFromDebug({ data: { is_valid: false, expires_at: sec("2026-09-01T00:00:00Z") } }).valid).toBe(false);
  });

  it("คำตอบผิดรูป / error = null (อย่าเขียนทับของเดิม)", () => {
    expect(tokenExpiryFromDebug({ error: { message: "x" } })).toBeNull();
    expect(tokenExpiryFromDebug(null)).toBeNull();
    expect(tokenExpiryFromDebug({ data: { expires_at: 123 } })).toBeNull();   // ไม่มี is_valid
    expect(tokenExpiryFromDebug({ data: { is_valid: true, expires_at: "abc" } })).toBeNull();
  });
});

describe("tokenCheckDue", () => {
  it("ยังไม่รู้วันหมดอายุ = เช็กเลย", () => {
    expect(tokenCheckDue({ expires_at: null, last_verified_at: "2026-09-17T11:00:00Z" }, NOW)).toBe(true);
  });
  it("เช็กไปไม่ถึง 24 ชม. = ข้าม · เกิน = เช็ก · ไม่เคยเช็ก = เช็ก", () => {
    expect(tokenCheckDue({ expires_at: "2026-11-01T00:00:00Z", last_verified_at: "2026-09-17T00:00:00Z" }, NOW)).toBe(false);
    expect(tokenCheckDue({ expires_at: "2026-11-01T00:00:00Z", last_verified_at: "2026-09-16T11:00:00Z" }, NOW)).toBe(true);
    expect(tokenCheckDue({ expires_at: "2026-11-01T00:00:00Z", last_verified_at: null }, NOW)).toBe(true);
  });
});

describe("authorizationTokenPatch", () => {
  const nowIso = "2026-09-17T12:00:00.000Z";
  it("ใช้ได้ = อัปเดตวันหมดอายุ + เวลาที่ตรวจ", () => {
    expect(authorizationTokenPatch({ valid: true, effectiveExpiresAt: "2026-10-20T00:00:00.000Z" }, nowIso))
      .toEqual({ expires_at: "2026-10-20T00:00:00.000Z", last_verified_at: nowIso });
  });
  it("ใช้ไม่ได้ = status expired (หน้าจอขึ้นให้เชื่อมใหม่) ไม่แตะวันหมดอายุ", () => {
    expect(authorizationTokenPatch({ valid: false, effectiveExpiresAt: null }, nowIso)).toEqual({ status: "expired", last_verified_at: nowIso });
  });
  it("ตรวจไม่ได้ = ไม่มีอะไรต้องเขียน", () => {
    expect(authorizationTokenPatch(null, nowIso)).toBeNull();
  });
});
