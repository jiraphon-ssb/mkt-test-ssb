// @vitest-environment jsdom
/* หน้า Sync — ส่วนระบบขาย · creative · สิทธิ์ ระดับหน้าจอ: ทุกสถานะ "ไม่มีข้อมูล" ต้องอ่านออกว่าเพราะอะไร */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AccessPanel, CoverageTable, CreativeRunsPanel, GoalMatrix, InventoryList } from "../src/modules/marketing/ads/SalesSyncPanels.jsx";

afterEach(cleanup);
const brands = [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jt", name: "JUNTAKARN" }];
const day = (fact_date, patch = {}) => ({ brand_id: "b_td", fact_date, inquiries: 0, inquiry_filled: false, qualified_leads: 1, deposits: 0, orders: 1, gross_revenue: 100, ...patch });

describe("CoverageTable", () => {
  const facts = [day("2026-08-01"), day("2026-08-02"), day("2026-09-01", { inquiry_filled: true, deposits: 2 }), day("2026-09-02", { deposits: 1 })];
  const groupRows = (label) => {
    const rows = screen.getAllByRole("row");
    const start = rows.findIndex((row) => row.textContent === label);
    const end = rows.findIndex((row, i) => i > start && row.classList.contains("sy-cov-group"));
    return rows.slice(start + 1, end === -1 ? undefined : end);
  };
  it("จัดกลุ่มตามตัวชี้วัด · ทีมยังไม่กรอก / กรอกบางวัน บอกรายแบรนด์ · ยังไม่เริ่มเก็บบอกวันเริ่ม (ไม่ใช่สีแดง)", () => {
    render(<CoverageTable facts={facts} brands={brands} from="2026-08-01" to="2026-09-02" />);
    const inquiry = groupRows("คนทัก (ทีมกรอก)");
    expect(inquiry.map((row) => row.querySelector("th").textContent)).toEqual(["TEAMDEE"]);
    expect(within(inquiry[0]).getByText("ทีมยังไม่กรอก")).toBeTruthy();
    expect(within(inquiry[0]).getByText("กรอก 1/2")).toBeTruthy();
    const deposits = groupRows("ได้ออเดอร์");
    expect(within(deposits[0]).getByText("เริ่มเก็บ 1 ก.ย.").className).toContain("since");
  });
  it("ทุกแบรนด์สถานะเหมือนกัน = ยุบเป็นแถวเดียว 'ทุกแบรนด์' · แบรนด์ที่ยังไม่มีแหล่งบอกครั้งเดียวใต้ตาราง", () => {
    const two = [{ id: "b_td", name: "TEAMDEE" }, { id: "b_ta", name: "t around" }, { id: "b_jt", name: "JUNTAKARN" }];
    const both = [...facts, ...facts.map((f) => ({ ...f, brand_id: "b_ta" }))];
    render(<CoverageTable facts={both} brands={two} from="2026-08-01" to="2026-09-02" />);
    expect(groupRows("ยอดขาย").map((row) => row.querySelector("th").textContent)).toEqual(["ทุกแบรนด์"]);
    expect(screen.getAllByText(/รอเชื่อมแหล่งข้อมูล/)).toHaveLength(1);
  });
  it("หัวคอลัมน์บอกช่วงวันจริง: เริ่มกลางเดือน · เดือนที่ยังไม่จบ", () => {
    render(<CoverageTable facts={[day("2026-06-18"), day("2026-09-17")]} brands={[brands[0]]} from="2026-06-18" to="2026-09-17" today="2026-09-17" />);
    expect(screen.getByRole("columnheader", { name: /มิ\.ย\. 69.*18–30/ })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /ก\.ย\. 69.*ถึงวันนี้/ })).toBeTruthy();
  });
  it("ไม่มีข้อมูลเลย = บอกว่าจะขึ้นเมื่อไร", () => {
    render(<CoverageTable facts={[]} brands={[]} from="2026-09-01" to="2026-09-17" />);
    expect(screen.getByText("ยังไม่มีข้อมูลความครบ")).toBeTruthy();
  });
});

