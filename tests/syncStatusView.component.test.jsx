// @vitest-environment jsdom
/* หน้า Sync ทั้งหน้า — บั๊กบน production 17 ก.ย.: ระหว่างรอ API หน้าเดิมขึ้น "ยังไม่เคยดึง / ยังไม่ได้เชื่อม Meta" ทั้งที่ดึงสำเร็จแล้ว
   หน้าใหม่ต้อง: ระหว่างโหลดบอกว่ากำลังตรวจ · ส่วนไหนมาแล้วขึ้นก่อน · โหลดเสร็จแล้วสรุปถูก */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const pending = {};
const deferred = (key) => new Promise((resolve, reject) => { pending[key] = { resolve, reject }; });
vi.mock("../src/foundation/data/apiClient.js", () => ({ apiClient: { ads: {
  recentSyncs: () => deferred("syncRuns"), connections: () => deferred("connections"), reconciliations: () => deferred("recons"),
  syncCoverage: () => deferred("coverage"), cronTicks: () => deferred("ticks"), pipelineRuns: () => deferred("pipes"),
  businessFacts: () => deferred("facts"), salesGoals: () => deferred("goals"), oauthStatus: () => deferred("oauth"),
} } }));
const auth = { demo: false, user: { role: "team_lead" } };
vi.mock("../src/foundation/auth/AuthContext.jsx", () => ({ useAuth: () => auth }));
vi.mock("../src/modules/marketing/ads/useAdsData.js", () => ({ loadPilotFacts: () => Promise.resolve() }));
const brands = [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jt", name: "JUNTAKARN" }];
vi.mock("../src/modules/marketing/useMkt.jsx", () => ({ useApp: () => ({ toast: () => {}, data: { brands, settings: { ads_control: {
  sources: { meta: { syncEveryHours: 6 } },
  // ค่าเก่าใน settings: บอกว่าดึงล่าสุดเมื่อวาน (ข้อมูลขาด) — ห้ามเอามาสรุประหว่างโหลด
  mappings: { meta: { b_td: { enabled: true, accountId: "act_1", connectionId: "c1", oauthStatus: "connected", lastSuccessAt: "2026-09-16T08:07:00Z" } } },
} } } }) }));
const { SyncStatusView } = await import("../src/modules/marketing/ads/SyncStatusView.jsx");

beforeEach(() => { auth.user = { role: "team_lead" }; for (const key of Object.keys(pending)) delete pending[key]; vi.useFakeTimers({ now: new Date("2026-09-17T03:00:00Z"), toFake: ["Date"] }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const show = () => render(<MemoryRouter initialEntries={["/mkt/ads/sync"]}><SyncStatusView /></MemoryRouter>);
const settle = async (key, value) => { await act(async () => { pending[key].resolve(value); }); };

describe("SyncStatusView — ระหว่างโหลด", () => {
  it("ไม่สรุปว่ายังไม่เคยดึง / ยังไม่ได้เชื่อม / ข้อมูลขาด · บอกว่ากำลังตรวจ", () => {
    show();
    expect(screen.getByRole("status").textContent).toContain("กำลังตรวจข้อมูล…");
    expect(screen.queryByText(/ยังไม่เคยดึง|ยังไม่ได้เชื่อม|ข้อมูลขาด/)).toBeNull();
    expect(screen.getAllByText("กำลังตรวจ…").length).toBeGreaterThanOrEqual(3);
  });

  it("ส่วนที่มาแล้วขึ้นก่อน: ยอดขายมาก่อน Meta ก็ขึ้นสถานะยอดขายได้เลย", async () => {
    show();
    await settle("pipes", [{ id: "s1", pipeline: "sales", status: "success", trigger_kind: "cron", started_at: "2026-09-17T02:07:00Z" }]);
    await settle("facts", [{ brand_id: "b_td", fact_date: "2026-09-01", inquiry_filled: true }]);
    const sales = screen.getByText("ยอดขาย TD · JD · TA").closest('[role="row"]');
    expect(within(sales).getByText("ปกติ")).toBeTruthy();
    expect(within(sales).getByText("53 นาทีก่อน")).toBeTruthy();
    const meta = screen.getByText("ค่าแอด Meta").closest('[role="row"]');
    expect(within(meta).getByText("กำลังตรวจ…")).toBeTruthy();
  });
});

describe("SyncStatusView — โหลดเสร็จ", () => {
  it("ทุกอย่างปกติ + token ไม่รู้วันหมดอายุ = ใช้ได้แต่ควรดู 1 เรื่อง · JUNTAKARN รอเชื่อม · แท็บสลับได้", async () => {
    show();
    await settle("connections", [{ id: "c1", provider: "meta", brand_id: "b_td", external_account_id: "act_1", status: "connected", last_success_at: "2026-09-16T22:07:00Z", timezone: "Asia/Bangkok", config: { backfillDays: 3 } }]);
    // ประวัติดึงครอบคลุมช่วงวัน (ว่าง = ระบบถือว่าวันที่ขาดจริง ซึ่งถูกต้อง)
    await settle("coverage", [{ connection_id: "c1", mode: "incremental", status: "success", range_from: "2026-06-01", range_to: "2026-09-17", started_at: "2026-09-16T22:07:00Z" }]);
    await settle("recons", []);
    await settle("syncRuns", []);
    await settle("ticks", [{ id: "t1", started_at: "2026-09-17T02:07:00Z", finished_at: "2026-09-17T02:07:02Z", status: "success", source: "pg_cron" }]);
    await settle("pipes", [{ id: "s1", pipeline: "sales", status: "success", trigger_kind: "cron", started_at: "2026-09-17T02:07:00Z" }]);
    await settle("facts", []);
    await settle("goals", [{ brand_id: "b_td", goal_source: "sale_goal", version: 2, sales_target: 1, ad_budget: 1, cpl: 1, roas: 1, pct_ads_new: 1, cac: 1, cpi: 1, inquiry_target: 1, leads_target: 1, deposits_target: 1, orders_target: 1 }]);
    await settle("oauth", { authorizations: [{ id: "a1", status: "connected", expires_at: null, provider_user_name: "อาร์ต" }] });

    expect(screen.getByRole("status").textContent).toContain("ข้อมูลใช้ได้ · มี");
    const issues = screen.getByRole("list", { name: "เรื่องที่ควรดู" });
    expect(within(issues).getByText("token Meta ไม่รู้วันหมดอายุ")).toBeTruthy();
    expect(screen.getByText("ยอดขาย JUNTAKARN").closest('[role="row"]').textContent).toContain("รอเชื่อมแหล่งข้อมูล");

    fireEvent.click(screen.getByRole("tab", { name: "ประวัติ" }));
    expect(screen.getByRole("tab", { name: "ประวัติ" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("ดึงยอดขาย")).toBeTruthy();
  });

  it("โหลดส่วนไหนไม่สำเร็จ = บอกที่แถวนั้น ไม่ทำเหมือนไม่มีข้อมูล", async () => {
    show();
    await act(async () => { pending.pipes.reject(new Error("boom")); });
    await settle("facts", []);
    const sales = screen.getByText("ยอดขาย TD · JD · TA").closest('[role="row"]');
    expect(within(sales).getByText("โหลดสถานะไม่สำเร็จ")).toBeTruthy();
    expect(within(sales).queryByText("ยังไม่เคยดึง")).toBeNull();
  });
});

describe("SyncStatusView — สมาชิกที่ไม่ใช่หัวหน้าทีม", () => {
  it("ยังโหลดสถานะบัญชีจริงจากฐาน (อ่านได้ทุกคน) · ไม่เห็นปุ่มสั่งงาน", async () => {
    auth.user = { role: "member" };
    show();
    expect(pending.connections).toBeTruthy();
    expect(pending.coverage).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ดึงข้อมูลตอนนี้/ })).toBeNull();
    expect(screen.queryByText("งานอื่น")).toBeNull();
  });
});
