// @vitest-environment jsdom
/* หน้าตั้งค่าข้อมูลโฆษณา — แท็บเป้าของเราถอดแล้ว (แผน 2026-09-17 ข้อ 4) เป้าทั้งหมดใช้ของระบบขาย */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth = { demo: true, user: { role: "team_lead" } };
vi.mock("../src/foundation/auth/AuthContext.jsx", () => ({ useAuth: () => auth }));
const { AdsControlCenter } = await import("../src/modules/marketing/ads/AdsControlCenter.jsx");

afterEach(() => { cleanup(); auth.user = { role: "team_lead" }; });
const brands = [{ id: "b_td", name: "TEAMDEE" }];

describe("AdsControlCenter", () => {
  /* 18 ก.ย. 69: แท็บ "เป้า" กลับมา แต่สัญญาเปลี่ยน — ไม่ใช่ที่ตั้งเป้าหลักเหมือนยุคก่อน
     เป้าหลักยังมาจากระบบขาย/ระบบ TMK · แท็บนี้ไว้ดูว่าได้อะไรมาแล้ว ขาดอะไร แล้วเติมทับได้ */
  it("มีแท็บเป้า · บอกว่าเป้าหลักมาจากระบบขายพร้อมลิงก์ไปสถานะ Sync", () => {
    render(<MemoryRouter><AdsControlCenter brands={brands} saved={{}} onSave={() => {}} /></MemoryRouter>);
    const tabs = screen.getByRole("navigation", { name: "หมวดการตั้งค่า Overview ads" });
    expect(tabs.textContent).toMatch(/1 · บัญชี.*2 · เป้า.*3 · กฎ.*4 · ตรวจยอด/);
    expect(screen.getByRole("note").textContent).toMatch(/มาจากระบบขายเอง/);
    expect(screen.getByRole("note").textContent).toMatch(/ชนะค่าที่ดึงมา/);
    expect(screen.getByRole("link", { name: "สถานะ Sync" }).getAttribute("href")).toBe("/mkt/ads/sync");
  });

  it("บันทึกแล้วยังเก็บเป้าเดิมไว้ (โหมดข้อมูลจำลองอ่านต่อ) ไม่ลบทิ้ง", () => {
    const onSave = vi.fn();
    const saved = { targets: { b_td: { revenue: 123 } } };
    render(<MemoryRouter><AdsControlCenter brands={brands} saved={saved} onSave={onSave} toast={() => {}} /></MemoryRouter>);
    // ปุ่มบันทึกทำงานเมื่อมีการแก้เท่านั้น (dirty contract 22 ก.ย.) — แก้ค่าหนึ่งช่องก่อน
    fireEvent.click(screen.getByRole("button", { name: /3 · กฎ/ }));
    const stale = [...document.querySelectorAll(".acc-rule input")][0];
    fireEvent.change(stale, { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: /^บันทึก/ }));
    expect(onSave.mock.calls[0][0].targets).toEqual({ b_td: { revenue: 123 } });
  });

  it("แท็บกฎ: เหลือเฉพาะช่องที่ระบบใช้จริง (ล่าช้า · ขาดหาย · ผลต่างยอด) · ไม่อ้าง CRM แล้ว", () => {
    render(<MemoryRouter><AdsControlCenter brands={brands} saved={{}} onSave={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /3 · กฎ/ }));
    const labels = [...document.querySelectorAll(".acc-rule strong")].map((el) => el.textContent);
    expect(labels).toEqual(["ข้อมูลเริ่มล่าช้า", "ข้อมูลขาดหาย", "ผลต่างยอดที่ยอมรับ"]);
    expect(document.body.textContent).not.toMatch(/CRM/);
    expect(document.body.textContent).toMatch(/ระบบขาย/);
  });

  it("กฎคัดครีเอทีฟ: เพิ่มกฎ เลือกตัวชี้วัด ใส่เพดาน แล้วบันทึกลง settings", () => {
    const onSave = vi.fn();
    render(<MemoryRouter><AdsControlCenter brands={brands} saved={{}} onSave={onSave} toast={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /3 · กฎ/ }));
    expect(screen.getByRole("heading", { name: "กฎคัดครีเอทีฟ" })).toBeTruthy();
    expect(screen.getByText(/ยังไม่มีกฎ/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มกฎ" }));
    fireEvent.change(screen.getByRole("textbox", { name: "ชื่อกฎ 1" }), { target: { value: "ซื้อคุ้ม" } });
    fireEvent.change(screen.getByRole("textbox", { name: "ค่าเกณฑ์ กฎ 1" }), { target: { value: "1,000" } });
    fireEvent.change(screen.getByRole("textbox", { name: "ใช้เงินขั้นต่ำ กฎ 1" }), { target: { value: "500" } });
    expect(screen.getByText("ต้นทุนต่อการซื้อ (Meta) ไม่เกิน ฿1,000.00 · เมื่อใช้เงินแล้วอย่างน้อย ฿500.00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^บันทึก/ }));
    expect(onSave.mock.calls[0][0].creativeRules).toEqual([
      expect.objectContaining({ name: "ซื้อคุ้ม", brandId: "all", metric: "cpa", op: "lte", value: 1000, minSpend: 500 }),
    ]);
  });

  it("กฎคัดครีเอทีฟ: เปลี่ยนตัวชี้วัดแล้วเงื่อนไขเปลี่ยนตามค่าเริ่มของตัวนั้น · ลบกฎได้", () => {
    const saved = { creativeRules: [{ id: "r1", name: "", brandId: "all", metric: "cpa", op: "lte", value: 900, minSpend: 0 }] };
    render(<MemoryRouter><AdsControlCenter brands={brands} saved={saved} onSave={() => {}} toast={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /3 · กฎ/ }));
    fireEvent.click(screen.getByRole("button", { name: "ตัวชี้วัด กฎ 1" }));
    fireEvent.click(screen.getByRole("option", { name: "ROAS จากการซื้อ (Meta)" }));
    expect(screen.getByRole("button", { name: "เงื่อนไข กฎ 1" }).textContent).toMatch(/อย่างน้อย/);
    fireEvent.click(screen.getByRole("button", { name: "ลบกฎ 1" }));
    expect(screen.getByText(/ยังไม่มีกฎ/)).toBeTruthy();
  });

  it("กฎที่ยังไม่ใส่ค่าเกณฑ์: ช่องขึ้นเตือน · กดบันทึกแล้วแจ้งว่ากฎไหนยังไม่ถูกใช้ (ไม่เงียบ)", () => {
    const toast = vi.fn();
    const saved = { creativeRules: [{ id: "r1", name: "คัด roas", brandId: "all", metric: "roas", op: "gte", value: null, minSpend: 500 }] };
    render(<MemoryRouter><AdsControlCenter brands={brands} saved={saved} onSave={() => {}} toast={toast} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /3 · กฎ/ }));
    const input = screen.getByRole("textbox", { name: "ค่าเกณฑ์ กฎ 1" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("placeholder")).toBe("เช่น 3");
    // dirty contract 22 ก.ย.: ปุ่มเซฟทำงานเมื่อมีการแก้ — แก้ minSpend (กฎยังไม่ใส่ค่าเกณฑ์เหมือนเดิม)
    fireEvent.change(screen.getByRole("textbox", { name: "ใช้เงินขั้นต่ำ กฎ 1" }), { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: /^บันทึก/ }));
    expect(toast).toHaveBeenCalledWith("บันทึกแล้ว · กฎคัดครีเอทีฟ \"คัด roas\" ยังไม่ใส่ค่าเกณฑ์ จึงยังไม่ถูกใช้กรอง", "bad");
  });

  it("พิมพ์ค่าที่อ่านไม่ออก: บอกทันทีใต้กฎ", () => {
    render(<MemoryRouter><AdsControlCenter brands={brands} saved={{}} onSave={() => {}} toast={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /3 · กฎ/ }));
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มกฎ" }));
    fireEvent.change(screen.getByRole("textbox", { name: "ค่าเกณฑ์ กฎ 1" }), { target: { value: "สามพัน" } });
    expect(screen.getByText("ค่าเกณฑ์ต้องเป็นตัวเลข เช่น 1,000")).toBeTruthy();
  });
});


