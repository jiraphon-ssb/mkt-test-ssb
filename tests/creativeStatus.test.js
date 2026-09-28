import { describe, expect, it } from "vitest";
import { actionLabel, adStatusOf, campaignDeliveryOf, campaignStatusIndex, campaignStatusOf } from "../src/modules/marketing/creatives/creativeStatus.js";

/* 25 ก.ย.: อาร์ตขอให้ตารางครีเอทีฟบอกว่าโฆษณา/แคมเปญเปิดหรือปิด
   ป้าย "Stop" เดิมคือคำแนะนำของระบบ ไม่ใช่สถานะจริง — สถานะต้องมาจาก effective_status ของ Meta เท่านั้น */
describe("adStatusOf — effective_status ของ Meta → ป้ายภาษาคน", () => {
  it("เปิด / ปิดเอง / ปิดเพราะแคมเปญหรือชุดโฆษณาปิด", () => {
    expect(adStatusOf("ACTIVE")).toMatchObject({ key: "active", label: "เปิด", tone: "emerald", on: true });
    expect(adStatusOf("PAUSED")).toMatchObject({ key: "paused", label: "ปิด", tone: "zinc", on: false });
    expect(adStatusOf("CAMPAIGN_PAUSED")).toMatchObject({ key: "campaign_paused", label: "ปิด · แคมเปญหยุด", on: false });
    expect(adStatusOf("ADSET_PAUSED")).toMatchObject({ key: "adset_paused", label: "ปิด · ชุดโฆษณาหยุด", on: false });
  });
  it("รอตรวจ = เหลือง · ถูกปฏิเสธ/มีปัญหา/ค้างชำระ = แดง · เก็บถาวร = ปิด", () => {
    for (const s of ["IN_PROCESS", "PENDING_REVIEW", "PREAPPROVED"]) expect(adStatusOf(s)).toMatchObject({ key: "review", tone: "amber", on: false });
    for (const s of ["DISAPPROVED", "WITH_ISSUES", "PENDING_BILLING_INFO"]) expect(adStatusOf(s)).toMatchObject({ key: "issue", tone: "rose", on: false });
    expect(adStatusOf("ARCHIVED")).toMatchObject({ key: "archived", label: "เก็บแล้ว", on: false });
  });
  it("ไม่มีข้อมูล / ค่าแปลก = ไม่ทราบ (ห้ามเดาว่าเปิด)", () => {
    expect(adStatusOf(null)).toMatchObject({ key: "unknown", label: "ไม่ทราบสถานะ", on: null });
    expect(adStatusOf("SOMETHING_NEW")).toMatchObject({ key: "unknown", on: null });
  });
});

describe("campaignStatusOf — สรุปสถานะแคมเปญจากโฆษณาในแคมเปญ", () => {
  const ad = (status) => ({ asset: { status } });
  it("มีโฆษณาเปิดอย่างน้อยหนึ่งตัว = แคมเปญเปิดอยู่", () => {
    expect(campaignStatusOf([ad("PAUSED"), ad("ACTIVE")])).toMatchObject({ key: "active", label: "เปิดอยู่", on: true });
  });
  it("Meta บอกว่าแคมเปญหยุด = ปิด", () => {
    expect(campaignStatusOf([ad("CAMPAIGN_PAUSED"), ad("CAMPAIGN_PAUSED")])).toMatchObject({ key: "paused", label: "ปิดอยู่", on: false });
  });
  it("รู้สถานะครบแต่ไม่มีตัวไหนเปิด = ไม่มีโฆษณาเปิด (แคมเปญอาจยังเปิดแต่ไม่ส่งโฆษณา)", () => {
    expect(campaignStatusOf([ad("PAUSED"), ad("ARCHIVED")])).toMatchObject({ key: "idle", label: "ไม่มีโฆษณาเปิด", on: false });
  });
  it("ยังไม่มีสถานะเลย / ไม่มีครีเอทีฟ = ไม่ทราบ", () => {
    expect(campaignStatusOf([ad(null), { asset: null }])).toMatchObject({ key: "unknown", on: null });
    expect(campaignStatusOf([])).toMatchObject({ key: "unknown", on: null });
  });
  it("รู้บางตัว ไม่มีตัวไหนเปิด = ยังสรุปไม่ได้ (ตัวที่ไม่รู้อาจเปิดอยู่)", () => {
    expect(campaignStatusOf([ad("PAUSED"), ad(null)])).toMatchObject({ key: "unknown", on: null });
  });
});

describe("campaignDeliveryOf — สถานะที่ขึ้นในรายการแคมเปญ", () => {
  const ad = (status) => ({ asset: { status } });
  it("รู้จากโฆษณาข้างใน = ใช้ค่านั้นก่อน (สดกว่าข้อมูลแคมเปญที่ติดมากับยอด)", () => {
    expect(campaignDeliveryOf({ status: "active", creatives: [ad("CAMPAIGN_PAUSED")] })).toMatchObject({ key: "paused", label: "ปิดอยู่" });
  });
  it("โฆษณาไม่บอก = ใช้สถานะแคมเปญเดิม · ไม่รู้ทั้งคู่ = ไม่ทราบ", () => {
    expect(campaignDeliveryOf({ status: "active", creatives: [] })).toMatchObject({ key: "active", label: "เปิดอยู่" });
    expect(campaignDeliveryOf({ status: "paused", creatives: [ad(null)] })).toMatchObject({ key: "paused", label: "ปิดอยู่" });
    expect(campaignDeliveryOf({ status: "unknown", creatives: [] })).toMatchObject({ key: "unknown", label: "ไม่ทราบสถานะ" });
  });
});

