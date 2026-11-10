import { describe, expect, it } from "vitest";
import { platformMeta } from "../src/modules/marketing/ads/PlatformIcon.jsx";

/* ตรวจ 10 พ.ย.: การ์ด ChatGPT Ads ขึ้นสี่เหลี่ยมเทาเปล่า ขณะที่ Google มีตัว G */
describe("platformMeta", () => {
  it("ChatGPT Ads มีสีและตัวอักษรของตัวเอง ไม่ตกไปเป็นช่องทางที่ไม่รู้จัก", () => {
    const meta = platformMeta("ChatGPT Ads");
    expect(meta.color).not.toBe("var(--ink-soft)");
    expect(meta.glyph).toBeTruthy();
  });
});
