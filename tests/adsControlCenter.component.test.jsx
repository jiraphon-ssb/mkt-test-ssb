// @vitest-environment jsdom
/* หน้าตั้งค่าข้อมูลโฆษณา — แท็บเป้าของเราถอดแล้ว (แผน 2026-09-17 ข้อ 4) เป้าทั้งหมดใช้ของระบบขาย */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../src/foundation/auth/AuthContext.jsx", () => ({ useAuth: () => ({ demo: true, user: { role: "team_lead" } }) }));
const { AdsControlCenter } = await import("../src/modules/marketing/ads/AdsControlCenter.jsx");

afterEach(cleanup);
const brands = [{ id: "b_td", name: "TEAMDEE" }];

describe("AdsControlCenter", () => {
  it("ไม่มีแท็บเป้า · บอกว่าเป้ามาจากระบบขายพร้อมลิงก์ไปสถานะ Sync", () => {
    render(<MemoryRouter><AdsControlCenter brands={brands} saved={{}} onSave={() => {}} /></MemoryRouter>);
    const tabs = screen.getByRole("navigation", { name: "หมวดการตั้งค่า Overview ads" });
    expect(tabs.textContent).not.toMatch(/เป้า/);
    expect(tabs.textContent).toMatch(/1 · บัญชี.*2 · กฎ.*3 · ตรวจยอด/);
    expect(screen.getByRole("note").textContent).toMatch(/ใช้ของระบบขาย/);
    expect(screen.getByRole("link", { name: "สถานะ Sync" }).getAttribute("href")).toBe("/mkt/ads/sync");
  });

  it("บันทึกแล้วยังเก็บเป้าเดิมไว้ (โหมดข้อมูลจำลองอ่านต่อ) ไม่ลบทิ้ง", () => {
    const onSave = vi.fn();
    const saved = { targets: { b_td: { revenue: 123 } } };
    render(<MemoryRouter><AdsControlCenter brands={brands} saved={saved} onSave={onSave} toast={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /บันทึก/ }));
    expect(onSave.mock.calls[0][0].targets).toEqual({ b_td: { revenue: 123 } });
  });
});
