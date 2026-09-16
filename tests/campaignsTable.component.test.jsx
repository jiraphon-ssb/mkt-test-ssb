// @vitest-environment jsdom
/* ตารางแคมเปญ — ระดับหน้าจอ (หน้าที่ทีมเปิดบ่อยสุด)
   ใช้ข้อมูลผ่านท่อจริง campaignRows → withSpendShare → campaignDecision เหมือน CampaignsView
   จึงจับได้ทั้งตอนตารางพัง และตอนที่ท่อข้อมูลเปลี่ยนรูปจนตารางแสดงผิด
   กราฟถูกแทนด้วยของปลอม: Chart.js ต้องมี canvas จริงและ ThemeContext ซึ่งไม่ใช่สิ่งที่เทสนี้ตรวจ */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../src/modules/marketing/dash/charts/ChartBox.jsx", () => ({
  ChartBox: ({ ariaLabel }) => <div data-testid="chart" aria-label={ariaLabel} />,
}));

const { CampaignsTable } = await import("../src/modules/marketing/campaigns/CampaignsTable.jsx");
const { campaignRows, campaignDecision, withSpendShare } = await import("../src/modules/marketing/adsCampaigns.js");

afterEach(cleanup);
beforeAll(() => { window.scrollTo = () => {}; });   // ลิ้นชักคืนตำแหน่ง scroll ตอนปิด — jsdom ไม่มีเมธอดนี้

const RANGE = { start: "2026-07-01T00:00:00.000Z", end: "2026-07-16T00:00:00.000Z" };
const PREV = { start: "2026-06-16T00:00:00.000Z", end: "2026-07-01T00:00:00.000Z" };
const BRANDS = [{ id: "b_td", name: "TEAMDEE" }];
const card = (id, day, over = {}) => ({
  id, track: "project", status: "measured", brand_id: "b_td", archived: true,
  campaign: "Always-on — คนเคยทัก", creative: "ชิ้น A",
  brief: { channels: ["Facebook"], publish_at: null },
  metrics: {
    spend: 1000, leads: 4, revenue: 3000, impressions: 20_000, clicks: 300, reach: 10_000,
    measured_at: `2026-07-${String(day).padStart(2, "0")}T09:00:00.000Z`,
  },
  ...over,
});
const cards = [
  card("a1", 3), card("a2", 5),
  card("a3", 8, { campaign: "Prospecting — กลุ่มใหม่", metrics: { ...card("x", 8).metrics, spend: 2000, leads: 0 } }),
];
const campaignBudgets = [
  { brand_id: "b_td", channel: "Meta Ads", campaign: "Always-on — คนเคยทัก", month: "2026-07", share: 0.6, objective: "messages", status: "active" },
  { brand_id: "b_td", channel: "Meta Ads", campaign: "Prospecting — กลุ่มใหม่", month: "2026-07", share: 0.4, objective: "leads", status: "active" },
];

const buildRows = () => withSpendShare(campaignRows(cards, RANGE, {
  brands: BRANDS, adBudgets: [{ brand_id: "b_td", channel: "Facebook", month: "2026-07", amount: 10_000 }],
  campaignBudgets, today: "2026-07-15", prevRange: PREV,
})).map((row) => ({ ...row, decision: campaignDecision(row, null) }));

const show = (props = {}) => render(
  <CampaignsTable
    rows={buildRows()} compareLabel="ช่วงก่อนหน้า" revenueLabel="ยอดรวม"
    renderDetail={(row) => <p>รายละเอียดของ {row.name}</p>} {...props}
  />,
);

describe("CampaignsTable — ข้อมูลจริง: การ์ดยอดขายยึดระบบขาย", () => {
  it("ยอดขายจริง + ROAS จริง · ยอดที่ Meta เห็นเป็นบรรทัดรอง · บอกแบรนด์ที่ไม่รวม", () => {
    const { container } = show({ salesSummary: { revenue: 80000, revenueNew: 60000, orders: 4, spend: 4000, roas: 20, pctAds: 4000 / 60000, excludedWaiting: ["JUNTAKARN"], excludedNoData: [] } });
    const summary = container.querySelector(".cp-summary");
    expect(within(summary).getByText("ยอดขายจริง · ระบบขาย")).toBeTruthy();
    expect(within(summary).getByText("฿80,000")).toBeTruthy();
    expect(within(summary).getByText(/ROAS จริง 20\.0x · %Ads ยอดใหม่ 6\.7%/)).toBeTruthy();
    expect(within(summary).getByText(/Meta เห็น ฿9,000 · ROAS Meta 2\.3x/)).toBeTruthy();
    expect(within(summary).getByText("ไม่รวม JUNTAKARN (รอเชื่อมแหล่งข้อมูล)")).toBeTruthy();
  });

  it("แบรนด์ที่เลือกยังไม่มีแหล่ง = บอกเหตุผล ไม่ขึ้น ฿0", () => {
    const { container } = show({ salesSummary: { revenue: null, roas: null, pctAds: null, excludedWaiting: ["JUNTAKARN"], excludedNoData: [] } });
    const summary = container.querySelector(".cp-summary");
    expect(within(summary).getByText("รอเชื่อมแหล่งข้อมูล")).toBeTruthy();
    expect(within(summary).queryByText("฿0")).toBeNull();
  });
});

