// @vitest-environment jsdom
/* แผงยอดขายจริง — ต้องกรองตามช่วงที่ดูอยู่ และ ROAS รวมไม่เอาค่าแอดของแบรนด์ที่ยังไม่มียอดมาหาร */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SalesRevenuePanel } from "../src/modules/marketing/ads/SalesRevenuePanel.jsx";

afterEach(cleanup);
const brands = [{ id: "b_td", name: "TEAMDEE", spend: 1000 }, { id: "b_jt", name: "JUNTAKARN", spend: 1000 }];
const fact = (fact_date, gross_revenue) => ({ brand_id: "b_td", fact_date, gross_revenue, orders: 1 });

describe("SalesRevenuePanel", () => {
  it("นับเฉพาะวันในช่วง (ISO from/to) ไม่รวมทุกวันที่โหลดมา", () => {
    const sales = [fact("2026-08-31", 90000), fact("2026-09-01", 5000), fact("2026-09-17", 5000)];
    render(<SalesRevenuePanel brands={brands} sales={sales} range={{ from: "2026-09-01", to: "2026-09-17" }} rangeLabel="1 – 17 ก.ย." />);
    expect(screen.getAllByText("฿10,000").length).toBeGreaterThan(0);
    expect(screen.queryByText("฿100,000")).toBeNull();
  });

  it("ROAS รวม = ยอดขาย ÷ ค่าแอดของแบรนด์ที่มียอดเท่านั้น", () => {
    render(<SalesRevenuePanel brands={brands} sales={[fact("2026-09-01", 10000)]} range={{ from: "2026-09-01", to: "2026-09-17" }} rangeLabel="ก.ย." />);
    expect(screen.getAllByText("10.0×")).toHaveLength(2); // หัวแผง + แถว TEAMDEE (ไม่ใช่ 5.0× จากค่าแอดรวม 2,000)
  });
});
