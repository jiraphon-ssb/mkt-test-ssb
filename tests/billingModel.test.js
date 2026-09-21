/* โมเดลหน้า บิล & กระทบยอด (spec docs/superpowers/specs/2026-09-22-billing-recon.md)
   ตัวเลขเก็บดิบ (UI จัดรูป 2 ตำแหน่งไม่ปัด) · สถานะ exception-based · fixture ใช้เลขบัญชีสมมุติ */
import { describe, expect, it } from "vitest";
import { MATCH_PCT, MINOR_PCT, VAT_RATE, buildBillingModel } from "../src/modules/marketing/ads/billingModel.js";

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
  it("snapshot ที่ไม่ได้เชื่อมและใช้เงินเพิ่ม = offsystem + alert", () => {
    const m = build({ snapshotsBefore: [{ external_account_id: "999000999", amount_spent_cents: 0 }] });
    const off = m.rows.find((r) => r.external_account_id === "999000999");
    expect(off.connected).toBe(false);
    expect(off.status).toBe("offsystem");
    expect(off.spend).toBeNull();
    expect(off.spentDelta).toBe(12400);
    expect(off.flag).toEqual({ text: "เงินออกนอกระบบ", tone: "rose" });
    expect(m.alerts.some((a) => a.key === "offsystem")).toBe(true);
    expect(m.totals.offSystemSpendDelta).toBe(12400);
  });
  it("ไม่มี delta (ไม่มีรอบก่อนเทียบ) = แถว offsystem โผล่แบบเงียบ ไม่ alert มั่ว", () => {
    const m = build();
    const off = m.rows.find((r) => r.external_account_id === "999000999");
    expect(off.status).toBe("offsystem");
    expect(off.spentDelta).toBeNull();
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
