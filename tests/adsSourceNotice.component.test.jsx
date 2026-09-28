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
const show = (props, extra = {}) => render(<MemoryRouter><AdsSourceNotice ads={ads(props)} {...extra} /></MemoryRouter>);

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
  it("ชั้นที่ 1 สรุป + ธงวันนี้ยังไม่จบ (เมื่อดูวันนี้) + ปุ่มโหลดใหม่", () => {
    show(undefined, { todayOnly: true });
    expect(screen.getByRole("status").textContent).toContain("ข้อมูลจริง");
    expect(screen.getByText(/ของวันนี้จะครบพรุ่งนี้/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /โหลดใหม่/ })).toBeTruthy();
  });

  it("ชั้นที่ 2 ป้ายรายแหล่งย้ายเข้า fold (มินิมอล 21 ก.ย. ค่ำ — สรุปบรรทัดบนบอกแหล่งที่มีปัญหาอยู่แล้ว)", () => {
    show();
    const chips = screen.getAllByRole("listitem");
    expect(chips).toHaveLength(4);
    expect(chips[0].closest("details")).toBeTruthy();          // อยู่ใน "ที่มาของตัวเลข" ไม่ลอยบนแถบ
    expect(document.querySelector(".ads-source-top .ads-source-chips")).toBeNull();
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

  /* ทดสอบละเอียดรอบ 2 (27 ก.ย.): โหลดพังแล้วขึ้นสองที่ (แถบนี้ + กล่องในหน้า) พร้อมปุ่มลองใหม่สองปุ่ม · ระหว่างโหลดก็ซ้อนสองบรรทัด
     → สถานะโหลด/พังให้กล่องในหน้าบอกที่เดียว (อยู่ตรงที่ข้อมูลควรอยู่ บอกได้ว่า "ไม่ได้แปลว่าไม่มีข้อมูล") แถบนี้เงียบ */
  it("กำลังโหลด / โหลดไม่สำเร็จ = แถบนี้ไม่ขึ้น (กล่องในหน้าบอกแทน ไม่ซ้อนสองที่)", () => {
    const { container } = show({ pilot: { status: "error", error: "SALES_READ_FAILED", summary } });
    expect(container.textContent).toBe("");
    cleanup();
    expect(show({ pilot: { status: "loading", error: null, summary } }).container.textContent).toBe("");
  });
});

/* 26 ก.ย. (สเปก creative-page-hierarchy): แถบขึ้นเฉพาะตอนมีเรื่อง — ปกติ (สดและครบ) ไม่กินพื้นที่ทุกหน้า ดูรายละเอียดที่หน้าสถานะ Sync */
describe("AdsSourceNotice — ขึ้นเฉพาะตอนมีปัญหา", () => {
  // ทุกแหล่งสด ณ 18 ก.ย. (ข้อมูลใน fixture ถึง 18 ก.ย.)
  const fresh = () => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-18T10:00:00+07:00")); };
  afterEach(() => vi.useRealTimers());

  it("ทุกแหล่งสดและครบ = ไม่แสดงแถบ", () => {
    fresh();
    const { container } = show();
    expect(container.firstChild).toBeNull();
  });
  it("สดและครบ แต่กำลังดู 'วันนี้' = แสดงแถบพร้อมธงวันนี้ยังไม่จบ", () => {
    fresh();
    show(undefined, { todayOnly: true });
    expect(screen.getByText(/ของวันนี้จะครบพรุ่งนี้/)).toBeTruthy();
  });
  it("แหล่งค้าง = ยังแสดงแถบ แต่ไม่มีธงวันนี้เมื่อไม่ได้ดูวันนี้", () => {
    show({ sales: [{ brand_id: "b_td", fact_date: "2026-09-10", source: "crm" }] });
    expect(screen.getByRole("status").textContent).toContain("ยอดขาย TD · JD · TA");
    expect(screen.queryByText(/ของวันนี้จะครบพรุ่งนี้/)).toBeNull();
  });
});

/* ทดสอบละเอียดรอบ 2: ยอดขาย/เป้าโหลดพัง ห้ามสรุปว่า "ยังไม่มีข้อมูลยอดขาย / ยังไม่ตั้งเป้า" */
it("ยอดขาย/เป้าโหลดไม่สำเร็จ = บอกบรรทัดเดียว + โหลดใหม่ · ไม่ขึ้น 'ยังไม่มี' / 'ยังไม่ตั้งเป้า'", () => {
  const { container } = show({ pilot: { status: "ready", error: null, summary, salesFailed: true } });
  expect(screen.getByRole("alert").textContent).toContain("โหลดยอดขายและเป้าไม่สำเร็จ");
  expect(screen.getByRole("button", { name: /โหลดใหม่/ })).toBeTruthy();
  expect(container.textContent).not.toMatch(/ยังไม่มีข้อมูล|ยังไม่ตั้งเป้า/);
});
