// @vitest-environment jsdom
/* การ์ดแพลตฟอร์ม (Meta Ads ฯลฯ) รื้อ 21 ก.ย. ค่ำ — ต้องพูดภาษาเดียวกับการ์ดอื่นทั้งหน้า:
   ตัวเลขใหญ่ = ค่าจริง / งบ · หน้าปัด mini ไม่มีเลขซ้ำ · facts แถวเดียวกัน · ป้ายมุมเฉพาะเมื่อมีเรื่อง */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
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
