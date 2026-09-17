// @vitest-environment jsdom
/* หน้ารายงานประชุม — หัวข้อเป็นคำถาม · สรุป 1 นาที · ปุ่มรอบรายงาน · ลิงก์ไปหน้ารายละเอียดพาตัวกรองไปด้วย */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const day = new Date(); day.setHours(12, 0, 0, 0);
const ad = (id, brand_id, creative, metrics) => ({ id, track: "project", status: "measured", archived: true, brand_id, campaign: `แคมเปญ ${creative}`, creative, source: "meta", ad_platform: "Meta Ads",
  brief: { channels: ["Meta Ads"] }, metrics: { impressions: 20000, clicks: 300, reach: 15000, leads: 20, revenue: null, measured_at: day.toISOString(), ...metrics } });
const cards = [ad("a", "b_td", "ชิ้น A", { spend: 4000, purchases: 4 }), ad("b", "b_td", "ชิ้น B", { spend: 2500, purchases: 0 })];
vi.mock("../src/modules/marketing/useMkt.jsx", () => ({ useApp: () => ({ data: { brands: [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jk", name: "JK Design" }], settings: {}, cards: [] }, inBrandScope: () => true, brandFilter: "all" }) }));
vi.mock("../src/modules/marketing/ads/useAdsData.js", () => ({ useAdsData: () => ({ cards, source: "mock", sales: [], salesGoals: [], canPreview: false, pilot: { summary: {} } }) }));
vi.mock("../src/modules/marketing/ads/AdsSourceControl.jsx", () => ({ AdsSourceControl: () => null, AdsSourceNotice: () => null }));
const { MeetingReportView } = await import("../src/modules/marketing/report/MeetingReportView.jsx");

afterEach(() => { cleanup(); sessionStorage.clear(); });
const view = (url = "/mkt/report") => render(<MemoryRouter initialEntries={[url]}><MeetingReportView /></MemoryRouter>);

describe("MeetingReportView", () => {
  it("เรียงตามคำถามที่ที่ประชุมถาม 7 ข้อ + สรุป 1 นาที", () => {
    view();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "สรุป 1 นาที", "ยอดขายเป็นยังไง ถึงเป้าไหม", "ใช้งบไปเท่าไร คุ้มไหม", "ลูกค้าหล่นตรงไหน", "อะไรทำให้ตัวเลขเปลี่ยน",
      "แคมเปญไหนต้องทำอะไร", "ครีเอทีฟไหนคุ้ม ไหนเปลือง", "ตัวเลขเชื่อได้แค่ไหน",
    ]);
  });

  it("ครีเอทีฟ: ชิ้นที่ใช้เงินเกิน ฿1,000 แต่ยังไม่มีการซื้อขึ้นในรายการและในสรุป", () => {
    view();
    const q6 = screen.getByRole("region", { name: "ครีเอทีฟไหนคุ้ม ไหนเปลือง" });
    expect(within(q6).getByText("ชิ้น B")).toBeTruthy();
    expect(within(q6).getByText("฿2,500.00")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "สรุป 1 นาที" })).getByText(/ยังไม่มีการซื้อ 1 ชิ้น \(฿2,500.00\)/)).toBeTruthy();
  });

  it("ปุ่มรอบรายงาน: สัปดาห์ก่อน กดแล้วเลือก · ลิงก์ไปหน้าแคมเปญพาช่วงวันไปด้วย", () => {
    view("/mkt/report?period=mtd");
    fireEvent.click(screen.getByRole("button", { name: "สัปดาห์ก่อน" }));
    expect(screen.getByRole("button", { name: "สัปดาห์ก่อน" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: /ดูแคมเปญทั้งหมด/ }).getAttribute("href")).toContain("period=lastWeek");
  });

  it("ไม่ใช่เดือนนี้: บอกว่าเป้า/คาดการณ์ดูได้เมื่อเลือกเดือนนี้ ไม่ขึ้นเป้าเป็น 0", () => {
    view("/mkt/report?period=lastWeek");
    expect(screen.getByText('เป้าและคาดการณ์รายเดือนดูได้เมื่อเลือก "เดือนนี้"')).toBeTruthy();
    expect(screen.queryByText("คาดสิ้นเดือน")).toBeNull();
  });
  it("เดือนนี้: ทุกตัวเทียบวันเดียวกันของเดือนก่อน (ฐานเดียวกันทั้งหน้า) · ช่วงอื่นเลือกฐานเทียบได้", () => {
    view("/mkt/report?period=mtd");
    expect(screen.getByText("เทียบ · วันเดียวกันเดือนก่อน")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "เทียบ" })).toBeNull();
    cleanup();
    view("/mkt/report?period=lastWeek");
    expect(screen.getByRole("button", { name: "เทียบ" })).toBeTruthy();
  });
});
