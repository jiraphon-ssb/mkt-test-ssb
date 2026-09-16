/* ตัวสำรวจข้อมูลจริงของระบบพี่ทัช (โหมด inventory ของ sales-sync) — อ่านอย่างเดียว คืนแค่ "มีอะไร ครบแค่ไหน"
   ไม่คืนตัวเลขเงิน ไม่คืนข้อความ ไม่ขอคอลัมน์ที่ระบุตัวคน/ผู้ขาย */
import { describe, it, expect } from "vitest";
import {
  inventoryUrls, pagedUrl, monthsBackStart,
  summarizeGoalInventory, summarizeTargetInventory, summarizeSpendInventory,
  summarizeBudgetInventory, summarizePctTargets, summarizeApMarketing, rpcShape,
} from "../supabase/functions/_shared/salesInventory.js";

const SALES = "https://abcdefghijklmnopqrst.supabase.co";

describe("monthsBackStart", () => {
  it("วันที่ 1 ของเดือนย้อนหลัง n เดือน · ข้ามปีได้ · วันที่เสีย = null", () => {
    expect(monthsBackStart("2026-09-17", 3)).toBe("2026-06-01");
    expect(monthsBackStart("2026-02-05", 3)).toBe("2025-11-01");
    expect(monthsBackStart("xx", 3)).toBe(null);
  });
});

describe("inventoryUrls — ขอแค่คอลัมน์ที่ไม่ระบุตัวคน", () => {
  const urls = inventoryUrls(SALES, { since: "2026-06-01", today: "2026-09-17" });
  const select = (u) => new URL(u).searchParams.get("select").split(",");
  it("เป้า: ไม่ดึงผู้สร้าง/เหตุผล/inputs/base", () => {
    expect(select(urls.goals)).toEqual(["brand", "month", "version", "targets", "ads"]);
    expect(new URL(urls.goals).searchParams.get("month")).toBe("gte.2026-06-01");
  });
  it("ค่าแอด CSV: ไม่ดึงชื่อบัญชีและคนนำเข้า", () => {
    expect(select(urls.spend)).toEqual(["day", "brand", "platform"]);
    expect(select(urls.spend)).not.toContain("account");
  });
  it("ค่าการตลาดตามบัญชี (AP): ไม่ดึงผู้ขาย รายละเอียด หรือยอดเงิน", () => {
    const cols = select(urls.apMarketing);
    expect(cols).toEqual(["doc_date", "brand_tags", "status"]);
    for (const col of ["vendor_id", "req_amount", "description", "requester_id", "note"]) expect(cols).not.toContain(col);
    expect(new URL(urls.apMarketing).searchParams.get("category_key")).toBe("eq.mkt");
  });
  it("งบประมาณ: เฉพาะหมวดรายได้กับการตลาด ไม่ดึงยอดเงิน", () => {
    expect(select(urls.budgetLines)).toEqual(["version_id", "category_key", "brand", "month"]);
    expect(new URL(urls.budgetLines).searchParams.get("category_key")).toBe("in.(revenue,mkt)");
    expect(select(urls.budgetVersions)).toEqual(["id", "status", "version_no"]);
  });
  it("RPC ของแดชบอร์ด: pipeline / insight · P&L อ่านแค่ว่ามีเดือนไหน", () => {
    expect(new URL(urls.pipeline).pathname).toBe("/rest/v1/rpc/sale_dashboard_pipeline");
    expect(new URL(urls.insight).pathname).toBe("/rest/v1/rpc/sale_dashboard_insight");
    expect(select(urls.plRevenue)).toEqual(["entity", "ym"]);
  });
  it("since รูปแบบผิด = throw (กันฉีดค่าเข้า filter)", () => {
    expect(() => inventoryUrls(SALES, { since: "2026-06-01&x=1", today: "2026-09-17" })).toThrow();
  });
});

describe("pagedUrl — แบ่งหน้าด้วยลำดับที่ไม่ซ้ำ", () => {
  it("ใส่ order=id · limit · offset", () => {
    const u = new URL(pagedUrl(`${SALES}/rest/v1/mkt_spend?select=day`, 2000));
    expect(u.searchParams.get("order")).toBe("id");
    expect(u.searchParams.get("limit")).toBe("1000");
    expect(u.searchParams.get("offset")).toBe("2000");
  });
});

describe("summarizeGoalInventory — เป้าแบบใหม่: เดือนไหน แบรนด์ไหน มีช่องอะไรบ้าง (ไม่คืนตัวเลข)", () => {
  const out = summarizeGoalInventory([
    { brand: "TD", month: "2026-09-01", version: 1, targets: { sales_total: 1, ad_budget: 0, cpl: null }, ads: { platforms: [{ key: "meta" }] } },
    { brand: "TD", month: "2026-09-01", version: 2, targets: { sales_total: 1, ad_budget: 5000, roas: 3.2, caps: { cpl: 400 } }, ads: { platforms: [{ key: "meta" }, { key: "google" }], other_cost: 2000 } },
  ]);
  it("ใช้เวอร์ชันล่าสุด · รายชื่อช่องที่มีค่า · งบแอดตั้งแล้วไหม · กี่แพลตฟอร์ม", () => {
    expect(out).toEqual({ TD: { "2026-09-01": { version: 2, versions: 2, filled: ["ad_budget", "caps", "roas", "sales_total"], adBudgetSet: true, platforms: 2, otherCost: true } } });
  });
  it("ไม่มีตัวเลขเงินหลุดออกมา", () => {
    expect(JSON.stringify(out)).not.toMatch(/5000|3\.2|400/);
  });
});

