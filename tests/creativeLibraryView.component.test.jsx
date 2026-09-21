// @vitest-environment jsdom
/* หน้า Creative Library — จำนวนการซื้อ + กรองตามกฎคัดครีเอทีฟที่ตั้งในหน้าตั้งค่า */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = { settings: {} };
const day = new Date(); day.setHours(12, 0, 0, 0);
const ad = (id, creative, metrics) => ({ id, track: "project", status: "measured", archived: true, brand_id: "b_td", campaign: "c1", creative, source: "meta", ad_platform: "Meta Ads",
  brief: { channels: ["Meta Ads"] }, metrics: { impressions: 10000, clicks: 100, reach: 8000, leads: 5, revenue: null, measured_at: day.toISOString(), ...metrics } });
const cards = [
  ad("a", "ชิ้นแพง", { spend: 3000, purchases: 2 }),      // 1,500 ต่อการซื้อ
  ad("b", "ชิ้นคุ้ม", { spend: 1600, purchases: 2 }),      // 800
  ad("c", "ชิ้นเผาเงิน", { spend: 2500, purchases: 0 }),   // ใช้เกินเพดานยังไม่มีการซื้อ
  ad("d", "ชิ้นใหม่", { spend: 200, purchases: 0 }),       // ต่ำกว่าขั้นต่ำ
];
vi.mock("../src/modules/marketing/useMkt.jsx", () => ({ useApp: () => ({ data: { brands: [{ id: "b_td", name: "TEAMDEE" }], settings: state.settings }, inBrandScope: () => true, brandFilter: "all", toast: () => {} }) }));
vi.mock("../src/modules/marketing/ads/useAdsData.js", () => ({ useAdsData: () => ({ cards, source: "meta_pilot", canPreview: false }) }));
vi.mock("../src/modules/marketing/ads/AdsSourceControl.jsx", () => ({ AdsSourceControl: () => null, AdsSourceNotice: () => null }));
vi.mock("../src/modules/marketing/creatives/CreativeMedia.jsx", () => ({ CreativeMedia: () => null }));
const { CreativeLibraryView } = await import("../src/modules/marketing/creatives/CreativeLibraryView.jsx");

afterEach(() => { cleanup(); state.settings = {}; sessionStorage.clear(); });
const view = (url = "/mkt/creatives") => render(<MemoryRouter initialEntries={[url]}><CreativeLibraryView /></MemoryRouter>);
const card = (name) => screen.getByText(name).closest("article");
const shown = () => [...document.querySelectorAll(".cl-card strong")].map((el) => el.textContent);