describe("CampaignsTable — สิ่งที่เห็นบนหน้าจอ", () => {
  it("ขึ้นครบทุกแคมเปญพร้อมจำนวนรายการ", () => {
    show();
    expect(screen.getByRole("heading", { name: "รายการแคมเปญ" })).toBeTruthy();
    expect(screen.getByText("2 รายการ")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Always-on — คนเคยทัก" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Prospecting — กลุ่มใหม่" })).toBeTruthy();
  });

  it("ยอดรวมด้านบนตรงกับผลรวมของแถวที่แสดง", () => {
    const { container } = show();
    const summary = container.querySelector(".cp-summary");
    expect(within(summary).getByText("฿4,000")).toBeTruthy();      // 1000 + 1000 + 2000
    expect(within(summary).getByText("2 แคมเปญ · งบที่ตั้ง ฿10,000")).toBeTruthy();
    expect(within(summary).getByText("8")).toBeTruthy();            // ผลลัพธ์รวม 4 + 4 + 0
  });

  it("ค่าที่ยังไม่รู้ขึ้น — ไม่ใช่ 0 (แคมเปญที่ยังไม่มีผลลัพธ์ต้องไม่ดูเหมือน CPL เป็นศูนย์)", () => {
    const { container } = show();
    const rows = [...container.querySelectorAll(".cp-campaign")];
    const prospecting = rows.find((row) => row.textContent.includes("Prospecting"));
    expect(within(prospecting).getByText("CPL —")).toBeTruthy();
  });

  it("เลขบนแท็บกลุ่มตรงกับจำนวนรายการที่กดแล้วได้จริง ทุกกลุ่ม", () => {
    const { container } = show();
    const tabs = screen.getAllByRole("tab").filter((tab) => tab.closest(".cp-views"));
    expect(tabs.length).toBeGreaterThan(1);
    for (const tab of tabs) {
      const badge = Number(tab.querySelector("b").textContent);
      fireEvent.click(tab);
      expect(tab.getAttribute("aria-selected")).toBe("true");
      expect(container.querySelectorAll(".cp-campaign").length).toBe(badge);
    }
  });

  it("กดการ์ด 'วันนี้ต้องดู' ซ้ำที่ใบเดิม = กลับมาทั้งหมด (ปุ่มสลับ ไม่ใช่ทางเดียว)", () => {
    const { container } = show();
    const waiting = [...container.querySelectorAll(".cp-focus-card")].find((card) => card.textContent.includes("รอข้อมูล"));
    fireEvent.click(waiting);
    expect(waiting.className).toContain("active");
    fireEvent.click(waiting);
    expect(waiting.className).not.toContain("active");
    expect(container.querySelectorAll(".cp-campaign").length).toBe(2);
  });

  it("สลับชุดข้อมูลระหว่าง งานวันนี้ / ตัวเลขละเอียด ได้ และบอกสถานะปุ่มให้ผู้ใช้ที่ใช้คีย์บอร์ด", () => {
    const { container } = show();
    const analysis = screen.getByRole("button", { name: "ตัวเลขละเอียด" });
    expect(analysis.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(analysis);
    expect(analysis.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".cp-workspace").className).toContain("cp-view--analysis");
  });

  it("กดปุ่มขยายแล้วเปิดลิ้นชักรายละเอียด และปิดได้", () => {
    show();
    const expand = screen.getByRole("button", { name: /ดูรายละเอียด Always-on/ });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expand);
    expect(screen.getByText("รายละเอียดของ Always-on — คนเคยทัก")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: /รายละเอียด Always-on/ })).toBeTruthy();
    // ชื่อ "ปิดรายละเอียด" ต้องมีปุ่มเดียว — พื้นหลังเป็นแค่พื้นที่กดของเมาส์ ไม่ควรถูกอ่านซ้ำ
    expect(screen.getAllByRole("button", { name: "ปิดรายละเอียด" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "ปิดรายละเอียด" }));
    expect(screen.queryByText("รายละเอียดของ Always-on — คนเคยทัก")).toBeNull();
  });

  it("กดพื้นหลังก็ปิดลิ้นชักได้ (คนใช้เมาส์คาดหวังแบบนี้)", () => {
    const { container } = show();
    fireEvent.click(screen.getByRole("button", { name: /ดูรายละเอียด Always-on/ }));
    const backdrop = container.querySelector(".cp-drawer-backdrop");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(container.querySelector(".cp-drawer")).toBeNull();
  });

  it("ไม่มีแคมเปญ: บอกสาเหตุต่างกันระหว่างกรองไม่เจอ กับไม่มีข้อมูลในช่วงนั้นเลย", () => {
    const filtered = show({ rows: [] });
    expect(screen.getByText("ไม่พบแคมเปญตามตัวกรองนี้")).toBeTruthy();
    filtered.unmount();
    show({ rows: [], scopeEmpty: true });
    expect(screen.getByText("ไม่มีข้อมูลแคมเปญในช่วงเวลาหรือช่องทางนี้")).toBeTruthy();
  });
});
