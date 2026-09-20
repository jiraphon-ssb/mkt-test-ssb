// @vitest-environment jsdom
/* หน้า Sync ทั้งหน้า — บั๊กบน production 17 ก.ย.: ระหว่างรอ API หน้าเดิมขึ้น "ยังไม่เคยดึง / ยังไม่ได้เชื่อม Meta" ทั้งที่ดึงสำเร็จแล้ว
   หน้าใหม่ต้อง: ระหว่างโหลดบอกว่ากำลังตรวจ · ส่วนไหนมาแล้วขึ้นก่อน · โหลดเสร็จแล้วสรุปถูก */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const pending = {};
const factArgs = [];
/* ผลของ sales-sync รอบเดียวกันมีทั้งยอดขายและเป้า (ระบบขายพี่ทัช + ระบบ TMK) */
let salesSyncResult = { written: 42, jk: { written: 14, error: null }, goals: { written: 3, error: null }, jkGoals: { written: 2, error: null } };
const deferred = (key) => new Promise((resolve, reject) => { pending[key] = { resolve, reject }; });
vi.mock("../src/foundation/data/apiClient.js", () => ({ apiClient: { ads: {
  recentSyncs: () => deferred("syncRuns"), connections: () => deferred("connections"), reconciliations: () => deferred("recons"),
  syncCoverage: () => deferred("coverage"), cronTicks: () => deferred("ticks"), pipelineRuns: () => deferred("pipes"),
  businessFacts: (args) => { factArgs.push(args); return deferred("facts"); }, salesGoals: () => deferred("goals"),
  goalOverrides: () => deferred("goalOverrides"), oauthStatus: () => deferred("oauth"),
  salesSync: async () => salesSyncResult,
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

beforeEach(() => { auth.user = { role: "team_lead" }; factArgs.length = 0; for (const key of Object.keys(pending)) delete pending[key]; vi.useFakeTimers({ now: new Date("2026-09-17T03:00:00Z"), toFake: ["Date"] }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const show = () => render(<MemoryRouter initialEntries={["/mkt/ads/sync"]}><SyncStatusView /></MemoryRouter>);
const settle = async (key, value) => { await act(async () => { pending[key].resolve(value); }); };
// เป้าของหน้านี้ = เป้าจากระบบขาย + ค่าที่คนแก้เอง (merge) → เทสต้องปล่อยทั้งสองก้อน
const settleGoals = async (goals = [], overrides = []) => { await settle("goals", goals); await settle("goalOverrides", overrides); };

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
    await settleGoals([{ brand_id: "b_td", month: "2026-09-01", goal_source: "sale_goal", version: 2, sales_target: 1, ad_budget: 1, cpl: 1, roas: 1, pct_ads_new: 1, cac: 1, cpi: 1, inquiry_target: 1, leads_target: 1, deposits_target: 1, orders_target: 1 }]);
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

/* ปุ่มเดิมสองปุ่มชื่อคล้ายกัน ("ดึงข้อมูลตอนนี้" = ค่าแอด vs "ดึงยอดขายตอนนี้" ในเมนู) ใช้งานยาก
   ของใหม่: ปุ่มหลักเดียวทำครบ · งานที่เหลืออยู่ในเมนูที่จัดกลุ่มและบอกว่าแต่ละอันทำอะไร */
describe("SyncStatusView — แถบปุ่มสั่งงาน", () => {
  it("ปุ่มหลักเดียว 'ดึงข้อมูลทั้งหมด' ไม่มีปุ่มชื่อคล้ายกันซ้อน", () => {
    show();
    expect(screen.getByRole("button", { name: /ดึงข้อมูลทั้งหมด/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^ดึงข้อมูลตอนนี้$/ })).toBeNull();
  });
  it("เมนูงานอื่นจัดกลุ่ม 3 กลุ่ม · ทุกงานมีคำอธิบายใต้ชื่อ", () => {
    show();
    const menu = screen.getByRole("menu");
    expect([...menu.querySelectorAll(".sy-menu-group")].map((node) => node.textContent)).toEqual(["ดึงแหล่งเดียว", "ระบบขาย", "Meta"]);
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(6);
    for (const item of items) expect(item.querySelector("small")?.textContent?.length).toBeGreaterThan(8);
    expect(within(menu).getByText("ดึงค่าแอด Meta เท่านั้น")).toBeTruthy();
    expect(within(menu).getByText("ดึงยอดขายเท่านั้น")).toBeTruthy();
  });
});

describe("SyncStatusView — สมาชิกที่ไม่ใช่หัวหน้าทีม", () => {
  it("ยังโหลดสถานะบัญชีจริงจากฐาน (อ่านได้ทุกคน) · ไม่เห็นปุ่มสั่งงาน", async () => {
    auth.user = { role: "member" };
    show();
    expect(pending.connections).toBeTruthy();
    expect(pending.coverage).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ดึงข้อมูลทั้งหมด/ })).toBeNull();
    expect(screen.queryByText("งานอื่น")).toBeNull();
  });

  /* บั๊กที่เทสเดิมมองไม่เห็นเพราะ mock ทั้งก้อน: businessFacts ของจริงกรอง source='crm' ไว้
     ถ้าหน้านี้ไม่ขอ 'tmk' มาด้วย แถว JK จะบอก "รอเชื่อมแหล่งข้อมูล" ตลอดไปแม้ข้อมูลเข้าฐานแล้ว */
  it("ขอยอดขายทั้ง crm และ tmk (ไม่งั้นแถว JUNTAKARN ไม่เห็นข้อมูลของตัวเอง)", () => {
    show();
    expect(factArgs.length).toBeGreaterThan(0);
    expect(factArgs[0]?.sources).toEqual(["crm", "tmk"]);
  });

  it("เฟส JK ของรอบล่าสุดล้ม = แถว JUNTAKARN ขึ้นดึงไม่สำเร็จพร้อมเหตุผลไทย", async () => {
    show();
    await settle("pipes", [{ id: "s1", pipeline: "sales", status: "partial", trigger_kind: "cron", started_at: "2026-09-17T02:07:00Z", summary: { jk: { error: "JK_NO_PERMISSION" } } }]);
    await settle("facts", []);
    const jk = screen.getByText("ยอดขาย JUNTAKARN").closest('[role="row"]');
    expect(within(jk).getByText("ดึงไม่สำเร็จ")).toBeTruthy();
    expect(within(jk).getByText(/service role key/)).toBeTruthy();
  });

  /* แถวนี้เคยอ่านคนละภาษากับอีก 3 แถว: "สดแค่ไหน" โชว์วันที่ของข้อมูล (ไม่ใช่เวลารอบดึง)
     และ "ครบแค่ไหน" โชว์คำนิยามแทนความครบ → เทียบข้ามแถวไม่ได้ */
  it("แถวยอดขาย JUNTAKARN: อ่านคอลัมน์เดียวกับแถวอื่นได้ · นิยามที่ต่างย้ายไปใต้ชื่อแหล่ง", async () => {
    show();
    await settle("pipes", [{ id: "s1", pipeline: "sales", status: "success", trigger_kind: "cron", started_at: "2026-09-17T02:07:00Z" }]);
    await settle("facts", [{ brand_id: "b_jt", fact_date: "2026-09-17", source: "tmk", inquiry_filled: true, orders: 2 }]);
    const jk = screen.getByText("ยอดขาย JUNTAKARN").closest('[role="row"]');
    expect(within(jk).getByText("ปกติ")).toBeTruthy();
    expect(within(jk).getByText("53 นาทีก่อน")).toBeTruthy();
    expect(within(jk).getByText("ดึงวันละครั้ง · พร้อมยอดขาย")).toBeTruthy();
    expect(within(jk).getByText(/ข้อมูลถึง 17 ก\.ย\./)).toBeTruthy();
    expect(within(jk).getByText("คนทักทีมกรอก 1/1 วัน")).toBeTruthy();
    expect(within(jk).getByText("ระบบ TMK · เฉพาะ Facebook").title).toContain("นับเฉพาะออเดอร์ช่องทาง Facebook");
    expect(within(jk).getByRole("button", { name: /ดูรายละเอียด/ })).toBeTruthy();
  });
});

/* ค่าที่แก้ในหน้าตั้งค่าเป้าต้องชนะถึงหน้าจอจริง ไม่ใช่ชนะแค่ในฟังก์ชัน merge
   (ถ้าลืมต่อ merge เข้าหน้านี้ ตารางเป้าจะบอกว่า "ยังไม่ตั้ง" ทั้งที่ตั้งไว้แล้ว) */
describe("SyncStatusView — เป้าที่ตั้งเองชนะเป้าจากระบบขาย", () => {
  const openSales = async () => { await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /ยอดขาย/ })); }); };

  it("แก้งบแอดในตั้งค่า = ตารางเป้าใช้ค่าที่แก้ และบอกที่มาว่าตั้งค่าเอง", async () => {
    show();
    await settle("pipes", []);
    await settle("facts", []);
    await settleGoals(
      [{ brand_id: "b_td", month: "2026-09-01", goal_source: "sale_goal", version: 2, sales_target: 3500000, ad_budget: 210000 }],
      [{ brand_id: "b_td", month: "2026-09-01", ad_budget: 250000, updated_at: "2026-09-18T10:00:00Z" }],
    );
    await openSales();
    // ตารางเป้าอยู่ในบล็อก sy-goal-block — แถวชื่อแบรนด์มีทั้งในตารางเป้าและตารางความครบ
    const row = within(document.querySelector(".sy-goal-block")).getByRole("row", { name: /TEAMDEE/ });
    expect(within(row).getByText("฿250,000.00")).toBeTruthy();      // ค่าที่แก้
    expect(within(row).queryByText("฿210,000.00")).toBeNull();      // ค่าจากระบบขายไม่ถูกใช้
    expect(within(row).getByText("฿3,500,000.00")).toBeTruthy();    // ช่องที่ไม่ได้แก้ยังมาจากระบบขาย
    expect(within(row).getByText(/ตั้งค่าเอง 1 ช่อง/)).toBeTruthy();
    expect(within(row).getByText(/หน้าเป้าหมาย v2/)).toBeTruthy();   // ช่องที่เหลือยังมาจากระบบขาย
  });

  it("เป้าของ JUNTAKARN ที่มาจากระบบ TMK บอกที่มาถูก (ไม่ใช่ 'ยังไม่ตั้งเป้า')", async () => {
    show();
    await settle("pipes", []);
    await settle("facts", []);
    await settleGoals([{ brand_id: "b_jt", month: "2026-09-01", goal_source: "tmk_month", version: 0, sales_target: 900000, ad_budget: 150000, roas: 6 }], []);
    await openSales();
    const row = within(document.querySelector(".sy-goal-block")).getByRole("row", { name: /JUNTAKARN/ });
    expect(within(row).getByText("ระบบ TMK")).toBeTruthy();
    expect(within(row).getByText("฿900,000.00")).toBeTruthy();
  });
});

