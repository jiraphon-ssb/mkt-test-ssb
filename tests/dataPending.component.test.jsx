// @vitest-environment jsdom
/* ตรวจรอบ 28 ก.ย.: กล่อง "ข้อมูลยังไม่เข้า" ใช้ร่วมทุกหน้า */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DataPending, isDataPending } from "../src/modules/marketing/ads/DataPending.jsx";

afterEach(cleanup);
const range = (from) => ({ start: new Date(`${from}T00:00:00`).toISOString(), end: new Date(`${from}T00:00:00`).toISOString() });

describe("isDataPending", () => {
  it("ข้อมูลจริง + ช่วงเริ่มหลังวันที่มีข้อมูล + ยังไม่มีตัวเลข = true", () => {
    expect(isDataPending({ real: true, range: range("2026-09-28"), dataThrough: "2026-09-26", hasData: false })).toBe(true);
  });
  it("มีตัวเลขแล้ว · ช่วงมีข้อมูล · ข้อมูลตัวอย่าง · ไม่รู้ว่าข้อมูลถึงไหน = false", () => {
    expect(isDataPending({ real: true, range: range("2026-09-28"), dataThrough: "2026-09-26", hasData: true })).toBe(false);
    expect(isDataPending({ real: true, range: range("2026-09-26"), dataThrough: "2026-09-26", hasData: false })).toBe(false);
    expect(isDataPending({ real: false, range: range("2026-09-28"), dataThrough: "2026-09-26", hasData: false })).toBe(false);
    expect(isDataPending({ real: true, range: range("2026-09-28"), dataThrough: null, hasData: false })).toBe(false);
  });
});

it("DataPending: บอกวันที่มีข้อมูล + ลิงก์ไปวันนั้นบนหน้าเดิม คงตัวกรองอื่น", () => {
  render(<MemoryRouter initialEntries={["/mkt/campaigns?period=today&brand=b_td"]}><DataPending label="28 ก.ย. 2569" through="2026-09-26" /></MemoryRouter>);
  expect(screen.getByRole("status").textContent).toContain("ข้อมูลของ 28 ก.ย. 2569 ยังไม่เข้า");
  expect(screen.getByRole("link", { name: "ดูข้อมูลล่าสุด (26 ก.ย.)" }).getAttribute("href")).toBe("/mkt/campaigns?period=custom&brand=b_td&from=2026-09-26&to=2026-09-26");
});
