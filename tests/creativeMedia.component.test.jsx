// @vitest-environment jsdom
/* แกลเลอรีภาพบนการ์ด Creative — ระดับหน้าจอ
   ตรรกะล้วน (mediaView/clampIndex/swipeStep) มีเทสอยู่แล้วใน tests/creativeMedia.test.js
   ไฟล์นี้ตรวจสิ่งที่ผู้ใช้เห็นและกดจริง: ตัวนับ ปุ่มเลื่อน คีย์บอร์ด สถานะภาพเสีย และการกดดูตัวอย่าง */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CreativeMedia } from "../src/modules/marketing/creatives/CreativeMedia.jsx";

afterEach(cleanup);

const img = (src, type = "image") => ({ thumbnailUrl: src, type });
const rowWith = (media, asset = {}) => ({
  creative: "ชิ้น A",
  asset: { media, copy: { headline: "หัวเรื่องโฆษณา" }, ...asset },
});
const counterOf = (container) => container.querySelector(".cl-media-count")?.textContent.replace(/\s+/g, " ").trim() ?? null;

describe("CreativeMedia — ภาพเดียว / ไม่มีภาพ", () => {
  it("ภาพเดียว = ไม่มีปุ่มเลื่อนและไม่มีตัวนับ ไม่ให้ผู้ใช้เข้าใจผิดว่ามีภาพอื่น", () => {
    const { container } = render(<CreativeMedia row={rowWith([img("a.jpg")])} />);
    expect(screen.queryByLabelText("ภาพถัดไป")).toBeNull();
    expect(screen.queryByLabelText("ภาพก่อนหน้า")).toBeNull();
    expect(counterOf(container)).toBeNull();
    expect(container.querySelector(".cl-media-badge").textContent).toBe("ภาพ");
  });

  it("ไม่มีภาพ = บอกตรงๆ ว่ายังไม่มี ไม่ใช่กรอบว่าง", () => {
    render(<CreativeMedia row={rowWith([])} />);
    expect(screen.getByText("ยังไม่มีภาพ")).toBeTruthy();
  });
});

describe("CreativeMedia — ชุดภาพ", () => {
  const threeImages = () => rowWith([img("a.jpg"), img("b.jpg"), img("c.jpg")]);

  it("เริ่มที่ภาพแรก ตัวนับบอกตำแหน่ง และปุ่มย้อนกลับกดไม่ได้", () => {
    const { container } = render(<CreativeMedia row={threeImages()} />);
    expect(counterOf(container)).toBe("ภาพที่ 1 / 3");
    expect(screen.getByLabelText("ภาพก่อนหน้า").disabled).toBe(true);
    expect(screen.getByLabelText("ภาพถัดไป").disabled).toBe(false);
  });

  it("กดถัดไป/ก่อนหน้า แล้วภาพและตัวนับเปลี่ยนตาม", () => {
    const { container } = render(<CreativeMedia row={threeImages()} />);
    fireEvent.click(screen.getByLabelText("ภาพถัดไป"));
    expect(counterOf(container)).toBe("ภาพที่ 2 / 3");
    expect(container.querySelector(".cl-media-img").getAttribute("src")).toBe("b.jpg");
    fireEvent.click(screen.getByLabelText("ภาพก่อนหน้า"));
    expect(counterOf(container)).toBe("ภาพที่ 1 / 3");
    expect(container.querySelector(".cl-media-img").getAttribute("src")).toBe("a.jpg");
  });

  it("ถึงภาพสุดท้ายแล้วปุ่มถัดไปกดไม่ได้ ไม่วนกลับไปภาพแรกแบบไม่บอก", () => {
    const { container } = render(<CreativeMedia row={threeImages()} />);
    fireEvent.click(screen.getByLabelText("ภาพถัดไป"));
    fireEvent.click(screen.getByLabelText("ภาพถัดไป"));
    expect(counterOf(container)).toBe("ภาพที่ 3 / 3");
    expect(screen.getByLabelText("ภาพถัดไป").disabled).toBe(true);
  });

  it("ลูกศรซ้าย/ขวา และ Home/End บนคีย์บอร์ดใช้ได้", () => {
    const { container } = render(<CreativeMedia row={threeImages()} />);
    const group = container.querySelector(".cl-media");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(counterOf(container)).toBe("ภาพที่ 2 / 3");
    fireEvent.keyDown(group, { key: "End" });
    expect(counterOf(container)).toBe("ภาพที่ 3 / 3");
    fireEvent.keyDown(group, { key: "Home" });
    expect(counterOf(container)).toBe("ภาพที่ 1 / 3");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(counterOf(container)).toBe("ภาพที่ 1 / 3");   // อยู่ภาพแรกแล้ว ไม่วนไปท้าย
  });

  it("บอกผู้ใช้ที่ใช้โปรแกรมอ่านหน้าจอว่าเลื่อนได้ และ alt บอกตำแหน่งภาพ", () => {
    const { container } = render(<CreativeMedia row={threeImages()} />);
    const group = container.querySelector(".cl-media");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toContain("ใช้ลูกศรซ้ายขวาเพื่อเลื่อน");
    expect(screen.getByAltText("หัวเรื่องโฆษณา · ภาพที่ 1 จาก 3")).toBeTruthy();
  });

  it("ภาพหมดอายุ = บอกว่าเลื่อนดูภาพอื่นได้ ไม่ใช่เงียบ", () => {
    const { container } = render(<CreativeMedia row={threeImages()} />);
    fireEvent.error(container.querySelector(".cl-media-img"));
    expect(screen.getByText("ภาพนี้หมดอายุ")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("ภาพถัดไป"));
    expect(container.querySelector(".cl-media-img").getAttribute("src")).toBe("b.jpg");
  });

  it("เปลี่ยนชุดภาพ (ดึงใหม่/เปลี่ยนหน้า) แล้วกลับไปภาพแรก ไม่ค้างตำแหน่งเดิมของชุดก่อน", () => {
    const { container, rerender } = render(<CreativeMedia row={threeImages()} />);
    fireEvent.click(screen.getByLabelText("ภาพถัดไป"));
    expect(counterOf(container)).toBe("ภาพที่ 2 / 3");
    rerender(<CreativeMedia row={rowWith([img("x.jpg"), img("y.jpg"), img("z.jpg")])} />);
    expect(counterOf(container)).toBe("ภาพที่ 1 / 3");
    expect(container.querySelector(".cl-media-img").getAttribute("src")).toBe("x.jpg");
  });
});

describe("CreativeMedia — ดูตัวอย่างโฆษณาจริง", () => {
  it("มีรหัสโฆษณาครบและเปิดดูได้ = มีปุ่ม กดแล้วส่งแถวนั้นออกไป", () => {
    const onPreview = vi.fn();
    const row = rowWith([img("a.jpg")], { adId: "123", connectionId: "c1" });
    render(<CreativeMedia row={row} onPreview={onPreview} />);
    fireEvent.click(screen.getByLabelText(/ดูตัวอย่างโฆษณา ชิ้น A/));
    expect(onPreview).toHaveBeenCalledWith(row);
  });

  it("ไม่มีรหัสโฆษณา = ไม่มีปุ่ม (กดไปก็เปิดอะไรไม่ได้)", () => {
    render(<CreativeMedia row={rowWith([img("a.jpg")])} onPreview={vi.fn()} />);
    expect(screen.queryByLabelText(/ดูตัวอย่างโฆษณา/)).toBeNull();
  });
});
