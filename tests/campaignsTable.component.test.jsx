// @vitest-environment jsdom
/* ตารางแคมเปญ — ระดับหน้าจอ (หน้าที่ทีมเปิดบ่อยสุด)
   ใช้ข้อมูลผ่านท่อจริง campaignRows → withSpendShare → campaignDecision เหมือน CampaignsView
   จึงจับได้ทั้งตอนตารางพัง และตอนที่ท่อข้อมูลเปลี่ยนรูปจนตารางแสดงผิด
   กราฟถูกแทนด้วยของปลอม: Chart.js ต้องมี canvas จริงและ ThemeContext ซึ่งไม่ใช่สิ่งที่เทสนี้ตรวจ */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../src/modules/marketing/dash/charts/ChartBox.jsx", () => ({
  ChartBox: ({ ariaLabel }) => <div data-testid="chart" aria-label={ariaLabel} />,
}));

const { CampaignsTable } = await import("../src/modules/marketing/campaigns/CampaignsTable.jsx");
const { audienceRows, campaignRows, campaignDecision, withSpendShare } = await import("../src/modules/marketing/adsCampaigns.js");

afterEach(cleanup);
beforeAll(() => { window.scrollTo = () => {}; });   // ลิ้นชักคืนตำแหน่ง scroll ตอนปิด — jsdom ไม่มีเมธอดนี้

const RANGE = { start: "2026-07-01T00:00:00.000Z", end: "2026-07-16T00:00:00.000Z" };
const PREV = { start: "2026-06-16T00:00:00.000Z", end: "2026-07-01T00:00:00.000Z" };
const BRANDS = [{ id: "b_td", name: "TEAMDEE" }];
const card = (id, day, over = {}) => ({
  id, track: "project", status: "measured", brand_id: "b_td", archived: true,
  campaign: "Always-on — คนเคยทัก", creative: "ชิ้น A",
  brief: { channels: ["Facebook"], publish_at: null },
  metrics: {
    spend: 1000, leads: 4, revenue: 3000, impressions: 20_000, clicks: 300, reach: 10_000,
    measured_at: `2026-07-${String(day).padStart(2, "0")}T09:00:00.000Z`,
  },
  ...over,
});
const cards = [
  card("a1", 3), card("a2", 5),
  card("a3", 8, { campaign: "Prospecting — กลุ่มใหม่", metrics: { ...card("x", 8).metrics, spend: 2000, leads: 0 } }),
];
const campaignBudgets = [
  { brand_id: "b_td", channel: "Meta Ads", campaign: "Always-on — คนเคยทัก", month: "2026-07", share: 0.6, objective: "messages", status: "active" },
  { brand_id: "b_td", channel: "Meta Ads", campaign: "Prospecting — กลุ่มใหม่", month: "2026-07", share: 0.4, objective: "leads", status: "active" },
];

const buildRows = () => withSpendShare(campaignRows(cards, RANGE, {
  brands: BRANDS, adBudgets: [{ brand_id: "b_td", channel: "Facebook", month: "2026-07", amount: 10_000 }],
  campaignBudgets, today: "2026-07-15", prevRange: PREV,
})).map((row) => ({ ...row, decision: campaignDecision(row, null) }));

const show = (props = {}) => render(
  <CampaignsTable
    rows={buildRows()} compareLabel="ช่วงก่อนหน้า" revenueLabel="ยอดรวม"
    renderDetail={(row) => <p>รายละเอียดของ {row.name}</p>} {...props}
  />,
);

