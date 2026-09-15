import { describe, it, expect } from "vitest";
import { mediaView } from "../src/modules/marketing/creatives/creativeMedia.js";

const img = (patch = {}) => ({ type: "image", imageUrl: "https://s/i.jpg", thumbnailUrl: "https://s/t.jpg", source: "post", ...patch });

describe("mediaView — ส่วนสื่อของการ์ด Creative", () => {
  it("วิดีโอ: ภาพปก + ป้ายวิดีโอ", () => {
    expect(mediaView({ format: "video", media: [img({ type: "video" })] })).toEqual({ kind: "video", src: "https://s/t.jpg", count: 1, label: "วิดีโอ", fromPage: false });
  });
  it("ภาพเดี่ยว · ใช้ thumbnail ก่อน ไม่มีค่อยใช้ imageUrl", () => {
    expect(mediaView({ format: "image", media: [img({ thumbnailUrl: null })] })).toMatchObject({ kind: "image", src: "https://s/i.jpg", label: "ภาพ" });
  });
  it("carousel: นับจำนวนภาพ · ป้าย 'ชุดภาพ · n' · media ที่ไม่มีภาพไม่ถูกนับ", () => {
    expect(mediaView({ format: "carousel", media: [img(), img(), { type: "image" }, img()] })).toMatchObject({ kind: "carousel", count: 3, label: "ชุดภาพ · 3" });
    expect(mediaView({ format: "image", media: [img(), img()] })).toMatchObject({ kind: "carousel", count: 2 });
  });
  it("มีแค่ภาพย่อระดับ creative (รูปโปรไฟล์เพจ) = fromPage ให้การ์ดบอกว่าเป็นภาพจากเพจ", () => {
    expect(mediaView({ format: "image", media: [img({ source: "creative" })] }).fromPage).toBe(true);
  });
  it("ไม่มีสื่อ / asset ว่าง = none", () => {
    expect(mediaView(null)).toEqual({ kind: "none", src: null, count: 0, label: "ไม่มีภาพ", fromPage: false });
    expect(mediaView({ format: "video", media: [{ type: "video" }] }).kind).toBe("none");
  });
});
