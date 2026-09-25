/* โมเดลหน้า บิล & กระทบยอด (spec docs/superpowers/specs/2026-09-22-billing-recon.md)
   ตัวเลขเก็บดิบ (UI จัดรูป 2 ตำแหน่งไม่ปัด) · สถานะ exception-based · fixture ใช้เลขบัญชีสมมุติ */
import { describe, expect, it } from "vitest";
import { MATCH_PCT, MINOR_PCT, VAT_RATE, buildBillingModel, connectionsFromCards } from "../src/modules/marketing/ads/billingModel.js";

const card = (account, campaign, day, spend) => ({
  brand_id: "b_jd", account_id: account, campaign, fact_date: `2026-09-${day}`,
  metrics: { spend, measured_at: `2026-09-${day}T12:00:00Z` },
});
const base = () => ({
  month: "2026-09-01",
  brands: [{ id: "b_jd", name: "JK Design" }],
  connections: [{ external_account_id: "111000111", brand_id: "b_jd", account_name: "JD1" }],
  cards: [
    card("111000111", "แคมเปญ A", "05", 100000),
    card("111000111", "แคมเปญ A", "06", 30000),
    card("111000111", "แคมเปญ B", "06", 20807.37),
    { ...card("111000111", "แคมเปญ เก่า", "05", 555), fact_date: "2026-08-05" },   // คนละเดือน ต้องไม่ถูกนับ
  ],
  snapshots: [
    { external_account_id: "111000111", account_name: "JD1", account_status: 1, amount_spent_cents: 90000000, balance_cents: 6166583, fetched_at: "2026-09-21T09:00:00Z" },
    { external_account_id: "999000999", account_name: "Finix2", account_status: 1, amount_spent_cents: 1240000, balance_cents: 0, fetched_at: "2026-09-21T09:00:00Z" },
  ],
  reviews: [],
});
const build = (over = {}) => buildBillingModel({ ...base(), ...over });

describe("รวมยอดเดือนต่อบัญชี", () => {
  it("รวมถึงสตางค์ · VAT ประมาณ · แคมเปญเรียงมาก→น้อย · เดือนอื่นไม่ปน", () => {
    const jd = build().rows.find((r) => r.external_account_id === "111000111");
    expect(jd.spend).toBeCloseTo(150807.37, 2);
    expect(jd.brandName).toBe("JK Design");
    expect(jd.vat).toBeCloseTo(jd.spend * VAT_RATE, 6);
    expect(jd.gross).toBeCloseTo(jd.spend * (1 + VAT_RATE), 6);
    expect(jd.campaigns[0]).toEqual({ name: "แคมเปญ A", spend: 130000, share: 130000 / 150807.37 });
    expect(jd.campaigns.find((c) => c.name === "แคมเปญ เก่า")).toBeUndefined();
    expect(jd.balance).toBe(61665.83);
    expect(jd.connected).toBe(true);
  });
});

describe("กระทบยอดกับ statement", () => {
  const review = (amt, at = "2026-10-02T07:00:00Z") => ({ month: "2026-09-01", external_account_id: "111000111",
    verdict: "noted", statement_amount: amt, note: "", reviewer: "อาร์ต", created_at: at });
  const spend = 150807.37;
  it("สามระดับตามเกณฑ์ MATCH/MINOR", () => {
    expect(build({ reviews: [review(spend * (1 + MATCH_PCT * 0.9))] }).rows[0].status).toBe("match");
    expect(build({ reviews: [review(spend * (1 + MINOR_PCT * 0.9))] }).rows[0].status).toBe("minor");
    const r = build({ reviews: [review(spend * 1.2455)] }).rows[0];
    expect(r.status).toBe("review");
    expect(r.flag).toEqual({ text: "ต้องตรวจ", tone: "rose" });
    expect(r.diff).toBeCloseTo(spend * 0.2455, 2);
  });
  it("ไม่กรอก statement = nostatement เงียบ · review ล่าสุด (created_at) ชนะ", () => {
    expect(build().rows[0].status).toBe("nostatement");
    expect(build().rows[0].flag).toBeNull();
    const m = build({ reviews: [review(spend, "2026-10-03T00:00:00Z"), review(spend * 2, "2026-10-01T00:00:00Z")] });
    expect(m.rows[0].status).toBe("match");
    expect(m.rows[0].review.created_at).toBe("2026-10-03T00:00:00Z");
  });
});

