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

  it("แท็บกฎ: เหลือเฉพาะช่องที่ระบบใช้จริง (ล่าช้า · ขาดหาย · ผลต่างยอด) · ไม่อ้าง CRM แล้ว", () => {
    render(<MemoryRouter><AdsControlCenter brands={brands} saved={{}} onSave={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /2 · กฎ/ }));
    const labels = [...document.querySelectorAll(".acc-rule strong")].map((el) => el.textContent);
    expect(labels).toEqual(["ข้อมูลเริ่มล่าช้า", "ข้อมูลขาดหาย", "ผลต่างยอดที่ยอมรับ"]);
    expect(document.body.textContent).not.toMatch(/CRM/);
    expect(document.body.textContent).toMatch(/ระบบขาย/);
  });

  it("กฎคัดครีเอทีฟ: เพิ่มกฎ เลือกตัวชี้วัด ใส่เพดาน แล้วบันทึกลง settings", () => {
    const onSave = vi.fn();
    render(<MemoryRouter><AdsControlCenter brands={brands} saved={{}} onSave={onSave} toast={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /2 · กฎ/ }));
    expect(screen.getByRole("heading", { name: "กฎคัดครีเอทีฟ" })).toBeTruthy();
    expect(screen.getByText(/ยังไม่มีกฎ/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มกฎ" }));
    fireEvent.change(screen.getByRole("textbox", { name: "ชื่อกฎ 1" }), { target: { value: "ซื้อคุ้ม" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "ค่าเกณฑ์ กฎ 1" }), { target: { value: "1000" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "ใช้เงินขั้นต่ำ กฎ 1" }), { target: { value: "500" } });
    expect(screen.getByText("ต้นทุนต่อการซื้อ ไม่เกิน ฿1,000.00 · เมื่อใช้เงินแล้วอย่างน้อย ฿500.00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^บันทึก/ }));
    expect(onSave.mock.calls[0][0].creativeRules).toEqual([
      expect.objectContaining({ name: "ซื้อคุ้ม", brandId: "all", metric: "cpa", op: "lte", value: 1000, minSpend: 500 }),
    ]);
  });

  it("กฎคัดครีเอทีฟ: เปลี่ยนตัวชี้วัดแล้วเงื่อนไขเปลี่ยนตามค่าเริ่มของตัวนั้น · ลบกฎได้", () => {
    const saved = { creativeRules: [{ id: "r1", name: "", brandId: "all", metric: "cpa", op: "lte", value: 900, minSpend: 0 }] };
    render(<MemoryRouter><AdsControlCenter brands={brands} saved={saved} onSave={() => {}} toast={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /2 · กฎ/ }));
    fireEvent.click(screen.getByRole("button", { name: "ตัวชี้วัด กฎ 1" }));
    fireEvent.click(screen.getByRole("option", { name: "ROAS (Meta)" }));
    expect(screen.getByRole("button", { name: "เงื่อนไข กฎ 1" }).textContent).toMatch(/อย่างน้อย/);
    fireEvent.click(screen.getByRole("button", { name: "ลบกฎ 1" }));
    expect(screen.getByText(/ยังไม่มีกฎ/)).toBeTruthy();
  });
});
