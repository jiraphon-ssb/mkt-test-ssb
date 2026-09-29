/* รายการบิล (29 ก.ย.) — 1 แถว = การตัดบัตร 1 ครั้งของ Meta (ใบเสร็จ 1 ใบ) · ทุกบัญชีรวมนอกระบบ · ฝ่ายบัญชีดาวน์โหลด CSV
   fixture เลขสมมุติ (repo public) */
import { describe, expect, it } from "vitest";
import { BILL_KIND_TEXT, billListCsv, billingHubUrl, buildBillList } from "../src/modules/marketing/ads/billList.js";

const charge = (account, date, amount, reference, kind = "charge", time = `${date}T03:00:00+0000`) => ({
  external_account_id: account, charge_date: date, amount, reference, source: "meta_api",
  raw: { kind, event_time: time, currency: "THB" },
});
const charges = [
  charge("900000001", "2026-08-30", 7000, "t-aug"),                              // เดือนก่อน — ไม่อยู่ในรายการ
  charge("900000001", "2026-09-03", 7000, "t-1"),
  charge("900000001", "2026-09-10", 1541.92, "t-2"),
  charge("900000002", "2026-09-05", 3000.5, "t-3"),                               // บัญชีนอกระบบ
  charge("900000001", "2026-09-12", 7000, "failed:2026-09-12T01:00:00+0000", "failed"),
  charge("900000002", "2026-09-15", 120.5, "t-4", "refund"),
  { external_account_id: "act_900000003", charge_date: "2026-09-08", amount: 500, reference: "old-1", source: "upload", raw: {} },  // แถวเก่าไม่มีชนิด = ตัดสำเร็จ
];
const rows = [
  { external_account_id: "900000001", accountName: "TD Main", brandName: "TEAMDEE", connected: true,
    charge: { charges: [
      { date: "2026-09-03", amount: 7000, reference: "t-1", coverFrom: "2026-09-01", coverTo: "2026-09-03", status: "ok", net: 7000, uncovered: 0, alloc: [{ day: "2026-09-01", amount: 7000 }] },
      { date: "2026-09-10", amount: 1541.92, reference: "t-2", coverFrom: "2026-09-04", coverTo: "2026-09-04", status: "over" },
    ] } },
  { external_account_id: "900000002", accountName: "Finix2", brandName: "", connected: false },
];
const snapshots = [{ external_account_id: "900000003", account_name: "Old Acc" }];

describe("buildBillList", () => {
  const list = buildBillList({ month: "2026-09-01", charges, rows, snapshots });

  it("เฉพาะเดือนที่ดู ทุกชนิด ทุกบัญชี · ใหม่สุดก่อน", () => {
    expect(list.items.map((i) => i.reference)).toEqual(["t-4", "failed:2026-09-12T01:00:00+0000", "t-2", "old-1", "t-3", "t-1"]);
  });
  it("ชื่อบัญชี/แบรนด์จากแถวกระทบยอด · บัญชีที่ไม่มีแถวใช้ชื่อจาก snapshot · ตัด act_", () => {
    const byRef = Object.fromEntries(list.items.map((i) => [i.reference, i]));
    expect(byRef["t-1"]).toMatchObject({ accountId: "900000001", accountName: "TD Main", brandName: "TEAMDEE", connected: true });
    expect(byRef["t-3"]).toMatchObject({ accountName: "Finix2", connected: false });
    expect(byRef["old-1"]).toMatchObject({ accountId: "900000003", accountName: "Old Acc", kind: "charge" });
  });
  it("ช่วงค่าแอดที่ครอบคลุมมาจากผลแมทของบัญชี · ไม่มีผลแมท (นอกระบบ/ไม่สำเร็จ) = null", () => {
    const byRef = Object.fromEntries(list.items.map((i) => [i.reference, i]));
    expect(byRef["t-1"]).toMatchObject({ coverFrom: "2026-09-01", coverTo: "2026-09-03", coverStatus: "ok" });
    expect(byRef["t-2"].coverStatus).toBe("over");
    expect(byRef["t-3"].coverFrom).toBeNull();
    // ส่งต่อให้หน้าต่างรายละเอียดบิล: ค่าแอดรายวันที่จ่าย + ยอดก่อน VAT + ส่วนที่ไม่มีค่าแอดรองรับ
    expect(byRef["t-1"]).toMatchObject({ net: 7000, uncovered: 0, alloc: [{ day: "2026-09-01", amount: 7000 }] });
    expect(byRef["t-3"]).toMatchObject({ net: null, alloc: [] });
    expect(byRef["t-4"].coverFrom).toBeNull();
  });
  it("ไม่มีเลขรายการจริง (อ้างอิงจากชนิด+เวลา) = เลขรายการว่าง", () => {
    expect(list.items.find((i) => i.kind === "failed").transactionId).toBeNull();
    expect(list.items.find((i) => i.reference === "t-1").transactionId).toBe("t-1");
  });
  it("ยอดรวม: ตัดสำเร็จ (จำนวน+เงิน) แยกจากไม่ผ่านและคืนเงิน · คิดเป็นสตางค์ · บอกส่วนของบัญชีนอกระบบ (การ์ด Meta ตัดจริงนับเฉพาะที่เชื่อม — ยอดสองที่ต่างกันต้องอธิบายได้)", () => {
    expect(list.totals).toEqual({ count: 6, chargedCount: 4, charged: 12042.42, offSystemCharged: 3500.5, failedCount: 1, failed: 7000, refundCount: 1, refund: 120.5, vat36: 842.96 });
  });
  it("ตัวเลือกบัญชีสำหรับกรอง เรียงตามยอดตัดสำเร็จ · กรองแล้วยอดรวมตามที่กรอง", () => {
    expect(list.accounts.map((a) => a.id)).toEqual(["900000001", "900000002", "900000003"]);
    const one = buildBillList({ month: "2026-09-01", charges, rows, snapshots, account: "900000002" });
    expect(one.items.map((i) => i.reference)).toEqual(["t-4", "t-3"]);
    expect(one.totals).toMatchObject({ chargedCount: 1, charged: 3000.5, offSystemCharged: 3000.5, refund: 120.5 });
    expect(one.accounts).toHaveLength(3);   // ตัวเลือกยังครบ ไม่หายตามตัวกรอง
  });
  it("ไม่มีรายการ = ว่าง ยอดรวมเป็น 0 ครบทุกช่อง", () => {
    expect(buildBillList({ month: "2026-10-01", charges, rows }).totals).toEqual({ count: 0, chargedCount: 0, charged: 0, offSystemCharged: 0, failedCount: 0, failed: 0, refundCount: 0, refund: 0, vat36: 0 });
  });
  it("VAT ภ.พ.36 = 7% ของยอดที่ตัดสำเร็จ ตัดสตางค์ไม่ปัด · บัญชีที่ Meta เก็บ VAT แล้วไม่นับ", () => {
    // 12,042.42 × 7% = 842.9694 → 842.96 (ไม่รวมที่ไม่ผ่าน/คืนเงิน)
    expect(list.totals.vat36).toBe(842.96);
    const included = buildBillList({ month: "2026-09-01", charges, snapshots,
      rows: rows.map((r) => (r.external_account_id === "900000001" ? { ...r, chargeMatch: { vatMode: "included" } } : r)) });
    expect(included.totals.vat36).toBe(245.03);   // เหลือ 3,000.50 + 500 = 3,500.50 × 7% = 245.035 → 245.03
  });
  it("ข้อความสถานะเป็นคำไทย ไม่พึ่งสีอย่างเดียว", () => {
    expect(BILL_KIND_TEXT).toMatchObject({ charge: "สำเร็จ", failed: "ไม่ผ่าน", declined: "ถูกปฏิเสธ", refund: "คืนเงิน" });
  });
});

