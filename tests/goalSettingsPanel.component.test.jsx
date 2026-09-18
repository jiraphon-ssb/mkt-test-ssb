// @vitest-environment jsdom
/* หน้าตั้งค่าเป้า — ต้องบอกว่าเดือนนี้ได้อะไรมาจากไหน ยังขาดอะไร และแก้ทับได้ทีละเดือน
   กติกา 18 ก.ย. 69: ค่าที่แก้ที่นี่ชนะค่าที่ดึงมา · ล้างช่อง = กลับไปใช้ค่าจากระบบขาย */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const calls = { save: [], clear: [] };
const data = { goals: {}, overrides: {} };
vi.mock("../src/foundation/data/apiClient.js", () => ({
  apiClient: {
    ads: {
      salesGoals: async (month) => data.goals[month] ?? [],
      goalOverrides: async ({ months }) => data.overrides[months[0]] ?? [],
      saveGoalOverride: async (args) => { calls.save.push(args); return args; },
      clearGoalOverride: async (brandId, month) => { calls.clear.push({ brandId, month }); },
    },
  },
}));
const { GoalSettingsPanel } = await import("../src/modules/marketing/ads/GoalSettingsPanel.jsx");

const brands = [
  { id: "b_td", name: "TEAMDEE" }, { id: "b_jk", name: "JK Design" },
  { id: "b_ta", name: "t around" }, { id: "b_jt", name: "JUNTAKARN" },
  { id: "b_new", name: "แบรนด์ใหม่" },
];
const THIS_MONTH = "2026-09-01";
const PREV_MONTH = "2026-08-01";
const goal = (brand_id, patch = {}) => ({ brand_id, month: THIS_MONTH, goal_source: "sale_goal", version: 2, sales_target: 3500000, ad_budget: 210000, ...patch });
const toast = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-09-18T05:00:00Z"), toFake: ["Date"] });
  calls.save = []; calls.clear = []; data.goals = {}; data.overrides = {}; toast.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const show = async (props = {}) => {
  const view = render(<MemoryRouter><GoalSettingsPanel brands={brands} isLead toast={toast} {...props} /></MemoryRouter>);
  await act(async () => {});
  return view;
};
const brandCard = (name) => screen.getByText(name).closest("article");
/* ใช้ชื่อช่องแบบเป๊ะ (accessible name จาก aria-label) — ข้อความอธิบายใต้ชื่อทำให้ regex ชนกันเอง
   เช่น "ROAS เป้า" + คำอธิบาย "ยอดขาย ÷ ค่าแอด" รวมกันแล้วมีคำว่า "เป้ายอดขาย" อยู่ข้างใน */
const input = (name, label) => within(brandCard(name)).getByRole("textbox", { name: label });

