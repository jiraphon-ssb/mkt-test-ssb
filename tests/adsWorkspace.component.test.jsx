// @vitest-environment jsdom
/* หน้า Overview ระดับหน้าจอ — เขียนหลังรีวิวตัวเอง 21 ก.ย. 69 ที่พบว่าหน้านี้ไม่มีเทสคุมเลย
   3 บั๊กที่เจอตอนนั้น เทสชุดนี้ต้องจับได้ทุกข้อ */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdsWorkspace } from "../src/modules/marketing/ads/AdsWorkspace.jsx";
import { monthClock, paceOf } from "../src/modules/marketing/ads/paceEngine.js";
import { brandAdvice } from "../src/modules/marketing/ads/overviewActions.js";

afterEach(cleanup);
const clock = monthClock("2026-09-21");
const paceSet = (revenue, revTarget, spend, budget) => {
  const rev = paceOf({ actual: revenue, target: revTarget, clock });
  const budgetPace = paceOf({ actual: spend, target: budget, clock, direction: "spend" });
  return { rev, budget: budgetPace, advice: brandAdvice({ revPace: rev, budgetPace }) };
};
const brand = (id, name, revenue, revTarget, spend, budget) => ({
  id, name, revenue, revTarget, spend, budget, pctAds: spend / revenue, revChangePct: -8.6, channels: [],
  pace2: paceSet(revenue, revTarget, spend, budget),
});
const brands = [brand("b_td", "TEAMDEE", 1560880, 3500000, 150788.55, 210000), brand("b_ta", "t around", 264519, 600000, 57038.53, 45000)];
const model = (over = {}) => ({
  brands, revenueBasis: "total", clock, spendThrough: "2026-09-20",
  summary: { revenue: 1825399, revTarget: 4100000, spend: 207827.08, budget: 255000, revChangePct: -8.6, pctAds: 0.11 },
  overallPace: paceSet(1825399, 4100000, 207827.08, 255000),
  overallPipeline: { items: [{ key: "roas", value: 8.78, before: 8.0 }, { key: "pctAds", value: 0.1379, before: null, sense: "lower" }] }, pipelines: { b_td: { items: [] }, b_ta: { items: [] } },
  goals: { overall: {}, byBrand: {} }, actions: [], goalGaps: [], channelList: [], compareLabel: "วันเดียวกันเดือนก่อน", rangeLabel: "1 – 21 ก.ย.",
  range: { start: new Date("2026-09-01T00:00:00"), end: new Date("2026-09-22T00:00:00") },
  before: { start: new Date("2026-08-01T00:00:00"), end: new Date("2026-08-22T00:00:00") },
  scoped: [], scopedAll: [], monthView: true, ...over,
});
const ads = (status = "ready") => ({ source: "meta_pilot", pilot: { status, error: null, loadedAt: null, summary: {} },
  sales: [], salesGoals: [], cards: [], mockFallback: false, canSwitch: false, canPreview: false, setSource: () => {}, reload: () => {} });
const show = (v, adsProp = ads()) => render(<MemoryRouter><AdsWorkspace v={v} ads={adsProp} controls={null}
  ChannelCard={() => null} SalePipeline={() => null} settings={{}} updateAdsControl={() => {}} toast={() => {}} /></MemoryRouter>);

describe("การ์ดยอดขาย", () => {
  it("โชว์ยอด เป้า หน้าปัดจังหวะ และประโยคตัดสินใจที่บอกว่าต้องเร่งวันละเท่าไร", () => {
    const { container } = show(model());
    const hero = within(container.querySelector(".aw-hero"));
    // ค่าจริง / เป้า ในตัวเลขใหญ่ (อาร์ตขอ 21 ก.ย. ค่ำ — แบบเดียวกับการ์ดงบ/tile/แพลตฟอร์ม)
    expect(container.querySelector(".aw-revenue").textContent).toBe("฿1,825,399.00 / ฿4,100,000.00");
    expect(hero.getByText("44.52%")).toBeTruthy();                         // ทำได้ x ของเป้าเดือน (1,825,399 ÷ 4,100,000)
    expect(hero.getByText("63.60%")).toBeTruthy();                         // 1,825,399 ÷ (4,100,000 × 21/30)
    // ประโยคตัดสินใจย้ายไปอยู่ใต้หน้าปัดในคอลัมน์ pace (อาร์ตเคาะ 21 ก.ย. ค่ำ) — อยู่คู่กับสิ่งที่มันอธิบาย
    const side = container.querySelector(".aw-hero .aw-hero-side");
    expect(side.querySelector(".pg")).toBeTruthy();
    expect(within(side).getByText(/ช้ากว่าแผน ฿1,044,601.00/)).toBeTruthy();
    expect(within(side).getByText(/ต้องทำให้ได้เฉลี่ย ฿252,733.44\/วัน ใน 9 วันที่เหลือ/)).toBeTruthy();
  });
  it("ป้ายมุมการ์ด: ยอดช้า = ต้องเร่ง · งบใช้เร็ว = เฝ้าระวัง (ระบบป้ายเดียวทั้งหน้า — อาร์ตขอ 21 ก.ย. ค่ำ)", () => {
    const { container } = show(model());
    expect(container.querySelector(".aw-hero .aw-flag").textContent).toBe("ต้องเร่ง");        // ยอดรวม 63.60% = bad
    const budget = [...container.querySelectorAll(".aw-middle .aw-panel")].find((p) => p.textContent.includes("งบโฆษณา"));
    expect(budget.querySelector(".aw-flag").textContent).toBe("เฝ้าระวัง");                    // งบ 116.43% = warn ยังไม่เกินงบ
  });
});