describe("summarizeTargetInventory — เป้าแบบเก่า", () => {
  it("นับตัวชี้วัดต่อเดือน×แบรนด์", () => {
    expect(summarizeTargetInventory([
      { month: "2026-09-01", brand: "TD", metric: "sales_new" }, { month: "2026-09-01", brand: "TD", metric: "orders" },
      { month: "2026-08-01", brand: "JD", metric: "inquiry" },
    ])).toEqual({ "2026-08-01": { JD: 1 }, "2026-09-01": { TD: 2 } });
  });
});

describe("summarizeSpendInventory — ค่าแอดจาก CSV", () => {
  it("ต่อแบรนด์×แพลตฟอร์ม: จำนวนวัน วันแรก วันล่าสุด", () => {
    expect(summarizeSpendInventory([
      { day: "2026-09-02", brand: "TD", platform: "meta" }, { day: "2026-09-01", brand: "TD", platform: "meta" },
      { day: "2026-09-01", brand: "TD", platform: "meta" }, { day: "2026-08-15", brand: "TA", platform: "google" },
    ])).toEqual({ TA: { google: { days: 1, first: "2026-08-15", last: "2026-08-15" } }, TD: { meta: { days: 2, first: "2026-09-01", last: "2026-09-02" } } });
  });
});

describe("summarizeBudgetInventory — งบประมาณ", () => {
  it("ต่อเดือน×หมวด: แบรนด์ที่มีงบอนุมัติแล้ว / มีแต่ร่าง · ระดับบริษัท (brand null) แยกไว้", () => {
    const versions = [{ id: "v1", status: "approved", version_no: 1 }, { id: "v2", status: "draft", version_no: 2 }];
    const lines = [
      { version_id: "v1", category_key: "mkt", brand: "TD", month: "2026-09-01" },
      { version_id: "v2", category_key: "mkt", brand: "JD", month: "2026-09-01" },
      { version_id: "v1", category_key: "revenue", brand: null, month: "2026-09-01" },
      { version_id: "v1", category_key: "mkt", brand: "TD", month: "2026-09-01" },
    ];
    expect(summarizeBudgetInventory(lines, versions)).toEqual({
      "2026-09-01": { mkt: { approved: ["TD"], draftOnly: ["JD"] }, revenue: { approved: ["บริษัท"], draftOnly: [] } },
    });
  });
});

describe("summarizePctTargets / summarizeApMarketing", () => {
  it("% การตลาดเป้า: นับที่เปิดใช้ และระดับไหน (ไม่คืนตัวเลข %)", () => {
    expect(summarizePctTargets([{ category_key: "mkt", brand: null, active: true }, { category_key: "mkt", brand: "TD", active: true }, { category_key: "mkt", brand: "JD", active: false }]))
      .toEqual({ active: 2, scopes: ["TD", "บริษัท"] });
  });
  it("ค่าการตลาด AP: ต่อเดือน จำนวนรายการ ติดแท็กแบรนด์กี่รายการ แยกแบรนด์ แยกสถานะ", () => {
    expect(summarizeApMarketing([
      { doc_date: "2026-09-03", brand_tags: ["TD"], status: "paid" },
      { doc_date: "2026-09-10", brand_tags: [], status: "approved" },
      { doc_date: "2026-08-20", brand_tags: ["TD", "JD"], status: "paid" },
      { doc_date: null, brand_tags: ["TA"], status: "submitted" },
    ])).toEqual({
      "2026-08": { count: 1, tagged: 1, brands: { JD: 1, TD: 1 }, statuses: { paid: 1 } },
      "2026-09": { count: 2, tagged: 1, brands: { TD: 1 }, statuses: { approved: 1, paid: 1 } },
      "ไม่ระบุวันที่": { count: 1, tagged: 1, brands: { TA: 1 }, statuses: { submitted: 1 } },
    });
  });
});

describe("rpcShape — RPC ตอบอะไรกลับมา (ชื่อก้อน ไม่เอาเนื้อ)", () => {
  it("object = รายชื่อคีย์บนสุด · array = จำนวน · อื่นๆ = ชนิด", () => {
    expect(rpcShape({ velocity: [1], aging: {}, lost_by_stage: [] })).toEqual({ type: "object", keys: ["aging", "lost_by_stage", "velocity"] });
    expect(rpcShape([1, 2])).toEqual({ type: "array", length: 2 });
    expect(rpcShape(null)).toEqual({ type: "null" });
  });
});
