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
    expect(hero.getByText("฿1,825,399.00")).toBeTruthy();
    expect(hero.getByText("63.60%")).toBeTruthy();                         // 1,825,399 ÷ (4,100,000 × 21/30)
    expect(hero.getByText(/ช้ากว่าแผน ฿1,044,601.00/)).toBeTruthy();
    expect(hero.getByText(/ต้องทำให้ได้เฉลี่ย ฿252,733.44\/วัน ใน 9 วันที่เหลือ/)).toBeTruthy();
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
  it("ฝั่งซ้ายเป็นหน้าปัดมินิของใครของมัน — ยอดกับค่าแอด แบรนด์ละคู่", () => {
    const { container } = show(model());
    const cards = [...container.querySelectorAll(".aw-brand")];
    expect(cards).toHaveLength(3);                                   // ภาพรวม + 2 แบรนด์
    for (const card of cards) expect(card.querySelectorAll(".pg--mini")).toHaveLength(2);
    expect(cards[1].textContent).toContain("ยอด");
    expect(cards[1].textContent).toContain("ค่าแอด");
  });
});

describe("การ์ดประสิทธิภาพ — กฎ: หนึ่งกล่องมีตัวเลขเด่นตัวเดียว", () => {
  const goals = { overall: {
    roas: { state: "set", tone: "emerald", text: "ถึงเป้า", paceState: "ontrack", kind: "rate_higher", target: 7.94, pct: 1.2021, gap: 1.6 },
    pctAds: { state: "set", tone: "amber", text: "เกินเป้าเล็กน้อย", paceState: "warn", kind: "rate_lower", target: 0.126, pct: 1.0946, gap: 0.0119 },
  }, byBrand: {} };
  it("ค่าเป็นพระเอก · ส่วนโค้งเปล่าไม่มีตัวเลขซ้ำ · แถวล่างบอกเป้ากับผลครบ", () => {
    const { container } = show(model({ goals }));
    const tiles = [...container.querySelectorAll(".aw-efficiency .aw-metric")];
    expect(tiles).toHaveLength(2);
    const roas = within(tiles[0]);
    expect(roas.getByText("ROAS")).toBeTruthy();
    expect(tiles[0].querySelector(".aw-metric-num").textContent).toBe("8.78×");
    expect(roas.getByText(/เป้า ≥ 7.94×/)).toBeTruthy();
    expect(roas.getByText("120.21%")).toBeTruthy();
    expect(roas.getByText("ถึงเป้า")).toBeTruthy();
    // หน้าปัดในกล่องต้องเป็นภาพเปล่า — ตัวเลขเด่นมีได้ตัวเดียวคือค่า ROAS
    expect(tiles[0].querySelectorAll(".pg .pg-value")).toHaveLength(0);
    expect(within(tiles[1]).getByText(/เพดาน ≤ 12.60%/)).toBeTruthy();
    expect(within(tiles[1]).getByText("เกินเป้าเล็กน้อย")).toBeTruthy();
    // เทียบเดือนก่อน (อาร์ตขอ 21 ก.ย. ค่ำ): ROAS มีฐานเทียบ = บอกทิศ · %Ads ไม่มี = บอกตรงๆ
    expect(within(tiles[0]).getByText(/▲ 9\.75% ดีขึ้น/)).toBeTruthy();       // 8.78 จาก 8.00
    expect(within(tiles[1]).getByText("เทียบเดือนก่อนไม่ได้")).toBeTruthy();
  });
});

describe("สิ่งที่ต้องทำวันนี้", () => {
  /* บั๊กที่เจอเอง: ระหว่างโหลด การ์ดนี้ประกาศว่า "ยังไม่ได้ตั้งเป้า 12 ช่อง" ทั้งที่ตั้งครบแล้ว
     กฎเดียวกับหน้า Sync — ยังโหลดไม่เสร็จ ห้ามสรุป */
  it("ข้อมูลยังโหลดไม่เสร็จ = บอกว่ากำลังตรวจ ห้ามสรุปว่ายังไม่ได้ตั้งเป้า", () => {
    const actions = [{ kind: "goal", key: "goal:b_ta", brandId: "b_ta", level: "wait", title: "t around ยังไม่ได้ตั้งเป้า 12 ช่อง", detail: "12 ช่อง", tone: "zinc" }];
    show(model({ actions }), ads("loading"));
    expect(screen.getByText("กำลังตรวจข้อมูล…")).toBeTruthy();
    expect(screen.queryByText(/ยังไม่ได้ตั้งเป้า/)).toBeNull();
  });
  it("โหลดเสร็จแล้วถึงจะสรุป", () => {
    const actions = [{ kind: "brand", key: "brand:b_ta", brandId: "b_ta", level: "bad", title: "t around — ตรวจแคมเปญ/ครีเอทีฟทันที", detail: "ยอด 62.98% · งบ 181.07%", tone: "rose" }];
    show(model({ actions }));
    expect(screen.getByText("t around — ตรวจแคมเปญ/ครีเอทีฟทันที")).toBeTruthy();
    expect(screen.queryByText("กำลังตรวจข้อมูล…")).toBeNull();
  });
});

describe("ตารางแบรนด์", () => {
  it("กดที่ไหนก็ได้ในแถวเพื่อเลือกแบรนด์ (คำอธิบายใต้ตารางบอกแบบนั้น)", () => {
    const onSelect = vi.fn();
    render(<MemoryRouter><AdsWorkspace v={model()} ads={ads()} controls={null} selected={null} onSelect={onSelect}
      ChannelCard={() => null} SalePipeline={() => null} settings={{}} updateAdsControl={() => {}} toast={() => {}} /></MemoryRouter>);
    const row = screen.getByRole("row", { name: /t around/ });
    fireEvent.click(within(row).getByText("฿264,519.00"));      // กดที่ช่องยอด ไม่ใช่ชื่อแบรนด์
    expect(onSelect).toHaveBeenCalledWith("b_ta");
  });
});
