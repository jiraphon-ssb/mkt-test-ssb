// @vitest-environment jsdom
/* หน้าปัดจังหวะ แบบ A (เติมจากซ้าย 0–200%) — สเปก 2026-09-21 หัวข้อ 3.1
   ข้อที่พลาดไม่ได้: ห้ามสื่อความหมายด้วยสีอย่างเดียว · เกินสเกลต้องไม่ตรึงตัวเลข · ไม่รู้ต้องไม่เขียวไม่แดง */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PaceGauge } from "../src/modules/marketing/ads/PaceGauge.jsx";
import { monthClock, paceOf, thresholdOf } from "../src/modules/marketing/ads/paceEngine.js";

afterEach(cleanup);
const clock = monthClock("2026-09-21");
const gauge = (props) => render(<PaceGauge {...props} />).container.querySelector("svg");

describe("PaceGauge", () => {
  it("ของจริง 21 ก.ย. — ตัวเลขตัดทศนิยมไม่ปัด · มีคำกำกับ ไม่ใช่มีแต่สี", () => {
    render(<PaceGauge pace={paceOf({ actual: 2997302, target: 5780000, clock })} />);
    expect(screen.getByText("74.08%")).toBeTruthy();
    expect(screen.getByText("ของที่ควรได้ถึงวันนี้")).toBeTruthy();
    expect(screen.getByText("ช้ากว่าแผน")).toBeTruthy();
    expect(screen.getByText("ตามแผน")).toBeTruthy();        // หมุดอ้างอิง 100% ต้องมีเสมอ
  });
  it("อ่านออกด้วยเครื่องอ่านหน้าจอเป็นประโยคเต็ม", () => {
    const svg = gauge({ pace: paceOf({ actual: 2997302, target: 5780000, clock }) });
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("จังหวะทำยอด 74.08% ของที่ควรได้ถึงวันนี้ — ช้ากว่าแผน");
  });
  it("ปลายส่วนโค้งตัดตรง — ปลายมนจะล้ำหมุด 100% ทำให้อ่านผิด", () => {
    const svg = gauge({ pace: paceOf({ actual: 700, target: 1000, clock }) });
    expect(svg.querySelector(".pg-val").getAttribute("stroke-linecap")).toBe("butt");
  });
  it("รางสองโทน — ครึ่งซ้าย (ยังไม่ถึงแผน) กับครึ่งขวา (เกินแผน) คนละเส้น", () => {
    const svg = gauge({ pace: paceOf({ actual: 700, target: 1000, clock }) });
    expect(svg.querySelectorAll(".pg-track")).toHaveLength(2);
  });
  it("ทะลุ 200% = ตรึงส่วนโค้งแต่ตัวเลขพิมพ์เต็ม", () => {
    render(<PaceGauge pace={paceOf({ actual: 1680, target: 1000, clock })} />);
    expect(screen.getByText("240.00%")).toBeTruthy();
    expect(screen.getByText("»")).toBeTruthy();
  });
  it("ยังตัดสินใจไม่ได้ = เทา ไม่มีส่วนโค้งค่า และบอกเหตุผล", () => {
    const { container } = render(<PaceGauge pace={paceOf({ actual: 100, target: null, clock })} />);
    expect(container.querySelector(".pg").className).toContain("zinc");
    expect(container.querySelector(".pg-val")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("ยังไม่ตั้งเป้าเดือนนี้")).toBeTruthy();
  });
  it("ข้อมูลเก่ากว่ากำหนด = เทาและบอกว่าเพราะข้อมูลยังมาไม่ถึง (ไม่ใช่เขียว)", () => {
    const pace = paceOf({ actual: 700, target: 1000, clock, freshThrough: "2026-09-18", staleAfterDays: 2 });
    const { container } = render(<PaceGauge pace={pace} />);
    expect(container.querySelector(".pg").className).toContain("zinc");
    expect(screen.getByText("ข้อมูลยังมาไม่ถึงวันนี้")).toBeTruthy();
  });
  /* ตัวชี้วัดแบบอัตราไม่มีมิติเวลา — เทียบกับเป้า/เพดานตรงๆ และต้องใช้คำของมันเอง
     ROAS 120.21% ของเป้า = "ถึงเป้า" (ไม่ใช่ "เหนือแผน" ซึ่งเป็นคำของจังหวะรายเดือน) */
  it("ตัวชี้วัดแบบอัตรา: ROAS ใช้คำของเป้า · %Ads ที่ต่ำกว่าดีใช้คำของเพดาน", () => {
    render(<PaceGauge pace={thresholdOf(9.54, 7.94)} kind="rate_higher" title="ROAS เทียบเป้า" caption="ของเป้า ROAS"/>);
    expect(screen.getByText("120.15%")).toBeTruthy();
    expect(screen.getByText("ถึงเป้า")).toBeTruthy();
    cleanup();
    render(<PaceGauge pace={thresholdOf(0.1379, 0.126, { direction: "lower" })} kind="rate_lower" caption="ของเพดาน %Ads"/>);
    expect(screen.getByText("เกินเป้าเล็กน้อย")).toBeTruthy();
  });
  it("โหมดงบใช้คำของงบ (เกินงบ ไม่ใช่ ช้ากว่าแผน)", () => {
    render(<PaceGauge pace={paceOf({ actual: 57038.53, target: 45000, clock, direction: "spend" })} />);
    expect(screen.getByText("เกินงบ")).toBeTruthy();
  });
});