describe("GoalMatrix", () => {
  it("ตารางแบรนด์ × ช่องเป้า โชว์ตัวเลขจริง · ช่องที่ยังไม่ตั้ง = — · สรุปช่องที่ขาดด้านบน · JK รอเชื่อม", () => {
    render(<GoalMatrix brands={brands} goals={[{ brand_id: "b_td", goal_source: "sale_target", version: 0, sales_target: 3300000, orders_target: 193, deposits_target: 206, leads_target: 344, inquiry_target: 1173 }]} />);
    const td = screen.getByRole("row", { name: /TEAMDEE/ });
    expect(within(td).getByText("เป้าแบบเก่า")).toBeTruthy();
    expect(within(td).getByText("฿3,300,000")).toBeTruthy();
    expect(within(td).getByText("1,173")).toBeTruthy();
    expect(within(td).getAllByText("—")).toHaveLength(6);
    expect(screen.getByText(/ยังไม่ตั้ง: งบแอด · CPL · ROAS · %Ads · CAC · ต้นทุนต่อทัก/)).toBeTruthy();
    expect(within(screen.getByRole("row", { name: /JUNTAKARN/ })).getByText("รอเชื่อมแหล่งข้อมูล")).toBeTruthy();
  });
  it("ไม่มีเป้าเลย = ยังไม่ตั้งเป้า · ตั้งครบ = ไม่มีบรรทัดสรุปช่องที่ขาด", () => {
    render(<GoalMatrix brands={[brands[0]]} goals={[]} />);
    expect(screen.getByText("ยังไม่ตั้งเป้า")).toBeTruthy();
    cleanup();
    const full = { brand_id: "b_td", goal_source: "sale_goal", version: 3, sales_target: 1, orders_target: 1, deposits_target: 1, leads_target: 1, inquiry_target: 1, ad_budget: 1000, cpl: 400, roas: 6, pct_ads_new: 0.16, cac: 5000, cpi: 90 };
    render(<GoalMatrix brands={[brands[0]]} goals={[full]} />);
    expect(screen.getByText("หน้าเป้าหมาย v3")).toBeTruthy();
    expect(screen.getByText("6.0×")).toBeTruthy();
    expect(screen.getByText("16%")).toBeTruthy();
    expect(screen.queryByText(/ยังไม่ตั้ง:/)).toBeNull();
  });
});

describe("InventoryList", () => {
  it("ยังไม่เคยสำรวจ = บอกว่าระบบสำรวจเองวันละครั้ง", () => {
    render(<InventoryList run={null} />);
    expect(screen.getByText("ยังไม่เคยสำรวจแหล่งข้อมูล")).toBeTruthy();
  });
  it("แยก มีข้อมูล / ยังไม่มีข้อมูล / เรียกได้ / อ่านไม่ได้", () => {
    render(<InventoryList run={{ started_at: "2026-09-17T01:00:00Z", trigger_kind: "cron", summary: {
      goals: { state: "open", rowCount: 0, summary: {} }, legacyTargets: { state: "open", rowCount: 18, summary: { "2026-09-01": {} } },
      pipeline: { state: "open", summary: {} }, plRevenue: { state: "open", rowCount: 0, summary: {} },
    } }} />);
    expect(screen.getByText("ระบบพร้อม แต่ยังไม่มีใครบันทึกเป้าในหน้าเป้าหมาย")).toBeTruthy();
    expect(screen.getByText("มีข้อมูล")).toBeTruthy();
    expect(screen.getByText("เรียกได้")).toBeTruthy();
    expect(screen.getByText("อ่านไม่ได้")).toBeTruthy();
  });
});

describe("CreativeRunsPanel / AccessPanel", () => {
  it("ขาดสิทธิ์ = ต้องเชื่อม Meta ใหม่ · ยังไม่มีรอบที่บันทึก = บอกตรงๆ (ไม่อ้างว่าไม่เคยรีเฟรช)", () => {
    const accounts = [{ key: "a", connectionId: "c1", brand: "TEAMDEE", accountId: "act_1" }, { key: "b", connectionId: "c2", brand: "t around", accountId: "act_2" }];
    const latest = new Map([["c1", { status: "success", started_at: "2026-09-17T01:00:00Z", summary: { total: 10, withPostMedia: 5, missingScopes: ["business_management"] } }]]);
    render(<CreativeRunsPanel latestByConnection={latest} accounts={accounts} />);
    expect(screen.getByText("ต้องเชื่อม Meta ใหม่")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("ยังไม่มีรอบที่บันทึก")).toBeTruthy();
  });
  it("token เหลือกี่วัน · คีย์ระบบขายยืนยันจากรอบดึงล่าสุด", () => {
    render(<MemoryRouter><AccessPanel now={Date.parse("2026-09-17T00:00:00Z")}
      authorizations={[{ id: "a1", status: "connected", expires_at: "2026-11-14T08:46:00Z", provider_user_name: "Art" }]}
      salesRun={{ status: "success", started_at: "2026-09-17T01:00:00Z" }} /></MemoryRouter>);
    expect(screen.getByText("เหลือ 58 วัน")).toBeTruthy();
    expect(screen.getByText("ใช้ได้")).toBeTruthy();
  });
  it("Meta ไม่ส่งวันหมดอายุ = บอกว่าไม่รู้และเตือนไม่ได้ ไม่ใช่บอกว่าไม่มีวันหมดอายุ", () => {
    render(<MemoryRouter><AccessPanel authorizations={[{ id: "a1", status: "connected", expires_at: null }]} /></MemoryRouter>);
    expect(screen.getByText("ไม่รู้วันหมดอายุ")).toBeTruthy();
    expect(screen.getByText(/ระบบเตือนล่วงหน้าไม่ได้/)).toBeTruthy();
    expect(screen.queryByText("ไม่มีวันหมดอายุ")).toBeNull();
  });
});