describe("หน้าปัดจังหวะ (อาร์ตเคาะ 21 ก.ย. 69)", () => {
  it("การ์ดหลัก 2 อันขนาดเท่ากัน (ยอดขาย · งบ) และใช้คำของตัวเอง", () => {
    const { container } = show(model());
    const big = [...container.querySelectorAll(".pg:not(.pg--mini)")];
    expect(big).toHaveLength(2);
    expect(new Set(big.map((g) => g.querySelector("svg").getAttribute("width"))).size).toBe(1);
    expect(big[0].textContent).toContain("ช้ากว่าแผน");      // ยอดขาย — คำของจังหวะรายเดือน
    expect(big[1].textContent).toContain("ใช้เร็วกว่าแผน");   // งบ — คำของงบ
  });
  /* รื้อ 21 ก.ย. ค่ำ (อาร์ตให้สิทธิ์เต็ม): ฝั่งซ้ายคือ "ตัวเลือกแบรนด์" ไม่ใช่แดชบอร์ดย่อ —
     หน้าปัด 10 อันในราง 250px ทำให้การ์ดสูงจนต้องเลื่อนหาแบรนด์ · เปลี่ยนเป็นการ์ดเตี้ย:
     แถบเป้า + สถานะยอดหนึ่งบรรทัด · ค่าแอดพูดเฉพาะเมื่อมีเรื่อง (แบรนด์ปกติ = เงียบ) */
  it("ฝั่งซ้าย: การ์ดเตี้ย แถบเป้า + สถานะยอด · ค่าแอดโผล่เฉพาะเมื่อมีปัญหา · ไม่มีหน้าปัดในราง", () => {
    const { container } = show(model());
    const cards = [...container.querySelectorAll(".aw-brand")];
    expect(cards).toHaveLength(3);                                    // ภาพรวม + 2 แบรนด์
    expect(container.querySelectorAll(".aw-brands .pg")).toHaveLength(0);
    const td = cards.find((card) => card.textContent.includes("TEAMDEE"));
    expect(td.querySelectorAll(".aw-track")).toHaveLength(1);
    expect(td.textContent).toContain("ยอด");
    expect(td.textContent).toContain("63.70%");
    expect(td.textContent).toContain("ช้ากว่าแผน");
    expect(td.textContent).not.toContain("ค่าแอด");                    // งบตามแผน = ไม่ต้องพูด
    const ta = cards.find((card) => card.textContent.includes("t around"));
    expect(ta.textContent).toContain("ค่าแอด");
    expect(ta.textContent).toContain("เกินงบ");
    expect(ta.textContent).toContain("181.07%");
    const all = cards.find((card) => card.textContent.includes("ภาพรวมทุกแบรนด์"));
    expect(all.textContent).toContain("ใช้เร็วกว่าแผน");               // 116.43% = เร็วแต่ยังไม่เกินงบ
  });
});