/* 26 ก.ย. อาร์ตยืนยัน: ท้ายชื่อแคมเปญ "เปิด" / "CLS" คือสถานะที่ทีมตั้งเอง — ใช้เมื่อ Meta ยังไม่บอก และบอกว่าอ่านจากชื่อ */
describe("campaignDeliveryOf — สถานะจากท้ายชื่อแคมเปญ", () => {
  const ad = (status) => ({ asset: { status } });
  it("ท้ายชื่อ เปิด / CLS / ปิด → สถานะพร้อมป้าย (ตามชื่อ)", () => {
    expect(campaignDeliveryOf({ name: "JD1 | RE | IB | PIC | 29/8 | เปิด", creatives: [] })).toMatchObject({ key: "active", label: "เปิดอยู่ (ตามชื่อ)", fromName: true });
    expect(campaignDeliveryOf({ name: "JD1 | NEW | IB | PICปัง | 29/8 | CLS", creatives: [] })).toMatchObject({ key: "paused", label: "ปิดอยู่ (ตามชื่อ)", fromName: true });
    expect(campaignDeliveryOf({ name: "X | cls ", creatives: [] })).toMatchObject({ key: "paused" });
    expect(campaignDeliveryOf({ name: "X | ปิด", creatives: [] })).toMatchObject({ key: "paused" });
  });
  it("Meta บอกแล้ว = ใช้ของ Meta ก่อนชื่อเสมอ · ชื่อไม่มีท้ายสถานะ = ไม่ทราบ", () => {
    expect(campaignDeliveryOf({ name: "A | CLS", creatives: [ad("ACTIVE")] })).toMatchObject({ key: "active", label: "เปิดอยู่" });
    expect(campaignDeliveryOf({ name: "A | CLS", status: "active", creatives: [] })).toMatchObject({ key: "active" });
    expect(campaignDeliveryOf({ name: "Always-on — คนเคยทัก", creatives: [] }).key).toBe("unknown");
    expect(campaignDeliveryOf({ name: "เปิดตัวสินค้าใหม่", creatives: [] }).key).toBe("unknown");   // ต้องเป็นช่องท้ายหลัง | เท่านั้น
  });
});

describe("campaignStatusIndex — สถานะแคมเปญจากทุกชิ้นในแคมเปญเดียวกัน", () => {
  const row = (per) => ({ perCampaign: per });
  it("รวมข้ามชิ้น: มีชิ้นไหนเปิดในแคมเปญนั้น = เปิดอยู่ · แคมเปญหยุด = ปิดอยู่ · ไม่รู้ = ไม่ทราบ", () => {
    const index = campaignStatusIndex([
      row([{ campaign: "C1", status: "PAUSED" }, { campaign: "C2", status: "CAMPAIGN_PAUSED" }]),
      row([{ campaign: "C1", status: "ACTIVE" }, { campaign: "C3", status: null }]),
    ]);
    expect(index.get("C1")).toMatchObject({ key: "active", label: "เปิดอยู่" });
    expect(index.get("C2")).toMatchObject({ key: "paused", label: "ปิดอยู่" });
    expect(index.get("C3")).toMatchObject({ key: "unknown" });
  });
});

describe("actionLabel — ต้นทุนดี (26 ก.ย.)", () => {
  it("คำแนะนำ Good = ต้นทุนดี", () => {
    expect(actionLabel({ action: "Good" })).toBe("ต้นทุนดี");
  });
});

/* ทดสอบแบบผู้ใช้จริง (27 ก.ย.): สถานะดึงตอน 05:20 — โฆษณา 855 ชิ้นไม่มีตัวไหน ACTIVE (CAMPAIGN_PAUSED 529) แต่เมื่อวานยังใช้เงิน ฿14,168.89
   ทุกแถวขึ้น "ปิดอยู่" ทั้งที่ชื่อลงท้าย "เปิด" และรันมา 26 วัน → คนอ่านงง ต้องบอกว่าสถานะเป็นของเวลาไหน */
import { statusSnapshotNote } from "../src/modules/marketing/creatives/creativeStatus.js";
describe("statusSnapshotNote — สถานะที่ดึงตอนเช้าขัดกับค่าแอดเมื่อวาน", () => {
  const asset = (status, statusAt = "2026-09-27T05:20:00+07:00") => ({ asset: { status, statusAt } });
  const cards = [{ fact_date: "2026-09-26", metrics: { spend: 14168.89 } }, { fact_date: "2026-09-27", metrics: { spend: 0 } }];
  it("ทุกชิ้นปิดตอนดึง แต่เมื่อวานยังใช้เงิน = คืนเวลาที่ดึง + ค่าแอดเมื่อวาน", () => {
    const note = statusSnapshotNote([asset("CAMPAIGN_PAUSED"), asset("PAUSED", "2026-09-27T05:10:00+07:00")], cards, "2026-09-27");
    expect(note).toEqual({ at: "2026-09-27T05:20:00+07:00", spend: 14168.89 });
  });
  it("มีชิ้นที่เปิดอยู่ หรือเมื่อวานไม่ได้ใช้เงิน = ไม่ต้องเตือน", () => {
    expect(statusSnapshotNote([asset("ACTIVE"), asset("CAMPAIGN_PAUSED")], cards, "2026-09-27")).toBeNull();
    expect(statusSnapshotNote([asset("CAMPAIGN_PAUSED")], [{ fact_date: "2026-09-26", metrics: { spend: 0 } }], "2026-09-27")).toBeNull();
    expect(statusSnapshotNote([{ asset: null }], cards, "2026-09-27")).toBeNull();   // ไม่รู้สถานะ = ไม่เตือน
  });
});
