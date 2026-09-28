// @vitest-environment jsdom
/* แผงรายละเอียดแคมเปญ รื้อใหม่ (อาร์ตสั่ง 26 ก.ย.) — ภาษาเดียวกับหน้าต่างครีเอทีฟ:
   คำแนะนำสีตามความหมาย · ความพร้อมเป็นชิป · ตัวเลขละเอียด 3 กลุ่มพร้อมเทียบช่วงก่อน · การ์ดครีเอทีฟ (อาร์ตบอกดีมาก) */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../src/modules/marketing/dash/charts/ChartBox.jsx", () => ({ ChartBox: ({ ariaLabel }) => <div data-testid="chart" aria-label={ariaLabel} /> }));
vi.mock("../src/modules/marketing/creatives/CreativeMedia.jsx", () => ({ CreativeMedia: () => <div data-testid="media" /> }));
const { CampaignDetail } = await import("../src/modules/marketing/campaigns/CampaignDetail.jsx");
const { campaignRows, campaignDecision } = await import("../src/modules/marketing/adsCampaigns.js");
afterEach(cleanup);

const RANGE = { start: "2026-07-01T00:00:00.000Z", end: "2026-07-16T00:00:00.000Z" };
const PREV = { start: "2026-06-16T00:00:00.000Z", end: "2026-07-01T00:00:00.000Z" };
const card = (id, day, over = {}) => ({ id, track: "project", status: "measured", brand_id: "b_td", archived: true,
  campaign: "Always-on", creative: "ชิ้น A", brief: { channels: ["Facebook"], publish_at: null },
  metrics: { spend: 1000, leads: 4, revenue: 3000, impressions: 20_000, clicks: 300, reach: 10_000, measured_at: `2026-${day}T09:00:00.000Z` }, ...over });
const rows = campaignRows([card("a", "07-03"), card("b", "07-05"), card("c", "07-08"), card("p", "06-20", { metrics: { ...card("x", "06-20").metrics, spend: 500, leads: 5 } })],
  RANGE, { brands: [{ id: "b_td", name: "TEAMDEE" }], today: "2026-07-15", prevRange: PREV })
  .map((r) => ({ ...r, decision: campaignDecision(r) }));
const show = () => render(<MemoryRouter><CampaignDetail row={rows[0]} compareLabel="ช่วงก่อนหน้า" /></MemoryRouter>);

