// @vitest-environment jsdom
/* หน้าต่างครีเอทีฟตัวเดียว (สเปก 2026-09-25) — ห้ามมี dialog ซ้อน · ‹ › เลื่อนชิ้น · อยู่ใน N แคมเปญ */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../src/modules/marketing/creatives/CreativeMedia.jsx", () => ({ CreativeMedia: ({ onPreview }) => <div data-testid="media" data-open={onPreview ? "yes" : "no"} /> }));
vi.mock("../src/modules/marketing/creatives/CreativePreview.jsx", () => ({ MetaPreviewPane: () => <div data-testid="meta-pane">iframe</div> }));
const { CreativeViewer } = await import("../src/modules/marketing/creatives/CreativeViewer.jsx");
afterEach(cleanup);

const asset = (status = "ACTIVE") => ({ provider: "meta", connectionId: "c1", adId: "11", status, statusAt: "2026-09-25T05:20:00Z", media: [], storyId: "1_2",
  copy: { headline: "หัวข้อ", primaryText: "ข้อความโฆษณาเต็มๆ ยาวมาก", callToAction: "MESSAGE_PAGE" } });
const row = (key, patch = {}) => ({ key, creative: `ชิ้น ${key}`, brand: "TEAMDEE", platform: "Meta Ads", campaigns: ["C1", "C2"], spend: 1000.555, ctr: 0.0304, frequency: 1.2, roas: 0.5,
  impressions: 103740, reach: 64037, clicks: 3154, cpm: 69.279, cpc: 2.278, ctrEarly: 0.0321, ctrLate: 0.0286, leads: 28, cpl: 256.648, resultLabel: "การสนทนาที่เริ่ม",
  purchases: 7, cpa: 1026.571, revenue: 500.2, linkClicks: 1276, linkCtr: 0.0123, linkCpc: 0.7841,
  action: "Stop", tone: "rose", why: "ROAS ต่ำ", asset: asset(),
  perCampaign: [{ campaign: "C1", spend: 800, impressions: 92110, leads: 4, cpl: 200, ctr: 0.03, linkCtr: 0.0111, adsets: ["หว่าน 25-45", "INT หน่วยงาน"], purchases: 1, roas: 0.4, status: "ACTIVE" }, { campaign: "C2", spend: 200.555, impressions: 0, leads: 0, cpl: null, ctr: null, purchases: null, roas: null, status: "CAMPAIGN_PAUSED" }], ...patch });
const rows = [row("a"), row("b"), row("c")];
const status = new Map([["C1", { key: "active", label: "เปิดอยู่", tone: "emerald", on: true }], ["C2", { key: "paused", label: "ปิดอยู่", tone: "zinc", on: false }]]);
const show = (props = {}) => render(<MemoryRouter><CreativeViewer rows={rows} index={0} onIndex={() => {}} onClose={() => {}} campaignStatus={status} {...props} /></MemoryRouter>);

