// @vitest-environment jsdom
/* กันเปลี่ยนหน้าระหว่างดึงข้อมูล (29 ก.ย. — อาร์ต: "กดดึงข้อมูลแล้วจะไปหน้าอื่นไม่ได้ หรือมีเตือนห้ามเปลี่ยนหน้า")
   แอปใช้ BrowserRouter (ไม่ใช่ data router) → useBlocker ใช้ไม่ได้ จึงดักคลิกลิงก์ในแอปเอง + beforeunload สำหรับรีเฟรช/ปิดแท็บ */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LeaveGuard } from "../src/modules/marketing/ads/LeaveGuard.jsx";

afterEach(cleanup);
const Where = () => <output aria-label="ตำแหน่ง">{useLocation().pathname}</output>;
const show = (active) => render(<MemoryRouter initialEntries={["/mkt/ads/sync"]}>
  <nav><Link to="/mkt/ads">ภาพรวม</Link><a href="https://business.facebook.com/x" target="_blank" rel="noreferrer">ภายนอก</a><Link to="/mkt/ads/sync">หน้านี้</Link></nav>
  <Routes><Route path="*" element={<><Where /><LeaveGuard active={active} /></>} /></Routes>
</MemoryRouter>);
const where = () => screen.getByLabelText("ตำแหน่ง").textContent;

describe("LeaveGuard", () => {
  it("กำลังดึง: กดลิงก์ไปหน้าอื่น = ยังไม่ไป · เด้งถามก่อน · 'อยู่ต่อ' = อยู่หน้าเดิม", () => {
    show(true);
    fireEvent.click(screen.getByRole("link", { name: "ภาพรวม" }));
    expect(where()).toBe("/mkt/ads/sync");
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("กำลังดึงข้อมูลอยู่");
    fireEvent.click(screen.getByRole("button", { name: "อยู่หน้านี้ต่อ" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(where()).toBe("/mkt/ads/sync");
  });
  it("กำลังดึง: ยืนยัน 'ออกจากหน้านี้' = ไปหน้าที่กด", () => {
    show(true);
    fireEvent.click(screen.getByRole("link", { name: "ภาพรวม" }));
    fireEvent.click(screen.getByRole("button", { name: "ออกจากหน้านี้" }));
    expect(where()).toBe("/mkt/ads");
  });
  it("กำลังดึง: รีเฟรช/ปิดแท็บ = ให้เบราว์เซอร์ถามยืนยัน", () => {
    show(true);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
  it("ลิงก์เปิดแท็บใหม่ / ลิงก์ไปหน้าเดิม ไม่ถูกดัก", () => {
    show(true);
    fireEvent.click(screen.getByRole("link", { name: "หน้านี้" }));
    fireEvent.click(screen.getByRole("link", { name: "ภายนอก" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("ไม่ได้ดึงอยู่ = เปลี่ยนหน้าได้ปกติ · รีเฟรชไม่ถาม", () => {
    show(false);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByRole("link", { name: "ภาพรวม" }));
    expect(where()).toBe("/mkt/ads");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