describe("CreativeLibraryView", () => {
  it("การ์ดแสดงจำนวนการซื้อและต้นทุนต่อการซื้อ · สรุปการซื้อรวม", () => {
    view();
    const a = within(card("ชิ้นแพง"));
    expect(a.getByText("การซื้อ").nextSibling.textContent).toBe("2");
    expect(a.getByText("ต่อการซื้อ").nextSibling.textContent).toBe("฿1,500.00");
    expect(within(card("ชิ้นเผาเงิน")).getByText("ต่อการซื้อ").nextSibling.textContent).toBe("—");
    expect(screen.getByText("การซื้อ (Meta)").nextSibling.textContent).toBe("4");
  });

  it("ยังไม่มีกฎ: บอกให้ไปตั้งกฎพร้อมลิงก์ไปแท็บกฎ", () => {
    view();
    expect(screen.getByRole("link", { name: "ตั้งกฎ" }).getAttribute("href")).toBe("/mkt/ads?panel=settings&tab=rules");
  });

  it("มีกฎแต่ยังไม่ใส่ค่าเกณฑ์: แสดงชื่อกฎและสถานะรอค่าเกณฑ์ ไม่บอกว่าไม่มีกฎ", () => {
    state.settings = { ads_control: { creativeRules: [
      { id: "r1", name: "คัด ROAS", brandId: "all", metric: "roas", op: "gte", value: null, minSpend: 1000 },
      { id: "r2", name: "คัด CPL", brandId: "all", metric: "cpl", op: "lte", value: null, minSpend: 1000 },
    ] } };
    view();
    const rules = within(screen.getByRole("region", { name: "กฎคัดครีเอทีฟที่ตั้งไว้" }));
    expect(rules.getByText("ตั้งไว้ 2 · พร้อมใช้ 0 · รอค่าเกณฑ์ 2")).toBeTruthy();
    expect(rules.getByText("คัด ROAS")).toBeTruthy();
    expect(rules.getByText("คัด CPL")).toBeTruthy();
    expect(rules.getAllByText("รอใส่ค่าเกณฑ์")).toHaveLength(2);
    expect(screen.queryByText(/ยังไม่มีกฎคัดครีเอทีฟ/)).toBeNull();
  });

  it("กฎที่พร้อมใช้แสดงบนหน้าและกดจากแถบกฎเพื่อเปิดผลได้", () => {
    state.settings = { ads_control: { creativeRules: [{ id: "r1", name: "CPA ไม่เกิน 1,000", brandId: "all", metric: "cpa", op: "lte", value: 1000, minSpend: 500 }] } };
    view();
    const rules = within(screen.getByRole("region", { name: "กฎคัดครีเอทีฟที่ตั้งไว้" }));
    fireEvent.click(rules.getByRole("button", { name: /CPA ไม่เกิน 1,000/ }));
    expect(within(card("ชิ้นแพง")).getByText("ไม่ผ่านกฎ")).toBeTruthy();
    expect(screen.getByRole("region", { name: "ผลตามกฎ" })).toBeTruthy();
  });

  it("เลือกกฎ: การ์ดบอกผ่าน/ไม่ผ่านพร้อมเหตุผล · สรุปนับชิ้นและเงินที่ใช้กับชิ้นที่ไม่ผ่าน · กดกรองเฉพาะไม่ผ่าน", () => {
    state.settings = { ads_control: { creativeRules: [{ id: "r1", name: "CPA ไม่เกิน 1,000", brandId: "all", metric: "cpa", op: "lte", value: 1000, minSpend: 500 }] } };
    view();
    fireEvent.click(screen.getByRole("button", { name: "กฎ" }));
    fireEvent.click(screen.getByRole("option", { name: "CPA ไม่เกิน 1,000" }));
    expect(within(card("ชิ้นแพง")).getByText("ไม่ผ่านกฎ")).toBeTruthy();
    expect(within(card("ชิ้นเผาเงิน")).getByText("ใช้ไป ฿2,500.00 ยังไม่มีการซื้อ (เพดาน ฿1,000.00 ต่อการซื้อ)")).toBeTruthy();
    expect(within(card("ชิ้นคุ้ม")).getByText("ผ่านกฎ")).toBeTruthy();
    expect(within(card("ชิ้นใหม่")).getByText("ยังตัดสินไม่ได้")).toBeTruthy();
    const summary = within(screen.getByRole("region", { name: "ผลตามกฎ" }));
    const fail = summary.getByRole("button", { name: /ไม่ผ่าน/ });
    expect(fail.textContent).toContain("2");
    expect(fail.textContent).toContain("ค่าแอด ฿5,500.00");
    fireEvent.click(fail);
    expect(shown().sort()).toEqual(["ชิ้นเผาเงิน", "ชิ้นแพง"]);
    fireEvent.click(summary.getByRole("button", { name: /ไม่ผ่าน/ }));
    expect(shown()).toHaveLength(4);
  });

  it("เรียงตามต้นทุนต่อการซื้อต่ำสุด", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "เรียง" }));
    fireEvent.click(screen.getByRole("option", { name: "ต้นทุนต่อการซื้อต่ำสุด" }));
    expect(shown().slice(0, 2)).toEqual(["ชิ้นคุ้ม", "ชิ้นแพง"]);
  });
  it("ตัวกรองมาจากลิงก์: ช่วงวัน การเรียง และคำค้นตามลิงก์ที่ส่งมา", () => {
    view("/mkt/creatives?period=lastWeek&sort=cpa&q=%E0%B8%84%E0%B8%B8%E0%B9%89%E0%B8%A1");
    expect(screen.getByRole("button", { name: "เรียง" }).textContent).toContain("ต้นทุนต่อการซื้อต่ำสุด");
    expect(screen.getByRole("searchbox", { name: "ค้นหาครีเอทีฟ" }).value).toBe("คุ้ม");
    expect(document.querySelector(".drp-trigger").textContent).toContain("สัปดาห์ก่อน");
  });

  it("ช่วงวันที่เลือกในหน้าอื่น (จำในแท็บ) ถูกใช้ต่อเมื่อเปิดหน้านี้โดยไม่มีตัวกรองในลิงก์ · ตัวกรองเฉพาะหน้าไม่ติดมา", () => {
    sessionStorage.setItem("ssb.report.filters", JSON.stringify({ period: "7d", brand: "all", status: "paused" }));
    view();
    expect(document.querySelector(".drp-trigger").textContent).toContain("7 วันล่าสุด");
  });
  it("เทียบตามรูปแบบชิ้นงาน: ชื่อไม่มีคำนำหน้า = ไม่ระบุ · กดชื่อรูปแบบแล้วกรองและใส่ในลิงก์", () => {
    view();
    const table = within(screen.getByRole("region", { name: "เทียบตามรูปแบบชิ้นงาน" }));
    const row = table.getByRole("button", { name: "ไม่ระบุ" }).closest("tr");
    expect(row.textContent).toContain("4");
    expect(row.textContent).toContain("฿7,300.00");
    fireEvent.click(table.getByRole("button", { name: "ไม่ระบุ" }));
    expect(table.getByRole("button", { name: "ไม่ระบุ" }).getAttribute("aria-pressed")).toBe("true");
    expect(shown()).toHaveLength(4);
  });
});

