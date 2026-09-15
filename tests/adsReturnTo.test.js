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

import { parseOrigins, requestAppOrigin, returnTarget, resolveReturnUrl } from "../supabase/functions/_shared/returnTo.js";

describe("หลาย origin (Vercel + localhost) — กลับไปหน้าเดิมที่กดเชื่อม", () => {
  const ALLOWED = parseOrigins(" https://mkt-test-ssb.vercel.app, http://localhost:5173 ,,http://127.0.0.1:5173 ");
  const DEFAULT = "https://mkt-test-ssb.vercel.app";
  it("parseOrigins ตัดช่องว่าง/ค่าว่าง · ตัด path และ / ท้ายให้เหลือ origin", () => {
    expect(ALLOWED).toEqual(["https://mkt-test-ssb.vercel.app", "http://localhost:5173", "http://127.0.0.1:5173"]);
    expect(parseOrigins("https://a.example.com/x/, not a url")).toEqual(["https://a.example.com"]);
    expect(parseOrigins(undefined)).toEqual([]);
  });
  it("requestAppOrigin: Origin ของคำขออยู่ใน allowlist = ใช้ตัวนั้น · ไม่อยู่/ไม่มี = ค่าเริ่ม", () => {
    expect(requestAppOrigin("http://localhost:5173", ALLOWED, DEFAULT)).toBe("http://localhost:5173");
    expect(requestAppOrigin("https://evil.example", ALLOWED, DEFAULT)).toBe(DEFAULT);
    expect(requestAppOrigin(null, ALLOWED, DEFAULT)).toBe(DEFAULT);
    expect(requestAppOrigin("http://localhost:5173.evil.com", ALLOWED, DEFAULT)).toBe(DEFAULT);
  });
  it("returnTarget: เก็บ origin + path ที่ผ่าน safeReturnTo แล้ว", () => {
    expect(returnTarget("/mkt/ads?panel=settings&tab=sources", "http://localhost:5173")).toBe("http://localhost:5173/mkt/ads?panel=settings&tab=sources");
    expect(returnTarget("https://evil.com/x", "http://localhost:5173")).toBe(`http://localhost:5173${DEFAULT_RETURN_TO}`);
  });
  it("resolveReturnUrl: origin ที่เก็บไว้ต้องอยู่ใน allowlist ตอน callback ด้วย · ของเก่าที่เป็น path ล้วนใช้ค่าเริ่ม", () => {
    expect(resolveReturnUrl("http://localhost:5173/mkt/ads?panel=settings", ALLOWED, DEFAULT)).toBe("http://localhost:5173/mkt/ads?panel=settings");
    expect(resolveReturnUrl("https://evil.example/mkt/ads", ALLOWED, DEFAULT)).toBe(`${DEFAULT}${DEFAULT_RETURN_TO}`);
    expect(resolveReturnUrl("/mkt/campaigns", ALLOWED, DEFAULT)).toBe(`${DEFAULT}/mkt/campaigns`);
    expect(resolveReturnUrl("https://mkt-test-ssb.vercel.app/admin", ALLOWED, DEFAULT)).toBe(`${DEFAULT}${DEFAULT_RETURN_TO}`);
    expect(resolveReturnUrl(null, ALLOWED, DEFAULT)).toBe(`${DEFAULT}${DEFAULT_RETURN_TO}`);
    for (const bad of ["http://localhost:5173/\\evil.com", "http://localhost:5173@evil.com/mkt/ads", "javascript:alert(1)"]) {
      expect(new URL(resolveReturnUrl(bad, ALLOWED, DEFAULT)).origin, bad).toMatch(/^(https:\/\/mkt-test-ssb\.vercel\.app|http:\/\/localhost:5173)$/);
    }
  });
});