describe("billListCsv", () => {
  const list = buildBillList({ month: "2026-09-01", charges, rows, snapshots });
  const csv = billListCsv(list.items);
  const lines = csv.replace(/^﻿/, "").split("\n");

  it("มี BOM ให้ Excel อ่านไทยถูก · หัวคอลัมน์ไทยครบ", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe("วันที่,บัญชี,เลขบัญชี,แบรนด์,เลขรายการ,ยอด (บาท),สกุลเงิน,สถานะ,ครอบคลุมค่าแอด");
  });
  it("เรียงวันที่เก่า→ใหม่แบบสมุดบัญชี · ยอดทศนิยม 2 ตำแหน่งไม่ปัด ไม่มีคอมมา · เลขบัญชีเต็ม", () => {
    expect(lines[1]).toBe("2026-09-03,TD Main,900000001,TEAMDEE,t-1,7000.00,THB,สำเร็จ,2026-09-01 ถึง 2026-09-03");
    expect(lines.find((l) => l.includes("t-2"))).toContain(",1541.92,");
    expect(lines.find((l) => l.startsWith("2026-09-12"))).toBe("2026-09-12,TD Main,900000001,TEAMDEE,,7000.00,THB,ไม่ผ่าน,");
    expect(lines).toHaveLength(7);
  });
  it("ยอดที่มีเศษ float ตัดไม่ปัด · ค่าที่มีคอมมา/เครื่องหมายคำพูดถูก escape", () => {
    const [item] = buildBillList({ month: "2026-09-01", charges: [charge("1", "2026-09-01", 10.999, "x")],
      rows: [{ external_account_id: "1", accountName: 'A, "B"', brandName: "", connected: true }] }).items;
    expect(billListCsv([item]).split("\n")[1]).toBe('2026-09-01,"A, ""B""",1,,x,10.99,THB,สำเร็จ,');
  });
});

it("billingHubUrl: ลิงก์ Billing hub ของบัญชีนั้น (ใบเสร็จรายใบรออาร์ตส่งตัวอย่างลิงก์)", () => {
  expect(billingHubUrl("act_900000001")).toBe("https://business.facebook.com/billing_hub/payment_activity?asset_id=900000001");
});

/* security-review 29 ก.ย. (ต่ำ): ชื่อบัญชี Meta ขึ้นต้น = + - @ → Excel ตีเป็นสูตร (CSV formula injection) — ใส่ ' นำหน้า */
it("billListCsv: ข้อความที่ขึ้นต้นด้วย = + - @ ถูกกันไม่ให้ Excel ตีเป็นสูตร · ยอดเงินไม่ถูกแตะ", () => {
  const [item] = buildBillList({ month: "2026-09-01", charges: [{ external_account_id: "1", charge_date: "2026-09-01", amount: 10, reference: "@x", raw: { kind: "charge" } }],
    rows: [{ external_account_id: "1", accountName: '=HYPERLINK("http://evil")', brandName: "+cmd", connected: true }] }).items;
  const line = billListCsv([item]).split("\n")[1];
  expect(line).toBe(`2026-09-01,"'=HYPERLINK(""http://evil"")",1,'+cmd,'@x,10.00,THB,สำเร็จ,`);
});
