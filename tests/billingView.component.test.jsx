// @vitest-environment jsdom
/* หน้า บิล & กระทบยอด (spec 2026-09-22) — team_lead เท่านั้น · ตัวเลข 2 ตำแหน่งไม่ปัด · ป้าย exception-based */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/* ล็อกวันที่ — ก.ย. 2569 เป็น "เดือนปัจจุบัน" ของเทสชุดนี้ (ยอดค้างแสดงเฉพาะเดือนปัจจุบัน ตรวจรอบ 28 ก.ย.) ไม่ให้เทสพังเมื่อถึง ต.ค. */
vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-28T12:00:00"));
const state = { role: "team_lead", snapshots: [], reviews: [], charges: [], adsSource: "meta_pilot", adsStatus: "ready", remoteFails: false };
const calls = { addReview: [], reload: 0 };
const day = "2026-09-05";
const card = (account, brand, campaign, spend) => ({ brand_id: brand, account_id: account, campaign,
  fact_date: day, metrics: { spend, measured_at: `${day}T12:00:00Z` } });

vi.mock("../src/modules/marketing/useMkt.jsx", () => ({ useApp: () => ({
  data: { brands: [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jd", name: "JK Design" }] } }) }));
vi.mock("../src/foundation/auth/AuthContext.jsx", () => ({ useAuth: () => ({ user: { role: state.role, name: "อาร์ต" } }) }));
vi.mock("../src/modules/marketing/ads/useAdsData.js", () => ({ useAdsData: () => ({ source: state.adsSource,
  cards: state.adsStatus === "ready" ? [card("111000111", "b_td", "ทีมดี-โปโล", 150807.37), card("111000111", "b_td", "Message-ทัก", 30000), ...(state.extraCards ?? [])] : [],
  pilot: { status: state.adsStatus, summary: { from: state.dataFrom ?? null } }, reload: () => { calls.reload += 1; } }) }));
vi.mock("../src/foundation/data/apiClient.js", () => ({ apiClient: { ads: {
  accountSnapshots: async () => { if (state.remoteFails) throw new Error("x"); return state.snapshots; },
  billingReviews: async () => state.reviews,
  billingCharges: async () => state.charges,
  addBillingReview: async (entry) => { calls.addReview.push(entry); return "id-1"; },
} } }));
const { BillingView } = await import("../src/modules/marketing/ads/BillingView.jsx");

afterEach(() => { cleanup(); Object.assign(state, { role: "team_lead", snapshots: [], reviews: [], charges: [], adsSource: "meta_pilot", adsStatus: "ready", remoteFails: false, extraCards: [] }); calls.addReview = []; calls.reload = 0; });
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
    expect(within(row).getByText("รอยอดใบแจ้งยอด")).toBeTruthy();
  });
  it("บัญชีนอกระบบขึ้นชื่อ+ยอดค้าง · ใช้เงินเพิ่ม = ป้ายแดง + แถบเตือน", async () => {
    state.snapshots = [{ external_account_id: "999000999", account_name: "Finix2", account_status: 1,
      amount_spent_cents: 1240000, balance_cents: 52000, fetched_at: "2026-09-21T09:00:00Z" }];
    show();
    const row = (await screen.findByText("Finix2")).closest("[data-row]");
    expect(within(row).getByText("ยังไม่ได้เชื่อมเข้าระบบ")).toBeTruthy();
    expect(within(row).getByText("฿520.00")).toBeTruthy();              // balance 52000 สตางค์
  });
  it("บันทึกผลตรวจมีขั้นยืนยันก่อน (แก้ไม่ได้ภายหลัง) → ส่ง payload ครบผ่าน RPC → บอกว่าบันทึกแล้ว", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "กรอกผลตรวจ · TEAMDEE" }));
    fireEvent.change(screen.getByRole("textbox", { name: "ยอดก่อน VAT ตามใบแจ้งยอด" }), { target: { value: "180,900" } });
    fireEvent.change(screen.getByRole("textbox", { name: "หมายเหตุ" }), { target: { value: "เทียบใบแจ้งยอดแล้ว" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกผลตรวจ" }));
    // ยังไม่ส่ง — ขึ้นสรุปให้ยืนยันก่อน
    expect(calls.addReview).toHaveLength(0);
    const confirm = screen.getByRole("group", { name: "ยืนยันบันทึกผลตรวจ" });
    expect(confirm.textContent).toContain("฿180,900.00");
    expect(confirm.textContent).toContain("แก้ไม่ได้");
    fireEvent.click(within(confirm).getByRole("button", { name: "ยืนยันบันทึก" }));
    await waitFor(() => expect(calls.addReview).toHaveLength(1));
    // reviewer ไม่ถูกส่งจาก client — RPC ผูกจาก auth.uid() ฝั่ง server (กันปลอมชื่อคนตรวจ)
    // 180,900 ห่างค่าแอด 180,807.37 ไม่ถึง 0.5% = match (เดิม match เกิดไม่ได้เลย · ชุด D)
    expect(calls.addReview[0]).toEqual({ month: "2026-09-01", external_account_id: "111000111",
      verdict: "match", statement_amount: 180900, note: "เทียบใบแจ้งยอดแล้ว" });
    expect((await screen.findByRole("status", { name: "ผลการบันทึก" })).textContent).toContain("บันทึกผลตรวจ TEAMDEE แล้ว");
  });
  it("ขั้นยืนยันกด 'กลับไปแก้' ได้ ไม่ส่งอะไร", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "กรอกผลตรวจ · TEAMDEE" }));
    fireEvent.change(screen.getByRole("textbox", { name: "หมายเหตุ" }), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกผลตรวจ" }));
    fireEvent.click(screen.getByRole("button", { name: "กลับไปแก้" }));
    expect(screen.getByRole("textbox", { name: "หมายเหตุ" }).value).toBe("x");
    expect(calls.addReview).toHaveLength(0);
  });
  it("ไม่มีศัพท์ระบบ (statement / snapshot / ads-cron) บนหน้า", async () => {
    show();
    await screen.findByText("TEAMDEE");
    fireEvent.click(screen.getByRole("button", { name: "กรอกผลตรวจ · TEAMDEE" }));
    expect(document.body.textContent).not.toMatch(/statement|snapshot|ads-cron/i);
  });
  it("บัญชีนอกระบบที่เดือนนี้ใช้ ฿0 ไม่ขึ้นเป็นแถว — รวมเป็นบรรทัดเดียว", async () => {
    state.snapshots = [{ external_account_id: "999000999", account_name: "Finix2", account_status: 1,
      balance_cents: 0, month_spend: { "2026-09": 0 }, fetched_at: "2026-09-21T09:00:00Z" }];
    show();
    expect(await screen.findByText(/บัญชีนอกระบบที่เดือนนี้ไม่ได้ใช้เงิน 1 บัญชี/)).toBeTruthy();
    expect(document.querySelector("[data-row] .bl-name")?.textContent).not.toContain("Finix2");
    expect([...document.querySelectorAll("[data-row]")].some((r) => r.textContent.includes("Finix2"))).toBe(false);
  });
  it("แถวที่กางออกมี VAT และยอดใบแจ้งยอด (คอลัมน์ที่ซ่อนตอนจอแคบ)", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "รายละเอียด TEAMDEE" }));
    const facts = document.querySelector(".bl-detail-facts");
    expect(facts.textContent).toContain("VAT ประมาณ");
    expect(facts.textContent).toContain("฿12,656.51");
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
    expect(screen.getByText(/กรอกยอดใบแจ้งยอดหรือหมายเหตุ/)).toBeTruthy();
    expect(calls.addReview).toHaveLength(0);
  });
  it("กรอกหมายเหตุอย่างเดียวก็บันทึกได้ (ตรวจแล้วตรง ไม่มีตัวเลขให้กรอก)", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "กรอกผลตรวจ · TEAMDEE" }));
    fireEvent.change(screen.getByRole("textbox", { name: "หมายเหตุ" }), { target: { value: "เทียบใบแจ้งยอดแล้วตรง" } });
    expect(screen.getByRole("button", { name: "บันทึกผลตรวจ" }).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "บันทึกผลตรวจ" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันบันทึก" }));
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

/* 26 ก.ย. (สเปก charge-match): คอลัมน์ Meta ตัดจริง · เจาะดูรายการตัดพร้อมช่วงค่าแอดที่ครอบคลุม · ตัดเกิน = ป้าย+แถบเตือน */
describe("แมทรายการตัดบัตร", () => {
  const charge = (id, charge_date, amount) => ({ id, external_account_id: "111000111", charge_date, amount, reference: id, source: "upload", raw: {} });
  const open = async () => { const row = (await screen.findByText("TEAMDEE")).closest("[data-row]"); fireEvent.click(row.querySelector(".bl-row")); return row; };

  it("ยังไม่นำเข้ารายการตัด: คอลัมน์ขึ้น — และบอกบรรทัดเดียวว่าคอลัมน์นี้มาจากไหน (ไม่เตือนแดง)", async () => {
    show();
    const row = (await screen.findByText("TEAMDEE")).closest("[data-row]");
    expect(screen.getByRole("table", { name: "กระทบยอดรายบัญชี" }).querySelector(".bl-row--head").textContent).toContain("Meta ตัดจริง");
    expect(row.querySelector("[data-col=charged]").textContent).toBe("—");
    expect(screen.getByText(/ยังไม่มีรายการตัดบัตร/)).toBeTruthy();
    expect(screen.queryByText(/Meta ตัดเกิน/)).toBeNull();
  });
  it("ตัดตรงกับค่าแอด: คอลัมน์ขึ้นยอดที่ตัด · เจาะดูเห็นรายการ + ช่วงค่าแอดที่ครอบคลุม · ไม่มีป้าย", async () => {
    state.charges = [charge("TX-1", "2026-09-05", 180807.37)];
    show();
    await waitFor(() => expect(screen.getByText("TEAMDEE").closest("[data-row]").querySelector("[data-col=charged]").textContent).toBe("฿180,807.37"));
    const row = await open();
    const list = within(row).getByRole("group", { name: "รายการที่ Meta ตัดบัตร" });
    expect(list.textContent).toContain("TX-1");
    expect(list.textContent).toContain("ครอบคลุมค่าแอด 5 ก.ย.");
    expect(list.textContent).not.toContain("ตัดเกิน");
  });
  it("ตัดเกินค่าแอดที่ระบบเห็น: ป้ายในแถว · ยอดที่ไม่มีค่าแอดรองรับในรายการ · แถบเตือนบนหน้า", async () => {
    state.charges = [charge("TX-1", "2026-09-05", 180807.37), charge("TX-2", "2026-09-06", 250000)];
    // 6 ก.ย. เก็บได้มากสุด = ค่าแอดทั้งวันของ 5 ก.ย. 180,807.37 (เวลาตัดในวันไม่รู้) → 250,000 เกินแน่ๆ 69,192.63
    // ระบบดึงข้อมูลถึง 10 ก.ย. แล้ว (บัญชีอื่นมีแถว) → 6 ก.ย. บัญชีนี้ไม่มีค่าแอด = ตัดเกินจริง ไม่ใช่ "รอค่าแอด"
    state.extraCards = [{ brand_id: "b_jd", account_id: "222000222", campaign: "อื่น", fact_date: "2026-09-10", metrics: { spend: 10, measured_at: "2026-09-10T12:00:00Z" } }];
    show();
    const row = await open();
    await waitFor(() => expect(within(row).getByText("Meta ตัดเกินค่าแอด")).toBeTruthy());
    expect(within(row).getByRole("group", { name: "รายการที่ Meta ตัดบัตร" }).textContent).toContain("ตัดเกินค่าแอด ฿69,192.63");
    expect(screen.getByText(/Meta ตัดเกินค่าแอดที่ระบบเห็น 1 รายการ ฿69,192.63/)).toBeTruthy();
  });
  it("ตัดหลังวันล่าสุดที่ระบบดึงค่าแอด = ป้าย 'รอค่าแอดวันนั้น' ไม่ใช่ตัดเกิน", async () => {
    state.charges = [charge("TX-1", "2026-09-05", 180807.37), charge("TX-2", "2026-09-06", 250000)];
    // 6 ก.ย. เก็บได้มากสุด = ค่าแอดทั้งวันของ 5 ก.ย. 180,807.37 (เวลาตัดในวันไม่รู้) → 250,000 เกินแน่ๆ 69,192.63
    show();
    const row = await open();
    const list = await within(row).findByRole("group", { name: "รายการที่ Meta ตัดบัตร" });
    expect(list.textContent).toContain("รอค่าแอดวันนั้น");
    expect(list.textContent).not.toContain("ตัดเกิน");
  });
});

/* ชุด B ข้อ 16: แถวหน้าบิลเปิดรายละเอียดด้วยคีย์บอร์ดได้เสมอ (เดิมตรวจแล้วปุ่มหาย → เปิดไม่ได้) */
it("ชื่อบัญชีเป็นปุ่มกาง/พับรายละเอียด พร้อม aria-expanded", async () => {
  show();
  const toggle = await screen.findByRole("button", { name: /รายละเอียด TEAMDEE/ });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
});

/* ทดสอบละเอียด 27 ก.ย.: เวลาตัดในวันไม่รู้ → ยังไม่ถูกตัดเป็นช่วง · ยอดเกินฐานเดียวกับยอดตัด · แยก VAT ไม่ออกต้องบอก */
describe("รายการตัดบัตร — แสดงตามความไม่แน่นอนจริง", () => {
  const charge = (id, charge_date, amount, raw = {}) => ({ id, external_account_id: "111000111", charge_date, amount, reference: id, source: "upload", raw });
  const openList = async () => {
    const row = (await screen.findByText("TEAMDEE")).closest("[data-row]");
    fireEvent.click(row.querySelector(".bl-row"));
    return within(row).findByRole("group", { name: "รายการที่ Meta ตัดบัตร" });
  };
  it("ยังไม่ถูกตัดขึ้นเป็นช่วงเมื่อไม่รู้เวลาตัด", async () => {
    // ค่าแอดทั้งหมดอยู่วันที่ 5 ก.ย. (180,807.37) ตัดวันเดียวกัน 100,000 → ค้างอย่างน้อย 80,807.37 · มากสุดทั้งวัน (ไม่รู้ว่ารายการนี้เก็บของวันก่อนไปเท่าไร)
    state.charges = [charge("TX-1", "2026-09-05", 100000)];
    show();
    const list = await openList();
    // ข้อมูลค่าแอดถึง 5 ก.ย. แต่วันนี้เลยมาแล้ว → ค่าแอดหลังจากนั้นยังไม่รู้ = บอกแค่ขั้นต่ำ (ทดสอบละเอียดรอบ 2)
    expect(list.textContent).toMatch(/ใช้แล้วยังไม่ถูกตัด อย่างน้อย ฿80,807\.37/);
  });
  it("ยอดเกินแสดงรวม VAT เมื่อไฟล์บอก VAT (ฐานเดียวกับยอดที่ตัด)", async () => {
    state.charges = [charge("TX-1", "2026-09-05", 193463.88, { vat: 12656.51 }), charge("TX-2", "2026-09-06", 214000, { vat: 14000 })];
    state.extraCards = [{ brand_id: "b_jd", account_id: "222000222", campaign: "อื่น", fact_date: "2026-09-10", metrics: { spend: 10, measured_at: "2026-09-10T12:00:00Z" } }];
    show();
    const list = await openList();
    // สุทธิ 200,000 เทียบเก็บได้มากสุด 180,807.37 → เกินสุทธิ 19,192.63 × (214,000 ÷ 200,000) = 20,536.11
    expect(list.textContent).toContain("ตัดเกินค่าแอด ฿20,536.11");
  });
});

/* ทดสอบละเอียดรอบ 2: แยก VAT ไม่ออก + เกินเฉพาะเมื่อไม่คิด VAT = ป้ายเหลือง ไม่ใช่แดง "ตัดเกิน" */
it("รายการที่เกินเฉพาะเมื่อไม่คิด VAT = ป้ายเหลือง 'เกินถ้าไม่คิด VAT' · ไม่มีแถบเตือนแดง", async () => {
  const charge = (id, charge_date, amount) => ({ id, external_account_id: "111000111", charge_date, amount, reference: id, source: "upload", raw: {} });
  // เพดานสะสมถึง 6 ก.ย. = ค่าแอดทั้งวัน 5 ก.ย. 180,807.37 · ตัด 190,000: ถ้ารวม VAT = สุทธิ 177,570.09 อยู่ในเพดาน · ถ้าไม่รวม = เกิน
  state.charges = [charge("TX-1", "2026-09-05", 100000), charge("TX-2", "2026-09-06", 190000)];
  state.extraCards = [{ brand_id: "b_jd", account_id: "222000222", campaign: "อื่น", fact_date: "2026-09-10", metrics: { spend: 10, measured_at: "2026-09-10T12:00:00Z" } }];
  show();
  const row = (await screen.findByText("TEAMDEE")).closest("[data-row]");
  fireEvent.click(row.querySelector(".bl-row"));
  const list = await within(row).findByRole("group", { name: "รายการที่ Meta ตัดบัตร" });
  expect(list.textContent).toContain("เกินถ้าไม่คิด VAT");
  expect(screen.queryByText(/Meta ตัดเกินค่าแอดที่ระบบเห็น/)).toBeNull();
  expect(within(row).getByText("เช็ก VAT")).toBeTruthy();
});

/* ทดสอบละเอียดรอบ 2 (agent): เดือนที่เริ่มก่อนช่วงข้อมูล 200 วัน — ค่าแอดขึ้น ฿0 / ยอดบางส่วนเหมือนเป็นตัวเลขจริง
   และถ้ามีผลตรวจยอดใบแจ้งยอด ขึ้น "ต้องตรวจ" ผิด (เทียบกับ 0) → ค่าแอดต้องเป็น "—" + บอกเหตุผล */
it("เดือนที่ข้อมูลค่าแอดไม่ครบทั้งเดือน = ระบบนับเป็น — ไม่ใช่ ฿0 · ไม่ขึ้นต้องตรวจ", async () => {
  const back = new Date(); back.setDate(1); back.setMonth(back.getMonth() - 7);   // 7 เดือนก่อน: ต้นเดือนอยู่นอกช่วง 200 วันแน่ๆ
  const m = `${back.getFullYear()}-${String(back.getMonth() + 1).padStart(2, "0")}-01`;
  state.reviews = [{ external_account_id: "111000111", month: m, verdict: "noted", statement_amount: 5000, note: "x", reviewer: "อาร์ต", created_at: "2026-01-01T00:00:00Z" }];
  render(<MemoryRouter><BillingView month={m} /></MemoryRouter>);
  expect(await screen.findByText(/ข้อมูลค่าแอดของเดือนนี้ไม่ครบ/)).toBeTruthy();
  expect(document.querySelector(".bl-stats b").textContent).toBe("—");
  expect(screen.queryByText("ต้องตรวจ")).toBeNull();
});

/* ทดสอบละเอียดรอบ 2 (หน้าจริง): ระบบมีค่าแอดตั้งแต่ 18 มิ.ย. — เม.ย./พ.ค. ขึ้น ฿0.00 · มิ.ย. ขึ้นยอดแค่ 18–30 เหมือนทั้งเดือน */
it("เดือนที่เริ่มก่อนวันแรกที่ระบบมีข้อมูล = — + บอกว่ามีข้อมูลตั้งแต่วันไหน", async () => {
  state.dataFrom = "2026-06-18";
  render(<MemoryRouter><BillingView month="2026-06-01" /></MemoryRouter>);
  expect(await screen.findByText(/ระบบมีข้อมูลค่าแอดตั้งแต่ 18 มิ\.ย\./)).toBeTruthy();
  expect(document.querySelector(".bl-stats b").textContent).toBe("—");
  state.dataFrom = null;
});

/* ทดสอบแบบผู้ใช้จริง (บัญชี): "ระบบนับได้" นับถึงเมื่อวาน แต่ Billing hub รวมวันนี้ — ไม่บอกวันที่ เทียบแล้วนึกว่าไม่ตรง
   และคอลัมน์ผลเทียบขึ้น "ยังไม่กรอก" ข้างปุ่ม "กรอกผลตรวจ" — ไม่รู้ว่าอะไรยังไม่กรอก */
it("เดือนปัจจุบัน: การ์ดระบบนับบอกว่าค่าแอดถึงวันไหน · ผลเทียบบอกว่ารอยอดใบแจ้งยอด", async () => {
  const now = new Date();
  const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  const yIso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  if (yIso.slice(0, 7) !== m.slice(0, 7)) return;   // วันที่ 1 ของเดือน: เมื่อวานอยู่เดือนก่อน ข้ามเคสนี้
  state.extraCards = [{ brand_id: "b_td", account_id: "111000111", campaign: "ทีมดี-โปโล", fact_date: yIso, metrics: { spend: 10, measured_at: `${yIso}T12:00:00Z` } }];
  render(<MemoryRouter><BillingView month={m} /></MemoryRouter>);
  // ป้ายจากสตริงวันที่ ไม่ใช่เวลาเครื่อง — เดิมใช้ y (เวลาท้องถิ่น) + timeZone UTC ช่วง 00:00–07:00 ของไทยได้วันก่อนหน้า (เทสพังตอนดึก)
  const label = new Date(`${yIso}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
  expect(await screen.findByText(new RegExp(`ค่าแอดถึง ${label.replace(/\./g, "\\.")}`))).toBeTruthy();
  expect(screen.getAllByText("รอยอดใบแจ้งยอด").length).toBeGreaterThan(0);
});

/* ทดสอบแบบผู้ใช้จริง (บัญชี): ช่องยอดไม่บอกว่าก่อนหรือหลัง VAT (ระบบเทียบกับค่าแอดก่อน VAT) · ฟอร์มไม่มีปุ่มยกเลิก */
it("ฟอร์มผลตรวจ: ช่องยอดบอกว่าก่อน VAT · มีปุ่มยกเลิกปิดฟอร์มโดยไม่บันทึก", async () => {
  show();
  fireEvent.click(await screen.findByRole("button", { name: "กรอกผลตรวจ · TEAMDEE" }));
  expect(screen.getByRole("textbox", { name: "ยอดก่อน VAT ตามใบแจ้งยอด" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
  expect(screen.queryByRole("textbox", { name: "ยอดก่อน VAT ตามใบแจ้งยอด" })).toBeNull();
  expect(calls.addReview).toHaveLength(0);
});
it("ยังไม่มีไฟล์ตัดบัตร: บอกว่าช่องนำเข้ายังไม่เปิด (ไม่ใช่ให้หาปุ่มนำเข้าที่ไม่มี)", async () => {
  show();
  expect(await screen.findByText(/ช่องนำเข้ายังไม่เปิด/)).toBeTruthy();
});

/* ตรวจรอบ 28 ก.ย.: เดือนก่อนไม่แสดงยอดค้าง (เป็นของวันนี้) · บัญชีนอกระบบที่ไม่มียอดของเดือนนั้นรวมบรรทัดเดียว */
it("เดือนก่อน: การ์ดยอดค้างบอกว่าดูได้เฉพาะเดือนปัจจุบัน · บัญชีนอกระบบไม่รู้ยอดรวมบรรทัดเดียว", async () => {
  state.extraCards = [{ brand_id: "b_td", account_id: "111000111", campaign: "ทีมดี-โปโล", fact_date: "2026-08-05", metrics: { spend: 100, measured_at: "2026-08-05T12:00:00Z" } }];
  state.snapshots = [
    { external_account_id: "111000111", account_name: "Finix1", account_status: 1, balance_cents: 117776, fetched_at: "2026-09-28T05:00:00Z" },
    { external_account_id: "999000999", account_name: "JD2", account_status: 1, balance_cents: 0, fetched_at: "2026-09-28T05:00:00Z" },
  ];
  render(<MemoryRouter><BillingView month="2026-08-01" /></MemoryRouter>);
  expect(await screen.findByText(/ยอดค้างเป็นของวันนี้ — ดูที่เดือนปัจจุบัน/)).toBeTruthy();
  expect(screen.queryByText("฿1,177.76")).toBeNull();
  expect(screen.getByText(/บัญชีนอกระบบที่ไม่มียอดของเดือนนี้ในระบบ 1 บัญชี · JD2/)).toBeTruthy();
  expect(screen.queryByText("ยังไม่ได้เชื่อมเข้าระบบ")).toBeNull();
});
