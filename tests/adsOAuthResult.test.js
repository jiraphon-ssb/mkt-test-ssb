import { describe, it, expect } from "vitest";
import { oauthResultMessage, stripOAuthParams } from "../src/modules/marketing/ads/adsOAuthResult.js";

describe("adsOAuthResult — ข้อความหลัง callback ของ Meta OAuth", () => {
  it("success + จำนวนบัญชี", () => {
    expect(oauthResultMessage("?panel=settings&tab=sources&oauth=success&accounts=3")).toEqual({ kind: "ok", tab: "sources", text: "เชื่อม Meta Ads แล้ว · พบ 3 บัญชีโฆษณา" });
    expect(oauthResultMessage("?oauth=success&accounts=0").text).toContain("ยังไม่พบบัญชีโฆษณา");
  });
  it("error แปลรหัสเป็นภาษาคน · รหัสไม่รู้จักโชว์ตามที่ได้", () => {
    expect(oauthResultMessage("?oauth=error&reason=ADS_READ_NOT_GRANTED")).toMatchObject({ kind: "bad", text: expect.stringContaining("ads_read") });
    expect(oauthResultMessage("?oauth=error&reason=SOMETHING_ELSE").text).toBe("เชื่อม Meta ไม่สำเร็จ: SOMETHING_ELSE");
  });
  it("ไม่มี param → null · stripOAuthParams ลบเฉพาะ param ผลลัพธ์", () => {
    expect(oauthResultMessage("?panel=settings")).toBeNull();
    expect(stripOAuthParams("http://localhost:5173/mkt/ads?panel=settings&tab=sources&oauth=success&accounts=2")).toBe("/mkt/ads?panel=settings&tab=sources");
  });
});