/* กด "ดึงข้อมูลทั้งหมด" แล้วต้องเห็นว่าเป้าถูกดึงด้วย — ไม่ใช่เดาเอาเองว่ารวมอยู่ในขั้นยอดขาย */
describe("SyncStatusView — ไทม์ไลน์มีขั้นเป้า", () => {
  const settleAll = async () => {
    await settle("syncRuns", []); await settle("connections", []); await settle("recons", []);
    await settle("coverage", []); await settle("ticks", []); await settle("pipes", []);
    await settle("facts", []); await settleGoals([], []); await settle("oauth", { authorizations: [] });
  };

  it("ดึงยอดขายอย่างเดียว = 2 ขั้น (ยอดขาย · เป้า) พร้อมผลของแต่ละขั้น", async () => {
    salesSyncResult = { written: 42, jk: { written: 14, error: null }, goals: { written: 3, error: null }, jkGoals: { written: 2, error: null } };
    show();
    await settleAll();
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: /ดึงยอดขายเท่านั้น/ })); });
    const steps = screen.getAllByRole("listitem").filter((node) => node.className.includes("ok") || node.className.includes("bad"));
    const timeline = screen.getByLabelText("ความคืบหน้าการดึงข้อมูล");
    expect(within(timeline).getByText(/ยอดขาย 42 วัน×แบรนด์ · JUNTAKARN 14 วัน/)).toBeTruthy();
    expect(within(timeline).getByText(/ระบบขาย 3 แถว · ระบบ TMK 2 เดือน/)).toBeTruthy();
    expect(within(timeline).getByText("เป้าเดือนนี้")).toBeTruthy();
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });

  it("เป้าล้มแต่ยอดเข้า = ขั้นยอดเสร็จ ขั้นเป้าไม่สำเร็จพร้อมเหตุผลไทย", async () => {
    salesSyncResult = { written: 42, jk: { written: 14, error: null }, goals: { written: 0, error: null }, jkGoals: { written: 0, error: "JK_GOAL_NO_PERMISSION" } };
    show();
    await settleAll();
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: /ดึงยอดขายเท่านั้น/ })); });
    const timeline = screen.getByLabelText("ความคืบหน้าการดึงข้อมูล");
    expect(within(timeline).getByText(/ไม่สำเร็จ · .*service role key/)).toBeTruthy();
    expect(within(timeline).getByRole("status").textContent).toContain("เป้าเดือนนี้");
  });
});