describe("GoalSettingsPanel", () => {
  it("โชว์ค่าที่ merge แล้ว + ที่มารายช่อง (ตั้งค่าเองชนะ และบอกว่าทับอะไรไว้)", async () => {
    data.goals[THIS_MONTH] = [goal("b_td")];
    data.overrides[THIS_MONTH] = [{ brand_id: "b_td", month: THIS_MONTH, ad_budget: 250000, updated_at: "2026-09-18T10:00:00Z" }];
    await show();
    expect(input("TEAMDEE", "งบแอด").value).toBe("250,000");        // มีคอมมาให้อ่านง่าย (ตอน parse ตัดให้)
    expect(input("TEAMDEE", "เป้ายอดขาย").value).toBe("3,500,000");
    const card = brandCard("TEAMDEE");
    expect(within(card).getByText("ระบบขาย")).toBeTruthy();
    expect(within(card).getByText(/ตั้งค่าเอง 1 ช่อง/)).toBeTruthy();
    // ขึ้นสองที่: บรรทัดเตือนว่าต้นทางเปลี่ยน และใต้ช่องที่ถูกทับ
    expect(within(card).getAllByText(/ระบบขายให้มา ฿210,000.00/).length).toBeGreaterThanOrEqual(1);
  });

  it("บอกว่าเดือนนี้ยังขาดช่องไหน และแบรนด์ที่ยังไม่มีแหล่งไม่ต้องตั้งเป้า", async () => {
    data.goals[THIS_MONTH] = [goal("b_td")];
    await show();
    const summary = screen.getByRole("status").textContent;
    expect(summary).toContain("ยังขาดบางช่อง");
    expect(summary).toContain("เป้าคนทัก");
    // แบรนด์ที่ยังไม่ตั้งอะไรเลย รวบเป็นชื่อแบรนด์ ไม่ไล่ทีละ 11 ช่องจนบรรทัดยาว
    expect(summary).toMatch(/ยังไม่ตั้งเป้าเลย: .*JUNTAKARN/);
    expect(summary).not.toMatch(/ROAS เป้า \(JUNTAKARN\)/);
    expect(screen.queryByText("แบรนด์ใหม่")).toBeNull();                       // ไม่มีการ์ดให้ตั้งเป้า
    expect(screen.getByText(/แบรนด์ใหม่: ยังไม่มีแหล่งยอดขาย/)).toBeTruthy();   // แต่บอกไว้ใต้ตาราง
  });

  it("พิมพ์ทับแล้วบันทึก = ส่งค่าที่ parse แล้ว · ช่องที่ไม่ได้แตะเป็น null (ไม่สร้าง override เกินจำเป็น)", async () => {
    data.goals[THIS_MONTH] = [goal("b_td")];
    await show();
    fireEvent.change(input("TEAMDEE", "งบแอด"), { target: { value: "250,000" } });
    fireEvent.change(input("TEAMDEE", "เป้าคนทัก"), { target: { value: "1500" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /บันทึกเป้าเดือนนี้/ })); });
    expect(calls.save).toHaveLength(1);
    expect(calls.save[0]).toMatchObject({ brandId: "b_td", month: THIS_MONTH });
    expect(calls.save[0].updatedBy).toBeUndefined();   // ใครแก้/เมื่อไหร่ ประทับจากฐาน ไม่ใช่จากหน้าเว็บ
    expect(calls.save[0].values).toMatchObject({ ad_budget: 250000, inquiry_target: 1500, sales_target: null, roas: null });
  });

  it("พิมพ์เลขเดิมซ้ำ = ไม่สร้าง override · ล้างช่องที่เคยตั้งไว้ = ลบทั้งแถวเมื่อไม่เหลืออะไร", async () => {
    data.goals[THIS_MONTH] = [goal("b_td")];
    data.overrides[THIS_MONTH] = [{ brand_id: "b_td", month: THIS_MONTH, ad_budget: 250000 }];
    await show();
    fireEvent.change(input("TEAMDEE", "เป้ายอดขาย"), { target: { value: "3500000" } });   // เท่าค่าจากระบบขาย
    fireEvent.change(input("TEAMDEE", "งบแอด"), { target: { value: "" } });               // ล้างค่าที่เคยตั้ง
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /บันทึกเป้าเดือนนี้/ })); });
    expect(calls.save).toHaveLength(0);
    expect(calls.clear).toEqual([{ brandId: "b_td", month: THIS_MONTH }]);
  });

  it("ปุ่มคืนค่า: ช่องกลับไปเป็นค่าจากระบบขาย แล้วบันทึกแล้วไม่เหลือ override", async () => {
    data.goals[THIS_MONTH] = [goal("b_td")];
    data.overrides[THIS_MONTH] = [{ brand_id: "b_td", month: THIS_MONTH, ad_budget: 250000 }];
    await show();
    fireEvent.click(within(brandCard("TEAMDEE")).getByRole("button", { name: /คืนค่า/ }));
    expect(input("TEAMDEE", "งบแอด").value).toBe("210,000");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /บันทึกเป้าเดือนนี้/ })); });
    expect(calls.clear).toEqual([{ brandId: "b_td", month: THIS_MONTH }]);
  });

  it("%Ads พิมพ์เป็นเปอร์เซ็นต์ เก็บเป็นสัดส่วน · พิมพ์ผิดขึ้นเตือนและกดบันทึกไม่ได้", async () => {
    data.goals[THIS_MONTH] = [goal("b_td")];
    await show();
    fireEvent.change(input("TEAMDEE", "%Ads เป้า"), { target: { value: "12%" } });
    fireEvent.change(input("TEAMDEE", "ROAS เป้า"), { target: { value: "หกเท่า" } });
    expect(within(brandCard("TEAMDEE")).getByText(/กรอกเป็นตัวเลข/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /บันทึก/ }).disabled).toBe(true);
    fireEvent.change(input("TEAMDEE", "ROAS เป้า"), { target: { value: "6.5x" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /บันทึกเป้าเดือนนี้/ })); });
    expect(calls.save[0].values).toMatchObject({ pct_ads_new: 0.12, roas: 6.5 });
  });

  it("เป้าของ JUNTAKARN จากระบบ TMK อ่านออกว่ามาจากไหน และเติมช่องที่ TMK ไม่มีได้", async () => {
    data.goals[THIS_MONTH] = [goal("b_jt", { goal_source: "tmk_month", version: 0, sales_target: 900000, ad_budget: 150000, roas: 6 })];
    await show();
    const card = brandCard("JUNTAKARN");
    expect(within(card).getByText("ระบบ TMK")).toBeTruthy();
    expect(within(card).getByRole("textbox", { name: "เป้ายืนยันออเดอร์" }).value).toBe("");
    fireEvent.change(within(card).getByRole("textbox", { name: "เป้ายืนยันออเดอร์" }), { target: { value: "60" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /บันทึกเป้าเดือนนี้/ })); });
    expect(calls.save[0]).toMatchObject({ brandId: "b_jt" });
    expect(calls.save[0].values.orders_target).toBe(60);
  });

  it("สลับเดือน = โหลดของเดือนนั้น และไม่เอาค่าที่ค้างในฟอร์มข้ามเดือน", async () => {
    data.goals[THIS_MONTH] = [goal("b_td")];
    data.goals[PREV_MONTH] = [goal("b_td", { month: PREV_MONTH, sales_target: 3000000 })];
    await show();
    fireEvent.change(input("TEAMDEE", "เป้ายอดขาย"), { target: { value: "9999" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "เดือนของเป้า" })); });
    await act(async () => { fireEvent.click(screen.getByRole("option", { name: /ส\.ค\. 2569/ })); });
    expect(input("TEAMDEE", "เป้ายอดขาย").value).toBe("3,000,000");
    expect(screen.getByRole("button", { name: /บันทึก/ }).disabled).toBe(true);   // ไม่มีอะไรค้าง
  });

  it("คัดลอกจากเดือนก่อน = เติมเฉพาะช่องที่ยังว่าง ไม่ทับของที่มีอยู่", async () => {
    data.goals[THIS_MONTH] = [goal("b_td", { ad_budget: null })];
    data.goals[PREV_MONTH] = [goal("b_td", { month: PREV_MONTH, sales_target: 3000000, ad_budget: 180000, inquiry_target: 1200 })];
    await show();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /คัดลอกจากเดือนก่อน/ })); });
    expect(input("TEAMDEE", "งบแอด").value).toBe("180,000");          // ช่องที่ว่าง → เติมให้
    expect(input("TEAMDEE", "เป้าคนทัก").value).toBe("1,200");
    expect(input("TEAMDEE", "เป้ายอดขาย").value).toBe("3,500,000");    // ช่องที่มีค่าอยู่แล้ว → ไม่ทับ
  });

  it("ไม่ใช่หัวหน้าทีม = ดูได้อย่างเดียว", async () => {
    data.goals[THIS_MONTH] = [goal("b_td")];
    await show({ isLead: false });
    expect(input("TEAMDEE", "เป้ายอดขาย").disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /บันทึก/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /คัดลอกจากเดือนก่อน/ })).toBeNull();
    expect(screen.getByText(/เฉพาะหัวหน้าทีมแก้เป้าได้/)).toBeTruthy();
  });
});

