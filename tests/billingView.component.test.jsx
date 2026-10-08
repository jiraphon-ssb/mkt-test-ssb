// @vitest-environment jsdom
/* หน้า บิลค่าแอด (spec 2026-09-22 · ทำให้ง่ายลง 29 ก.ย. — อาร์ต: "ใช้งานยาก ไม่ต้องอะไรเยอะ")
   คอลัมน์เดียว: 1) จ่ายไปเท่าไหร่ + ปกติไหม  2) เรื่องที่ต้องดู  3) ใบเสร็จ (ปุ่มกรองบัญชี)  + ส่วนพับของฝ่ายบัญชี
   team_lead เท่านั้น · ตัวเลข 2 ตำแหน่งไม่ปัด · ป้ายเฉพาะที่ผิดปกติ */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/* ล็อกวันที่ — ก.ย. 2569 เป็น "เดือนปัจจุบัน" ของเทสชุดนี้ (ยอดค้างแสดงเฉพาะเดือนปัจจุบัน ตรวจรอบ 28 ก.ย.) */
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

afterEach(() => { cleanup(); Object.assign(state, { role: "team_lead", snapshots: [], reviews: [], charges: [], adsSource: "meta_pilot", adsStatus: "ready", remoteFails: false, extraCards: [], dataFrom: null }); calls.addReview = []; calls.reload = 0; });
const show = (month = "2026-09-01") => render(<MemoryRouter><BillingView month={month} /></MemoryRouter>);
const paid = () => document.querySelector(".bl-paid")?.textContent;
const status = () => document.querySelector(".bl-sum-status")?.textContent;
const issues = () => screen.queryByRole("region", { name: "เรื่องที่ต้องดู" })?.textContent ?? "";
/* ส่วนพับของฝ่ายบัญชี — เปิดก่อนดูตาราง/ผลตรวจ */
const openAcct = async () => { await screen.findByText(/เทียบกับค่าแอด และบันทึกผลตรวจ/); fireEvent.click(document.querySelector(".bl-acct summary")); document.querySelector(".bl-acct").open = true; };
const row = async (name) => [...(await screen.findByRole("table", { name: "กระทบยอดรายบัญชี" })).querySelectorAll("[data-row]")].find((r) => r.querySelector("th").textContent.startsWith(name));
const chip = async (name) => fireEvent.click(within(await screen.findByRole("group", { name: "เลือกบัญชี" })).getByRole("button", { name: new RegExp(`^${name}`) }));
const list = () => screen.findByRole("list", { name: "รายการบิล" });
const items = async () => within(await list()).getAllByRole("listitem");
const bill = (account, date, amount, reference, kind = "charge", raw = {}) => ({ external_account_id: account, charge_date: date, amount, reference,
  source: "meta_api", raw: { kind, event_time: `${date}T03:00:00+0000`, currency: "THB", ...raw } });
const upload = (id, charge_date, amount, raw = {}) => ({ id, external_account_id: "111000111", charge_date, amount, reference: id, source: "upload", raw });

describe("สิทธิ์", () => {
  it("role อื่นเห็นข้อความไม่มีสิทธิ์ ไม่เห็นตัวเลขเงิน", async () => {
    state.role = "staff";
    show();
    expect(await screen.findByText(/เฉพาะหัวหน้าทีม/)).toBeTruthy();
    expect(screen.queryByText(/฿150,807/)).toBeNull();
  });
  it("แท็บ บิล & กระทบยอด เห็นเฉพาะ team_lead", async () => {
    const { AdsSectionTabs } = await import("../src/modules/marketing/ads/AdsSectionTabs.jsx");
    render(<MemoryRouter><AdsSectionTabs /></MemoryRouter>);
    expect(screen.getByText("บิล & กระทบยอด")).toBeTruthy();
    cleanup(); state.role = "staff";
    render(<MemoryRouter><AdsSectionTabs /></MemoryRouter>);
    expect(screen.queryByText("บิล & กระทบยอด")).toBeNull();
  });
});

