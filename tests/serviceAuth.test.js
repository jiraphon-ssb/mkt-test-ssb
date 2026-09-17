import { describe, it, expect } from "vitest";
import { bearerToken, isServiceRoleToken, jwtClaims, runTriggerOf } from "../supabase/functions/_shared/serviceAuth.js";

const NOW = Date.UTC(2026, 8, 16, 10, 0, 0);
const b64 = (obj) => btoa(JSON.stringify(obj)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const jwt = (claims) => `eyJhbGciOiJIUzI1NiJ9.${b64(claims)}.sig`;
const PROJECT = "https://lzvftqhffqefqupwulus.supabase.co";
const REF = "lzvftqhffqefqupwulus";
const SERVICE = jwt({ role: "service_role", ref: REF, exp: 2000000000 });

describe("bearerToken", () => {
  it("ตัด Bearer และช่องว่าง · ไม่มี header = ค่าว่าง", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerToken("bearer  abc ")).toBe("abc");
    expect(bearerToken(null)).toBe("");
  });
});

describe("jwtClaims", () => {
  it("อ่าน payload ได้ · ของเสีย/ไม่ใช่ JWT = null (ไม่ throw)", () => {
    expect(jwtClaims(SERVICE)).toMatchObject({ role: "service_role", ref: REF });
    expect(jwtClaims("sb_secret_xxx")).toBeNull();
    expect(jwtClaims("a.b")).toBeNull();
    expect(jwtClaims("a.@@@.c")).toBeNull();
    expect(jwtClaims("")).toBeNull();
  });
});

describe("isServiceRoleToken", () => {
  it("ตรงกับคีย์ใน env = ผ่าน (ทางลัด ไม่ต้องแกะ JWT)", () => {
    expect(isServiceRoleToken("sb_secret_same", { serviceKey: "sb_secret_same", projectUrl: PROJECT, now: NOW })).toBe(true);
  });
  it("คีย์ถูกหมุนใหม่จน env ไม่ตรง แต่เป็น service_role ของโปรเจกต์นี้ที่ยังไม่หมดอายุ = ผ่าน", () => {
    expect(isServiceRoleToken(SERVICE, { serviceKey: "คีย์เก่าคนละตัว", projectUrl: PROJECT, now: NOW })).toBe(true);
  });
  it("token ของสมาชิกทั่วไป · anon · หมดอายุ · ว่าง = ไม่ผ่าน", () => {
    const opts = { serviceKey: "k", projectUrl: PROJECT, now: NOW };
    expect(isServiceRoleToken(jwt({ role: "authenticated", ref: REF, exp: 2000000000 }), opts)).toBe(false);
    expect(isServiceRoleToken(jwt({ role: "anon", ref: REF, exp: 2000000000 }), opts)).toBe(false);
    expect(isServiceRoleToken(jwt({ role: "service_role", ref: REF, exp: 1000 }), opts)).toBe(false);
    expect(isServiceRoleToken("", { serviceKey: "", projectUrl: PROJECT, now: NOW })).toBe(false);
    expect(isServiceRoleToken("", opts)).toBe(false);
  });
  it("ไม่มี exp หรือ exp ไม่ใช่ตัวเลข = ไม่ผ่าน (token ที่ไม่มีวันหมดอายุคือของปลอมที่ปั้นเองได้)", () => {
    const opts = { serviceKey: "k", projectUrl: PROJECT, now: NOW };
    expect(isServiceRoleToken(jwt({ role: "service_role", ref: REF }), opts)).toBe(false);
    expect(isServiceRoleToken(jwt({ role: "service_role", ref: REF, exp: "not-a-time" }), opts)).toBe(false);
  });
  it("คีย์ของโปรเจกต์อื่น = ไม่ผ่าน แม้ role จะเป็น service_role", () => {
    const opts = { serviceKey: "k", projectUrl: PROJECT, now: NOW };
    expect(isServiceRoleToken(jwt({ role: "service_role", ref: "someotherprojectref", exp: 2000000000 }), opts)).toBe(false);
    expect(isServiceRoleToken(jwt({ role: "service_role", exp: 2000000000 }), opts)).toBe(false);   // ไม่มี ref เลย
  });
});

describe("runTriggerOf — ป้ายผู้สั่งในประวัติรอบ (data_pipeline_runs.trigger_kind)", () => {
  it("มีผู้ใช้ = manual · service role เฉยๆ (ads-cron) = cron", () => {
    expect(runTriggerOf({ id: "u1" }, {})).toBe("manual");
    expect(runTriggerOf(null, {})).toBe("cron");
    expect(runTriggerOf(null, { inventory: true })).toBe("cron");
  });
  it("service role ที่คนสั่งเอง (ดึงย้อนหลังผ่าน pg_net/curl) ส่ง trigger: manual ได้ · ค่าอื่นไม่นับ", () => {
    expect(runTriggerOf(null, { trigger: "manual" })).toBe("manual");
    expect(runTriggerOf(null, { trigger: "admin" })).toBe("cron");
    expect(runTriggerOf(null, null)).toBe("cron");
  });
});
