// @vitest-environment jsdom
/* แถบที่มาของตัวเลข — สามชั้น: สรุป → ป้ายความสดรายแหล่ง → ที่มาของตัวเลข (พับไว้)
   ตัวสลับ "ของจริง / ตัวอย่าง" ถอดออกแล้ว เหลือป้ายเฉพาะโหมดเดโม */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdsSourceControl, AdsSourceNotice } from "../src/modules/marketing/ads/AdsSourceControl.jsx";

afterEach(cleanup);
const summary = { accounts: 4, from: "2026-06-18", to: "2026-09-18", lastSuccessAt: "2026-09-18T05:07:00Z", provisionalToday: true, empty: false };
const ads = (patch = {}) => ({
  source: "meta_pilot", reload: () => {},
  sales: [{ brand_id: "b_td", fact_date: "2026-09-18", source: "crm" }, { brand_id: "b_jt", fact_date: "2026-09-18", source: "tmk" }],
  // 4 แบรนด์ที่มีแหล่งยอดขาย (รวม JUNTAKARN) · "ตั้งแล้ว" = มีเป้ายอดขายของเดือนนั้น
  salesGoals: ["b_td", "b_jk", "b_ta", "b_jt"].map((brand_id) => ({ brand_id, month: "2026-09-01", sales_target: 1000000 })),
  pilot: { status: "ready", error: null, summary }, ...patch,
});
const show = (props) => render(<MemoryRouter><AdsSourceNotice ads={ads(props)} /></MemoryRouter>);

describe("AdsSourceControl — ไม่มีตัวสลับแหล่งข้อมูลแล้ว", () => {
  it("ข้อมูลจริง = ไม่มีป้ายอะไรบนหัวหน้า (แถบด้านล่างบอกอยู่แล้ว)", () => {
    const { container } = render(<AdsSourceControl ads={ads()} />);
    expect(container.firstChild).toBeNull();
  });
  it("โหมดเดโม = ยังบอกว่าเป็นข้อมูลตัวอย่าง", () => {
    render(<AdsSourceControl ads={ads({ source: "mock" })} />);
    expect(screen.getByText("ข้อมูลตัวอย่าง")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ของจริง/ })).toBeNull();
  });
});

describe("AdsSourceNotice — สามชั้น", () => {
  it("ชั้นที่ 1 สรุป + ธงวันนี้ยังไม่จบ + ปุ่มโหลดใหม่", () => {
    show();
    expect(screen.getByRole("status").textContent).toContain("ข้อมูลจริง");
    expect(screen.getByText(/วันนี้ยังไม่สิ้นสุด/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /โหลดใหม่/ })).toBeTruthy();
  });

  it("ชั้นที่ 2 ป้ายครบทั้ง 4 แหล่ง · ค่าอ่านเป็นคำ ไม่ได้บอกด้วยสีอย่างเดียว", () => {
    show();
    const chips = screen.getAllByRole("listitem");
    expect(chips).toHaveLength(4);
    expect(chips.map((chip) => chip.querySelector("span").textContent))
      .toEqual(["ค่าแอด Meta", "ยอดขาย TD · JD · TA", "ยอดขาย JUNTAKARN", "เป้าเดือนนี้"]);
    expect(within(chips[0]).getByText("4 บัญชี · ถึง 18 ก.ย.")).toBeTruthy();
    expect(within(chips[3]).getByText("4/4 แบรนด์")).toBeTruthy();
  });

  it("ชั้นที่ 3 ที่มาของตัวเลขพับไว้ กดแล้วเห็นคู่ ระบบ → ตัวชี้วัด และเวลาที่ดึงล่าสุด", () => {
    show();
    const legend = screen.getByText("ที่มาของตัวเลข");
    expect(legend.closest("details").open).toBe(false);
    fireEvent.click(legend);
    const terms = screen.getAllByRole("term").map((node) => node.textContent);
    expect(terms).toEqual(["ระบบขาย", "Meta Ads", "ดึงค่าแอดล่าสุด"]);
    expect(screen.getByText(/ยอดขาย · เป้า · funnel/)).toBeTruthy();
  });

  it("แหล่งไหนค้าง = ป้ายนั้นเตือนและสรุปบอกชื่อแหล่ง", () => {
    show({ sales: [{ brand_id: "b_td", fact_date: "2026-09-10", source: "crm" }] });
    expect(screen.getByRole("status").textContent).toContain("ยอดขาย TD · JD · TA");
    const chips = screen.getAllByRole("listitem");
    expect(chips[1].className).toBe("warn");
    expect(within(chips[2]).getByText("รอเชื่อมแหล่งข้อมูล")).toBeTruthy();
  });

  it("โหลดไม่สำเร็จ = บอกเหตุผลไทยและไม่สลับไปข้อมูลตัวอย่างเงียบๆ", () => {
    show({ pilot: { status: "error", error: "SALES_READ_FAILED", summary } });
    expect(screen.getByRole("alert").textContent).toContain("ไม่ได้แสดงข้อมูลตัวอย่างแทน");
  });
});
