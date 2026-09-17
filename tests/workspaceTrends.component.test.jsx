// @vitest-environment jsdom
/* กราฟแนวโน้มใน Overview — ข้อมูลจริง: แท็บยอดขาย/ROAS/คนทัก/CPL ต้องเป็นตัวเลขชุดเดียวกับด้านบน (ระบบขาย) ไม่ใช่ยอดที่ Meta เห็น */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../src/modules/marketing/dash/charts/ChartBox.jsx", () => ({ ChartBox: ({ ariaLabel }) => <div data-testid="chart" aria-label={ariaLabel} /> }));
const { WorkspaceTrends } = await import("../src/modules/marketing/ads/WorkspaceTrends.jsx");

afterEach(cleanup);
// ช่วง 1–2 ก.ย. ตามเวลาเครื่อง (dates() ในกราฟเดินวันแบบ local)
const local = (y, m, d) => new Date(y, m - 1, d).toISOString();
const card = (brand_id, day, metrics) => ({ id: `${brand_id}-${day}`, track: "project", status: "measured", brand_id, archived: true, campaign: "c", brief: { channels: ["Facebook"] },
  metrics: { impressions: 1000, clicks: 10, reach: 800, leads: 0, ...metrics, measured_at: new Date(2026, 8, day, 12).toISOString() } });
const v = {
  range: { start: local(2026, 9, 1), end: local(2026, 9, 3) }, before: { start: local(2026, 8, 30), end: local(2026, 9, 1) },
  compareLabel: "ช่วงก่อนหน้า", revenueBasis: "total",
  brands: [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jt", name: "JUNTAKARN" }],
  scoped: [card("b_td", 1, { spend: 1000, revenue: 500 }), card("b_jt", 1, { spend: 4000, revenue: 900 })],
};
v.scopedAll = v.scoped;
const sales = [
  { brand_id: "b_td", fact_date: "2026-09-01", gross_revenue: 20000, revenue_new: 5000, inquiries: 12, inquiry_filled: true, qualified_leads: 4 },
  { brand_id: "b_td", fact_date: "2026-09-02", gross_revenue: 10000, revenue_new: 0, inquiries: 0, inquiry_filled: false, qualified_leads: 1 },
];
const total = () => document.querySelector(".aw-trend-total b").textContent;

describe("WorkspaceTrends — ข้อมูลจริง", () => {
  it("ยอดขาย = ระบบขาย (ไม่ใช่ ฿1,400.00 ที่ Meta เห็น) พร้อมป้ายที่มา", () => {
    render(<WorkspaceTrends v={v} sales={sales} />);
    fireEvent.click(screen.getByRole("button", { name: "ยอดขาย" }));
    expect(total()).toBe("฿30,000.00");
    expect(screen.getByText("จากระบบขาย · รวมเฉพาะแบรนด์ที่มีแหล่งยอดขาย")).toBeTruthy();
  });

  it("ROAS หารด้วยค่าแอดของแบรนด์ที่มียอดเท่านั้น (30,000 ÷ 1,000) · CPL = ค่าแอด ÷ Lead ระบบขาย", () => {
    render(<WorkspaceTrends v={v} sales={sales} />);
    fireEvent.click(screen.getByRole("button", { name: "ROAS" }));
    expect(total()).toBe("30.00×");
    fireEvent.click(screen.getByRole("button", { name: "CPL" }));
    expect(total()).toBe("฿200.00");
  });

  it("หน้าแบรนด์ที่ยังไม่มีแหล่ง: บอกว่ารอเชื่อม · แยกแพลตฟอร์มกดไม่ได้ในแท็บของระบบขาย", () => {
    render(<WorkspaceTrends v={v} brandId="b_jt" sales={sales} />);
    fireEvent.click(screen.getByRole("button", { name: "ยอดขาย" }));
    expect(total()).toBe("—");
    expect(screen.getByText("รอเชื่อมแหล่งข้อมูลยอดขาย")).toBeTruthy();
    expect(screen.getByRole("checkbox").disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "ค่าแอด" }));
    expect(screen.getByRole("checkbox").disabled).toBe(false);
    expect(screen.getByText("จาก Meta")).toBeTruthy();
  });

  it("ข้อมูลจำลอง (ไม่ส่ง sales) = ของ Meta ตามเดิม ไม่มีป้ายที่มา", () => {
    render(<WorkspaceTrends v={v} />);
    fireEvent.click(screen.getByRole("button", { name: "ยอดขาย" }));
    expect(total()).toBe("฿1,400.00");
    expect(screen.queryByText("จาก Meta")).toBeNull();
  });
});
