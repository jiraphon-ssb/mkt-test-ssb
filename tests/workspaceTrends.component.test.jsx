// @vitest-environment jsdom
/* กราฟแนวโน้มใน Overview — ข้อมูลจริง: แท็บยอดขาย/ROAS/คนทัก/CPL ต้องเป็นตัวเลขชุดเดียวกับด้านบน (ระบบขาย) ไม่ใช่ยอดที่ Meta เห็น */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// เก็บ props ล่าสุดของกราฟไว้ตรวจชนิดกราฟและค่าในแต่ละชุด
const chart = { last: null };
vi.mock("../src/modules/marketing/dash/charts/ChartBox.jsx", () => ({ ChartBox: (props) => { chart.last = props; return <div data-testid="chart" aria-label={props.ariaLabel} />; } }));
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
  { brand_id: "b_td", fact_date: "2026-09-01", gross_revenue: 20000, revenue_new: 5000, inquiries: 12, inquiry_filled: true, qualified_leads: 4, deposits: 0, orders: 2, orders_new: 1 },
  { brand_id: "b_td", fact_date: "2026-09-02", gross_revenue: 10000, revenue_new: 0, inquiries: 0, inquiry_filled: false, qualified_leads: 1, deposits: 3, orders: 1, orders_new: 1 },
];
const total = () => document.querySelector(".aw-trend-total b").textContent;
const series = (label) => chart.last.data.datasets.find((d) => d.label === label).data;
const mode = (name) => fireEvent.click(screen.getByRole("button", { name }));

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

  /* b_jt (JUNTAKARN) เป็นแหล่งจริงแล้วตั้งแต่ 18 ก.ย. 69 — เคสนี้ใช้แบรนด์ที่ยังไม่มีแหล่งเลย */
  it("หน้าแบรนด์ที่ยังไม่มีแหล่ง: บอกว่ารอเชื่อม · แยกแพลตฟอร์มกดไม่ได้ในแท็บของระบบขาย", () => {
    const vNo = { ...v, brands: [...v.brands, { id: "b_new", name: "แบรนด์ใหม่" }], scoped: [...v.scoped, card("b_new", 1, { spend: 700, revenue: 100 })] };
    vNo.scopedAll = vNo.scoped;
    render(<WorkspaceTrends v={vNo} brandId="b_new" sales={sales} />);
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

describe("WorkspaceTrends — Lead · ได้ออเดอร์ · ยืนยันออเดอร์ จากระบบขาย", () => {
  it("Lead และยืนยันออเดอร์เป็นจำนวนนับ · เส้นรายวันตรงกับระบบขาย", () => {
    render(<WorkspaceTrends v={v} sales={sales} />);
    fireEvent.click(screen.getByRole("button", { name: "Lead" }));
    expect(total()).toBe("5");
    expect(series("ช่วงนี้")).toEqual([4, 1]);
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันออเดอร์" }));
    expect(total()).toBe("3");
    expect(screen.getByText("จากระบบขาย · ยืนยันออเดอร์ = รับรู้ยอด · รวมเฉพาะแบรนด์ที่มีแหล่งยอดขาย")).toBeTruthy();
  });

  it("ได้ออเดอร์: วันก่อนระบบขายมีข้อมูลสเตจ = ช่องว่าง ไม่ใช่ 0 · บอกวันที่เริ่มมีข้อมูล", () => {
    render(<WorkspaceTrends v={v} sales={sales} />);
    fireEvent.click(screen.getByRole("button", { name: "ได้ออเดอร์" }));
    expect(series("ช่วงนี้")).toEqual([null, 3]);
    expect(total()).toBe("3");
    expect(screen.getByText(/มีข้อมูลตั้งแต่ 2 ก\.ย\./)).toBeTruthy();
  });

  it("CAC · %Ads อยู่ในเมนูตัวชี้วัดอื่น คิดจากค่าแอด Meta ÷ ระบบขาย", () => {
    render(<WorkspaceTrends v={v} sales={sales} />);
    expect(screen.queryByRole("button", { name: "CAC" })).toBeNull();
  });
});

describe("WorkspaceTrends — รูปแบบกราฟ เส้น / แท่ง / สะสม", () => {
  it("โหมดสรุปบน Overview แสดงยอดขายสะสมทันทีและซ่อนชุดควบคุมกราฟ", () => {
    render(<WorkspaceTrends v={{ ...v, rangeLabel: "1–2 ก.ย." }} sales={sales} compact initialMetric="revenue" />);
    expect(screen.getByText("ยอดสะสมรายวัน")).toBeTruthy();
    expect(series("ช่วงนี้")).toEqual([20000, 30000]);
    expect(screen.queryByRole("button", { name: "เส้น" })).toBeNull();
  });

  it("ค่าเริ่มต้นเป็นเส้น · กดแท่งแล้วกราฟเป็นแท่ง ค่ายังเป็นรายวัน", () => {
    render(<WorkspaceTrends v={v} sales={sales} />);
    expect(chart.last.type).toBe("line");
    expect(screen.getByRole("button", { name: "เส้น" }).getAttribute("aria-pressed")).toBe("true");
    mode("แท่ง");
    expect(chart.last.type).toBe("bar");
    fireEvent.click(screen.getByRole("button", { name: "ยอดขาย" }));
    expect(series("ช่วงนี้")).toEqual([20000, 10000]);
  });

  it("สะสม: ยอดขายบวกต่อกันทุกวัน · ตัวเลขหัวกราฟยังเป็นยอดทั้งช่วง", () => {
    render(<WorkspaceTrends v={v} sales={sales} />);
    mode("สะสม");
    fireEvent.click(screen.getByRole("button", { name: "ยอดขาย" }));
    expect(chart.last.type).toBe("line");
    expect(series("ช่วงนี้")).toEqual([20000, 30000]);
    expect(total()).toBe("฿30,000.00");
    expect(screen.getByText(/แต่ละจุด = ยอดรวมตั้งแต่ต้นช่วงถึงวันนั้น/)).toBeTruthy();
  });

  it("สะสม ROAS: คิดใหม่จากยอดรวมถึงวันนั้น (30,000 ÷ 1,000) ไม่ใช่เอา ROAS รายวันมาบวก", () => {
    render(<WorkspaceTrends v={v} sales={sales} />);
    mode("สะสม");
    fireEvent.click(screen.getByRole("button", { name: "ROAS" }));
    expect(series("ช่วงนี้")).toEqual([20, 30]);
  });

  it("Frequency สะสมไม่ได้: ปุ่มสะสมกดไม่ได้และกราฟกลับเป็นรายวัน", () => {
    render(<WorkspaceTrends v={v} sales={sales} />);
    mode("สะสม");
    fireEvent.click(screen.getByRole("button", { name: "ตัวชี้วัดอื่น" }));
    fireEvent.click(screen.getByRole("option", { name: "Frequency" }));
    expect(screen.getByRole("button", { name: "สะสม" }).disabled).toBe(true);
    expect(chart.last.type).toBe("line");
    expect(screen.getByText(/Frequency สะสมไม่ได้/)).toBeTruthy();
  });

  it("สะสม + เดือนนี้ + มีเป้า: มีเส้นเป้าตามจังหวะ (เป้าเดือน × วันที่ ÷ วันในเดือน)", () => {
    const month = { ...v, monthView: true, brands: [{ id: "b_td", name: "TEAMDEE", revTarget: 300000, budget: 30000 }], summary: { revTarget: 300000, budget: 30000 } };
    render(<WorkspaceTrends v={month} sales={sales} />);
    mode("สะสม");
    fireEvent.click(screen.getByRole("button", { name: "ยอดขาย" }));
    expect(series("เป้าตามจังหวะ")).toEqual([10000, 20000]);
    mode("เส้น");
    expect(chart.last.data.datasets.some((d) => d.label === "เป้าตามจังหวะ")).toBe(false);
  });
  it("Lead ช่วงที่มีวันก่อน 1 ก.ย.: บอกเหตุผลจริง (กรอกใน sheet) ไม่ใช่ 'ยังไม่มีข้อมูล'", () => {
    const aug = { ...v, range: { start: local(2026, 8, 31), end: local(2026, 9, 2) }, before: { start: local(2026, 8, 29), end: local(2026, 8, 31) } };
    render(<WorkspaceTrends v={aug} sales={[{ brand_id: "b_td", fact_date: "2026-08-31", qualified_leads: 180 }, ...sales]} />);
    fireEvent.click(screen.getByRole("button", { name: "Lead" }));
    expect(total()).toBe("—");
    expect(screen.getByText("Lead มีข้อมูลตั้งแต่ 1 ก.ย. (ก่อนหน้านั้นกรอกใน sheet) · เลือกช่วงตั้งแต่ 1 ก.ย. เพื่อดูยอดรวม")).toBeTruthy();
  });
});
