// @vitest-environment jsdom
/* แท็บประวัติในหน้า Sync — แถวเยอะให้แบ่งหน้า · จัดกลุ่มตามวัน · เปลี่ยนตัวกรองกลับหน้า 1 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../src/foundation/auth/AuthContext.jsx", () => ({ useAuth: () => ({ demo: true, user: null }) }));
vi.mock("../src/modules/marketing/useMkt.jsx", () => ({ useApp: () => ({ data: {}, toast: () => {} }) }));
const { HistoryList } = await import("../src/modules/marketing/ads/SyncStatusView.jsx");

// jsdom ไม่มี scrollIntoView — เปลี่ยนหน้าแล้วหน้าจอเลื่อนขึ้นหัวรายการ (scrollToList)
beforeEach(() => { Element.prototype.scrollIntoView = () => {}; try { window.localStorage.clear(); } catch { /* ไม่มี storage */ } });
afterEach(cleanup);
// 45 รายการ ย้อนทีละชั่วโมงจาก 17 ก.ย. 09:00 (ไทย) → คร่อม 2 วัน
const items = Array.from({ length: 45 }, (_, i) => ({ id: `x${i}`, at: new Date(Date.parse("2026-09-17T02:00:00Z") - i * 3_600_000).toISOString(), kind: i % 2 ? "meta" : "sales", title: `งาน ${i + 1}`, detail: null, statusLabel: "สำเร็จ", tone: "ok", auto: true }));

describe("HistoryList", () => {
  it("หน้าละ 20 · แสดง 1–20 จาก 45 · ไปหน้า 2 ได้", () => {
    render(<HistoryList items={items} filter="all" onFilter={() => {}} />);
    expect(screen.getAllByRole("listitem").filter((li) => li.closest(".sy-timeline"))).toHaveLength(20);
    expect(document.querySelector(".pg-count").textContent).toContain("1–20");
    fireEvent.click(screen.getByRole("button", { name: "หน้า 2" }));
    expect(screen.getByText("งาน 21")).toBeTruthy();
    expect(screen.queryByText("งาน 1")).toBeNull();
  });
  it("จัดกลุ่มตามวัน: หัววันขึ้นเมื่อวันเปลี่ยน · แถวโชว์แค่เวลา", () => {
    render(<HistoryList items={items} filter="all" onFilter={() => {}} />);
    const heads = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(heads[0]).toContain("17 ก.ย.");
    expect(heads.some((h) => h.includes("16 ก.ย."))).toBe(true);
    expect(within(screen.getByText("งาน 1").closest("li")).getByText("09:00")).toBeTruthy();
  });
  it("เปลี่ยนตัวกรอง = กลับหน้า 1", () => {
    const { rerender } = render(<HistoryList items={items} filter="all" onFilter={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "หน้า 2" }));
    const sales = items.filter((item) => item.kind === "sales");
    rerender(<HistoryList items={sales} filter="sales" onFilter={() => {}} />);
    expect(document.querySelector(".pg-count").textContent).toContain("1–20");
  });
  it("บอกว่าประวัติที่แสดงเริ่มตั้งแต่เมื่อไร (โหลดมาจำนวนจำกัด ไม่ใช่ทั้ง 90 วัน)", () => {
    render(<HistoryList items={items} filter="all" onFilter={() => {}} />);
    expect(document.querySelector(".sy-note").textContent).toMatch(/แสดงตั้งแต่ 15 ก\.ย\./);
  });
});
