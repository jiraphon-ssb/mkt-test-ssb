// @vitest-environment jsdom
/* การ์ดครีเอทีฟตัวเดียว (อาร์ตเคาะ 25 ก.ย.) — หน้าตาแบบแผงแคมเปญเดิม ใช้ทั้งแผงแคมเปญและหน้าคลัง */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../src/modules/marketing/creatives/CreativeMedia.jsx", () => ({ CreativeMedia: ({ onPreview }) => <button type="button" data-testid="media" onClick={() => onPreview?.()}>รูป</button> }));
const { CreativeCard } = await import("../src/modules/marketing/creatives/CreativeCard.jsx");
afterEach(cleanup);

const row = (patch = {}) => ({ key: "a", creative: "Album_TD_กำลังวางแผน", brand: "TEAMDEE", campaigns: ["C1"], spend: 7186.019, ctr: 0.0304, roas: 0.17,
  action: "Stop", tone: "rose", asset: { status: "CAMPAIGN_PAUSED", storyId: "1_2", permalinkUrl: "https://www.instagram.com/p/x/", copy: { primaryText: "กำลังวางแผนจัดงานอีเวนท์" } }, ...patch });

describe("CreativeCard", () => {
  it("ชื่อ · คำแนะนำไทย · สถานะ · ตัวเลขตัดไม่ปัด · อยู่ใน N แคมเปญ · FB/IG", () => {
    render(<CreativeCard row={row({ cpl: 159.199, linkCtr: 0.0304 })} onOpen={() => {}} />);
    const card = screen.getByRole("article");
    expect(within(card).getByText("Album_TD_กำลังวางแผน")).toBeTruthy();
    expect(within(card).getByText("ควรหยุด")).toBeTruthy();
    expect(within(card).getByText("ปิด · แคมเปญหยุด")).toBeTruthy();
    expect(within(card).getByText("฿7,186.01")).toBeTruthy();
    expect(within(card).getByText("3.04%")).toBeTruthy();
    expect(within(card).getByText("0.17×")).toBeTruthy();
    expect(within(card).getByText("฿159.19")).toBeTruthy();
    expect(within(card).getByText("อยู่ใน 1 แคมเปญ")).toBeTruthy();
    expect(within(card).getByRole("link", { name: /Facebook/ })).toBeTruthy();
  });
  it("ไม่รู้สถานะ = ไม่ขึ้นป้ายสถานะ (ไม่ขึ้น 'ไม่ทราบสถานะ' ทุกใบ)", () => {
    render(<CreativeCard row={row({ asset: { status: null } })} onOpen={() => {}} />);
    expect(screen.queryByText("ไม่ทราบสถานะ")).toBeNull();
  });
  it("คลิกการ์ดหรือรูป = onOpen · ลิงก์และช่องเทียบไม่เปิดหน้าต่าง", () => {
    const onOpen = vi.fn(), onToggle = vi.fn();
    render(<CreativeCard row={row()} onOpen={onOpen} selectable checked={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId("media"));
    fireEvent.click(screen.getByText("Album_TD_กำลังวางแผน"));
    expect(onOpen).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("checkbox", { name: "เทียบ Album_TD_กำลังวางแผน" }));
    fireEvent.click(screen.getByRole("link", { name: /Facebook/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});

/* 26 ก.ย. (สเปก creative-page-hierarchy): ตัวเลข 4 ช่องคงที่ทุกใบ · แคปชั่นอยู่ในหน้าต่างเท่านั้น · ROAS ไม่หลอกตา */
describe("CreativeCard — ตัวเลขที่ใช้คัดชิ้นงาน", () => {
  const facts = () => [...document.querySelectorAll(".cc-facts > div")].map((d) => [d.querySelector("dt").textContent, d.querySelector("dd")]);
  it("4 ช่อง: ค่าแอด · ต่อผลลัพธ์ · CTR ลิงก์ · ROAS · ไม่มีแคปชั่นบนการ์ด", () => {
    render(<CreativeCard row={row({ cpl: 43.67, linkCtr: 0.0123, roas: null })} onOpen={() => {}} />);
    expect(facts().map(([k]) => k)).toEqual(["ค่าแอด", "ต่อผลลัพธ์", "CTR ลิงก์", "ROAS (Meta)"]);
    expect(facts().map(([, v]) => v.textContent)).toEqual(["฿7,186.01", "฿43.67", "1.23%", "—"]);
    expect(screen.queryByText("กำลังวางแผนจัดงานอีเวนท์")).toBeNull();
    expect(document.querySelector(".cc-copy")).toBeNull();
  });
  it("ROAS '—' ไม่เป็นสีแดง · แดงเฉพาะ Meta เห็นยอดแต่ต่ำกว่า 1", () => {
    render(<CreativeCard row={row({ roas: null })} onOpen={() => {}} />);
    expect(facts()[3][1].className).not.toContain("bad");
    cleanup();
    render(<CreativeCard row={row({ roas: 0.5 })} onOpen={() => {}} />);
    expect(facts()[3][1].className).toContain("bad");
  });
  it("ยังไม่มีผลลัพธ์ / ไม่มีคลิกลิงก์ = '—' ไม่ใช่ 0", () => {
    render(<CreativeCard row={row({ cpl: null, linkCtr: null })} onOpen={() => {}} />);
    expect(facts()[1][1].textContent).toBe("—");
    expect(facts()[2][1].textContent).toBe("—");
  });
});

/* 26 ก.ย. อาร์ตเคาะ: บรรทัดผลกฎ 3 บรรทัดขึ้นมาแทนแคปชั่น → ผ่าน = ป้ายอย่างเดียว · ไม่ผ่าน/รอ = บรรทัดเดียว (เต็มอยู่ในหน้าต่าง)
   27 ก.ย. (ทดสอบแบบใช้งานจริง): การ์ดมีคำตัดสินเดียว — ไม่ผ่านกฎ = ป้ายบนสุดเป็น "ไม่ผ่านกฎ" · ผ่าน = ป้ายเป็นคำแนะนำ ไม่มีบรรทัด "ผ่านกฎ" */
describe("CreativeCard — ผลกฎสั้น", () => {
  const TEXT = { pass: "ผ่านกฎ", fail: "ไม่ผ่านกฎ", pending: "ยังตัดสินไม่ได้" };
  it("ผ่านกฎ = ไม่มีบรรทัดผลกฎ · ป้ายเป็นคำแนะนำของระบบ", () => {
    render(<CreativeCard row={row()} onOpen={() => {}} ruleText={TEXT} ruleResult={{ status: "pass", text: "ROAS จากการซื้อ (Meta) 2.18× ถึงเกณฑ์ 1.00× · CTR 4.28% ถึงเกณฑ์ 3.00%" }} />);
    expect(document.querySelector(".cc-rule")).toBeNull();
    expect(document.querySelector(".cc-action").textContent).not.toBe("ไม่ผ่านกฎ");
    expect(document.body.textContent).not.toContain("ผ่านกฎ");
  });
  it("ไม่ผ่าน = บรรทัดเดียวบอกตัวที่หลุด · ข้อความเต็มอยู่ใน title", () => {
    const text = "CTR ทั้งหมด 2.09% ต่ำกว่าเกณฑ์ 3.00%";
    render(<CreativeCard row={row({ action: "ติดตาม", tone: "zinc" })} onOpen={() => {}} ruleText={TEXT} ruleResult={{ status: "fail", text }} />);
    const reason = document.querySelector(".cc-rule span");
    expect(reason.textContent).toBe(text);
    expect(reason.getAttribute("title")).toBe(text);
    expect(document.querySelector(".cc-rule").className).toContain("cc-rule--fail");
    // ป้ายบนสุดคือคำตัดสิน — บรรทัดล่างบอกเหตุผลอย่างเดียว ไม่พูด "ไม่ผ่านกฎ" ซ้ำ
    const badge = document.querySelector(".cc-action");
    expect(badge.textContent).toBe("ไม่ผ่านกฎ");
    expect(badge.className).toContain("cc-action--rose");
    expect(document.querySelector(".cc-rule").textContent).toBe(text);
  });
  /* ตรวจรอบ 27 ก.ย. ดึก: ระบบบอก "ควรหยุด" (เช่นใช้เงินไม่มีผล) หนักกว่าไม่ผ่านกฎ CTR — ป้ายต้องเป็นควรหยุด ไม่ให้กฎกลบ */
  it("ควรหยุด + ไม่ผ่านกฎ = ป้ายควรหยุด · บรรทัดล่างบอกว่าไม่ผ่านกฎเพราะอะไร", () => {
    const text = "CTR ทั้งหมด 1.20% ต่ำกว่าเกณฑ์ 3.00%";
    render(<CreativeCard row={row({ action: "Stop", tone: "rose" })} onOpen={() => {}} ruleText={TEXT} ruleResult={{ status: "fail", text }} />);
    expect(document.querySelector(".cc-action").textContent).toBe("ควรหยุด");
    expect(document.querySelector(".cc-rule").textContent).toBe(`ไม่ผ่านกฎ${text}`);
  });
  it("รอข้อมูลของกฎ = ป้ายยังเป็นคำแนะนำ · บรรทัดบอกว่ากฎยังตัดสินไม่ได้", () => {
    render(<CreativeCard row={row()} onOpen={() => {}} ruleText={TEXT} ruleResult={{ status: "pending", text: "ค่าแอดยังไม่ถึง ฿500.00" }} />);
    expect(document.querySelector(".cc-action").textContent).not.toBe("ไม่ผ่านกฎ");
    expect(document.querySelector(".cc-rule").textContent).toBe("ยังตัดสินไม่ได้ค่าแอดยังไม่ถึง ฿500.00");
  });
});

/* ชุด B ข้อ 16: การ์ดทุกใบเปิดด้วยคีย์บอร์ดได้ — เดิมปุ่มเปิดมีเฉพาะในกรอบรูปของชิ้นที่มีเลข ad */
it("ชื่อชิ้นงานเป็นปุ่มเปิดหน้าต่าง (เปิดด้วยคีย์บอร์ดได้ทุกใบ)", () => {
  const onOpen = vi.fn();
  render(<CreativeCard row={row()} onOpen={onOpen} />);
  fireEvent.click(screen.getByRole("button", { name: "ดูรายละเอียด Album_TD_กำลังวางแผน" }));
  expect(onOpen).toHaveBeenCalledTimes(1);   // ไม่เรียกซ้ำจากคลิกของการ์ด
});
