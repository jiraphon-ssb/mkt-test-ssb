// @vitest-environment jsdom
/* ไทม์ไลน์รอบดึงข้อมูล — ต้องอ่านออกด้วยตัวหนังสือล้วน (สีบอกสถานะห้ามเป็นข้อมูลเดียวที่มี) */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { newRun, runHeadline, setStep, stepRows } from "../src/modules/marketing/ads/syncProgress.js";
import { SyncTimeline } from "../src/modules/marketing/ads/SyncStatusView.jsx";

afterEach(() => cleanup());
const show = (run, onHide = null) => render(<SyncTimeline rows={stepRows(run)} headline={runHeadline(run)} onHide={onHide} />);

describe("SyncTimeline", () => {
  it("ยังไม่ได้กดอะไร = ไม่มีอะไรโผล่", () => {
    const { container } = show(null);
    expect(container.firstChild).toBeNull();
  });

  it("กำลังทำ: ทุกขั้นมีคำบอกสถานะ + ตัวเลขผล ไม่ได้บอกด้วยสีอย่างเดียว", () => {
    let run = setStep(newRun(["facts", "creatives", "sales"]), "facts", "done", "6/6 ช่วง · 1,240 แถว");
    run = setStep(run, "creatives", "running", "2/3 บัญชี");
    show(run);
    expect(screen.getByRole("status").textContent).toBe("กำลังดึงข้อมูล ขั้นที่ 2/3");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText(/ขั้นที่ 1/)).toBeTruthy();
    expect(within(items[0]).getByText("เสร็จ · 6/6 ช่วง · 1,240 แถว")).toBeTruthy();
    expect(within(items[1]).getByText("กำลังทำ · 2/3 บัญชี")).toBeTruthy();
    expect(within(items[2]).getByText("รอคิว")).toBeTruthy();
    // ขั้นที่ยังไม่ถึงต้องยังบอกได้ว่าจะทำอะไร
    expect(within(items[2]).getByText(/JUNTAKARN/)).toBeTruthy();
  });

  it("ขั้นที่ล้ม: บอกเหตุผลไทยที่ขั้นนั้น และสรุปหัวบอกว่าขั้นไหนล้ม", () => {
    let run = setStep(newRun(["facts", "creatives", "sales"]), "facts", "failed", "สิทธิ์ Meta หมดอายุ");
    run = setStep(run, "creatives", "skipped", "ขั้นก่อนหน้าไม่สำเร็จ");
    run = setStep(run, "sales", "done", "42 วัน×แบรนด์ · JUNTAKARN 14 วัน");
    show(run);
    expect(screen.getByRole("status").textContent).toBe("ดึงเสร็จ แต่ไม่สำเร็จ 1/3 ขั้น — ค่าแอด Meta");
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("ไม่สำเร็จ · สิทธิ์ Meta หมดอายุ")).toBeTruthy();
    expect(within(items[1]).getByText("ข้าม · ขั้นก่อนหน้าไม่สำเร็จ")).toBeTruthy();
    expect(within(items[2]).getByText(/เสร็จ · 42 วัน×แบรนด์/)).toBeTruthy();
  });

  it("จบรอบแล้วซ่อนได้ (ระหว่างทำยังซ่อนไม่ได้)", () => {
    const hide = vi.fn();
    const done = ["facts", "creatives", "sales"].reduce((acc, key) => setStep(acc, key, "done"), newRun(["facts", "creatives", "sales"]));
    show(done, hide);
    fireEvent.click(screen.getByRole("button", { name: "ซ่อนไทม์ไลน์" }));
    expect(hide).toHaveBeenCalledTimes(1);
    cleanup();
    show(setStep(newRun(["sales"]), "sales", "running"));
    expect(screen.queryByRole("button", { name: "ซ่อนไทม์ไลน์" })).toBeNull();
  });
});