/* รื้อรอบ 2 (26 ก.ย. อาร์ต: "อ่านยาก") — ตัวเลขหลัก 4 ช่องใหญ่ · คำแนะนำแถบเดียว · ตัวเลขรองเป็นรายการ ป้าย—ค่า · ไม่โชว์ค่าที่ไม่รู้ */
describe("CampaignDetail (รื้อรอบ 2)", () => {
  it("ตัวเลขหลัก 4 ช่อง: ค่าแอด · ผลลัพธ์ · CPL · ความถี่ พร้อมเทียบช่วงก่อนใต้ตัวเลข · ตัดไม่ปัด (อาร์ตเคาะช่อง 4 = ความถี่ 26 ก.ย.)", () => {
    show();
    const kpi = screen.getByRole("group", { name: "ตัวเลขหลัก" });
    const tiles = [...kpi.querySelectorAll(".cd-kpi")].map((t) => t.textContent);
    expect(tiles[0]).toMatch(/ค่าแอด.*฿3,000\.00.*▲ 500\.00%/);
    expect(tiles[1]).toMatch(/ผลลัพธ์.*12/);
    expect(tiles[2]).toMatch(/CPL.*฿250\.00.*(ดีขึ้น|แย่ลง)/);
    expect(tiles[3]).toMatch(/ความถี่.*2\.00×/);
    expect(kpi.textContent).not.toContain("ROAS");
  });
  it("คำแนะนำแถบเดียว สีตามความหมาย · พร้อมตัดสินใจแล้ว = ไม่มีบรรทัดความพร้อม (บรรทัดเทคนิค — สเปก 2026-09-26)", () => {
    const { container } = show();
    const advice = container.querySelector(".cd-advice");
    expect(advice.className).toContain(`cd-advice--${rows[0].decision.tone}`);
    expect(advice.textContent).toContain(rows[0].decision.label);
    expect(advice.textContent).toContain(rows[0].decision.next);
    expect(container.querySelector(".cd-advice-ready")).toBeNull();
  });
  it("ตัวเลขรองเป็นรายการ ป้าย—ค่า 3 กลุ่ม · ไม่มีงบ = ไม่ขึ้นแถวงบ (ไม่โชว์ 'ยังไม่ตั้ง' / —)", () => {
    show();
    const reach = screen.getByRole("group", { name: "การเข้าถึง" });
    // ไม่มี link_clicks = ไม่ขึ้นแถวลิงก์ (ไม่เดา) · ความถี่ย้ายไปช่องหลัก
    expect([...reach.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["การแสดงผล60,000", "เข้าถึง (รวมรายวัน)30,000", "CTR ทั้งหมด1.50%"]);
    const spend = screen.getByRole("group", { name: "การใช้เงิน" });
    expect(spend.textContent).not.toMatch(/งบเดือน|ยังไม่ตั้ง/);
    expect(screen.getByRole("group", { name: "ผลลัพธ์" }).textContent).toMatch(/รายได้ที่ Meta เห็น฿9,000\.00.*ROAS \(Meta\)3\.00×.*%Ads \(Meta\)33\.33%/);
  });
  it("การ์ดครีเอทีฟแบบเดิม (อาร์ตบอกดีมาก) ยังอยู่", () => {
    const { container } = show();
    expect(within(container.querySelector(".cp-creative-section")).getAllByRole("article").length).toBeGreaterThan(0);
  });
});

/* บั๊ก 26 ก.ย.: ที่มาเขียน "ข้อมูลจำลองจากการ์ดรายวัน" ทั้งที่เป็นข้อมูลจริงจาก Meta */
describe("CampaignDetail — ที่มา", () => {
  it("ไม่อ้างว่าเป็นข้อมูลจำลอง", () => {
    show();
    expect(document.body.textContent).not.toContain("ข้อมูลจำลอง");
  });
});

/* 26 ก.ย. (สเปก campaign-page-audience): ตัวเลขชุดเดียวกับ Creative · ของเทคนิคออกจากพื้นผิวหลัก */
describe("CampaignDetail — ตัวเลขชุดเดียวกับ Creative", () => {
  // ป้ายคำแนะนำคิดใหม่ตามตัวเลขที่แก้ — ไม่งั้นแถวทดสอบพูดขัดกันเอง (รันมา 1 วันแต่ป้ายยังเป็นของ 3 วัน)
  const render2 = (patch) => { const row = { ...rows[0], ...patch }; return render(<MemoryRouter><CampaignDetail row={{ ...row, decision: campaignDecision(row) }} compareLabel="ช่วงก่อนหน้า" /></MemoryRouter>); };
  it("การเข้าถึง: คลิกลิงก์ · CTR ลิงก์ · CPC ลิงก์ ก่อน CTR ทั้งหมด", () => {
    render2({ linkClicks: 120, linkCtr: 0.002, linkCpc: 25 });
    const reach = screen.getByRole("group", { name: "การเข้าถึง" });
    expect([...reach.querySelectorAll("li span")].map((n) => n.textContent)).toEqual(["การแสดงผล", "เข้าถึง (รวมรายวัน)", "คลิกลิงก์", "CTR ลิงก์", "CPC ลิงก์", "CTR ทั้งหมด"]);
  });
  it("Meta ไม่เห็นยอด = ROAS (Meta) '—' ไม่ใช่ 0.00×", () => {
    render2({ roas: null, revenue: 0 });
    expect(screen.getByRole("group", { name: "ผลลัพธ์" }).textContent).toContain("ROAS (Meta)—");
  });
  it("ยังตัดสินไม่ได้ = บอกสิ่งที่ยังรอเป็นภาษาคน", () => {
    const { container } = render2({ days: 1, leads: 2 });
    expect(container.querySelector(".cd-advice-ready").textContent).toBe("ยังตัดสินไม่ได้ · รออีก 2 วัน · รอผลลัพธ์อีก 3");
  });
  it("ไม่มีป้าย 'รอ Creative API' / 'มีสื่อ' · ที่มาไม่มีบรรทัดงบเมื่อไม่มีงบ", () => {
    const { container } = render2({});
    expect(container.textContent).not.toMatch(/รอ Creative API|มีสื่อ \d/);
    expect(container.querySelector(".cp-lineage").textContent).not.toMatch(/งบแคมเปญ|จังหวะ =/);
  });
});

/* ทดสอบละเอียด 27 ก.ย.: ใช้เงินเกินเกณฑ์แล้วไม่มีผล → คำแนะนำ "ควรหยุด" แต่บรรทัดใต้บอก "ยังตัดสินไม่ได้ · รอผลลัพธ์อีก 5" ขัดกันเอง */
it("ตัดสินแล้ว (ควรหยุด) = ไม่ขึ้นบรรทัด 'ยังตัดสินไม่ได้'", () => {
  const zero = (d) => card(`z${d}`, d, { metrics: { ...card("x", d).metrics, spend: 2000, leads: 0, revenue: 0 } });
  const [row] = campaignRows([zero("07-03"), zero("07-05"), zero("07-08")], RANGE, { brands: [{ id: "b_td", name: "TEAMDEE" }], today: "2026-07-15", prevRange: PREV })
    .map((r) => ({ ...r, decision: campaignDecision(r) }));
  expect(row.decision.tag).toBe("stop");
  render(<MemoryRouter><CampaignDetail row={row} compareLabel="ช่วงก่อนหน้า" /></MemoryRouter>);
  expect(screen.queryByText(/ยังตัดสินไม่ได้/)).toBeNull();
});

/* ตรวจรอบ 28 ก.ย.: "แพงแต่ขายได้" บอกให้ไปเทียบยอดขายในหน้าภาพรวม แต่ไม่มีทางไป → ลิงก์ไปหน้าภาพรวมของแบรนด์นั้น */
it("แพงแต่ขายได้ = มีลิงก์ไปดูยอดขายของแบรนด์ในหน้าภาพรวม · ป้ายอื่นไม่มี", () => {
  const sells = { ...rows[0], decision: { tag: "sells", label: "แพงแต่ขายได้", tone: "zinc", why: "x", next: "y" } };
  const { unmount } = render(<MemoryRouter><CampaignDetail row={sells} compareLabel="ช่วงก่อนหน้า" /></MemoryRouter>);
  const link = screen.getByRole("link", { name: `ดูยอดขาย ${sells.brand}` });
  // ไม่ใส่ period — ลิงก์ที่มี period ทำให้ตัวกรองที่จำไว้ (ช่วง/ช่องทาง/เทียบ) ถูกล้าง (รีวิวโค้ด 28 ก.ย.)
  expect(link.getAttribute("href")).toBe(`/mkt/ads?brand=${sells.brandId}`);
  unmount();
  render(<MemoryRouter><CampaignDetail row={{ ...rows[0], decision: { ...sells.decision, tag: "fix", label: "ควรแก้" } }} compareLabel="ช่วงก่อนหน้า" /></MemoryRouter>);
  expect(screen.queryByRole("link", { name: /ดูยอดขาย/ })).toBeNull();
});

/* รีวิวโค้ด 28 ก.ย.: หัวแผงซ่อนสถานะที่ไม่รู้ แต่หัวส่วนครีเอทีฟในแผงเดียวกันขึ้น "แคมเปญไม่ทราบสถานะ" */
it("ไม่รู้สถานะแคมเปญ = หัวส่วนครีเอทีฟไม่ขึ้น 'ไม่ทราบสถานะ' (เหมือนหัวแผง)", () => {
  show();
  expect(document.body.textContent).not.toContain("ไม่ทราบสถานะ");
});