describe("CreativeViewer", () => {
  it("dialog เดียว · ชื่อชิ้นงาน · ตำแหน่ง 1/3 · รูปในหน้าต่างไม่เปิดอะไรต่อ", () => {
    show();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "ชิ้น a" })).toBeTruthy();
    expect(screen.getByText("1 / 3")).toBeTruthy();
    expect(screen.getByTestId("media").dataset.open).toBe("no");
  });
  it("อยู่ใน N แคมเปญ: แถวละแคมเปญ · สถานะแคมเปญ + สถานะชิ้นในแคมเปญ · ตัวเลขตัดไม่ปัด · ไม่รู้ = —", () => {
    show();
    const section = screen.getByRole("region", { name: "อยู่ใน 2 แคมเปญ" });
    const rowsIn = within(section).getAllByRole("row").slice(1);
    expect(within(rowsIn[0]).getByText("C1")).toBeTruthy();
    expect(rowsIn[0].textContent).toContain("เปิดอยู่");
    expect(rowsIn[0].textContent).toContain("฿800.00");
    expect(rowsIn[0].textContent).toContain("92,110");
    expect(rowsIn[1].textContent).toContain("ปิดอยู่");
    expect(rowsIn[1].textContent).not.toContain("แคมเปญหยุด");        // สถานะคอลัมน์เดียว ไม่พูดซ้ำ (ตารางล้นขวาเห็นจริง 26 ก.ย.)
    expect(rowsIn[1].textContent).toContain("฿200.55");
    expect(rowsIn[1].textContent).toContain("—");
    expect(within(rowsIn[0]).getByRole("link", { name: "C1" }).getAttribute("href")).toBe("/mkt/campaigns?open=C1");
    expect(rowsIn[0].textContent).toContain("หว่าน 25-45 · INT หน่วยงาน");      // ชุดโฆษณาเป็นบรรทัดรองใต้ชื่อแคมเปญ
    expect(rowsIn[0].textContent).toContain("1.11%");                          // CTR ลิงก์รายแคมเปญ
    expect(within(section).getByRole("columnheader", { name: "CTR ลิงก์" })).toBeTruthy();
  });
  it("แคมเปญเปิดแต่ชิ้นนี้ปิด = บอกเพิ่มว่า 'ชิ้นนี้ปิด' (กรณีเดียวที่สถานะชิ้นให้ข้อมูลเพิ่ม)", () => {
    render(<MemoryRouter><CreativeViewer rows={[row("p", { perCampaign: [{ campaign: "C1", spend: 1, impressions: 1, leads: 0, status: "PAUSED" }] })]} index={0} onIndex={() => {}} onClose={() => {}} campaignStatus={status} /></MemoryRouter>);
    const r = within(screen.getByRole("region", { name: "อยู่ใน 1 แคมเปญ" })).getAllByRole("row")[1];
    expect(r.textContent).toContain("เปิดอยู่");
    expect(r.textContent).toContain("ชิ้นนี้ปิด");
  });
  it("‹ › และลูกศรคีย์บอร์ดเปลี่ยนชิ้น · สุดขอบปุ่มกดไม่ได้", () => {
    const onIndex = vi.fn();
    show({ onIndex });
    expect(screen.getByRole("button", { name: "ชิ้นก่อนหน้า" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "ชิ้นถัดไป" }));
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onIndex).toHaveBeenCalledWith(1);
    expect(onIndex).toHaveBeenCalledTimes(2);
  });
  it("ปุ่มตัวอย่างจาก Meta สลับกรอบรูปเป็นตัวอย่างในหน้าต่างเดิม (ไม่มี dialog ที่สอง) · ดูไม่ได้ = ไม่มีปุ่ม", () => {
    const { unmount } = show({ canPreview: true });
    fireEvent.click(screen.getByRole("button", { name: "ตัวอย่างจาก Meta" }));
    expect(screen.getByTestId("meta-pane")).toBeTruthy();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "กลับไปดูภาพ" }));
    expect(screen.getByTestId("media")).toBeTruthy();
    unmount();
    show({ canPreview: false });
    expect(screen.queryByRole("button", { name: "ตัวอย่างจาก Meta" })).toBeNull();
  });
  /* อาร์ตเคาะ 25 ก.ย.: หน้าต่างต้องแสดงข้อมูลละเอียด — 3 กลุ่ม การใช้เงิน · การเข้าถึง · ผลลัพธ์ */
  it("ตัวเลขละเอียดครบ 3 กลุ่ม · ตัดทศนิยมไม่ปัด · ไม่รู้ = —", () => {
    show();
    const group = (name) => screen.getByRole("group", { name });
    expect(group("การใช้เงิน").textContent).toMatch(/฿1,000\.55.*฿69\.27.*฿2\.27/);
    // สเปก 2026-09-26: คลิกลิงก์ · CTR ลิงก์ · CPC ลิงก์ ก่อน · CTR ทั้งหมดยังอยู่ (ฐานกฎเริ่มล้า)
    expect([...group("การเข้าถึง").querySelectorAll("dt")].map((n) => n.textContent))
      .toEqual(["การแสดงผล", "เข้าถึง (รวมรายวัน)", "ความถี่", "คลิกลิงก์", "CTR ลิงก์", "CPC ลิงก์", "CTR ทั้งหมด", "CTR ทั้งหมด ครึ่งแรก → หลัง"]);
    expect(group("การเข้าถึง").textContent).toMatch(/103,740.*64,037.*1\.20×.*1,276.*1\.23%.*฿0\.78.*3\.04%.*3\.21% → 2\.86%/);
    expect(group("ผลลัพธ์").textContent).toMatch(/การสนทนาที่เริ่ม.*28.*฿256\.64.*7.*฿1,026\.57.*฿500\.20.*0\.50×/);
    const blank = render(<MemoryRouter><CreativeViewer rows={[row("z", { purchases: null, cpa: null, revenue: null })]} index={0} onIndex={() => {}} onClose={() => {}} /></MemoryRouter>);
    expect(within(blank.container).getByRole("group", { name: "ผลลัพธ์" }).textContent).toContain("—");
  });
  it("ไม่รู้สถานะ = ไม่โชว์เวลาที่อ่าน (เวลานั้นเป็นรอบรีเฟรชรูป ไม่ใช่สถานะ)", () => {
    render(<MemoryRouter><CreativeViewer rows={[row("x", { asset: asset(null) })]} index={0} onIndex={() => {}} onClose={() => {}} /></MemoryRouter>);
    // สเปก 2026-09-26: ไม่รู้ = ไม่ขึ้นป้ายและไม่ขึ้นบรรทัดเทคนิค "จะมากับรอบดึงตี 5"
    expect(document.querySelector(".cv-state")).toBeNull();
    expect(document.body.textContent).not.toMatch(/ตี 5|ยังไม่มีสถานะจาก Meta/);
  });
  it("ข้อความโฆษณายาวถูกย่อ มีปุ่มอ่านทั้งหมด (ส่วนแคมเปญต้องไม่จมใต้ข้อความ)", () => {
    const long = Array.from({ length: 12 }, (_, i) => `บรรทัด ${i + 1}`).join("\n");
    render(<MemoryRouter><CreativeViewer rows={[row("x", { asset: { ...asset(), copy: { primaryText: long } } })]} index={0} onIndex={() => {}} onClose={() => {}} /></MemoryRouter>);
    const text = screen.getByText(/บรรทัด 1/);
    expect(text.className).toBe("is-clamped");
    fireEvent.click(screen.getByRole("button", { name: "อ่านทั้งหมด" }));
    expect(text.className).toBe("");
  });
  it("Esc ปิด · ข้อความโฆษณาเต็ม · คำแนะนำภาษาไทย", () => {
    const onClose = vi.fn();
    show({ onClose });
    expect(screen.getByText("ข้อความโฆษณาเต็มๆ ยาวมาก")).toBeTruthy();
    expect(screen.getByText("ควรหยุด")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

/* 26 ก.ย.: เหตุผลกฎเต็มอยู่ในหน้าต่าง (การ์ดเหลือบรรทัดเดียว) */
describe("CreativeViewer — ผลกฎ", () => {
  it("ส่ง ruleOf มา = แสดงผลกฎพร้อมเหตุผลเต็ม · ไม่ส่ง = ไม่มีส่วนผลกฎ", () => {
    const ruleOf = () => ({ status: "pass", text: "ROAS 2.18× ถึงเกณฑ์ 1.00× · CTR 4.28% ถึงเกณฑ์ 3.00%" });
    show({ ruleOf });
    const part = screen.getByRole("group", { name: "ผลกฎ" });
    expect(part.textContent).toContain("ผ่านกฎ");
    expect(part.textContent).toContain("CTR 4.28% ถึงเกณฑ์ 3.00%");
    cleanup();
    show();
    expect(screen.queryByRole("group", { name: "ผลกฎ" })).toBeNull();
  });
});

/* 26 ก.ย. อาร์ตเคาะ: สถานะในตารางแคมเปญใช้ตัวอ่านเดียวกับหน้าแคมเปญ (ท้ายชื่อ เปิด/CLS) · ไม่รู้ = ไม่ขึ้น "ไม่ทราบสถานะ" */
describe("CreativeViewer — สถานะในตารางแคมเปญ", () => {
  const per = (campaign) => ({ campaign, spend: 100, impressions: 1000, leads: 1, cpl: 100, ctr: 0.01, linkCtr: 0.005, purchases: null, roas: null, status: null });
  it("Meta ไม่บอก → อ่านจากท้ายชื่อ พร้อมบอกว่าตามชื่อ · ไม่มีท้ายชื่อ = ว่าง", () => {
    const r = row("n", { asset: asset(null), perCampaign: [per("JD1 | NEW | IB | VDOปัง | 29/8 | CLS"), per("Always-on")] });
    render(<MemoryRouter><CreativeViewer rows={[r]} index={0} onIndex={() => {}} onClose={() => {}} /></MemoryRouter>);
    const [first, second] = within(screen.getByRole("region", { name: "อยู่ใน 2 แคมเปญ" })).getAllByRole("row").slice(1);
    expect(first.textContent).toContain("ปิดอยู่ (ตามชื่อ)");
    expect(second.textContent).not.toContain("ไม่ทราบสถานะ");
  });
});

/* ชุด B ข้อ 16: หน้าต่างครีเอทีฟขัง focus และคืน focus ตอนปิด */
describe("CreativeViewer — focus", () => {
  it("Tab วนในหน้าต่าง · ปิดแล้ว focus กลับตัวที่เปิด", () => {
    const opener = document.createElement("button"); opener.textContent = "เปิด"; document.body.appendChild(opener); opener.focus();
    const onClose = vi.fn();
    const view = render(<MemoryRouter><CreativeViewer rows={rows} index={0} onIndex={() => {}} onClose={onClose} campaignStatus={status} /></MemoryRouter>);
    const dialog = screen.getByRole("dialog");
    const items = [...dialog.querySelectorAll("button:not([disabled]), a[href], input, [tabindex]:not([tabindex='-1'])")];
    items.at(-1).focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(items[0]);
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
