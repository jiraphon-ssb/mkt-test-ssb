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
