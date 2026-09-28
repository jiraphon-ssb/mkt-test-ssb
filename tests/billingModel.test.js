/* โมเดลหน้า บิล & กระทบยอด (spec docs/superpowers/specs/2026-09-22-billing-recon.md)
   ตัวเลขเก็บดิบ (UI จัดรูป 2 ตำแหน่งไม่ปัด) · สถานะ exception-based · fixture ใช้เลขบัญชีสมมุติ */
import { describe, expect, it } from "vitest";
import { MATCH_PCT, MINOR_PCT, VAT_RATE, buildBillingModel, connectionsFromCards, reviewVerdict } from "../src/modules/marketing/ads/billingModel.js";

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
    // VAT ตัดสตางค์ไม่ปัด (150,807.37 × 7% = 10,556.5159 → 10,556.51) · รวม = ค่าแอด + VAT ที่แสดง
    expect(jd.vat).toBe(10556.51);
    expect(jd.gross).toBe(161363.88);
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
  it("บัญชีนอกระบบที่เดือนนี้ไม่ได้ใช้เงินและไม่มียอดค้าง = ไม่ขึ้นเป็นแถว รวมไว้บรรทัดเดียว · ไม่มี alert (ชุด D ข้อ 18)", () => {
    const m = buildBillingModel({ ...base(), snapshots: [base().snapshots[0], off(0)] });
    expect(m.rows.some((r) => r.external_account_id === "999000999")).toBe(false);
    expect(m.offSystemIdle).toEqual([{ external_account_id: "999000999", accountName: "Finix2" }]);
    expect(m.alerts.some((a) => a.key === "offsystem")).toBe(false);
  });
  it("บัญชีนอกระบบยอด ฿0 แต่ยังมียอดค้าง = ยังขึ้นเป็นแถว (มีเงินต้องจ่าย)", () => {
    const m = buildBillingModel({ ...base(), snapshots: [base().snapshots[0], { ...off(0), balance_cents: 50000 }] });
    expect(m.rows.find((r) => r.external_account_id === "999000999").balance).toBe(500);
    expect(m.offSystemIdle).toEqual([]);
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

/* ทดสอบแบบใช้งานจริง 27 ก.ย.: VAT รวมด้านบน ฿32,339.91 แต่บวกแถวในตารางได้ ฿32,339.90
   → VAT ต่อแถวตัดสตางค์ก่อน แล้วยอดรวมบวกจากตัวที่แสดง (บวกในหัวแล้วตรงกับตาราง) */
describe("VAT รวม = ผลบวกของแถวที่แสดง", () => {
  it("สองบัญชี VAT 0.7063 → แถวละ ฿0.70 · รวม ฿1.40 (ไม่ใช่ 1.41 จากการตัดทีหลัง)", () => {
    const m = build({
      connections: [{ external_account_id: "111000111", brand_id: "b_jd", account_name: "JD1" }, { external_account_id: "222000222", brand_id: "b_jd", account_name: "JD2" }],
      cards: [card("111000111", "A", "05", 10.09), card("222000222", "B", "05", 10.09)],
    });
    expect(m.rows.filter((r) => r.connected).map((r) => r.vat)).toEqual([0.7, 0.7]);
    expect(m.totals.vat).toBe(1.4);
    expect(m.totals.gross).toBe(21.58);
  });
});

describe("ค่าแอดยังไม่รู้ (โหลดไม่สำเร็จ/ยังโหลด/ข้อมูลจำลอง)", () => {
  it("spendKnown:false = ยอดระบบนับ · VAT · รวม เป็น null ไม่ใช่ 0", () => {
    const m = buildBillingModel({ month: "2026-09-01", cards: [], spendKnown: false });
    expect(m.totals).toMatchObject({ spend: null, vat: null, gross: null });
  });
});

/* 26 ก.ย. (สเปก charge-match): แมทรายการตัดบัตร Meta ↔ ค่าแอดที่ระบบนับ — อ่านจาก ad_billing_charges */
describe("แมทรายการตัดบัตร", () => {
  const charge = (charge_date, amount, reference) => ({ id: reference, external_account_id: "111000111", charge_date, amount, reference, source: "upload", raw: {} });
  const jd = (m) => m.rows.find((r) => r.external_account_id === "111000111");

  it("ยังไม่นำเข้ารายการตัด = charge null · ไม่มีแถบเตือนเรื่องตัดบัตร", () => {
    const m = build({ charges: [], today: "2026-09-21" });
    expect(jd(m).charge).toBeNull();
    expect(m.totals.charged).toBeNull();
    expect(m.alerts.find((a) => a.key === "chargeOver")).toBeUndefined();
  });
  it("Meta ตัดเกินค่าแอดที่ระบบเห็น = ป้าย + แถบเตือนบอกจำนวนและยอด", () => {
    // 5 ก.ย. ตัด 100,555 (รายการแรก) · 6 ก.ย. ตัด 170,000 — เก็บได้มากสุด ค่าแอด 6 ก.ย. 50,807.37 + ทั้งวันของ 5 ก.ย. 100,000
    // (เวลาตัดในวันไม่รู้ · ทดสอบละเอียด 27 ก.ย.) → เกินแน่ๆ 19,192.63
    const m = build({ charges: [charge("2026-09-05", 100555, "T1"), charge("2026-09-06", 170000, "T2")], today: "2026-09-21" });
    expect(jd(m).charge).toMatchObject({ charged: 270555, count: 2, overCount: 1, status: "review" });
    expect(jd(m).charge.overAmount).toBeCloseTo(19192.63, 2);
    expect(jd(m).flag).toEqual({ text: "Meta ตัดเกินค่าแอด", tone: "rose" });
    expect(m.totals.charged).toBe(270555);
    const alert = m.alerts.find((a) => a.key === "chargeOver");
    expect(alert.text).toBe("Meta ตัดเกินค่าแอดที่ระบบเห็น 1 รายการ ฿19,192.63 — ระบบดึงค่าแอดบางวันขาด หรือมีการใช้เงินที่ระบบไม่เห็น");
  });
  it("เดือนปัจจุบัน: ค่าแอดที่ยังไม่ถูกตัดไม่ตรงกับยอดค้างใน Meta = ยอดค้างไม่ตรง · ตรง = ไม่มีป้าย", () => {
    const one = [charge("2026-09-05", 100555, "T1")];                                    // ที่เหลือ 6 ก.ย. 50,807.37 ยังไม่ถูกตัด
    const withBalance = (cents) => base().snapshots.map((s) => (s.external_account_id === "111000111" ? { ...s, balance_cents: cents } : s));
    // ยังไม่ถูกตัดอยู่ในช่วง 50,807.37 – 150,807.37 (เศษของ 5 ก.ย. ไม่รู้) · ยอดค้าง 20,000 ต่ำกว่าช่วง = ไม่ตรง
    const gap = build({ charges: one, today: "2026-09-21", snapshots: withBalance(2000000) });
    expect(jd(gap).charge.status).toBe("review");
    expect(jd(gap).flag).toEqual({ text: "ยอดค้างไม่ตรง", tone: "amber" });
    const snapshots = base().snapshots.map((s) => (s.external_account_id === "111000111" ? { ...s, balance_cents: 5080737 } : s));
    const ok = build({ charges: one, today: "2026-09-21", snapshots });
    expect(jd(ok).charge.status).toBe("match");
    expect(jd(ok).flag).toBeNull();
    expect(jd(ok).chargeMatch.unbilled).toBeCloseTo(50807.37, 2);
  });
});

it("แถบเตือนตัดเกินใช้ตัวเลขตัดทศนิยม ไม่ปัด (12,345.678 → ฿12,345.67 ไม่ใช่ ฿12,345.68)", () => {
  const charge = (charge_date, amount, reference) => ({ id: reference, external_account_id: "111000111", charge_date, amount, reference, source: "upload", raw: {} });
  // ตัด 6 ก.ย. เกินที่เก็บได้ (150,807.37) ไป 12,345.678 → ข้อความต้องเป็น ฿12,345.67
  const m = buildBillingModel({ ...base(), charges: [charge("2026-09-05", 100555, "T1"), charge("2026-09-06", 163153.048, "T2")], today: "2026-09-21" });
  expect(m.alerts.find((a) => a.key === "chargeOver").text).toContain("฿12,345.67");
});

/* ชุด A ข้อ 8: ค่าแอด 0 แต่ statement มีเงิน — เดิมขึ้น "ตรงกัน" เพราะ null <= 0.005 เป็นจริงใน JS */
describe("statement เทียบค่าแอด 0", () => {
  const review = (statement_amount) => [{ external_account_id: "111000111", month: "2026-09-01", verdict: "note", statement_amount, note: "x", reviewer: "อาร์ต", created_at: "2026-09-21T10:00:00Z" }];
  const noSpend = () => ({ cards: [] });
  it("ค่าแอด 0 · statement ฿180,900 = ต้องตรวจ (เงินออกโดยไม่มีค่าแอดรองรับ)", () => {
    const row = build({ ...noSpend(), reviews: review(180900) }).rows.find((r) => r.external_account_id === "111000111");
    expect(row.status).toBe("review");
  });
  it("ค่าแอด 0 · statement ฿0 = ตรงกัน", () => {
    const row = build({ ...noSpend(), reviews: review(0) }).rows.find((r) => r.external_account_id === "111000111");
    expect(row.status).toBe("match");
  });
});

/* ชุด D ข้อ 18 */
describe("ผลตรวจล่าสุดต่อบัญชี (act_ prefix)", () => {
  it("review เก็บเลขบัญชีแบบ act_… ก็ยังเลือกอันล่าสุดถูก", () => {
    const r = (amount, at) => ({ month: "2026-09-01", external_account_id: "act_111000111", verdict: "noted", statement_amount: amount, note: "", reviewer: "อาร์ต", created_at: at });
    const m = build({ reviews: [r(1, "2026-10-01T00:00:00Z"), r(2, "2026-10-03T00:00:00Z"), r(3, "2026-10-02T00:00:00Z")] });
    expect(m.rows[0].review.created_at).toBe("2026-10-03T00:00:00Z");
    expect(m.rows[0].statement).toBe(2);
  });
});

describe("reviewVerdict — ผลตรวจที่บันทึก", () => {
  it("กรอกยอดใบแจ้งยอดใกล้ค่าแอด (≤ 0.5%) = match · ห่างกว่านั้น = noted", () => {
    expect(reviewVerdict(180900, 180807.37)).toBe("match");
    expect(reviewVerdict(190000, 180807.37)).toBe("noted");
  });
  it("ไม่กรอกยอด (หมายเหตุอย่างเดียว) หรือค่าแอดไม่รู้ = noted", () => {
    expect(reviewVerdict(null, 180807.37)).toBe("noted");
    expect(reviewVerdict(1000, null)).toBe("noted");
  });
  it("ค่าแอด 0: ยอด 0 = match · มีเงิน = noted", () => {
    expect(reviewVerdict(0, 0)).toBe("match");
    expect(reviewVerdict(500, 0)).toBe("noted");
  });
});

/* ชุด D (เจอบนหน้าจริง 26 ก.ย.): ระหว่างค่าแอดยังโหลด รายชื่อบัญชีที่เชื่อม (สกัดจาก cards) ว่าง
   → ทุกบัญชีใน snapshot กลายเป็น "นอกระบบ" + แถบแดง "เงินออกนอกระบบ ฿447k" ทั้งที่เชื่อมอยู่ */
describe("ค่าแอดยังไม่รู้ = ไม่ตัดสินว่าบัญชีไหนนอกระบบ", () => {
  it("spendKnown:false → ไม่มีแถวนอกระบบ ไม่มีแถบเตือนเงินออกนอกระบบ", () => {
    const off = { external_account_id: "999000999", account_name: "Finix2", account_status: 1, balance_cents: 0, month_spend: { "2026-09": 1240000 } };
    const m = buildBillingModel({ ...base(), cards: [], connections: [], spendKnown: false, snapshots: [base().snapshots[0], off] });
    expect(m.rows.filter((r) => !r.connected)).toEqual([]);
    expect(m.offSystemIdle).toEqual([]);
    expect(m.alerts.some((a) => a.key === "offsystem")).toBe(false);
  });
});

/* ทดสอบละเอียดรอบ 2 (agent): ต่างพอดี 0.50% ขึ้น "ต่างเล็กน้อย" ทั้งที่ป้ายบอก ≤ 0.50% = ตรงกัน (เศษ float) */
it("ต่างพอดี 0.50% = ตรงกัน (ไม่โดนเศษ float)", () => {
  expect(reviewVerdict(10.05, 10)).toBe("match");
  const m = buildBillingModel({ ...base(), cards: [card("111000111", "A", "05", 1014)], reviews: [{ external_account_id: "111000111", month: "2026-09-01", verdict: "noted", statement_amount: 1019.07, note: "", reviewer: "x", created_at: "2026-09-21T00:00:00Z" }] });
  expect(m.rows.find((r) => r.external_account_id === "111000111").status).toBe("match");
});

/* ตรวจรอบ 28 ก.ย.: ดูบิล ส.ค. แล้วขึ้น "ยอดค้างที่ Meta ยังไม่ตัด ฿40,639.08" = ยอดค้าง ณ วันนี้ ไม่ใช่ของ ส.ค.
   และบัญชีนอกระบบที่ไม่มียอดของ ส.ค. ขึ้นเป็นแถว "— / ฿0.00 / กรอกผลตรวจ" 4 แถวที่ไม่มีอะไรให้ทำ */
describe("เดือนที่ผ่านมาแล้ว", () => {
  const off = (id, name, monthSpend, balance = 0) => ({ external_account_id: id, account_name: name, account_status: 1, balance_cents: balance,
    fetched_at: "2026-09-21T09:00:00Z", ...(monthSpend === undefined ? {} : { month_spend: { "2026-08": monthSpend } }) });
  const past = (over = {}) => buildBillingModel({ ...base(), month: "2026-08-01", today: "2026-09-28",
    cards: [{ ...base().cards[0], fact_date: "2026-08-05", metrics: { spend: 1000, measured_at: "2026-08-05T12:00:00Z" } }], ...over });
  it("ยอดค้างเป็นของวันนี้ = ไม่แสดงในเดือนก่อน (แถว + รวม) · บอกว่าเป็นเดือนที่ผ่านมา", () => {
    const m = past();
    expect(m.rows.find((r) => r.external_account_id === "111000111").balance).toBeNull();
    expect(m.totals.balance).toBeNull();
    expect(m.pastMonth).toBe(true);
    expect(buildBillingModel({ ...base(), today: "2026-09-28" }).pastMonth).toBe(false);
  });
  it("บัญชีนอกระบบที่ไม่มียอดของเดือนนั้น = รวมบรรทัดเดียว (ไม่รู้ยอด) ไม่ขึ้นเป็นแถว · ยอดค้างวันนี้ไม่ทำให้ขึ้นแถว", () => {
    const m = past({ snapshots: [base().snapshots[0], off("1", "Finix2"), off("2", "JD2", undefined, 50000), off("3", "SAIFAH", 0)] });
    expect(m.rows.filter((r) => !r.connected)).toEqual([]);
    expect(m.offSystemUnknown.map((a) => a.accountName)).toEqual(["Finix2", "JD2"]);
    expect(m.offSystemIdle.map((a) => a.accountName)).toEqual(["SAIFAH"]);
  });
  it("บัญชีนอกระบบที่รู้ว่าเดือนนั้นใช้เงิน = ยังเป็นแถวแดงเหมือนเดิม", () => {
    const m = past({ snapshots: [base().snapshots[0], off("1", "Finix2", 1240000)] });
    expect(m.rows.find((r) => r.external_account_id === "1")).toMatchObject({ spend: 12400, balance: null, flag: { text: "เงินออกนอกระบบ", tone: "rose" } });
  });
});
