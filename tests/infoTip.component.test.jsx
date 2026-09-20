// @vitest-environment jsdom
/* ไอคอน i ต้องใช้งานได้จริง — กดได้ · ไล่ด้วยคีย์บอร์ดได้ · Esc ปิด · กดที่อื่นปิด
   (ของเดิมใช้ title ของเบราว์เซอร์ ซึ่งต้องจ่อเมาส์ค้าง บนมือถือไม่ขึ้นเลย) */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InfoTip } from "../src/modules/marketing/ui/InfoTip.jsx";

afterEach(cleanup);
const lines = ["เทียบไม่ได้", "จากแอด Meta 1,466 · ทีมกรอก 19/20 วัน", "เป้าเดือน 1,488"];
const show = () => render(<InfoTip label="คนทัก" lines={lines} />);

describe("InfoTip", () => {
  it("ปิดอยู่ตอนแรก · กดแล้วเปิด · กดซ้ำปิด", () => {
    show();
    const button = screen.getByRole("button", { name: /คนทัก/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("tooltip").textContent).toContain("จากแอด Meta 1,466");
    fireEvent.click(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("จ่อเมาส์ก็เปิด (ไม่ต้องกด) · เอาเมาส์ออกแล้วปิด", () => {
    const { container } = show();
    fireEvent.mouseEnter(container.querySelector(".ui-info"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.mouseLeave(container.querySelector(".ui-info"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  /* บั๊กที่เจอตอนรีวิว 21 ก.ย. เย็น: จ่อเมาส์เปิดอยู่ → กดปุ่มเพื่อจะตรึงไว้อ่าน → มันดับต่อหน้า
     (hover ตั้ง open ไว้แล้ว คลิกไป toggle เป็นปิด) — กติกาใหม่: คลิก = ตรึง · คลิกซ้ำ = เลิกตรึง */
  it("จ่อเมาส์เปิดอยู่แล้วกด = ตรึงไว้ ไม่ดับ · เอาเมาส์ออกก็ยังอยู่ · กดซ้ำถึงปิด", () => {
    const { container } = show();
    const wrap = container.querySelector(".ui-info");
    fireEvent.mouseEnter(wrap);
    fireEvent.click(screen.getByRole("button", { name: /คนทัก/ }));
    expect(screen.getByRole("tooltip")).toBeTruthy();          // กดแล้วต้องไม่ดับ
    fireEvent.mouseLeave(wrap);
    expect(screen.getByRole("tooltip")).toBeTruthy();          // ตรึงอยู่ = เอาเมาส์ออกก็ไม่หาย
    fireEvent.click(screen.getByRole("button", { name: /คนทัก/ }));
    expect(screen.queryByRole("tooltip")).toBeNull();          // เลิกตรึง (เมาส์ไม่ได้จ่ออยู่) = ปิด
  });
  it("Esc ปิดแล้วโฟกัสกลับมาที่ปุ่ม", () => {
    show();
    const button = screen.getByRole("button", { name: /คนทัก/ });
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
  it("กดที่อื่นแล้วปิด", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /คนทัก/ }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("ทุกบรรทัดอยู่ครบ และปุ่มบอกเครื่องอ่านหน้าจอว่าอธิบายเรื่องอะไร", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /คนทัก/ }));
    const tip = screen.getByRole("tooltip");
    for (const line of lines) expect(tip.textContent).toContain(line);
    expect(screen.getByRole("button", { name: /คนทัก/ }).getAttribute("aria-controls")).toBe(tip.id);
  });
});
