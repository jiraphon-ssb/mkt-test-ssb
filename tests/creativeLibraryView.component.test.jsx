// @vitest-environment jsdom
/* หน้า Creative Library — จำนวนการซื้อ + กรองตามกฎคัดครีเอทีฟที่ตั้งในหน้าตั้งค่า */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = { settings: {}, ads: {} };
/* ข้อมูลจริงดึงวันละครั้ง ค่าแอดล่าสุดคือเมื่อวาน — เดิม fixture เป็น "วันนี้" ซึ่งหลังตัดช่วงที่วันที่มีข้อมูล (ตรวจรอบ 28 ก.ย.) จะหลุดจากเดือนนี้
   ล็อกวันที่กลางเดือน กันวันที่ 1 ที่เมื่อวานเป็นเดือนก่อน */
vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-15T12:00:00"));
const day = new Date("2026-09-14T12:00:00");
const ad = (id, creative, metrics) => ({ id, track: "project", status: "measured", archived: true, brand_id: "b_td", campaign: "c1", creative, source: "meta", ad_platform: "Meta Ads",
  brief: { channels: ["Meta Ads"] }, metrics: { impressions: 10000, clicks: 100, reach: 8000, leads: 5, revenue: null, measured_at: day.toISOString(), ...metrics } });
const cards = [
  ad("a", "ชิ้นแพง", { spend: 3000, purchases: 2 }),      // 1,500 ต่อการซื้อ
  ad("b", "ชิ้นคุ้ม", { spend: 1600, purchases: 2 }),      // 800
  ad("c", "ชิ้นเผาเงิน", { spend: 2500, purchases: 0 }),   // ใช้เกินเพดานยังไม่มีการซื้อ
  ad("d", "ชิ้นใหม่", { spend: 200, purchases: 0 }),       // ต่ำกว่าขั้นต่ำ
];
vi.mock("../src/modules/marketing/useMkt.jsx", () => ({ useApp: () => ({ data: { brands: [{ id: "b_td", name: "TEAMDEE" }], settings: state.settings }, inBrandScope: () => true, brandFilter: "all", toast: () => {} }) }));
vi.mock("../src/modules/marketing/ads/useAdsData.js", () => ({ useAdsData: () => ({ cards, source: "meta_pilot", canPreview: false, reload: () => {}, ...state.ads }) }));
vi.mock("../src/modules/marketing/ads/AdsSourceControl.jsx", () => ({ AdsSourceControl: () => null, AdsSourceNotice: () => null }));
vi.mock("../src/modules/marketing/creatives/CreativeMedia.jsx", () => ({ CreativeMedia: () => null }));
const { CreativeLibraryView } = await import("../src/modules/marketing/creatives/CreativeLibraryView.jsx");

afterEach(() => { cleanup(); state.settings = {}; state.ads = {}; sessionStorage.clear(); if (cards.length > 4) cards.length = 4; });
const view = (url = "/mkt/creatives") => render(<MemoryRouter initialEntries={[url]}><CreativeLibraryView /></MemoryRouter>);
const card = (name) => screen.getByText(name).closest("article");
const shown = () => [...document.querySelectorAll(".cc-title b")].map((el) => el.textContent);