describe("1) จ่ายไปเท่าไหร่ + ปกติไหม", () => {
  it("ยังไม่มีรายการตัด = — (ไม่ใช่ ฿0) · บอกว่าดึงจาก Meta ทุกเช้า · ไม่พูดถึงการนำเข้าไฟล์ · ไม่มีศัพท์ระบบ", async () => {
    show();
    await screen.findByRole("heading", { level: 1, name: "บิลค่าแอด" });
    await waitFor(() => expect(paid()).toBe("—"));
    expect(screen.getByText(/ยังไม่มีรายการตัดบัตร · ดึงทุกเช้า 07:30/)).toBeTruthy();
    expect(screen.queryByText(/นำเข้า|Payment activity/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/statement|snapshot|ads-cron/i);
  });
  /* 8 ต.ค.: ค่าแอด Google/ChatGPT อยู่ในระบบแล้วแต่หน้านี้ไม่ได้รวม — ต้องเขียนไว้บนจอ
     ไม่งั้นคนอ่านจะนึกว่ายอดนี้ครบทั้งบัตร ซึ่งเป็นต้นเหตุที่เสียเวลาไล่หาบิลที่หาไม่เจอมาแล้ว */
  it("บอกบนจอว่านับเฉพาะ Meta และ Google/ChatGPT ไม่รวมอยู่ด้วย", async () => {
    show();
    await screen.findByRole("heading", { level: 1, name: "บิลค่าแอด" });
    const scope = document.querySelector(".bl-scope");
    expect(scope).toBeTruthy();
    expect(scope.textContent).toMatch(/นับเฉพาะ\s*Meta/);
    expect(scope.textContent).toContain("Google Ads");
    expect(scope.textContent).toContain("ChatGPT Ads");
  });
  it("มีรายการตัด: ยอดที่ Meta ตัด + จำนวนใบเสร็จ + VAT ภ.พ.36 จากยอดที่จ่าย · ไม่มีเรื่อง = ทุกอย่างปกติ", async () => {
    state.charges = [bill("111000111", "2026-09-05", 150807.37, "T1")];
    show();
    await waitFor(() => expect(paid()).toBe("฿150,807.37"));
    const sum = document.querySelector(".bl-sum").textContent;
    expect(sum).toContain("1 ใบเสร็จ");
    expect(sum).toContain("฿10,556.51");        // 150,807.37 × 7% — ไม่ใช่ 7% ของค่าแอด 180,807.37
    expect(status()).toBe("ทุกอย่างปกติ");
    expect(screen.queryByRole("region", { name: "เรื่องที่ต้องดู" })).toBeNull();
  });
});

describe("2) เรื่องที่ต้องดู", () => {
  it("ยอดค้างใน Meta ไม่อยู่ในช่วงที่ระบบคำนวณ = ประโยคบอกตัวเลขทั้งสองฝั่ง · ปุ่มดูใบเสร็จของบัญชีนั้น", async () => {
    // ค่าแอดทั้งหมด 5 ก.ย. 180,807.37 ตัดวันเดียวกัน 100,000 → ควรค้างอย่างน้อย 80,807.37 แต่ Meta ค้าง 520
    state.snapshots = [{ external_account_id: "111000111", account_name: "Finix1", account_status: 1, balance_cents: 52000 }];
    state.charges = [upload("TX-1", "2026-09-05", 100000)];
    show();
    await waitFor(() => expect(issues()).toContain("TEAMDEE: ยอดค้างใน Meta ฿520.00 ไม่อยู่ในช่วงที่ระบบคำนวณ (อย่างน้อย ฿80,807.37)"));
    expect(status()).toBe("มี 1 เรื่องต้องดู");
    fireEvent.click(within(screen.getByRole("region", { name: "เรื่องที่ต้องดู" })).getByRole("button", { name: "ดูใบเสร็จ" }));
    expect(within(screen.getByRole("group", { name: "เลือกบัญชี" })).getByRole("button", { name: /^TEAMDEE/ }).getAttribute("aria-pressed")).toBe("true");
  });
  it("ตัดเกินค่าแอดที่ระบบเห็น = เรื่องต้องดู + ป้ายยอดเกินในแถวใบเสร็จ + สถานะในตาราง", async () => {
    state.charges = [upload("TX-1", "2026-09-05", 180807.37), upload("TX-2", "2026-09-06", 250000)];
    // 6 ก.ย. เก็บได้มากสุด = ค่าแอดทั้งวันของ 5 ก.ย. 180,807.37 → 250,000 เกินแน่ 69,192.63 (ระบบดึงถึง 10 ก.ย. แล้ว = ตัดเกินจริง)
    state.extraCards = [{ brand_id: "b_jd", account_id: "222000222", campaign: "อื่น", fact_date: "2026-09-10", metrics: { spend: 10 } }];
    show();
    await waitFor(() => expect(issues()).toMatch(/Meta ตัดเกินค่าแอดที่ระบบเห็น 1 รายการ ฿69,192.63/));
    expect((await list()).textContent).toContain("ตัดเกินค่าแอด ฿69,192.63");
    await openAcct();
    expect((await row("TEAMDEE")).querySelector("[data-col=status]").textContent).toBe("ตรวจใบเสร็จใน Billing hub");
  });
  it("ตัดหลังวันล่าสุดที่ระบบดึงค่าแอด = 'รอค่าแอดวันนั้น' ไม่ใช่ตัดเกิน", async () => {
    state.charges = [upload("TX-1", "2026-09-05", 180807.37), upload("TX-2", "2026-09-06", 250000)];
    show();
    const l = await list();
    await waitFor(() => expect(l.textContent).toContain("รอค่าแอดวันนั้น"));
    expect(l.textContent).not.toContain("ตัดเกิน");
  });
  it("ยอดเกินแสดงรวม VAT เมื่อไฟล์บอก VAT (ฐานเดียวกับยอดที่ตัด)", async () => {
    state.charges = [upload("TX-1", "2026-09-05", 193463.88, { vat: 12656.51 }), upload("TX-2", "2026-09-06", 214000, { vat: 14000 })];
    state.extraCards = [{ brand_id: "b_jd", account_id: "222000222", campaign: "อื่น", fact_date: "2026-09-10", metrics: { spend: 10 } }];
    show();
    // สุทธิ 200,000 เทียบเก็บได้มากสุด 180,807.37 → เกินสุทธิ 19,192.63 × (214,000 ÷ 200,000) = 20,536.11
    await waitFor(async () => expect((await list()).textContent).toContain("ตัดเกินค่าแอด ฿20,536.11"));
  });
  it("เกินเฉพาะเมื่อไม่คิด VAT = เรื่องต้องดูสีเหลือง 'เช็กใบกำกับ' · ไม่มีแถบตัดเกินแดง", async () => {
    state.charges = [upload("TX-1", "2026-09-05", 100000), upload("TX-2", "2026-09-06", 190000)];
    state.extraCards = [{ brand_id: "b_jd", account_id: "222000222", campaign: "อื่น", fact_date: "2026-09-10", metrics: { spend: 10 } }];
    show();
    await waitFor(() => expect(issues()).toContain("มีบิลที่เกินค่าแอดถ้ายอดตัดไม่รวม VAT"));
    expect((await list()).textContent).toContain("เกินถ้าไม่คิด VAT");
    expect(issues()).not.toMatch(/Meta ตัดเกินค่าแอดที่ระบบเห็น/);
  });
});

describe("3) ใบเสร็จ", () => {
  const setup = () => {
    state.snapshots = [{ external_account_id: "999000999", account_name: "Finix2", account_status: 1, balance_cents: 0, month_spend: { "2026-09": 300050 } }];
    state.charges = [
      bill("111000111", "2026-09-03", 7000, "t-1"), bill("111000111", "2026-09-10", 1541.92, "t-2"),
      bill("999000999", "2026-09-05", 3000.5, "t-3"), bill("111000111", "2026-09-12", 7000, "failed:2026-09-12T03:00:00+0000", "failed"),
      bill("111000111", "2026-08-30", 9999, "t-old"),
    ];
  };
  it("ทุกบัญชีของเดือนที่ดู ใหม่สุดก่อน · ป้ายเฉพาะที่ผิดปกติ · รวมเฉพาะที่ตัดสำเร็จ · ตัดไม่ผ่านขึ้นในเรื่องต้องดู", async () => {
    setup(); show();
    const rows = await items();
    expect(rows).toHaveLength(4);                                   // ส.ค. ไม่อยู่
    expect(within(rows[0]).getByText("ไม่ผ่าน")).toBeTruthy();
    expect(within(rows[2]).getByText("Finix2")).toBeTruthy();        // นอกระบบก็อยู่ในรายการ
    expect(within(rows[2]).getByText("นอกระบบ")).toBeTruthy();
    expect(rows[1].querySelector(".aw-flag")).toBeNull();            // ตัดสำเร็จปกติ = เงียบ
    expect(document.querySelector(".bl-total").textContent).toContain("฿11,542.42");   // 7,000 + 1,541.92 + 3,000.50
    expect(issues()).toContain("ตัดบัตรไม่ผ่าน 1 ครั้ง ฿7,000.00");
  });
  it("ปุ่มกรองบัญชี = ใบเสร็จเฉพาะบัญชีนั้น · ลิงก์ Billing hub เป็นของบัญชีนั้น (แท็บใหม่)", async () => {
    setup(); show();
    await list();
    await chip("Finix2");
    expect(await items()).toHaveLength(1);
    const link = screen.getByRole("link", { name: "Billing hub" });
    expect(link.getAttribute("href")).toBe("https://business.facebook.com/billing_hub/payment_activity?asset_id=999000999");
    expect(link.getAttribute("target")).toBe("_blank");
  });
  it("ดาวน์โหลด CSV ชื่อไฟล์ตามเดือน เนื้อหาตามที่กรอง", async () => {
    setup(); show();
    await list();
    let blob = null; let name = null;
    const create = vi.spyOn(URL, "createObjectURL").mockImplementation((b) => { blob = b; return "blob:x"; });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { name = this.download; });
    fireEvent.click(screen.getByRole("button", { name: /ดาวน์โหลด CSV/ }));
    expect(name).toBe("meta-bills-2026-09.csv");
    const text = await new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.readAsText(blob); });
    expect(text.split("\n")).toHaveLength(5);
    expect(text).toContain("2026-09-05,Finix2,999000999,,t-3,3000.50,THB,สำเร็จ,");
    create.mockRestore(); revoke.mockRestore(); click.mockRestore();
  });
  it("เดือนที่ไม่มีรายการ = บอกบรรทัดเดียว ปุ่ม CSV กดไม่ได้", async () => {
    show();
    expect(await screen.findAllByText(/เดือนนี้ยังไม่มีรายการตัดบัตร —/)).toHaveLength(1);
    expect(screen.getByRole("button", { name: /ดาวน์โหลด CSV/ }).disabled).toBe(true);
  });
  it("เกิน 15 ใบ = แสดง 15 ใบแรก + ปุ่มดูทั้งหมด", async () => {
    state.charges = Array.from({ length: 18 }, (_, i) => bill("111000111", `2026-09-${String(i + 1).padStart(2, "0")}`, 100, `r-${i}`));
    show();
    expect(await items()).toHaveLength(15);
    fireEvent.click(screen.getByRole("button", { name: "ดูทั้งหมด 18 รายการ" }));
    expect(await items()).toHaveLength(18);
  });
  it("ระหว่างค่าแอดยังไม่พร้อม: ไม่ติดป้าย 'นอกระบบ' (ยังไม่รู้ว่าบัญชีไหนเชื่อม)", async () => {
    state.adsStatus = "loading";
    state.charges = [bill("111000111", "2026-09-05", 7000, "t-1")];
    show();
    expect((await list()).textContent).not.toContain("นอกระบบ");
  });
});

