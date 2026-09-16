import { describe, it, expect } from "vitest";
import { mediaView, clampIndex, swipeStep } from "../src/modules/marketing/creatives/creativeMedia.js";

const img = (patch = {}) => ({ type: "image", imageUrl: "https://s/i.jpg", thumbnailUrl: "https://s/t.jpg", source: "post", ...patch });

describe("mediaView — ส่วนสื่อของการ์ด Creative", () => {
  it("วิดีโอ: ภาพปก + ป้ายวิดีโอ · items มีชนิดต่อชิ้น", () => {
    expect(mediaView({ format: "video", media: [img({ type: "video" })] })).toEqual({
      kind: "video", count: 1, label: "วิดีโอ", key: "1|https://s/t.jpg", items: [{ src: "https://s/t.jpg", type: "video" }],
    });
  });
  it("ภาพเดี่ยว · ใช้ thumbnail ก่อน ไม่มีค่อยใช้ imageUrl", () => {
    expect(mediaView({ format: "image", media: [img({ thumbnailUrl: null })] })).toMatchObject({ kind: "image", label: "ภาพ", items: [{ src: "https://s/i.jpg", type: "image" }] });
  });
  it("หลายภาพ: นับเฉพาะชิ้นที่มีภาพ · ป้าย 'ชุดภาพ · n' · ชิ้นวิดีโอในชุดคงชนิดวิดีโอ", () => {
    const view = mediaView({ format: "carousel", media: [img(), img({ type: "video", thumbnailUrl: "https://s/v.jpg" }), { type: "image" }, img({ thumbnailUrl: "https://s/3.jpg" })] });
    expect(view).toMatchObject({ kind: "carousel", count: 3, label: "ชุดภาพ · 3" });
    expect(view.items.map((i) => i.type)).toEqual(["image", "video", "image"]);
    expect(view.key).toBe("3|https://s/t.jpg|https://s/3.jpg");
    expect(mediaView({ format: "image", media: [img(), img({ thumbnailUrl: "https://s/t2.jpg" })] })).toMatchObject({ kind: "carousel", count: 2 });
  });
  it("ชุดที่ทุกชิ้นชี้ภาพเดียวกัน = ภาพเดียว ไม่โชว์ตัวนับหลอกว่ามี 8 ภาพ", () => {
    // ของจริงจาก Meta: อัลบั้ม 8 ชิ้นที่ child ไม่มี URL ภาพติดมา ทุกชิ้นเลยตกไปใช้ภาพระดับ creative ตัวเดียวกัน
    const same = Array.from({ length: 8 }, () => img());
    expect(mediaView({ format: "carousel", media: same })).toMatchObject({ kind: "image", count: 1, label: "ภาพ" });
  });
  it("ชุดที่ซ้ำบางชิ้น = เหลือเฉพาะภาพที่ต่างกันจริง เรียงตามเดิม", () => {
    const view = mediaView({ format: "carousel", media: [img(), img({ thumbnailUrl: "https://s/b.jpg" }), img(), img({ thumbnailUrl: "https://s/c.jpg" })] });
    expect(view.count).toBe(3);
    expect(view.items.map((i) => i.src)).toEqual(["https://s/t.jpg", "https://s/b.jpg", "https://s/c.jpg"]);
  });
  it("ไม่มีสื่อ / asset ว่าง = none", () => {
    expect(mediaView(null)).toEqual({ kind: "none", count: 0, label: "ไม่มีภาพ", key: "0", items: [] });
    expect(mediaView({ format: "video", media: [{ type: "video" }] }).kind).toBe("none");
  });
});

describe("เลื่อนภาพ", () => {
  it("clampIndex: ไม่เลยหัว/ท้าย · ชุดว่างเป็น 0", () => {
    expect(clampIndex(-1, 5)).toBe(0);
    expect(clampIndex(7, 5)).toBe(4);
    expect(clampIndex(2, 5)).toBe(2);
    expect(clampIndex(3, 0)).toBe(0);
  });
  it("swipeStep: ปัดแนวนอนเกิน 40px = เลื่อน · ปัดแนวตั้ง/สั้นไป = ไม่นับ (ยังเลื่อนหน้าได้)", () => {
    expect(swipeStep(-60, 5)).toBe(1);       // ปัดซ้าย = ภาพถัดไป
    expect(swipeStep(55, -8)).toBe(-1);      // ปัดขวา = ภาพก่อนหน้า
    expect(swipeStep(30, 0)).toBe(0);
    expect(swipeStep(-50, 80)).toBe(0);      // ตั้งใจเลื่อนหน้า
  });
});