describe("CreativeLibraryView", () => {
  /* การ์ดตัวเดียว (อาร์ตเคาะ 25 ก.ย.): บนการ์ด = ค่าแอด/CTR/ROAS · การซื้อ ต่อการซื้อ %Ads อยู่ในหน้าต่างแบบละเอียด */
  it("การ์ดแสดงค่าแอด · CTR · ROAS · หน้าต่างแสดงการซื้อและต้นทุนต่อการซื้อ · สรุปการซื้อรวม", () => {
    view();
    expect(within(card("ชิ้นแพง")).getByText("฿3,000.00")).toBeTruthy();
    fireEvent.click(card("ชิ้นแพง"));
    const results = within(screen.getByRole("group", { name: "ผลลัพธ์" }));
    expect(results.getByText("การซื้อ (Meta)").nextSibling.textContent).toBe("2");
    expect(results.getByText("ต่อการซื้อ").nextSibling.textContent).toBe("฿1,500.00");
    const stats = within(screen.getByRole("group", { name: "สรุปชุดที่กำลังดู" }));
    expect(stats.getByText("การซื้อ (Meta)").nextSibling.textContent).toBe("4");
  });

  it("ยังไม่มีกฎ: บอกให้ไปตั้งกฎพร้อมลิงก์ไปแท็บกฎ", () => {
    view();
    expect(screen.getByRole("link", { name: "ตั้งกฎคัดครีเอทีฟ" }).getAttribute("href")).toBe("/mkt/ads?panel=settings&tab=rules");
  });

  /* สเปก 2026-09-25: กล่องรายการกฎถูกยุบเข้าแถบสรุป — ยังต้องบอกว่ากฎรอค่าเกณฑ์ ไม่ใช่บอกว่าไม่มีกฎ */
  it("มีกฎแต่ยังไม่ใส่ค่าเกณฑ์: แถบสรุปบอกว่ารอค่าเกณฑ์ + ลิงก์แก้กฎ ไม่บอกว่าไม่มีกฎ", () => {
    state.settings = { ads_control: { creativeRules: [
      { id: "r1", name: "คัด ROAS", brandId: "all", metric: "roas", op: "lte", value: null, minSpend: 1000 },
      { id: "r2", name: "คัด CPL", brandId: "all", metric: "cpl", op: "lte", value: null, minSpend: 1000 },
    ] } };
    view();
    const strip = document.querySelector(".cl-bar");
    expect(strip.textContent).toContain("กฎ 2 ข้อยังไม่ใส่ค่าเกณฑ์");
    expect(within(strip).getByRole("link", { name: "แก้กฎ" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "ตั้งกฎคัดครีเอทีฟ" })).toBeNull();
  });

  it("เลือกกฎ: การ์ดบอกผ่าน/ไม่ผ่านพร้อมเหตุผล · สรุปนับชิ้นและเงินที่ใช้กับชิ้นที่ไม่ผ่าน · กดกรองเฉพาะไม่ผ่าน", () => {
    state.settings = { ads_control: { creativeRules: [{ id: "r1", name: "CPA ไม่เกิน 1,000", brandId: "all", metric: "cpa", op: "lte", value: 1000, minSpend: 500 }] } };
    view();
    fireEvent.click(screen.getByRole("button", { name: "กฎ" }));
    fireEvent.click(screen.getByRole("option", { name: "CPA ไม่เกิน 1,000" }));
    expect(within(card("ชิ้นแพง")).getByText("ไม่ผ่านกฎ")).toBeTruthy();
    expect(within(card("ชิ้นเผาเงิน")).getByText("ใช้ไป ฿2,500.00 ยังไม่มีการซื้อ (เพดาน ฿1,000.00 ต่อการซื้อ)")).toBeTruthy();
    expect(card("ชิ้นคุ้ม").querySelector(".cc-rule")).toBeNull();   // ผ่าน = ไม่ขึ้นบรรทัดกฎ ป้ายเป็นคำแนะนำ (27 ก.ย.) · ดูผ่าน/ไม่ผ่านรวมจากแถบกรองด้านล่าง
    expect(within(card("ชิ้นใหม่")).getByText("ยังตัดสินไม่ได้")).toBeTruthy();
    const summary = within(screen.getByRole("group", { name: "กรองตามผลกฎ" }));
    const fail = summary.getByRole("button", { name: /^ไม่ผ่าน/ });
    expect(fail.textContent).toContain("2");
    expect(fail.textContent).toContain("฿5,500.00");
    fireEvent.click(fail);
    expect(shown().sort()).toEqual(["ชิ้นเผาเงิน", "ชิ้นแพง"]);
    fireEvent.click(summary.getByRole("button", { name: /^ไม่ผ่าน/ }));
    expect(shown()).toHaveLength(4);
    // แบ่งช่องมี "ทั้งหมด" ให้กดกลับได้ตรงๆ และบอกว่าช่องไหนเลือกอยู่
    fireEvent.click(summary.getByRole("button", { name: /^ผ่าน/ }));
    expect(shown()).toEqual(["ชิ้นคุ้ม"]);
    fireEvent.click(summary.getByRole("button", { name: /^ทั้งหมด/ }));
    expect(summary.getByRole("button", { name: /^ทั้งหมด/ }).getAttribute("aria-pressed")).toBe("true");
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
  /* รีวิว UX 25 ก.ย. ข้อ 12: มีรูปแบบเดียว ("ไม่ระบุ 100%") ตารางเทียบไม่มีอะไรให้เทียบ → ไม่แสดง */
  it("มีรูปแบบเดียว = ไม่แสดงตารางเทียบรูปแบบ และไม่มีปุ่มเปิด", () => {
    view();
    expect(screen.queryByRole("region", { name: "เทียบตามรูปแบบชิ้นงาน" })).toBeNull();
    expect(screen.queryByRole("button", { name: "เทียบตามรูปแบบ" })).toBeNull();
  });
  it("เทียบตามรูปแบบชิ้นงาน: ชื่อไม่มีคำนำหน้า = ไม่ระบุ · กดชื่อรูปแบบแล้วกรองและใส่ในลิงก์", () => {
    cards.push(ad("v", "VDO รีวิวลูกค้า", { spend: 100, purchases: 0 }));
    view();
    const toggle = screen.getByRole("button", { name: "เทียบตามรูปแบบ" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "เทียบตามรูปแบบชิ้นงาน" })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
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
    expect(document.querySelectorAll(".cc .cc-rule").length).toBeGreaterThan(0);
    expect(within(card("ชิ้นแพง")).getByText("ไม่ผ่านกฎ")).toBeTruthy();   // 1,500 เกินเพดาน 1,000
    expect(within(card("ชิ้นคุ้ม")).queryByText("ไม่ผ่านกฎ")).toBeNull();   // 800 อยู่ในเพดาน — ผ่านแล้วไม่ขึ้นบรรทัด "ผ่านกฎ" (27 ก.ย.)
    expect(card("ชิ้นคุ้ม").querySelector(".cc-rule")).toBeNull();
    expect(screen.getByRole("group", { name: "กรองตามผลกฎ" })).toBeTruthy();
  });
  it("เลือก 'ไม่ใช้กฎ' เองแล้วต้องเคารพ ไม่เด้งกลับมาเปิดเอง", () => {
    state.settings = { ads_control: { creativeRules: ready } };
    view("/mkt/creatives?rule=none");
    expect(document.querySelectorAll(".cc .cc-rule")).toHaveLength(0);
  });
});

describe("%Ads (อาร์ตขอ 21 ก.ย. ค่ำ) — ย้ายไปหน้าต่างแบบละเอียด", () => {
  it("ไม่มีรายได้ = ขีด ไม่ใช่ศูนย์", () => {
    view();
    fireEvent.click(card("ชิ้นแพง"));
    expect(within(screen.getByRole("group", { name: "ผลลัพธ์" })).getByText("ROAS (Meta) · %Ads (Meta)").nextSibling.textContent).toBe("— · —");
  });
});

/* สเปก 2026-09-25 ทาง A: เปิดมาเป็นรูปเต็ม · ปุ่ม รูป/ตาราง ในหัวหน้า · ส่วนบนแถบเดียว · คลิก = หน้าต่างเดียว */
describe("หน้าคลัง (สเปก 2026-09-25)", () => {
  it("เปิดมาเป็นรูปเต็ม · ปุ่ม รูป/ตาราง อยู่ในหัวหน้า", () => {
    view();
    const head = document.querySelector(".cl-command header");
    expect(within(head).getByRole("button", { name: "รูป" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".cc")).toBeTruthy();
    fireEvent.click(within(head).getByRole("button", { name: "ตาราง" }));
    expect(document.querySelector(".cc")).toBeNull();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(4);
  });
  /* รื้อ 26 ก.ย. (อาร์ต: "รื้อมาแล้วทำดีๆหน่อย" — เดิมประโยคยาวบรรทัดเดียว + ชิปล้นขวา) → แผงเดียว ตัวเลขแบบ ป้าย/ค่า */
  it("แถบสรุป: ตัวเลขแบบป้าย/ค่าในแผงเดียว · ไม่มีการ์ดสรุป 5 ใบ", () => {
    view();
    expect(document.querySelector(".cl-summary")).toBeNull();
    const stats = within(screen.getByRole("group", { name: "สรุปชุดที่กำลังดู" }));
    expect(stats.getByText("ชิ้นงาน").nextSibling.textContent).toBe("4");
    expect(stats.getByText("ค่าแอด").nextSibling.textContent).toBe("฿7,300.00");
    expect(stats.queryByText("เริ่มล้า")).toBeNull();          // ไม่มีชิ้นล้า = ไม่ขึ้นช่องศูนย์
  });
  it("การ์ดโชว์จุดสถานะเฉพาะเมื่อรู้สถานะ (ไม่ขึ้น 'ไม่ทราบสถานะ' ทุกใบ)", () => {
    view();
    expect(within(card("ชิ้นแพง")).queryByText("ไม่ทราบสถานะ")).toBeNull();
  });
  it("คลิกการ์ด หรือแถวตาราง = หน้าต่างเดียว", () => {
    view();
    fireEvent.click(screen.getByText("ชิ้นแพง").closest("article"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "ชิ้นแพง" })).toBeTruthy();
    cleanup();
    view("/mkt/creatives?view=table");
    fireEvent.click(screen.getByText("ชิ้นแพง").closest("tr"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});

/* 26 ก.ย. (สเปก creative-page-hierarchy): เชิงอรรถออกจากพื้นผิวหลัก → รวมที่ "สูตรและที่มา" ท้ายหน้า พับไว้ */
describe("CreativeLibraryView — สูตรและที่มา", () => {
  it("ตารางเทียบรูปแบบไม่มีเชิงอรรถใต้ตาราง · ท้ายหน้ามี 'สูตรและที่มา' พับไว้ รวมคำอธิบาย CTR ลิงก์ ROAS รูปแบบ สถานะ", () => {
    cards.push(ad("v2", "VDO รีวิว", { spend: 100, purchases: 0 }));
    view();
    fireEvent.click(screen.getByRole("button", { name: "เทียบตามรูปแบบ" }));
    expect(document.querySelector(".cl-formats .aw-key")).toBeNull();
    const notes = screen.getByText("สูตรและที่มา").closest("details");
    expect(notes.open).toBe(false);
    expect(notes.textContent).toMatch(/CTR ลิงก์.*ROAS.*รูปแบบมาจาก Meta.*07:30/s);
  });
});

/* 26 ก.ย. อาร์ตเคาะ: ระหว่างโหลดห้ามบอกว่า "ไม่พบชิ้นงาน" / ฿0.00 · ภาพพังต้องบอกตรงๆ พร้อมลองใหม่ */
describe("CreativeLibraryView — สถานะโหลด", () => {
  it("กำลังโหลด = บอกว่ากำลังโหลด ไม่ขึ้นไม่พบชิ้นงาน ไม่ขึ้นตัวเลขสรุป", () => {
    state.ads = { cards: [], pilot: { status: "loading" } };
    view();
    expect(screen.getByRole("status").textContent).toContain("กำลังโหลดชิ้นงาน");
    expect(screen.queryByText("ไม่พบชิ้นงานในช่วงนี้")).toBeNull();
    expect(screen.queryByRole("group", { name: "สรุปชุดที่กำลังดู" })).toBeNull();
  });
  it("ภาพครีเอทีฟโหลดไม่สำเร็จ = บอกตรงๆ + ปุ่มลองใหม่ · ยังเห็นตัวเลข", () => {
    const reload = vi.fn();
    state.ads = { pilot: { status: "ready", creativesFailed: true }, reload };
    view();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("โหลดภาพครีเอทีฟไม่สำเร็จ");
    fireEvent.click(within(alert).getByRole("button", { name: "ลองใหม่" }));
    expect(reload).toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "สรุปชุดที่กำลังดู" })).toBeTruthy();
  });
});

describe("CreativeLibraryView — โหลดไม่สำเร็จ (ชุด A ข้อ 5)", () => {
  it("ไม่ขึ้น 'ไม่พบชิ้นงาน' หรือตัวเลขสรุป ฿0 · มีปุ่มลองใหม่", () => {
    const reload = vi.fn();
    state.ads = { cards: [], pilot: { status: "error", error: "SALES_READ_FAILED" }, reload };
    view();
    expect(screen.getByRole("alert").textContent).toMatch(/โหลดตัวเลขไม่สำเร็จ · \S/);   // เหตุผลเฉพาะอยู่ในกล่องนี้ (ทดสอบละเอียดรอบ 2)
    expect(screen.queryByText("ไม่พบชิ้นงานในช่วงนี้")).toBeNull();
    expect(screen.queryByRole("group", { name: "สรุปชุดที่กำลังดู" })).toBeNull();
    expect(document.body.textContent).toContain("โหลดตัวเลขไม่สำเร็จ");
    fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(reload).toHaveBeenCalled();
  });
});

/* ชุด B ข้อ 17: ‹ › ในหน้าต่างครีเอทีฟเลื่อนได้ครบทุกชิ้น ไม่หยุดที่ขอบหน้าที่แบ่งไว้ */
describe("CreativeLibraryView — หน้าต่างเลื่อนข้ามหน้า", () => {
  it("มี 14 ชิ้น แบ่งหน้า 12 → หน้าต่างบอก 1 / 14", () => {
    for (let i = 0; i < 10; i++) cards.push(ad(`x${i}`, `ชิ้นเพิ่ม ${i}`, { spend: 50 + i, purchases: 0 }));
    view();
    fireEvent.click(screen.getByRole("button", { name: /ดูรายละเอียด ชิ้นแพง/ }));
    expect(within(screen.getByRole("dialog")).getByText(/^\d+ \/ 14$/)).toBeTruthy();
  });
});

/* ตรวจรอบ 28 ก.ย.: "วันนี้" เดิมขึ้น "ไม่พบชิ้นงาน ลองเปลี่ยนช่วงเวลา" — ข้อมูลของวันนี้ยังไม่ดึง ต้องบอกเหมือนหน้าภาพรวม */
it("ช่วงวันนี้ (ข้อมูลถึงเมื่อวาน) = กล่องข้อมูลยังไม่เข้า + ลิงก์ไปวันล่าสุด ไม่ใช่ 'ไม่พบชิ้นงาน'", () => {
  view("/mkt/creatives?period=today");
  expect(screen.getByText(/ข้อมูลของ 15 ก.ย. 2569 ยังไม่เข้า/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "ดูข้อมูลล่าสุด (14 ก.ย.)" })).toBeTruthy();
  expect(screen.queryByText("ไม่พบชิ้นงานในช่วงนี้")).toBeNull();
  // แถบสรุป/ผลกฎที่เป็นศูนย์ทั้งหมดไม่ขึ้นเหนือกล่อง (ตรวจรอบ 28 ก.ย.)
  expect(screen.queryByRole("region", { name: "สรุปและผลกฎ" })).toBeNull();
});

/* รีวิวโค้ด 28 ก.ย.: เปิดลิงก์ที่มีตัวกรองรูปแบบ + ช่วงวันนี้ = ตารางเทียบรูปแบบว่างขึ้นเหนือกล่องข้อมูลยังไม่เข้า */
it("ช่วงวันนี้ + ตัวกรองรูปแบบ = ไม่มีตารางเทียบรูปแบบ (มีแต่กล่องข้อมูลยังไม่เข้า)", () => {
  view("/mkt/creatives?period=today&format=video");
  expect(screen.getByText(/ยังไม่เข้า/)).toBeTruthy();
  expect(document.querySelector(".cl-formats")).toBeNull();
});