describe("หน้าต่างรายละเอียดบิล", () => {
  it("กดบิล = บอกว่าจ่ายค่าแอดวันไหน แคมเปญอะไร · ผลรวมแคมเปญ = ยอดบิล · Esc ปิด", async () => {
    state.charges = [bill("111000111", "2026-09-05", 100000, "t-1")];
    show();
    fireEvent.click(await screen.findByRole("button", { name: /ดูรายละเอียดบิล 5 ก\.ย\. TEAMDEE ฿100,000\.00/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("บิลนี้จ่ายค่าแอด 1 วัน");
    expect(within(dialog).getByText("ทีมดี-โปโล")).toBeTruthy();
    expect(within(dialog).getByText("Message-ทัก")).toBeTruthy();
    const amounts = [...dialog.querySelectorAll(".bs-camp-head .num:not(small)")].map((el) => Number(el.textContent.replace(/[฿,]/g, "")));
    expect(Math.round(amounts.reduce((n, v) => n + v, 0) * 100)).toBe(10000000);
    expect(dialog.textContent).toContain("ตัดบัตรกลางวัน");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("ตัดไม่ผ่าน = ไม่มีเงินออก ไม่แตกแคมเปญ · บัญชีนอกระบบ = บอกตรงๆ ว่าแตกไม่ได้", async () => {
    state.snapshots = [{ external_account_id: "999000999", account_name: "Finix2", account_status: 1, balance_cents: 0 }];
    state.charges = [bill("111000111", "2026-09-07", 7000, "failed:2026-09-07T03:00:00+0000", "failed"), bill("999000999", "2026-09-06", 363.22, "f-1")];
    show();
    fireEvent.click(await screen.findByRole("button", { name: /ดูรายละเอียดบิล 7 ก\.ย\. TEAMDEE/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("ไม่มีเงินออก");
    expect(dialog.textContent).not.toContain("แยกตามแคมเปญ");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /ดูรายละเอียดบิล 6 ก\.ย\. Finix2/ }));
    expect((await screen.findByRole("dialog")).textContent).toContain("ยังไม่ได้เชื่อมเข้าระบบ");
  });
});

describe("บัญชีนอกระบบ", () => {
  it("ใช้เงินเดือนนี้ (month_spend) = เรื่องต้องดู + แถวในตารางพร้อมยอดค้าง + สถานะเชื่อมบัญชี", async () => {
    state.snapshots = [{ external_account_id: "999000999", account_name: "Finix2", account_status: 1,
      amount_spent_cents: 1240000, balance_cents: 52000, month_spend: { "2026-09": 1240000 }, fetched_at: "2026-09-21T09:00:00Z" }];
    show();
    await waitFor(() => expect(issues()).toMatch(/เงินออกนอกระบบ ฿12,400.00/));
    await openAcct();
    const r = await row("Finix2");
    expect(r.textContent).toContain("ยังไม่ได้เชื่อมเข้าระบบ");
    expect(r.textContent).toContain("฿12,400.00");
    expect(r.textContent).toContain("฿520.00");                     // balance 52000 สตางค์
    expect(r.querySelector("[data-col=status]").textContent).toBe("เชื่อมบัญชีเข้าระบบ");
  });
  it("เดือนนี้ใช้ ฿0 = ไม่ขึ้นเป็นแถว รวมเป็นบรรทัดเดียว", async () => {
    state.snapshots = [{ external_account_id: "999000999", account_name: "Finix2", account_status: 1,
      balance_cents: 0, month_spend: { "2026-09": 0 }, fetched_at: "2026-09-21T09:00:00Z" }];
    show();
    await openAcct();
    expect(await screen.findByText(/บัญชีนอกระบบที่เดือนนี้ไม่ได้ใช้เงิน 1 บัญชี/)).toBeTruthy();
    expect([...document.querySelectorAll("[data-row]")].some((r) => r.textContent.includes("Finix2"))).toBe(false);
  });
  it("ถูกตัดบัตร = เรื่องต้องดูบอกยอดที่ถูกตัด · ปุ่มกรองบอกว่านอกระบบ", async () => {
    state.snapshots = [{ external_account_id: "999000999", account_name: "Finix2", account_status: 1, balance_cents: 0 }];
    state.charges = [bill("999000999", "2026-09-06", 363.22, "f-1")];
    show();
    await waitFor(() => expect(issues()).toMatch(/บัญชีนอกระบบถูกตัดบัตร ฿363.22 — Finix2/));
    expect(within(screen.getByRole("group", { name: "เลือกบัญชี" })).getByRole("button", { name: /Finix2 \(นอกระบบ\)/ })).toBeTruthy();
  });
  it("เดือนก่อน: ไม่มีคอลัมน์/ตัวเลขยอดค้าง (เป็นของวันนี้) · บัญชีนอกระบบไม่รู้ยอดรวมบรรทัดเดียว", async () => {
    state.extraCards = [{ brand_id: "b_td", account_id: "111000111", campaign: "ทีมดี-โปโล", fact_date: "2026-08-05", metrics: { spend: 100, measured_at: "2026-08-05T12:00:00Z" } }];
    state.snapshots = [
      { external_account_id: "111000111", account_name: "Finix1", account_status: 1, balance_cents: 117776, fetched_at: "2026-09-28T05:00:00Z" },
      { external_account_id: "999000999", account_name: "JD2", account_status: 1, balance_cents: 0, fetched_at: "2026-09-28T05:00:00Z" },
    ];
    show("2026-08-01");
    await openAcct();
    expect(await screen.findByText(/บัญชีนอกระบบที่เดือนนี้ไม่มียอดและไม่ถูกตัดบัตร 1 บัญชี · JD2/)).toBeTruthy();
    expect(screen.queryByText("ยอดค้างใน Meta")).toBeNull();
    expect(screen.queryByText("฿1,177.76")).toBeNull();
  });
});

describe("ส่วนพับของฝ่ายบัญชี", () => {
  it("ตาราง: ค่าแอดสองตำแหน่งไม่ปัด · ไม่มีเรื่อง = ตามรอบตัดบัตร · ตัดเลขบัญชีเหลือ 4 ตัว ไม่มี act_", async () => {
    show();
    await openAcct();
    const r = await row("TEAMDEE");
    expect(r.textContent).toContain("฿180,807.37");
    expect(r.querySelector("[data-col=status]").textContent).toBe("ตามรอบตัดบัตร");
    expect(r.textContent).toContain("…0111");
    expect(r.textContent).not.toContain("act_");
  });
  it("สมการ: ค่าแอด − ยังไม่ถึงรอบตัด + นอกระบบ = ยอดตัดบัตร (ลงตัวกับยอดจ่าย)", async () => {
    state.snapshots = [{ external_account_id: "999000999", account_name: "Finix2", account_status: 1, balance_cents: 0 }];
    state.charges = [bill("111000111", "2026-09-05", 100000, "t-1"), bill("999000999", "2026-09-06", 363.22, "f-1")];
    show();
    await openAcct();
    const why = await screen.findByRole("region", { name: "ทำไมยอดตัดบัตรไม่เท่ากับค่าแอด" });
    expect(why.textContent).toContain("฿180,807.37");
    expect(why.textContent).toContain("−฿80,807.37");
    expect(why.textContent).toContain("+฿363.22");
    expect(why.textContent).toContain("฿100,363.22");
    expect(paid()).toBe("฿100,363.22");
  });
  it("ผลตรวจ: ยังไม่เลือกบัญชี = บอกให้เลือกก่อน · เลือกแล้ว มีขั้นยืนยันก่อน (แก้ไม่ได้) → ส่ง payload ครบ → บอกว่าบันทึกแล้ว", async () => {
    show();
    await openAcct();
    expect(screen.getByText(/เลือกบัญชีจากปุ่มในส่วนใบเสร็จก่อน/)).toBeTruthy();
    await chip("TEAMDEE");     // เดือนที่ยังไม่มีบิลก็เลือกบัญชีได้
    fireEvent.change(screen.getByRole("textbox", { name: "ยอดก่อน VAT ตามใบแจ้งยอด" }), { target: { value: "180,900" } });
    fireEvent.change(screen.getByRole("textbox", { name: "หมายเหตุ" }), { target: { value: "เทียบใบแจ้งยอดแล้ว" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกผลตรวจ" }));
    expect(calls.addReview).toHaveLength(0);
    const confirm = screen.getByRole("group", { name: "ยืนยันบันทึกผลตรวจ" });
    expect(confirm.textContent).toContain("฿180,900.00");
    expect(confirm.textContent).toContain("แก้ไม่ได้");
    fireEvent.click(within(confirm).getByRole("button", { name: "ยืนยันบันทึก" }));
    await waitFor(() => expect(calls.addReview).toHaveLength(1));
    // reviewer ไม่ถูกส่งจาก client — RPC ผูกจาก auth.uid() · 180,900 ห่างค่าแอดไม่ถึง 0.5% = match
    expect(calls.addReview[0]).toEqual({ month: "2026-09-01", external_account_id: "111000111",
      verdict: "match", statement_amount: 180900, note: "เทียบใบแจ้งยอดแล้ว" });
    expect((await screen.findByRole("status", { name: "ผลการบันทึก" })).textContent).toContain("บันทึกผลตรวจ TEAMDEE แล้ว");
  });
  it("ผลตรวจ: 'กลับไปแก้' ไม่ส่งอะไร · ฟอร์มเปล่ากดไม่ได้ · ล้างที่กรอกได้ · หมายเหตุอย่างเดียวบันทึกได้ (noted)", async () => {
    show();
    await openAcct();
    await chip("TEAMDEE");
    expect(screen.getByRole("button", { name: "บันทึกผลตรวจ" }).disabled).toBe(true);
    expect(screen.getByText(/กรอกยอดใบแจ้งยอดหรือหมายเหตุ/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "หมายเหตุ" }), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกผลตรวจ" }));
    fireEvent.click(screen.getByRole("button", { name: "กลับไปแก้" }));
    expect(screen.getByRole("textbox", { name: "หมายเหตุ" }).value).toBe("x");
    fireEvent.click(screen.getByRole("button", { name: "ล้างที่กรอก" }));
    expect(screen.getByRole("textbox", { name: "หมายเหตุ" }).value).toBe("");
    fireEvent.change(screen.getByRole("textbox", { name: "หมายเหตุ" }), { target: { value: "เทียบใบแจ้งยอดแล้วตรง" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกผลตรวจ" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันบันทึก" }));
    await waitFor(() => expect(calls.addReview).toHaveLength(1));
    expect(calls.addReview[0].verdict).toBe("noted");
  });
  it("ตรวจแล้ว = สถานะ 'ตรวจแล้ว' ในตาราง + ชื่อคนตรวจเมื่อเลือกบัญชี", async () => {
    state.reviews = [{ external_account_id: "111000111", month: "2026-09-01", verdict: "match", statement_amount: 180807.37, note: "", reviewer: "อาร์ต", created_at: "2026-09-28T01:00:00Z" }];
    show();
    await openAcct();
    expect((await row("TEAMDEE")).querySelector("[data-col=status]").textContent).toBe("ตรวจแล้ว");
    await chip("TEAMDEE");
    expect(screen.getByText(/ล่าสุด: ตรง · อาร์ต/)).toBeTruthy();
  });
});

describe("ขอบเขตเดือน + โหลดไม่สำเร็จต้องไม่โชว์ศูนย์", () => {
  it("เดือนปัจจุบัน: ปุ่มเดือนถัดไปกดไม่ได้ · บอกว่าค่าแอดนับถึงวันไหน", async () => {
    state.extraCards = [{ brand_id: "b_td", account_id: "111000111", campaign: "ทีมดี-โปโล", fact_date: "2026-09-27", metrics: { spend: 10 } }];
    show();
    await openAcct();
    expect(screen.getByRole("button", { name: "เดือนถัดไป" }).disabled).toBe(true);
    expect(screen.getByText(/ค่าแอดเดือนนี้นับถึง 27 ก\.ย\./)).toBeTruthy();
  });
  it("ย้อนเกินหน้าต่างข้อมูล = บอกเหตุผล · ไม่มี ฿0.00 · ไม่ขึ้นต้องตรวจ", async () => {
    state.reviews = [{ external_account_id: "111000111", month: "2024-01-01", verdict: "noted", statement_amount: 5000, note: "x", reviewer: "อาร์ต", created_at: "2026-01-01T00:00:00Z" }];
    show("2024-01-01");
    expect(await screen.findByText(/เกินช่วงข้อมูลที่ระบบเก็บไว้/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("฿0.00");
    expect(screen.queryByText("ต้องตรวจ")).toBeNull();
  });
  it("เดือนที่เริ่มก่อนวันแรกที่ระบบมีข้อมูล = บอกว่ามีข้อมูลตั้งแต่วันไหน", async () => {
    state.dataFrom = "2026-06-18";
    show("2026-06-01");
    expect(await screen.findByText(/ระบบมีข้อมูลค่าแอดตั้งแต่ 18 มิ\.ย\./)).toBeTruthy();
  });
  it("ค่าแอดโหลดไม่สำเร็จ = ไม่มี ฿0.00 + แจ้งเตือนชัด + ปุ่มลองใหม่", async () => {
    state.adsStatus = "error";
    show();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/โหลดค่าแอดไม่สำเร็จ/);
    expect(document.body.textContent).not.toContain("฿0.00");
    fireEvent.click(within(alert).getByRole("button", { name: "ลองใหม่" }));
    expect(calls.reload).toBe(1);
  });
  it("กำลังโหลด / ข้อมูลจำลอง = ไม่โชว์ ฿0.00 · จำลองบอกตรงๆ", async () => {
    state.adsStatus = "loading";
    show();
    await screen.findByText(/กำลังโหลดค่าแอด/);
    expect(document.body.textContent).not.toContain("฿0.00");
    cleanup(); state.adsStatus = "ready"; state.adsSource = "mock";
    show();
    expect(await screen.findByText(/ข้อมูลจำลอง/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("฿0.00");
  });
  it("ฝั่งฐานโหลดไม่สำเร็จ = แจ้งเตือน + ลองใหม่ · ไม่อ้างว่าตัวเลขถูกต้องเมื่อค่าแอดก็ไม่รู้", async () => {
    state.remoteFails = true;
    show();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/ยอดค้างและผลตรวจโหลดไม่สำเร็จ/);
    expect(alert.textContent).toContain("ยังถูกต้อง");
    cleanup(); state.adsSource = "mock";
    show();
    expect((await screen.findByRole("alert")).textContent).not.toContain("ยังถูกต้อง");
  });
});