describe("CampaignsTable — สิ่งที่เห็นบนหน้าจอ", () => {
  it("ขึ้นครบทุกแคมเปญพร้อมจำนวนรายการ", () => {
    show();
    expect(screen.getByRole("heading", { name: "รายการแคมเปญ" })).toBeTruthy();
    expect(screen.getByText("2 รายการ")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Always-on — คนเคยทัก" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Prospecting — กลุ่มใหม่" })).toBeTruthy();
  });

  /* 26 ก.ย. อาร์ตสั่งลบกล่องสรุป 3 ใบ (ค่าแอด/ผลลัพธ์/ยอดขาย) — ตัวเลขรวมอยู่ในหน้าภาพรวมแล้ว */
  it("ไม่มีกล่องสรุปเหนือรายการ", () => {
    const { container } = show();
    expect(container.querySelector(".cp-summary")).toBeNull();
  });

  it("ค่าที่ยังไม่รู้ขึ้น — ไม่ใช่ 0 (แคมเปญที่ยังไม่มีผลลัพธ์ต้องไม่ดูเหมือน CPL เป็นศูนย์)", () => {
    const { container } = show();
    const rows = [...container.querySelectorAll(".cp-campaign")];
    const prospecting = rows.find((row) => row.textContent.includes("Prospecting"));
    expect(prospecting.querySelector('[data-label="CPL"] b').textContent).toBe("—");
  });

  it("เลขบนแท็บกลุ่มตรงกับจำนวนรายการที่กดแล้วได้จริง ทุกกลุ่ม", () => {
    const { container } = show();
    const tabs = screen.getAllByRole("tab").filter((tab) => tab.closest(".cp-views"));
    expect(tabs.length).toBeGreaterThan(1);
    for (const tab of tabs) {
      const badge = Number(tab.querySelector("b").textContent);
      fireEvent.click(tab);
      expect(tab.getAttribute("aria-selected")).toBe("true");
      expect(container.querySelectorAll(".cp-campaign").length).toBe(badge);
    }
  });

  it("กดชิปกลุ่มซ้ำที่อันเดิม = กลับมาทั้งหมด (ปุ่มสลับ ไม่ใช่ทางเดียว)", () => {
    const { container } = show();
    const tab = screen.getAllByRole("tab").find((t) => t.closest(".cp-views") && !t.textContent.startsWith("ทั้งหมด"));
    fireEvent.click(tab);
    expect(tab.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tab);
    expect(container.querySelectorAll(".cp-campaign").length).toBe(2);
  });

  it("กดปุ่มขยายแล้วเปิดลิ้นชักรายละเอียด และปิดได้", () => {
    show();
    const expand = screen.getByRole("button", { name: /ดูรายละเอียด Always-on/ });
    expect(expand.getAttribute("aria-haspopup")).toBe("dialog");   // แผงเป็น dialog (ชุด B) ไม่ใช่กางในแถว
    fireEvent.click(expand);
    expect(screen.getByText("รายละเอียดของ Always-on — คนเคยทัก")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: /รายละเอียด Always-on/ })).toBeTruthy();
    // ชื่อ "ปิดรายละเอียด" ต้องมีปุ่มเดียว — พื้นหลังเป็นแค่พื้นที่กดของเมาส์ ไม่ควรถูกอ่านซ้ำ
    expect(screen.getAllByRole("button", { name: "ปิดรายละเอียด" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "ปิดรายละเอียด" }));
    expect(screen.queryByText("รายละเอียดของ Always-on — คนเคยทัก")).toBeNull();
  });

  /* รื้อ 26 ก.ย.: หัวแผงมีสถานะแคมเปญ + ‹ n/N › ไปแคมเปญถัดไปได้ไม่ต้องปิด (ภาษาเดียวกับหน้าต่างครีเอทีฟ) */
  it("หัวแผง: สถานะแคมเปญ · ‹ › ไปแคมเปญถัดไปโดยไม่ต้องปิด", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /ดูรายละเอียด Always-on/ }));
    const drawer = screen.getByRole("dialog", { name: /รายละเอียด Always-on/ });
    expect(within(drawer).getByText("1 / 2")).toBeTruthy();
    expect(drawer.querySelector(".cv-pill")).toBeTruthy();                       // fixture มี status active จากงบแคมเปญ = รู้สถานะ
    fireEvent.click(within(drawer).getByRole("button", { name: "แคมเปญถัดไป" }));
    expect(screen.getByRole("dialog", { name: /รายละเอียด Prospecting/ })).toBeTruthy();
  });

  it("กดพื้นหลังก็ปิดลิ้นชักได้ (คนใช้เมาส์คาดหวังแบบนี้)", () => {
    const { container } = show();
    fireEvent.click(screen.getByRole("button", { name: /ดูรายละเอียด Always-on/ }));
    const backdrop = container.querySelector(".cp-drawer-backdrop");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(container.querySelector(".cp-drawer")).toBeNull();
  });

  it("ไม่มีแคมเปญ: บอกสาเหตุต่างกันระหว่างกรองไม่เจอ กับไม่มีข้อมูลในช่วงนั้นเลย", () => {
    const filtered = show({ rows: [] });
    expect(screen.getByText("ไม่พบแคมเปญตามตัวกรองนี้")).toBeTruthy();
    filtered.unmount();
    show({ rows: [], scopeEmpty: true });
    expect(screen.getByText("ไม่มีข้อมูลแคมเปญในช่วงเวลาหรือช่องทางนี้")).toBeTruthy();
  });
});

