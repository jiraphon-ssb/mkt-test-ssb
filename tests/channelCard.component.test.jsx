// @vitest-environment jsdom
/* การ์ดแพลตฟอร์ม (Meta Ads ฯลฯ) รื้อ 21 ก.ย. ค่ำ — ต้องพูดภาษาเดียวกับการ์ดอื่นทั้งหน้า:
   ตัวเลขใหญ่ = ค่าจริง / งบ · หน้าปัด mini ไม่มีเลขซ้ำ · facts แถวเดียวกัน · ป้ายมุมเฉพาะเมื่อมีเรื่อง */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChannelCard } from "../src/modules/marketing/ads/AdsView.jsx";

afterEach(cleanup);

// ตัวเลขชุดจริง 21 ก.ย. (ผ่านไป 70% ของเดือน): ใช้ 150,807.37 จากงบ 210,000 → จังหวะ 102.59% ตามแผน
const pace = {
  used: 150807.37 / 210000, expected: 0.7, expectedSpend: 147000, vsPace: 3807.37,
  remaining: 59192.63, average: 7181.30, forecast: 215439.10, forecastOver: 5439.10,
  daysLeft: 9, requiredDaily: 6577.0, daysToExhaust: 8.24,
};
const c = {
  key: "Meta Ads", spend: 150807.37, budget: 210000, pctAds: 1.1271, roas: 1.25, cpl: 96.55,
  revenue: 133807, leads: 100, pace, delivery: { ctr: 0.012, cpc: 9.5, cpm: 120, frequency: 2.1 },
  campaigns: [], series: { pctAds: [], cpl: [] },
};

describe("การ์ดแพลตฟอร์มโหมดเดือน", () => {
  it("สองคอลัมน์แบบ hero: เนื้อหาซ้าย · หน้าปัดใหญ่+ประโยคเงินขวา · facts ครบ · ตามแผน = ไม่มีป้าย", () => {
    const { container } = render(<ChannelCard c={c} />);
    expect(container.querySelector(".aw-metric-num").textContent).toBe("฿150,807.37 / ฿210,000.00");
    // คอลัมน์ขวา = หน้าปัดใหญ่เดี่ยว · ประโยคเงินอยู่ใต้ facts ฝั่งซ้าย (เติมที่ว่าง การ์ดไม่สูงโปร่ง — อาร์ต 21 ก.ย. ค่ำ)
    const side = container.querySelector(".aw-card-grid .aw-hero-side");
    expect(side).toBeTruthy();
    expect(container.querySelector(".pg--mini")).toBeNull();
    expect(side.querySelector(".pg .pg-value").textContent).toBe("102.59%");
    expect(side.querySelector(".aw-decide")).toBeNull();
    const decide = container.querySelector(".aw-card-grid > div:first-child .aw-decide");
    expect(decide.textContent).toContain("ใช้เร็วกว่าจังหวะ ฿3,807.37");
    expect(decide.textContent).toContain("คาดเกินงบ ฿5,439.10");
    // เร็วกว่าจังหวะ = คำเตือน ต้องไม่ย้อมเขียวตามสถานะรวม
    expect(decide.querySelector("b").className).toContain("ads-over");
    // 102.59% พูดครั้งเดียว (ในหน้าปัด) — ประโยค "จังหวะ x%" เดิมต้องหายไป
    expect(container.textContent.match(/102\.59%/g)).toHaveLength(1);
    const facts = container.querySelector(".aw-facts");
    expect(facts.textContent).toContain("ควรใช้วันนี้");
    expect(facts.textContent).toContain("฿147,000.00");
    expect(facts.textContent).toContain("งบคงเหลือ");
    expect(facts.textContent).toContain("฿59,192.63");
    expect(facts.textContent).toContain("คาดใช้สิ้นเดือน");
    expect(facts.textContent).toContain("฿215,439.10");
    expect(facts.textContent).toContain("เหลือเวลา");
    expect(facts.textContent).toContain("9 วัน");
    expect(facts.textContent).toContain("%Ads");
    expect(facts.textContent).toContain("112.71%");
    expect(container.querySelector(".aw-flag")).toBeNull();               // ตามแผน = เงียบ
  });
  it("เกินงบจริง = ป้ายต้องคุมงบ", () => {
    const over = { ...c, spend: 220000, pace: { ...pace, used: 220000 / 210000, vsPace: 73000, remaining: -10000 } };
    const { container } = render(<ChannelCard c={over} />);
    expect(container.querySelector(".aw-flag").textContent).toBe("ต้องคุมงบ");
  });
});