/* อาร์ตแจ้ง 21 ก.ย. ค่ำ: "ตั้งกฎไว้แล้ว พออยู่ในหน้าครีเอทีฟมันไม่แสดง"
   เหตุ: ตัวกรองกฎตั้งต้นเป็น "ไม่ใช้กฎ" → การ์ดไม่มีบรรทัดผลกฎเลยจนกว่าจะไปเลือกเองจากดรอปดาวน์ */
describe("กฎที่ตั้งไว้ต้องทำงานทันทีที่เข้าหน้า", () => {
  const ready = [
    { id: "r1", name: "", brandId: "all", metric: "cpa", op: "lte", value: 1000, minSpend: 500 },
  ];
  it("มีกฎพร้อมใช้ = การ์ดขึ้นผลกฎทันที ไม่ต้องไปเลือกจากดรอปดาวน์ก่อน", () => {
    state.settings = { ads_control: { creativeRules: ready } };
    view();
    expect(document.querySelectorAll(".cl-card .cl-rule").length).toBeGreaterThan(0);
    expect(within(card("ชิ้นแพง")).getByText("ไม่ผ่านกฎ")).toBeTruthy();   // 1,500 เกินเพดาน 1,000
    expect(within(card("ชิ้นคุ้ม")).getByText("ผ่านกฎ")).toBeTruthy();      // 800 อยู่ในเพดาน
    expect(document.querySelector(".cl-rule-summary")).toBeTruthy();
  });
  it("เลือก 'ไม่ใช้กฎ' เองแล้วต้องเคารพ ไม่เด้งกลับมาเปิดเอง", () => {
    state.settings = { ads_control: { creativeRules: ready } };
    view("/mkt/creatives?rule=none");
    expect(document.querySelectorAll(".cl-card .cl-rule")).toHaveLength(0);
  });
});

describe("%Ads บนการ์ด (อาร์ตขอ 21 ก.ย. ค่ำ)", () => {
  it("มีรายได้ = โชว์ %Ads · ไม่มีรายได้ = ขีด ไม่ใช่ศูนย์", () => {
    view();
    expect(within(card("ชิ้นแพง")).getByText("%Ads")).toBeTruthy();
    expect(within(card("ชิ้นแพง")).getByText("%Ads").nextSibling.textContent).toBe("—");   // revenue null
  });
});
