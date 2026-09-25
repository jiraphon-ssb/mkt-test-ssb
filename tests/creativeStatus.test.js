import { describe, expect, it } from "vitest";
import { adStatusOf, campaignDeliveryOf, campaignStatusOf } from "../src/modules/marketing/creatives/creativeStatus.js";

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
