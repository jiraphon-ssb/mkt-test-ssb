import { describe, it, expect } from "vitest";
import { bearerToken, isServiceRoleToken, jwtClaims } from "../supabase/functions/_shared/serviceAuth.js";

const NOW = Date.UTC(2026, 8, 16, 10, 0, 0);
const b64 = (obj) => btoa(JSON.stringify(obj)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const jwt = (claims) => `eyJhbGciOiJIUzI1NiJ9.${b64(claims)}.sig`;
const SERVICE = jwt({ role: "service_role", ref: "abc", exp: 2000000000 });

describe("bearerToken", () => {
  it("ตัด Bearer และช่องว่าง · ไม่มี header = ค่าว่าง", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerToken("bearer  abc ")).toBe("abc");
    expect(bearerToken(null)).toBe("");
  });
});

describe("jwtClaims", () => {
  it("อ่าน payload ได้ · ของเสีย/ไม่ใช่ JWT = null (ไม่ throw)", () => {
    expect(jwtClaims(SERVICE)).toMatchObject({ role: "service_role", ref: "abc" });
    expect(jwtClaims("sb_secret_xxx")).toBeNull();
    expect(jwtClaims("a.b")).toBeNull();
    expect(jwtClaims("a.@@@.c")).toBeNull();
    expect(jwtClaims("")).toBeNull();
  });
});

describe("isServiceRoleToken", () => {
  it("ตรงกับคีย์ใน env = ผ่าน (ทางลัด ไม่ต้องแกะ JWT)", () => {
    expect(isServiceRoleToken("sb_secret_same", "sb_secret_same", NOW)).toBe(true);
  });
  it("คีย์ถูกหมุนใหม่จน env ไม่ตรง แต่เป็น service_role ที่แพลตฟอร์มตรวจลายเซ็นมาแล้ว = ผ่าน", () => {
    expect(isServiceRoleToken(SERVICE, "คีย์เก่าคนละตัว", NOW)).toBe(true);
  });
  it("token ของสมาชิกทั่วไป · anon · หมดอายุ · ว่าง = ไม่ผ่าน", () => {
    expect(isServiceRoleToken(jwt({ role: "authenticated", exp: 2000000000 }), "k", NOW)).toBe(false);
    expect(isServiceRoleToken(jwt({ role: "anon", exp: 2000000000 }), "k", NOW)).toBe(false);
    expect(isServiceRoleToken(jwt({ role: "service_role", exp: 1000 }), "k", NOW)).toBe(false);
    expect(isServiceRoleToken("", "", NOW)).toBe(false);
    expect(isServiceRoleToken("", "k", NOW)).toBe(false);
  });
  it("ไม่มี exp = ยังใช้ได้ (แพลตฟอร์มเป็นคนคุมอายุ)", () => {
    expect(isServiceRoleToken(jwt({ role: "service_role" }), "k", NOW)).toBe(true);
  });
});