describe("การ์ดประสิทธิภาพ — กฎ: หนึ่งกล่องมีตัวเลขเด่นตัวเดียว", () => {
  const goals = { overall: {
    roas: { state: "set", tone: "emerald", text: "ถึงเป้า", paceState: "ontrack", kind: "rate_higher", target: 7.94, pct: 1.2021, gap: 1.6 },
    pctAds: { state: "set", tone: "amber", text: "เกินเป้าเล็กน้อย", paceState: "warn", kind: "rate_lower", target: 0.126, pct: 1.0946, gap: 0.0119 },
  }, byBrand: {} };
  it("ค่าจริง/เป้าอยู่ในตัวเลขใหญ่แบบเดียวกับ funnel (คงเครื่องหมาย ≥/≤ กัน %Ads อ่านกลับทาง) · ส่วนโค้งเปล่า", () => {
    const { container } = show(model({ goals }));
    const tiles = [...container.querySelectorAll(".aw-efficiency .aw-metric")];
    expect(tiles).toHaveLength(2);
    const roas = within(tiles[0]);
    expect(roas.getByText("ROAS")).toBeTruthy();
    expect(tiles[0].querySelector(".aw-metric-num").textContent).toBe("8.78× / ≥ 7.94×");
    expect(roas.getByText("120.21%")).toBeTruthy();
    expect(roas.getByText("ถึงเป้า")).toBeTruthy();
    // เป้าย้ายขึ้นตัวเลขใหญ่แล้ว — บรรทัดล่างห้ามพูดซ้ำ
    expect(tiles[0].textContent.match(/7\.94×/g)).toHaveLength(1);
    // หน้าปัดในกล่องต้องเป็นภาพเปล่า — ตัวเลขเด่นมีได้ตัวเดียวคือค่า ROAS
    expect(tiles[0].querySelectorAll(".pg .pg-value")).toHaveLength(0);
    expect(tiles[1].querySelector(".aw-metric-num").textContent).toBe("11.00% / ≤ 12.60%");   // ค่าจริงจาก summary.pctAds
    expect(within(tiles[1]).getByText("เกินเป้าเล็กน้อย")).toBeTruthy();
    // ป้ายหัวกล่องแบบเดียวกับ "หล่นแรงสุด" ของ funnel (อาร์ตขอ 21 ก.ย. ค่ำ) — โผล่เฉพาะกล่องที่มีเรื่อง
    expect(tiles[0].querySelector(".aw-flag")).toBeNull();                                    // ROAS ontrack = เงียบ
    expect(tiles[1].querySelector(".aw-flag").textContent).toBe("เฝ้าระวัง");                  // %Ads warn
    const badGoals = { overall: { ...goals.overall, pctAds: { ...goals.overall.pctAds, paceState: "bad", tone: "rose" } }, byBrand: {} };
    cleanup();
    const bad = show(model({ goals: badGoals }));
    const tile2 = [...bad.container.querySelectorAll(".aw-efficiency .aw-metric")][1];
    expect(tile2.querySelector(".aw-flag").textContent).toBe("ต้องแก้");
    // เทียบเดือนก่อน (อาร์ตขอ 21 ก.ย. ค่ำ): ROAS มีฐานเทียบ = บอกทิศ · %Ads ไม่มี = บอกตรงๆ
    expect(within(tiles[0]).getByText(/▲ 9\.75% ดีขึ้น/)).toBeTruthy();       // 8.78 จาก 8.00
    expect(within(tiles[1]).getByText("เทียบเดือนก่อนไม่ได้")).toBeTruthy();
  });
});

describe("มุมมองรายแบรนด์ (อาร์ตเคาะ 21 ก.ย. ค่ำ)", () => {
  /* การ์ด "สิ่งที่ต้องทำวันนี้" ถูกลบทั้งหมด (อาร์ตเคาะ 21 ก.ย. ค่ำ) — คำแนะนำอยู่ในคอลัมน์ "ควรทำ" ของตาราง */
  it("ไม่มีการ์ดสิ่งที่ต้องทำวันนี้อีกต่อไป · ตารางแบรนด์อยู่เฉพาะภาพรวม", () => {
    const { container } = show(model());
    expect(screen.queryByText("สิ่งที่ต้องทำวันนี้")).toBeNull();
    expect(container.querySelector(".aw-brandtable")).toBeTruthy();
  });
  it("เข้าแบรนด์แล้วตารางแบรนด์หาย — ใช้ฝั่งซ้ายสลับแบรนด์แทน", () => {
    const { container } = render(<MemoryRouter><AdsWorkspace v={model()} ads={ads()} controls={null} selected="b_ta" onSelect={() => {}}
      ChannelCard={() => null} SalePipeline={() => null} settings={{}} updateAdsControl={() => {}} toast={() => {}} /></MemoryRouter>);
    expect(container.querySelector(".aw-brandtable")).toBeNull();
    expect(screen.queryByText("สิ่งที่ต้องทำวันนี้")).toBeNull();
  });
  it("แนวโน้มแสดงเสมอ ไม่ซ่อนใน details อีกต่อไป", () => {
    const { container } = show(model());
    expect(container.querySelector("details.aw-trends-fold")).toBeNull();
    expect(screen.getByText("ตัวชี้วัดและแนวโน้ม")).toBeTruthy();
  });
});

describe("ตารางแบรนด์", () => {
  it("กดที่ไหนก็ได้ในแถวเพื่อเลือกแบรนด์ (คำอธิบายใต้ตารางบอกแบบนั้น)", () => {
    const onSelect = vi.fn();
    render(<MemoryRouter><AdsWorkspace v={model()} ads={ads()} controls={null} selected={null} onSelect={onSelect}
      ChannelCard={() => null} SalePipeline={() => null} settings={{}} updateAdsControl={() => {}} toast={() => {}} /></MemoryRouter>);
    const row = screen.getByRole("row", { name: /t around/ });
    // ช่องจังหวะพูดเป็นประโยคเหมือนทุกที่ (เลข + คำสถานะ) ไม่ใช่ตัวเลขเปล่าที่ต้องเดาว่าคือ % ของอะไร
    expect(within(row).getByText(/62\.98% ช้ากว่าแผน/)).toBeTruthy();
    expect(within(row).getByText(/181\.07% เกินงบ/)).toBeTruthy();
    fireEvent.click(within(row).getByText("฿264,519.00"));      // กดที่ช่องยอด ไม่ใช่ชื่อแบรนด์
    expect(onSelect).toHaveBeenCalledWith("b_ta");
  });
});
