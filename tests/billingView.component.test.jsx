// @vitest-environment jsdom
/* หน้า บิล & กระทบยอด (spec 2026-09-22) — team_lead เท่านั้น · ตัวเลข 2 ตำแหน่งไม่ปัด · ป้าย exception-based */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = { role: "team_lead", snapshots: [], reviews: [], charges: [] };
const calls = { addReview: [] };
const day = "2026-09-05";
const card = (account, brand, campaign, spend) => ({ brand_id: brand, account_id: account, campaign,
  fact_date: day, metrics: { spend, measured_at: `${day}T12:00:00Z` } });

vi.mock("../src/modules/marketing/useMkt.jsx", () => ({ useApp: () => ({
  data: { brands: [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jd", name: "JK Design" }] } }) }));
vi.mock("../src/foundation/auth/AuthContext.jsx", () => ({ useAuth: () => ({ user: { role: state.role, name: "อาร์ต" } }) }));
vi.mock("../src/modules/marketing/ads/useAdsData.js", () => ({ useAdsData: () => ({ source: "meta_pilot",
  cards: [card("111000111", "b_td", "ทีมดี-โปโล", 150807.37), card("111000111", "b_td", "Message-ทัก", 30000)],
  pilot: { status: "ready" } }) }));
vi.mock("../src/foundation/data/apiClient.js", () => ({ apiClient: { ads: {
  accountSnapshots: async () => state.snapshots,
  billingReviews: async () => state.reviews,
  billingCharges: async () => state.charges,
  addBillingReview: async (entry) => { calls.addReview.push(entry); return "id-1"; },
} } }));
const { BillingView } = await import("../src/modules/marketing/ads/BillingView.jsx");

afterEach(() => { cleanup(); state.role = "team_lead"; state.snapshots = []; state.reviews = []; state.charges = []; calls.addReview = []; });
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
    fireEvent.click(await screen.findByRole("button", { name: /ตรวจแล้ว · TEAMDEE/ }));
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