/* บั๊ก 26 ก.ย.: เส้น CPL ในรายละเอียดอ้างตัวแปร st ที่ไม่มีอยู่ → กด "ดูรายละเอียด" แล้วหน้าพัง */
describe("การ์ดแพลตฟอร์ม — กดดูรายละเอียด", () => {
  it("กางรายละเอียดได้ ไม่พัง และเห็นเส้น CPL ในเดือน", () => {
    render(<ChannelCard c={{ ...c, cplSeries: [90, 95, 96.55] }} />);
    fireEvent.click(screen.getByRole("button", { name: /ดูรายละเอียด/ }));
    expect(screen.getByText("CPL ในเดือน")).toBeTruthy();
  });
});

/* ทดสอบแบบผู้ใช้จริง: หน้าเดียวมี %Ads สองค่า — "%Ads ต่อยอดลูกค้าใหม่ 24.38%" กับการ์ดนี้ "%Ads (Meta) 130.82%"
   ข้อมูลจริง Meta แทบไม่เห็นยอดขาย (ทักแชท) → %Ads (Meta) ไม่มีความหมาย ห้ามขึ้นคู่กับ %Ads จริง */
it("ข้อมูลจริง: การ์ดแพลตฟอร์มไม่ขึ้น %Ads (Meta) · ข้อมูลจำลองยังขึ้น", () => {
  const { container } = render(<ChannelCard c={c} real />);
  expect(container.textContent).not.toContain("%Ads");
  cleanup();
  expect(render(<ChannelCard c={c} />).container.textContent).toContain("%Ads (Meta)");
});

/* ตรวจ 10 พ.ย. (ภาพการ์ด Google / ChatGPT ของ TEAMDEE) */
describe("การ์ดแพลตฟอร์ม — ตรวจ 10 พ.ย.", () => {
  const under = { ...pace, used: 2228.01 / 27300, expected: 9 / 30, expectedSpend: 8190, vsPace: -5961.99,
    remaining: 25071.99, average: 247.56, forecast: 7426.70, forecastOver: -19873.30, daysLeft: 21 };
  const g = { ...c, key: "Google Ads", spend: 2228.01, budget: 27300, pace: under };
  it("คาดใช้ต่ำกว่างบมาก ต้องไม่พูดว่า 'คาดพอดีงบ'", () => {
    const { container } = render(<ChannelCard c={g} real asOfText="9 พ.ย." />);
    const decide = container.querySelector(".aw-decide").textContent;
    expect(decide).not.toContain("พอดีงบ");
    expect(decide).toContain("คาดใช้ไม่ถึงงบ · เหลือ ฿19,873.30");
  });
  it("คาดสิ้นเดือนใกล้งบ (ต่างไม่เกิน 5%) = คาดพอดีงบ", () => {
    const near = { ...g, pace: { ...under, forecast: 26500, forecastOver: -800 } };
    const { container } = render(<ChannelCard c={near} real asOfText="9 พ.ย." />);
    expect(container.querySelector(".aw-decide").textContent).toContain("คาดพอดีงบ · เหลือ ฿800.00");
  });
  it("ข้อมูลจริง: คำอธิบายงบบอกว่ามาจากเป้าระบบขายรายแพลตฟอร์ม ไม่ใช่การแบ่งตามสัดส่วนเดิม", () => {
    render(<ChannelCard c={g} real asOfText="9 พ.ย." />);
    fireEvent.click(screen.getByRole("button", { name: "รายละเอียด งบ Google Ads" }));
    const tip = screen.getByRole("tooltip").textContent;
    expect(tip).toContain("งบที่ตั้งให้ Google Ads ในเป้าเดือนของระบบขาย");
    expect(tip).not.toContain("แบ่งจากงบของแบรนด์");
  });
  it("ข้อมูลไฟล์ค้าง: ป้ายจังหวะใช้วันที่ไฟล์มี และบอกว่าข้อมูลถึงวันไหน", () => {
    const stale = { ...g, dataThrough: "2026-11-05", pace: { ...under, expectedSpend: 4550 } };
    const { container } = render(<ChannelCard c={stale} real asOfText="9 พ.ย." />);
    const facts = container.querySelector(".aw-facts").textContent;
    expect(facts).toContain("ควรใช้ถึง 5 พ.ย.");
    expect(facts).not.toContain("9 พ.ย.");
    expect(container.querySelector(".ads-chan-stale").textContent).toContain("ข้อมูลถึง 5 พ.ย.");
  });
  it("ไม่ค้าง = ไม่มีป้ายข้อมูลถึง", () => {
    const { container } = render(<ChannelCard c={g} real asOfText="9 พ.ย." />);
    expect(container.querySelector(".ads-chan-stale")).toBeNull();
  });
});
