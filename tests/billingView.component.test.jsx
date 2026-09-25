// @vitest-environment jsdom
/* หน้า บิล & กระทบยอด (spec 2026-09-22) — team_lead เท่านั้น · ตัวเลข 2 ตำแหน่งไม่ปัด · ป้าย exception-based */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = { role: "team_lead", snapshots: [], reviews: [], charges: [], adsSource: "meta_pilot", adsStatus: "ready", remoteFails: false };
const calls = { addReview: [], reload: 0 };
const day = "2026-09-05";
const card = (account, brand, campaign, spend) => ({ brand_id: brand, account_id: account, campaign,
  fact_date: day, metrics: { spend, measured_at: `${day}T12:00:00Z` } });

vi.mock("../src/modules/marketing/useMkt.jsx", () => ({ useApp: () => ({
  data: { brands: [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jd", name: "JK Design" }] } }) }));
vi.mock("../src/foundation/auth/AuthContext.jsx", () => ({ useAuth: () => ({ user: { role: state.role, name: "อาร์ต" } }) }));
vi.mock("../src/modules/marketing/ads/useAdsData.js", () => ({ useAdsData: () => ({ source: state.adsSource,
  cards: state.adsStatus === "ready" ? [card("111000111", "b_td", "ทีมดี-โปโล", 150807.37), card("111000111", "b_td", "Message-ทัก", 30000)] : [],
  pilot: { status: state.adsStatus }, reload: () => { calls.reload += 1; } }) }));
vi.mock("../src/foundation/data/apiClient.js", () => ({ apiClient: { ads: {
  accountSnapshots: async () => { if (state.remoteFails) throw new Error("x"); return state.snapshots; },
  billingReviews: async () => state.reviews,
  billingCharges: async () => state.charges,
  addBillingReview: async (entry) => { calls.addReview.push(entry); return "id-1"; },
} } }));
const { BillingView } = await import("../src/modules/marketing/ads/BillingView.jsx");

afterEach(() => { cleanup(); Object.assign(state, { role: "team_lead", snapshots: [], reviews: [], charges: [], adsSource: "meta_pilot", adsStatus: "ready", remoteFails: false }); calls.addReview = []; calls.reload = 0; });
const show = () => render(<MemoryRouter><BillingView month="2026-09-01" /></MemoryRouter>);

describe("สิทธิ์", () => {
  it("role อื่นเห็นข้อความไม่มีสิทธิ์ ไม่เห็นตัวเลขเงิน", async () => {
    state.role = "staff";
    show();
    expect(await screen.findByText(/เฉพาะหัวหน้าทีม/)).toBeTruthy();
    expect(screen.queryByText(/฿150,807/)).toBeNull();
  });
});

describe("ตารางรายเดือน", () => {
  it("แถวบัญชีที่เชื่อม: ยอด/VAT ตัดสองตำแหน่งไม่ปัด · ไม่กรอก statement = เงียบไม่มีป้าย", async () => {
    show();
    const row = (await screen.findByText("TEAMDEE")).closest("[data-row]");
    expect(within(row).getByText("฿180,807.37")).toBeTruthy();          // 150,807.37 + 30,000
    expect(within(row).getByText("฿12,656.51")).toBeTruthy();           // ×0.07 = 12,656.5159 → ตัดไม่ปัด
    expect(row.querySelector(".aw-flag")).toBeNull();
    expect(within(row).getByText("ยังไม่กรอก")).toBeTruthy();
  });
  it("บัญชีนอกระบบขึ้นชื่อ+ยอดค้าง · ใช้เงินเพิ่ม = ป้ายแดง + แถบเตือน", async () => {
    state.snapshots = [{ external_account_id: "999000999", account_name: "Finix2", account_status: 1,
      amount_spent_cents: 1240000, balance_cents: 52000, fetched_at: "2026-09-21T09:00:00Z" }];
    show();
    const row = (await screen.findByText("Finix2")).closest("[data-row]");
    expect(within(row).getByText("ยังไม่ได้เชื่อมเข้าระบบ")).toBeTruthy();
    expect(within(row).getByText("฿520.00")).toBeTruthy();              // balance 52000 สตางค์
  });
  it("กดยืนยันผลตรวจ → ส่ง payload ครบผ่าน RPC และแสดงผลบันทึก", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "กรอกผลตรวจ · TEAMDEE" }));
    fireEvent.change(screen.getByRole("textbox", { name: "ยอดตาม statement" }), { target: { value: "180,900" } });
    fireEvent.change(screen.getByRole("textbox", { name: "หมายเหตุ" }), { target: { value: "เทียบ statement แล้ว" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกผลตรวจ" }));
    await waitFor(() => expect(calls.addReview).toHaveLength(1));
    // reviewer ไม่ถูกส่งจาก client — RPC ผูกจาก auth.uid() ฝั่ง server (กันปลอมชื่อคนตรวจ)
    expect(calls.addReview[0]).toEqual({ month: "2026-09-01", external_account_id: "111000111",
      verdict: "noted", statement_amount: 180900, note: "เทียบ statement แล้ว" });
  });
  it("ทุกอย่างปกติ = ไม่มีแถบเตือน · ส่วนการตัดรายครั้งซ่อนเมื่อ charges ว่าง", async () => {
    show();
    await screen.findByText("TEAMDEE");
    expect(document.querySelector(".bl-alerts")).toBeNull();
    expect(screen.queryByText(/การตัดบัตรรายครั้ง/)).toBeNull();
  });
});

describe("แท็บ บิล & กระทบยอด ใน AdsSectionTabs", () => {
  it("team_lead เห็นแท็บ · role อื่นไม่เห็น", async () => {
    const { AdsSectionTabs } = await import("../src/modules/marketing/ads/AdsSectionTabs.jsx");
    const tabs = () => render(<MemoryRouter><AdsSectionTabs /></MemoryRouter>);
    tabs();
    expect(screen.getByText("บิล & กระทบยอด")).toBeTruthy();
    cleanup();
    state.role = "staff";
    tabs();
    expect(screen.queryByText("บิล & กระทบยอด")).toBeNull();
    expect(screen.getByText("ภาพรวม")).toBeTruthy();
  });
});


describe("แถวกดได้ทั้งแถว (กติกาเดียวกับตารางแบรนด์)", () => {
  it("กดที่ตัวเลขในแถวก็เปิดรายละเอียด · กดซ้ำปิด", async () => {
    show();
    const row = (await screen.findByText("TEAMDEE")).closest("[data-row]");
    const cell = within(row).getByText("฿180,807.37");
    fireEvent.click(cell);
    expect(screen.getByText("เงินก้อนนี้ไปกับอะไร")).toBeTruthy();
    fireEvent.click(cell);
    expect(screen.queryByText("เงินก้อนนี้ไปกับอะไร")).toBeNull();
  });
  it("ชื่อบัญชีไม่โชว์ act_ ดิบ — ตัดเหลือท้าย 4 ตัวเมื่อไม่มีชื่อจาก snapshot", async () => {
    show();
    const row = (await screen.findByText("TEAMDEE")).closest("[data-row]");
    expect(within(row).getByText("บัญชี …0111")).toBeTruthy();
    expect(row.textContent).not.toContain("act_");
  });
});

/* B1 · 22 ก.ย.: เดือนอนาคตกดได้ไม่จำกัด และย้อนเกินหน้าต่าง facts (200 วัน) ตารางว่างโดยไม่บอกเหตุผล */
describe("ขอบเขตเดือน", () => {
  it("เดือนปัจจุบัน: ปุ่มเดือนถัดไปกดไม่ได้", async () => {
    render(<MemoryRouter><BillingView month={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`} /></MemoryRouter>);
    await screen.findByText(/บิล & กระทบยอด/);
    expect(screen.getByRole("button", { name: "เดือนถัดไป" }).disabled).toBe(true);
  });
  it("ย้อนเกินหน้าต่างข้อมูล = บอกเหตุผล ไม่ปล่อยให้เข้าใจว่าไม่มีค่าแอด", async () => {
    render(<MemoryRouter><BillingView month="2024-01-01" /></MemoryRouter>);
    expect(await screen.findByText(/เกินช่วงข้อมูลที่ระบบเก็บไว้/)).toBeTruthy();
  });
});

describe("บัญชีนอกระบบใช้ยอดเดือนจริง", () => {
  it("มี month_spend = โชว์ยอด + VAT + ป้ายแดง", async () => {
    state.snapshots = [{ external_account_id: "999000999", account_name: "Finix2", account_status: 1,
      amount_spent_cents: 1240000, balance_cents: 0, month_spend: { "2026-09": 1240000 },
      fetched_at: "2026-09-21T09:00:00Z" }];
    show();
    const row = (await screen.findByText("Finix2")).closest("[data-row]");
    expect(within(row).getByText("฿12,400.00")).toBeTruthy();
    expect(within(row).getByText("เงินออกนอกระบบ")).toBeTruthy();
  });
});

/* B2 · 22 ก.ย.: กดบันทึกด้วยฟอร์มเปล่าได้ record "ตรวจแล้ว · ตรง" ถาวร ลบไม่ได้
   หลักฐานตรวจสอบที่ไม่มีอะไรยืนยันว่าตรวจอะไร — ต้องกรอกอย่างน้อยหนึ่งอย่าง */
describe("ฟอร์มผลตรวจต้องมีเนื้อหา", () => {
  it("ฟอร์มเปล่า = ปุ่มกดไม่ได้ + บอกว่าต้องกรอกอะไร", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "กรอกผลตรวจ · TEAMDEE" }));
    const save = screen.getByRole("button", { name: "บันทึกผลตรวจ" });
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/กรอกยอด statement หรือหมายเหตุ/)).toBeTruthy();
    expect(calls.addReview).toHaveLength(0);
  });
  it("กรอกหมายเหตุอย่างเดียวก็บันทึกได้ (ตรวจแล้วตรง ไม่มีตัวเลขให้กรอก)", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "กรอกผลตรวจ · TEAMDEE" }));
    fireEvent.change(screen.getByRole("textbox", { name: "หมายเหตุ" }), { target: { value: "เทียบ statement แล้วตรง" } });
    expect(screen.getByRole("button", { name: "บันทึกผลตรวจ" }).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "บันทึกผลตรวจ" }));
    await waitFor(() => expect(calls.addReview).toHaveLength(1));
    expect(calls.addReview[0].verdict).toBe("noted");
  });
});

/* รีวิว UX 25 ก.ย. ข้อ 1: โหลดค่าแอดไม่สำเร็จแต่การ์ดขึ้น ฿0.00 — ขัดกฎ "ข้อมูลไม่ครบ = — ไม่แทนด้วยศูนย์"
   คนอ่านจะเข้าใจว่าเดือนนี้ไม่มีค่าแอด · ข้อความ error เดิมเป็นตัวเล็กสีเทาใต้การ์ด */
describe("โหลดไม่สำเร็จต้องไม่โชว์ศูนย์", () => {
  const statValues = () => [...document.querySelectorAll(".bl-stats b")].map((b) => b.textContent);
  it("ค่าแอดโหลดไม่สำเร็จ = การ์ดเป็น — ทั้งหมด + แจ้งเตือนชัด + ปุ่มลองใหม่", async () => {
    state.adsStatus = "error";
    show();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/โหลดค่าแอดไม่สำเร็จ/);
    expect(statValues().slice(0, 3)).toEqual(["—", "—", "—"]);
    expect(document.body.textContent).not.toContain("฿0.00");
    fireEvent.click(within(alert).getByRole("button", { name: "ลองใหม่" }));
    expect(calls.reload).toBe(1);
  });
  it("กำลังโหลด = — ไม่ใช่ ฿0.00", async () => {
    state.adsStatus = "loading";
    show();
    await screen.findByText(/กำลังโหลดค่าแอด/);
    expect(statValues().slice(0, 3)).toEqual(["—", "—", "—"]);
  });
  it("ข้อมูลจำลอง = ไม่เอามาทำบิล บอกตรงๆ", async () => {
    state.adsSource = "mock";
    show();
    expect(await screen.findByText(/ข้อมูลจำลอง/)).toBeTruthy();
    expect(statValues().slice(0, 3)).toEqual(["—", "—", "—"]);
  });
  it("ทั้งค่าแอดยังไม่รู้และฝั่งฐานพัง = ไม่อ้างว่า 'ตัวเลขระบบนับยังถูกต้อง' (ไม่มีตัวเลขให้ถูก)", async () => {
    state.adsSource = "mock"; state.remoteFails = true;
    show();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("ยังถูกต้อง");
  });
  it("ข้อมูลฝั่งฐาน (ยอดค้าง/ผลตรวจ) โหลดไม่สำเร็จ = แจ้งเตือนชัด + ลองใหม่ · ตัวเลขระบบนับยังขึ้น", async () => {
    state.remoteFails = true;
    show();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/ยอดค้างและผลตรวจโหลดไม่สำเร็จ/);
    expect(within(alert).getByRole("button", { name: "ลองใหม่" })).toBeTruthy();
    expect(statValues()[0]).toBe("฿180,807.37");
  });
});