/* รื้อ 26 ก.ย. (อาร์ต: "ให้สอดคล้องกับระบบหรือข้อมูลที่มี") — ข้อมูลจริง 20/20 แถวขึ้น "ยังไม่ตั้งงบ · ไม่ระบุเป้าหมาย · เทียบไม่ได้" ซ้ำทุกแถว
   ตารางใหม่: ไม่ขึ้นช่องที่ไม่มีข้อมูล · CPL เทียบค่าเฉลี่ยแบรนด์ · ROAS เฉพาะที่ Meta เห็นยอด · สถานะจากท้ายชื่อ · ป้ายเฉพาะข้อยกเว้น */
describe("CampaignsTable — ตารางตามข้อมูลที่มีจริง", () => {
  const bare = () => withSpendShare(campaignRows(cards, RANGE, { brands: BRANDS, adBudgets: [], campaignBudgets: [], today: "2026-07-15" }))
    .map((row) => ({ ...row, decision: campaignDecision(row, null, undefined, { roasFromMeta: false }) }));
  const rowOf = (container, name) => [...container.querySelectorAll(".cp-campaign")].find((r) => r.textContent.includes(name));

  it("ไม่มีงบ/เป้าหมาย/สถานะ/ช่วงเทียบ = ไม่ขึ้นข้อความแทนที่ว่าง และไม่มีคอลัมน์งบ", () => {
    const { container } = show({ rows: bare() });
    for (const text of ["ยังไม่ตั้งงบ", "ไม่ระบุเป้าหมาย", "ไม่ทราบสถานะ", "เทียบไม่ได้"]) expect(container.textContent).not.toContain(text);
    expect(container.querySelector(".cp-list-labels").textContent).not.toContain("งบเดือน");
  });
  it("มีแถวที่ตั้งงบ = คอลัมน์งบกลับมา", () => {
    const { container } = show();
    expect(container.querySelector(".cp-list-labels").textContent).toContain("งบเดือน / จังหวะ");
  });
  it("CPL เทียบค่าเฉลี่ยแบรนด์ในแถว (ตัดไม่ปัด)", () => {
    const { container } = show({ rows: bare() });
    const cell = rowOf(container, "Always-on").querySelector('[data-label="CPL"]');
    expect(cell.querySelector("b").textContent).toBe("฿250.00");
    expect(cell.textContent).toContain("ถูกกว่าเฉลี่ย 50.00%");
    expect(cell.querySelector("small").className).toContain("good");
  });
  it("ROAS ขึ้นใต้ชื่อเฉพาะแคมเปญที่ Meta เห็นยอดขาย (≥ 1x) · แคมเปญทักแชท ROAS 0.1x ไม่ขึ้น", () => {
    const rows = bare().map((r) => (r.name.startsWith("Prospecting") ? { ...r, roas: 0.1 } : r));
    const { container } = show({ rows });
    expect(rowOf(container, "Always-on").textContent).toContain("Meta เห็นยอดขาย · ROAS 3.00×");
    expect(rowOf(container, "Prospecting").textContent).not.toContain("ROAS");
  });
  it("สถานะจากท้ายชื่อ บอกว่าอ่านจากชื่อ", () => {
    const rows = bare().map((r, i) => (i === 0 ? { ...r, name: "JD1 | RE | PIC | CLS" } : r));
    const { container } = show({ rows });
    expect(rowOf(container, "JD1 | RE").textContent).toContain("ปิดอยู่ (ตามชื่อ)");
  });
  /* ทดสอบแบบใช้งานจริง 27 ก.ย.: ช่องว่างอ่านเหมือนข้อมูลหาย → เขียน "ปกติ" สีจาง (เหตุผลอยู่ใน title) */
  it("ติดตาม = 'ปกติ' สีจาง · ป้ายจากค่าเฉลี่ยบอกสิ่งที่ควรทำ ไม่พูดซ้ำตัวเลขในช่อง CPL", () => {
    const rows = bare().map((r, i) => (i === 0
      ? { ...r, decision: { tag: "good", label: "ต้นทุนดี", tone: "emerald", why: "CPL ถูกกว่าเฉลี่ย", next: "ดูยอดขายของแบรนด์ก่อนเติมงบ", basis: "average" } }
      : { ...r, decision: { tag: "watch", label: "ติดตาม", tone: "zinc", why: "x", next: "y" } }));
    const { container } = show({ rows });
    const [first, second] = [...container.querySelectorAll(".cp-decision")];
    expect(first.textContent).toBe("ต้นทุนดีดูยอดขายของแบรนด์ก่อนเติมงบ");
    expect(second.textContent).toBe("ปกติ");
    expect(second.querySelector(".cp-decision-quiet").getAttribute("title")).toBe("x");
  });
  it("ชิปกลุ่มที่เป็น 0 ไม่ขึ้น (ยกเว้น ทั้งหมด) และไม่มีการ์ด 'วันนี้ต้องดู' ซ้ำด้านบน", () => {
    const { container } = show({ rows: bare() });
    const tabs = [...container.querySelectorAll(".cp-views [role=tab]")];
    expect(tabs[0].textContent).toContain("ทั้งหมด");
    for (const tab of tabs.slice(1)) expect(Number(tab.querySelector("b").textContent)).toBeGreaterThan(0);
    expect(container.querySelector(".cp-focus")).toBeNull();
  });
});

