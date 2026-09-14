import { describe, it, expect } from "vitest";
import { safeReturnTo, publicErrorCode, DEFAULT_RETURN_TO } from "../supabase/functions/_shared/returnTo.js";

const APP = "https://app.example.com";

describe("safeReturnTo — กัน open redirect หลัง OAuth", () => {
  it("path ในแอปผ่าน และคง query/hash", () => {
    expect(safeReturnTo("/mkt/ads?panel=settings&tab=sources", APP)).toBe("/mkt/ads?panel=settings&tab=sources");
    expect(safeReturnTo("/mkt/campaigns#x", APP)).toBe("/mkt/campaigns#x");
  });
  it("host อื่น · protocol-relative · backslash · control char · path นอกโมดูล → fallback", () => {
    for (const bad of ["https://evil.com/x", "//evil.com", "/\\evil.com", "/\\\\evil.com", "/\t/evil.com", "/%5Cevil.com/../..", "javascript:alert(1)", "/admin", "", null, 42]) {
      expect(safeReturnTo(bad, APP), String(bad)).toBe(DEFAULT_RETURN_TO);
    }
  });
  it("ผลลัพธ์เมื่อประกอบกับ origin ต้องอยู่ origin เดิมเสมอ (ทดสอบตามที่ reviewer ใช้)", () => {
    for (const input of ["/\\evil.com", "/\t/evil.com", "/mkt/ads", "//evil.com/mkt/ads"]) {
      const out = new URL(safeReturnTo(input, APP), APP);
      expect(out.origin).toBe(APP);
    }
  });
  it("publicErrorCode ปล่อยเฉพาะรหัสที่รู้จัก ข้อความ Postgres/Meta ถูกแทนด้วยรหัสกลาง", () => {
    expect(publicErrorCode(new Error("ADS_READ_NOT_GRANTED"), "OAUTH_CALLBACK_FAILED")).toBe("ADS_READ_NOT_GRANTED");
    expect(publicErrorCode(new Error('duplicate key value violates unique constraint "ad_provider_authorizations_pkey"'), "OAUTH_CALLBACK_FAILED")).toBe("OAUTH_CALLBACK_FAILED");
    expect(publicErrorCode("Meta API 400", "X")).toBe("X");
  });
});
