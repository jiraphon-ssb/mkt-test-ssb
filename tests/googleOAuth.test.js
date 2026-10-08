/* OAuth ฝั่ง Google (pure · เทสได้โดยไม่ต้องยิงจริง)
   กับดักคลาสสิกของ Google OAuth: ถ้าไม่ใส่ access_type=offline + prompt=consent
   จะ "ต่อสำเร็จ" แต่ไม่ได้ refresh token → รุ่งขึ้นดึงข้อมูลไม่ได้และหาสาเหตุไม่เจอ */
import { describe, expect, it, vi } from "vitest";
import {
  GOOGLE_ADS_SCOPE, googleAuthorizeUrl, googleTokenExchange, googleTokenRefresh, googleRevokeRequest, parseGoogleTokenResponse, refreshGoogleAccessToken,
} from "../supabase/functions/_shared/googleOAuth.js";

const app = { clientId: "cid.apps.googleusercontent.com", clientSecret: "secret", redirectUri: "https://x.supabase.co/functions/v1/ads-oauth-callback" };

describe("googleAuthorizeUrl", () => {
  const url = new URL(googleAuthorizeUrl({ ...app, state: "st123" }));

  it("ขอสิทธิ์ Google Ads อย่างเดียว ไม่ขอเกินจำเป็น", () => {
    expect(url.searchParams.get("scope")).toBe(GOOGLE_ADS_SCOPE);
    expect(GOOGLE_ADS_SCOPE).toBe("https://www.googleapis.com/auth/adwords");
  });

  it("บังคับขอ refresh token — ขาดอย่างใดอย่างหนึ่งคือพังเงียบวันถัดไป", () => {
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("พา state ไปด้วยเพื่อกันคำขอปลอม", () => {
    expect(url.searchParams.get("state")).toBe("st123");
    expect(url.searchParams.get("redirect_uri")).toBe(app.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});

describe("googleTokenExchange / googleTokenRefresh", () => {
  it("แลกโค้ดเป็น token ด้วย grant_type authorization_code", () => {
    const req = googleTokenExchange({ ...app, code: "abc" });
    expect(req.url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(req.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("abc");
    expect(body.get("redirect_uri")).toBe(app.redirectUri);
  });

  it("ต่ออายุด้วย refresh token ไม่ต้องให้คนกดยินยอมใหม่", () => {
    const body = new URLSearchParams(googleTokenRefresh({ ...app, refreshToken: "rt" }).body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt");
    expect(body.get("code")).toBe(null);
  });
});

describe("parseGoogleTokenResponse", () => {
  it("อ่าน access token · refresh token · เวลาหมดอายุ", () => {
    const out = parseGoogleTokenResponse({ access_token: "at", refresh_token: "rt", expires_in: 3599, scope: GOOGLE_ADS_SCOPE }, { now: Date.parse("2026-10-08T00:00:00Z") });
    expect(out.accessToken).toBe("at");
    expect(out.refreshToken).toBe("rt");
    expect(out.expiresAt).toBe("2026-10-08T00:59:59.000Z");
    expect(out.scopes).toEqual([GOOGLE_ADS_SCOPE]);
  });

  it("กดยินยอมซ้ำแล้ว Google ไม่ส่ง refresh token มา = คืน null ให้ผู้เรียกเก็บของเดิมไว้ ไม่ใช่ทับด้วยค่าว่าง", () => {
    expect(parseGoogleTokenResponse({ access_token: "at2", expires_in: 3599 }).refreshToken).toBe(null);
  });

  it("ไม่มี access token = โยน error ไม่เก็บสถานะว่าต่อสำเร็จ", () => {
    expect(() => parseGoogleTokenResponse({ error: "invalid_grant" })).toThrow(/invalid_grant/);
  });
});

describe("refreshGoogleAccessToken", () => {
  it("ได้ access token สดจาก refresh token", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "fresh", expires_in: 3599 }) }));
    const out = await refreshGoogleAccessToken({ ...app, refreshToken: "rt", fetch });
    expect(out.accessToken).toBe("fresh");
  });

  it("refresh token ถูกเพิกถอน = TOKEN_EXPIRED เพื่อให้หน้าจอชวนเชื่อมใหม่ ไม่ใช่ error ปนเป", async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) }));
    await expect(refreshGoogleAccessToken({ ...app, refreshToken: "rt", fetch })).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
  });
});

describe("googleRevokeRequest", () => {
  it("ถอนสิทธิ์ที่ Google จริง ไม่ใช่แค่ลบแถวในฐาน", () => {
    const req = googleRevokeRequest("rt");
    expect(req.url).toBe("https://oauth2.googleapis.com/revoke");
    expect(new URLSearchParams(req.body).get("token")).toBe("rt");
  });
});
