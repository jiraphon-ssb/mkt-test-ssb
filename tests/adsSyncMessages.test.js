import { describe, it, expect } from "vitest";
import { adsErrorText } from "../src/modules/marketing/ads/adsSyncMessages.js";
import { SYNC_PUBLIC_CODES } from "../supabase/functions/_shared/adsSyncJob.js";

describe("adsErrorText", () => {
  it("รหัสจาก backend → ข้อความไทย · รับทั้ง string และ Error ที่มี code", () => {
    expect(adsErrorText("META_TOKEN_INVALID")).toBe("สิทธิ์ Meta หมดอายุ ต้องเชื่อมบัญชีใหม่");
    expect(adsErrorText(Object.assign(new Error("x"), { code: "SYNC_ALREADY_RUNNING" }))).toContain("กำลังดึงข้อมูลอยู่");
    expect(adsErrorText(new Error("Supabase is not configured"))).toBe("ยังไม่ได้เชื่อม Supabase (โหมดเดโม)");
    expect(adsErrorText(new Error("random db text"), "ดึงไม่สำเร็จ")).toBe("ดึงไม่สำเร็จ");
  });
  it("รหัสที่ ads-sync ส่งถึงผู้ใช้และเกิดจากสถานการณ์จริง มีข้อความไทยครบ", () => {
    const internalOnly = new Set(["METHOD_NOT_ALLOWED", "CONNECTION_ID_REQUIRED", "PROVIDER_NOT_SUPPORTED", "SYNC_MODE_INVALID", "SYNC_RANGE_INVALID", "GRAPH_VERSION_INVALID", "META_PAGING_INVALID"]);
    for (const code of SYNC_PUBLIC_CODES) {
      if (internalOnly.has(code)) continue;
      expect(adsErrorText(code, "__none__"), code).not.toBe("__none__");
    }
  });
});

import { functionErrorCode } from "../src/modules/marketing/ads/adsSyncMessages.js";
describe("functionErrorCode — แปลง error ของ supabase.functions.invoke เป็นรหัส", () => {
  it("body มี { error } ใช้รหัสนั้น · ส่งไม่ถึง function (CORS/เครือข่าย) = FUNCTION_UNREACHABLE · อื่นๆ = fallback", async () => {
    const http = { name: "FunctionsHttpError", context: { json: async () => ({ error: "MEMBER_REQUIRED" }) } };
    expect(await functionErrorCode(http, "X")).toBe("MEMBER_REQUIRED");
    expect(await functionErrorCode({ name: "FunctionsFetchError", message: "Failed to send a request to the Edge Function" }, "X")).toBe("FUNCTION_UNREACHABLE");
    expect(await functionErrorCode({ name: "FunctionsHttpError", context: { json: async () => { throw new Error("not json"); } } }, "X")).toBe("X");
  });
  it("ข้อความไทยของรหัสใหม่", () => {
    expect(adsErrorText("FUNCTION_UNREACHABLE")).toContain("เรียกระบบหลังบ้านไม่ได้");
    expect(adsErrorText("MEMBER_REQUIRED")).toContain("โปรไฟล์ทีม");
  });
});

/* เฟสของ JUNTAKARN (ยอด + เป้า) — รหัสพวกนี้ขึ้นหน้าจอโดยตรง ห้ามหลุดเป็นโค้ดดิบ */
describe("รหัสของสะพาน JUNTAKARN มีข้อความไทยครบ", () => {
  const codes = [
    "JK_MISSING", "JK_NO_PERMISSION", "JK_BAD_KEY", "JK_ERROR", "JK_OPEN",
    "JK_COLUMN_LEAK", "JK_EMPTY_RESULT", "JK_WRITE_FAILED", "JK_FAILED",
    "JK_GOAL_MISSING", "JK_GOAL_NO_PERMISSION", "JK_GOAL_BAD_KEY", "JK_GOAL_ERROR", "JK_GOAL_OPEN",
    "JK_GOAL_COLUMN_LEAK", "JK_GOAL_WRITE_FAILED", "JK_GOAL_FAILED",
  ];
  it("ทุกรหัสมีคำอธิบายไทย ไม่คืนโค้ดดิบ", () => {
    for (const code of codes) {
      const text = adsErrorText(code, "__none__");
      expect(text, code).not.toBe("__none__");
      expect(text, code).not.toBe(code);
      expect(text.length, code).toBeGreaterThan(10);
    }
  });
  it("รหัสเป้าแยกจากรหัสยอด (อ่านแล้วรู้ว่าเป็นเรื่องเป้า)", () => {
    expect(adsErrorText("JK_GOAL_NO_PERMISSION")).toContain("เป้า");
    expect(adsErrorText("JK_NO_PERMISSION")).not.toContain("เป้า");
  });
});