/* ตรวจหน้าตั้งค่า 22 ก.ย. (อาร์ตขอ "ครบๆจบๆ" เรื่องปุ่มเซฟ) — dirty contract:
   ปุ่มเดียวครอบแท็บ บัญชี+กฎ · สะอาด = "บันทึกแล้ว" กดไม่ได้ · แก้ค้าง = จุดบนแท็บ + เตือนก่อนออก */
describe("ปุ่มบันทึกรู้จักการแก้ค้าง (dirty)", () => {
  const show = (over = {}) => render(<MemoryRouter><AdsControlCenter brands={brands}
    saved={{ updatedAt: "2026-09-22T10:00:00Z", ...over }} onSave={() => {}} toast={() => {}} /></MemoryRouter>);
  it("ยังไม่แก้ = ปุ่มเขียนว่า บันทึกแล้ว และกดไม่ได้ · แสดงเวลาบันทึกล่าสุด", () => {
    show();
    const btn = screen.getByRole("button", { name: /บันทึกแล้ว/ });
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/บันทึกล่าสุด/).textContent).toMatch(/2569|2026/);
  });
  it("แก้กฎ = ปุ่มกลับมาเป็น บันทึก กดได้ + แท็บกฎมีจุดแก้ค้าง · แท็บบัญชีไม่มี", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /3 · กฎ/ }));
    fireEvent.change([...document.querySelectorAll(".acc-rule input")][0], { target: { value: "9" } });
    const btn = screen.getByRole("button", { name: /^บันทึก$/ });
    expect(btn.disabled).toBe(false);
    expect(screen.getByRole("button", { name: /3 · กฎ/ }).querySelector(".acc-dot")).toBeTruthy();
    expect(screen.getByRole("button", { name: /1 · บัญชี/ }).querySelector(".acc-dot")).toBeNull();
  });
  it("แก้ค้างแล้วกดกลับ Overview = ถามยืนยันก่อน · ตอบไม่ = ไม่ไป", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /3 · กฎ/ }));
    fireEvent.change([...document.querySelectorAll(".acc-rule input")][0], { target: { value: "9" } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("link", { name: /Overview ads/ }));
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });
  it("ไม่ใช่หัวหน้าทีม: ช่องกฎถูกปิดจริง ไม่ใช่แก้ได้แต่เซฟไม่ได้", () => {
    auth.user = { role: "staff" };
    show();
    fireEvent.click(screen.getByRole("button", { name: /3 · กฎ/ }));
    for (const input of document.querySelectorAll(".acc-rule input")) expect(input.disabled).toBe(true);
  });
});
