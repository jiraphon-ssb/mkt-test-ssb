// @vitest-environment jsdom
/* ตรวจรอบ 28 ก.ย.: ช่วงสำเร็จรูปในตัวเลือกต้องตรงกับที่หน้าคิดจริง — ข้อมูลถึง 26 = "7 วันล่าสุด" คือ 20–26 ไม่ใช่ 22–28 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DateRangePicker } from "../src/modules/marketing/ui/DateRangePicker.jsx";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("DateRangePicker — through", () => {
  it("เลือก 7 วันล่าสุด ขณะข้อมูลถึง 26 ก.ย. = สรุปช่วง 20 – 26 ก.ย. · ส่งช่วงนั้นเมื่อยืนยัน", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-28T09:00:00"));
    const onChange = vi.fn();
    render(<DateRangePicker period="mtd" from="2026-09-01" to="2026-09-26" max="2026-09-28" through="2026-09-26" onChange={onChange} />);
    fireEvent.click(document.querySelector(".drp-trigger"));
    fireEvent.click(screen.getByRole("radio", { name: "7 วันล่าสุด" }));
    expect(document.querySelector(".drp-summary").textContent).toContain("20 – 26 ก.ย.");
    fireEvent.click(screen.getByRole("button", { name: /ใช้ช่วงนี้|ยืนยัน|ตกลง/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ period: "7d", from: "2026-09-20", to: "2026-09-26" }));
  });
});