/* ขั้น "เป้า" ต้องไม่โกหก 2 แบบที่รีวิวจับได้
   ก) ยังไม่ได้ตั้งคีย์ JK = ยังไม่เคยยิงไปหา TMK เลย ห้ามขึ้นเขียวว่า "เดือนนี้ไม่มีใครตั้งเป้า"
   ข) รอบยอดขายล้ม = อ่านผลของขั้นเป้าไม่ได้ ห้ามบอกว่า "ไม่ได้ดึงเป้า" (เฟสเป้ารันไปก่อนแล้ว) */
describe("SyncStatusView — ขั้นเป้าไม่โกหก", () => {
  const settleAll = async () => {
    await settle("syncRuns", []); await settle("connections", []); await settle("recons", []);
    await settle("coverage", []); await settle("ticks", []); await settle("pipes", []);
    await settle("facts", []); await settleGoals([], []); await settle("oauth", { authorizations: [] });
  };
  const pullSales = async () => { await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: /ดึงยอดขายเท่านั้น/ })); }); };

  it("ยังไม่ได้ตั้งคีย์ระบบ TMK = บอกว่าข้ามไป ไม่ใช่ว่าไม่มีใครตั้งเป้า", async () => {
    salesSyncResult = { written: 42, jk: { written: 0, error: null }, goals: { written: 3, error: null }, jkGoals: { written: 0, error: null, skipped: "JK_NOT_CONFIGURED" } };
    show();
    await settleAll();
    await pullSales();
    const timeline = screen.getByLabelText("ความคืบหน้าการดึงข้อมูล");
    expect(within(timeline).getByText(/ระบบ TMK ยังไม่ได้ตั้งคีย์ — ข้ามไป/)).toBeTruthy();
    expect(within(timeline).queryByText(/ยังไม่มีใครตั้งเป้าในระบบต้นทาง/)).toBeNull();
  });

  it("รอบยอดขายล้ม = ขั้นเป้าบอกว่าไม่ทราบผล ไม่ใช่บอกว่าไม่ได้ดึง", async () => {
    const boom = new Error("SALES_READ_FAILED");
    const { apiClient } = await import("../src/foundation/data/apiClient.js");
    const original = apiClient.ads.salesSync;
    apiClient.ads.salesSync = async () => { throw boom; };
    try {
      show();
      await settleAll();
      await pullSales();
      const timeline = screen.getByLabelText("ความคืบหน้าการดึงข้อมูล");
      expect(within(timeline).getByText(/ไม่ทราบผลของขั้นเป้า/)).toBeTruthy();
      expect(within(timeline).queryByText(/ไม่ได้ดึงเป้า/)).toBeNull();
    } finally { apiClient.ads.salesSync = original; }
  });
});