/* 26 ก.ย. (สเปก campaign-page-audience): สลับมุม แคมเปญ | กลุ่มเป้าหมาย · CTR ลิงก์ · ความถี่ แสดงตลอด · สถานะโหลด */
describe("CampaignsTable — มุมกลุ่มเป้าหมาย", () => {
  const withSet = cards.map((c, i) => ({ ...c, ad_group: i < 2 ? "หว่าน | 30-55" : "RETARGET" }));
  const audiences = audienceRows(withSet, RANGE, { brands: BRANDS });
  const labels = (container) => container.querySelector(".cp-list-labels").textContent;

  it("ปุ่มสลับ [แคมเปญ | กลุ่มเป้าหมาย] แทนปุ่มงานวันนี้/ตัวเลขละเอียด · คอลัมน์ CTR ลิงก์ · ความถี่ แสดงตลอด", () => {
    const { container } = show({ audiences });
    expect(screen.queryByRole("button", { name: "ตัวเลขละเอียด" })).toBeNull();
    const camp = screen.getByRole("button", { name: "แคมเปญ" });
    expect(camp.getAttribute("aria-pressed")).toBe("true");
    expect(labels(container)).toContain("CTR ลิงก์ · ความถี่");
  });
  it("มุมกลุ่มเป้าหมาย: หนึ่งแถวต่อกลุ่ม · บอกจำนวนแคมเปญ · กางดูแคมเปญข้างใน · กดชื่อแคมเปญ = เปิดแผงแคมเปญนั้น", () => {
    const { container } = show({ audiences });
    fireEvent.click(screen.getByRole("button", { name: "กลุ่มเป้าหมาย" }));
    expect(screen.getByRole("button", { name: "กลุ่มเป้าหมาย" }).getAttribute("aria-pressed")).toBe("true");
    expect(labels(container)).toContain("กลุ่มเป้าหมาย");
    const row = screen.getByRole("heading", { name: "หว่าน | 30-55" }).closest(".cp-campaign");
    expect(row.textContent).toContain("1 แคมเปญ");
    fireEvent.click(within(row).getByRole("button", { name: /ดูแคมเปญใน หว่าน/ }));
    fireEvent.click(within(row).getByRole("button", { name: "Always-on — คนเคยทัก" }));
    expect(screen.getByRole("dialog", { name: /รายละเอียด Always-on/ })).toBeTruthy();
  });
  it("กำลังโหลด = บอกว่ากำลังโหลด ไม่ขึ้นข้อความไม่มีข้อมูล ไม่ขึ้นชิป", () => {
    const { container } = show({ rows: [], loading: true, scopeEmpty: true });
    expect(screen.getByRole("status").textContent).toContain("กำลังโหลดแคมเปญ");
    expect(container.textContent).not.toContain("ไม่มีข้อมูลแคมเปญ");
    expect(container.querySelector(".cp-views")).toBeNull();
  });
});