describe("บัญชีนอกระบบ + สถานะบัญชี + alerts", () => {
  /* B1 22 ก.ย.: เดิมใช้ส่วนต่าง amount_spent ระหว่าง snapshot สองรอบ ซึ่งไม่มีวันมี (upsert แถวเดียว)
     → ใช้ month_spend ที่ ads-cron ถาม Meta insights มาให้ตรงๆ ยอดเดือนจริง ไม่ใช่ประมาณ */
  const off = (monthSpend) => ({ external_account_id: "999000999", account_name: "Finix2", account_status: 1,
    amount_spent_cents: 1240000, balance_cents: 0, fetched_at: "2026-09-21T09:00:00Z",
    ...(monthSpend === undefined ? {} : { month_spend: { "2026-09": monthSpend } }) });
  it("บัญชีนอกระบบที่ใช้เงินเดือนนี้ = ยอดจริง + ป้ายแดง + alert บอกยอดรวม", () => {
    const m = buildBillingModel({ ...base(), snapshots: [base().snapshots[0], off(1240000)] });
    const row = m.rows.find((r) => r.external_account_id === "999000999");
    expect(row.connected).toBe(false);
    expect(row.status).toBe("offsystem");
    expect(row.spend).toBe(12400);                      // สตางค์ → บาท · เป็นยอดเดือนจริง ไม่ใช่ delta
    expect(row.vat).toBeCloseTo(12400 * VAT_RATE, 6);   // VAT คิดให้ด้วย จะได้รวมเข้ายอดภาษีซื้อได้
    expect(row.flag).toEqual({ text: "เงินออกนอกระบบ", tone: "rose" });
    expect(m.alerts.find((a) => a.key === "offsystem").text).toContain("฿12,400.00");
    expect(m.totals.offSystemSpend).toBe(12400);
  });
  it("บัญชีนอกระบบที่เดือนนี้ไม่ได้ใช้เงิน = เงียบ ไม่มีป้าย ไม่มี alert", () => {
    const m = buildBillingModel({ ...base(), snapshots: [base().snapshots[0], off(0)] });
    const row = m.rows.find((r) => r.external_account_id === "999000999");
    expect(row.spend).toBe(0);
    expect(row.flag).toBeNull();
    expect(m.alerts.some((a) => a.key === "offsystem")).toBe(false);
  });
  it("ยังไม่เคยเก็บยอดเดือนนั้น = ขีด ไม่ใช่ศูนย์ (แยก 'ไม่รู้' ออกจาก 'ไม่ได้ใช้')", () => {
    const m = buildBillingModel({ ...base(), snapshots: [base().snapshots[0], off(undefined)] });
    const row = m.rows.find((r) => r.external_account_id === "999000999");
    expect(row.spend).toBeNull();
    expect(row.flag).toBeNull();
    expect(m.alerts.some((a) => a.key === "offsystem")).toBe(false);
  });
  it("account_status ≠ 1 = ป้ายเหลืองบัญชีมีปัญหา · ปกติหมด = alerts ว่าง", () => {
    const bad = build({ snapshots: [{ ...base().snapshots[0], account_status: 2 }] });
    expect(bad.rows[0].flag).toEqual({ text: "บัญชีมีปัญหา", tone: "amber" });
    expect(bad.alerts.some((a) => a.key === "accountStatus")).toBe(true);
    const clean = build({ snapshots: base().snapshots.slice(0, 1) });
    expect(clean.alerts).toEqual([]);
  });
});

describe("connectionsFromCards", () => {
  it("สกัดรายการบัญชีที่เชื่อมจาก cards (unique) — ชื่อบัญชีเติมจาก snapshot ตอน build", async () => {
    const { connectionsFromCards } = await import("../src/modules/marketing/ads/billingModel.js");
    const list = connectionsFromCards([
      card("111000111", "A", "05", 1), card("111000111", "B", "06", 2),
      { ...card("222000222", "C", "05", 3), brand_id: "b_td" },
      { campaign: "no-account", metrics: { spend: 9 } },
    ]);
    expect(list).toEqual([
      { external_account_id: "111000111", brand_id: "b_jd", account_name: "" },
      { external_account_id: "222000222", brand_id: "b_td", account_name: "" },
    ]);
  });
});

/* บั๊กจากหน้าจริง 22 ก.ย.: cards เก็บ account_id แบบ "act_1234" แต่ Graph snapshot คืนเลขล้วน
   → join พลาดทั้งหน้า (ชื่อบัญชีโชว์ act_… ยอดค้างเป็น — หมด) — ต้อง normalize ทั้งสองฝั่ง */
describe("normalize act_ prefix", () => {
  it("cards act_… จับคู่ snapshot เลขล้วนได้ · ชื่อบัญชีมาจาก snapshot", () => {
    const m = buildBillingModel({ ...base(),
      cards: [{ ...card("act_111000111", "แคมเปญ A", "05", 1000) }],
      connections: connectionsFromCards([{ ...card("act_111000111", "A", "05", 1) }]),
    });
    const jd = m.rows.find((r) => r.external_account_id === "111000111");
    expect(jd).toBeTruthy();
    expect(jd.accountName).toBe("JD1");          // จาก snapshot ไม่ใช่ act_…
    expect(jd.balance).toBe(61665.83);
  });
  it("totals.balance = null เมื่อยังไม่มี snapshot เลย (ห้ามโชว์ ฿0.00 หลอก)", () => {
    const m = buildBillingModel({ ...base(), snapshots: [] });
    expect(m.totals.balance).toBeNull();
  });
});

describe("ค่าแอดยังไม่รู้ (โหลดไม่สำเร็จ/ยังโหลด/ข้อมูลจำลอง)", () => {
  it("spendKnown:false = ยอดระบบนับ · VAT · รวม เป็น null ไม่ใช่ 0", () => {
    const m = buildBillingModel({ month: "2026-09-01", cards: [], spendKnown: false });
    expect(m.totals).toMatchObject({ spend: null, vat: null, gross: null });
  });
});
