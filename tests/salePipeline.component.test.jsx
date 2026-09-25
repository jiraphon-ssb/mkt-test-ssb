// @vitest-environment jsdom
/* funnel โหมดหน้า Overview (gauge) — เขียนหลังรีวิว 21 ก.ย. เย็นพบว่าสองรอบหลังไม่มีเทสหน้าจอคุมเลย
   กติกา: บนจอเหลือ ค่า + จังหวะ + ส่วนโค้งเปล่า · บริบทย้ายเข้าไอคอน i · "หล่นแรงสุด" ยังอยู่บนจอ */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SalePipeline } from "../src/modules/marketing/ads/AdsView.jsx";

afterEach(cleanup);
const items = [
  { key: "inquiries", label: "คนทัก (ทีมกรอก)", value: 1293, before: null, fmt: "int", conv: null, sub: "จากแอด Meta 1,466 · ทีมกรอก 19/20 วัน" },
  { key: "qualified", label: "Lead", value: 109, before: 89, fmt: "int", conv: 0.0843 },
];
const goals = {
  inquiries: { state: "set", tone: "emerald", text: "เหนือแผน", pace: 1.2413, paceState: "ontrack", kind: "higher", target: 1488, monthTarget: 1488, pct: 0.8689, expected: 1041.6 },
  qualified: { state: "set", tone: "amber", text: "ใกล้เป้า", pace: 0.8508, paceState: "warn", kind: "higher", target: 183, monthTarget: 183, pct: 0.5956, expected: 128.1 },
};
const show = () => render(<SalePipeline row gauge items={items} goals={goals} worstKey="qualified" />);

describe("SalePipeline โหมด gauge", () => {
  it("บนจอเหลือ ค่า + จังหวะ + สถานะ — เป้าเดือน/ทำได้/ที่มา ต้องไม่อยู่บนจอ", () => {
    show();
    // ค่าจริง / เป้าเดือน คู่กัน (อาร์ตขอ 21 ก.ย. ค่ำ)
    const num = screen.getByText("1,293").closest(".aw-metric-num");
    expect(num.textContent.replace(/\s+/g, " ")).toContain("1,293 / 1,488");
    expect(screen.getByText(/124\.13%/)).toBeTruthy();
    expect(screen.getByText(/เหนือแผน/)).toBeTruthy();
    // เทียบเดือนก่อนต้องอยู่บนจอ (อาร์ตขอ 21 ก.ย. ค่ำ): มีข้อมูล = บอกทิศ · ไม่มี = บอกตรงๆ ไม่เดา
    expect(screen.getByText(/▲ 22\.47% ดีขึ้น/)).toBeTruthy();          // Lead 109 จาก 89
    expect(screen.getByText("เทียบเดือนก่อนไม่ได้")).toBeTruthy();       // คนทัก before = null
    expect(screen.queryByText(/เป้าเดือน/)).toBeNull();   // คำว่า "เป้าเดือน" ไม่ต้องมี — เลขเป้าอยู่หลัง / แล้ว
    expect(screen.queryByText(/ทำได้/)).toBeNull();
    expect(screen.queryByText(/จากแอด Meta/)).toBeNull();
  });
  it("ส่วนโค้งเป็นภาพเปล่า ไม่มีตัวเลขซ้ำ (กฎ: หนึ่งบล็อกมีตัวเลขเด่นตัวเดียว)", () => {
    const { container } = show();
    expect(container.querySelectorAll(".pg").length).toBe(2);
    expect(container.querySelectorAll(".pg .pg-value")).toHaveLength(0);
    expect(container.querySelectorAll(".pg .pg-state")).toHaveLength(0);
  });
  it("บริบทที่หายจากจอ ไปอยู่ครบในไอคอน i และ 'หล่นแรงสุด' ยังอยู่บนจอ", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /รายละเอียด คนทัก/ }));
    const tip = screen.getByRole("tooltip");
    for (const line of ["จากแอด Meta 1,466 · ทีมกรอก 19/20 วัน", "ทำได้ 86.89% ของเป้าเดือน"]) {
      expect(tip.textContent).toContain(line);
    }
    expect(screen.getByText("หล่นแรงสุด")).toBeTruthy();      // คอขวดต้องเห็นโดยไม่ต้องเปิดไอคอน
  });
});

/* รีวิว UX 25 ก.ย. ข้อ 10: ขั้นที่ไม่มีข้อมูลเลยขึ้น "— / ยังไม่ตั้งเป้า / เทียบเดือนก่อนไม่ได้" ซ้ำทุกกล่อง
   ไม่มีค่า = พูดประโยคเดียวพอ ไม่ต้องไล่บอกว่าเทียบอะไรไม่ได้บ้าง */
describe("ขั้นที่ยังไม่มีข้อมูล", () => {
  it("ค่าเป็น null = ขึ้น 'ยังไม่มีข้อมูล' บรรทัดเดียว ไม่มี 'ยังไม่ตั้งเป้า' หรือ 'เทียบเดือนก่อนไม่ได้'", () => {
    render(<SalePipeline row gauge items={[{ key: "deposits", label: "ได้ออเดอร์", value: null, before: null, fmt: "int" }]} goals={{}} />);
    const foot = document.querySelector(".aw-metric-foot");
    expect(foot.textContent).toBe("ยังไม่มีข้อมูล");
  });
});