/* ตารางค่าที่แก้เองยังไม่ถูกสร้าง (migration ยังไม่ push) หรือสิทธิ์ไม่ถึง
   → ต้องยังดูได้ว่าเดือนนี้ได้เป้าอะไรมาแล้ว แค่แก้ไม่ได้ (เจอบนของจริง 18 ก.ย. 69 ทั้งหน้าพัง) */
describe("GoalSettingsPanel — อ่านค่าที่แก้เองไม่ได้", () => {
  it("ยังโชว์เป้าที่ดึงมา · บอกเหตุผล · ปิดการแก้ไว้", async () => {
    data.goals[THIS_MONTH] = [goal("b_td")];
    const { apiClient } = await import("../src/foundation/data/apiClient.js");
    const original = apiClient.ads.goalOverrides;
    apiClient.ads.goalOverrides = async () => { throw new Error('relation "ad_sales_goal_overrides" does not exist'); };
    try {
      await show();
      expect(input("TEAMDEE", "เป้ายอดขาย").value).toBe("3,500,000");
      expect(input("TEAMDEE", "เป้ายอดขาย").disabled).toBe(true);
      expect(screen.getByRole("alert").textContent).toContain("ยังแก้เป้าเองไม่ได้");
      expect(screen.queryByRole("button", { name: /บันทึกเป้าเดือนนี้/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /คัดลอกจากเดือนก่อน/ })).toBeNull();
    } finally { apiClient.ads.goalOverrides = original; }
  });
});