/* ชุด A ข้อ 5: โหลดพัง = บอกตรงๆ + ลองใหม่ — ห้ามขึ้น "ไม่มีข้อมูลแคมเปญ" (อ่านแล้วเข้าใจว่าเดือนนี้ไม่ได้ยิงแอด) */
describe("CampaignsTable — โหลดไม่สำเร็จ", () => {
  it("ไม่ขึ้นข้อความไม่มีข้อมูล · มีปุ่มลองใหม่", () => {
    const retry = vi.fn();
    const { container } = show({ rows: [], scopeEmpty: true, loadError: true, loadErrorText: "อ่านยอดขายไม่สำเร็จ", onRetry: retry });
    expect(container.textContent).not.toContain("ไม่มีข้อมูลแคมเปญ");
    expect(container.textContent).toContain("โหลดตัวเลขไม่สำเร็จ · อ่านยอดขายไม่สำเร็จ");   // เหตุผลเฉพาะย้ายมาจากแถบบน (ทดสอบละเอียดรอบ 2)
    fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(retry).toHaveBeenCalled();
  });
});

/* ชุด B ข้อ 16–17 (ตรวจรอบละเอียด 26 ก.ย.): แผงแคมเปญเป็น dialog จริง · กดแถวเปิดได้ · ลิงก์ ?open= ใช้ได้ทุกครั้ง */
describe("แผงแคมเปญ — คีย์บอร์ดและลิงก์", () => {
  const open = () => { const btn = screen.getByRole("button", { name: /ดูรายละเอียด Always-on/ }); btn.focus(); fireEvent.click(btn); return btn; };
  it("เป็น dialog · focus เข้าแผง · Esc ปิด · ปิดแล้ว focus กลับปุ่มเดิม", () => {
    show();
    const trigger = open();
    const dialog = screen.getByRole("dialog", { name: /Always-on/ });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("Tab วนอยู่ในแผง (ตัวสุดท้าย → ตัวแรก · Shift+Tab ตัวแรก → ตัวสุดท้าย)", () => {
    show();
    open();
    const dialog = screen.getByRole("dialog");
    const items = [...dialog.querySelectorAll("button:not([disabled]), a[href], input, [tabindex]:not([tabindex='-1'])")];
    items.at(-1).focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(items.at(-1));
  });
  it("กดที่ไหนในแถวก็เปิดแผงได้ (ไม่ต้องเล็งปุ่มลูกศรเล็กๆ ท้ายแถว)", () => {
    const { container } = show();
    fireEvent.click([...container.querySelectorAll(".cp-campaign-row")].find((r) => r.textContent.includes("Always-on")));
    expect(screen.getByRole("dialog", { name: /Always-on/ })).toBeTruthy();
  });
  it("ลิงก์ ?open= ที่เปลี่ยนภายหลัง (จากหน้าต่างครีเอทีฟ) เปิดแคมเปญใหม่ได้ทุกครั้ง", () => {
    const view = show({ initialOpenName: "Always-on — คนเคยทัก" });
    expect(screen.getByRole("dialog", { name: /Always-on/ })).toBeTruthy();
    view.rerender(<CampaignsTable rows={buildRows()} compareLabel="ช่วงก่อนหน้า" revenueLabel="ยอดรวม" renderDetail={(row) => <p>รายละเอียดของ {row.name}</p>} initialOpenName="Prospecting — กลุ่มใหม่" />);
    expect(screen.getByRole("dialog", { name: /Prospecting/ })).toBeTruthy();
  });
});

/* ชุด C (ข้อเล็ก): ชื่อที่ถูกตัดท้ายต้องชี้แล้วอ่านเต็มได้ */
it("ชื่อแคมเปญที่อาจถูกตัดมี title ให้อ่านเต็ม", () => {
  const { container } = show();
  const h3 = container.querySelector(".cp-campaign-name h3");
  expect(h3.getAttribute("title")).toBe(h3.textContent);
});

/* ทดสอบละเอียด 27 ก.ย.: ลิงก์ ?open= ไปแคมเปญเดิมเป็นครั้งที่สองเงียบ — จำชื่อที่เปิดแล้วไว้ และ open ค้างในลิงก์ (รีโหลดแล้วแผงเด้งเอง) */
it("ปิดแผงที่เปิดจากลิงก์ = ล้าง open ในลิงก์ · ลิงก์เดิมครั้งถัดไปเปิดได้อีก", () => {
  const cleared = [];
  const props = (name) => ({ rows: buildRows(), compareLabel: "ช่วงก่อนหน้า", revenueLabel: "ยอดรวม", renderDetail: (row) => <p>รายละเอียดของ {row.name}</p>, initialOpenName: name, onOpenHandled: () => cleared.push(true) });
  const view = render(<CampaignsTable {...props("Always-on — คนเคยทัก")} />);
  fireEvent.click(screen.getByRole("button", { name: "ปิดรายละเอียด" }));
  expect(cleared).toHaveLength(1);
  view.rerender(<CampaignsTable {...props("")} />);
  view.rerender(<CampaignsTable {...props("Always-on — คนเคยทัก")} />);
  expect(screen.getByRole("dialog", { name: /Always-on/ })).toBeTruthy();
});

/* ทดสอบแบบผู้ใช้จริง: เดิมใช้สามแบบ "แพงกว่า 1.92 เท่า" · "สูงกว่า 21.37%" · "ถูกกว่า 45.12%" — หน่วยสลับกลางคอลัมน์ */
import { cplCompare } from "../src/modules/marketing/campaigns/CampaignsTable.jsx";
it("เทียบเฉลี่ยแบรนด์ใช้ % ทิศเดียวกันทุกระดับ: แพงกว่า / ถูกกว่า", () => {
  expect(cplCompare(1.92).text).toBe("แพงกว่าเฉลี่ย 92.00%");
  expect(cplCompare(1.2137).text).toBe("แพงกว่าเฉลี่ย 21.37%");
  expect(cplCompare(0.5488).text).toBe("ถูกกว่าเฉลี่ย 45.12%");
  expect(cplCompare(0.9).text).toBe("ถูกกว่าเฉลี่ย 10.00%");
});

/* ทดสอบแบบผู้ใช้จริง: "6.69% ของรายการ" — กรองเหลือ 17 แถวก็ยังเป็นสัดส่วนของค่าแอดทั้งหมด คำว่า "รายการ" ชวนเข้าใจผิด */
it("สัดส่วนค่าแอดบอกว่าเทียบกับค่าแอดทั้งหมด", () => {
  const { container } = show();
  expect(container.textContent).toContain("ของค่าแอดทั้งหมด");
  expect(container.textContent).not.toContain("ของรายการ");
});
