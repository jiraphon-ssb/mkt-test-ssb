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
    expect(td.textContent).toContain("จังหวะ");
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
    pctAds: { state: "set", tone: "amber", text: "เกินเพดานเล็กน้อย", paceState: "warn", kind: "rate_lower", target: 0.126, pct: 1.0946, gap: 0.0119 },
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
    expect(within(tiles[1]).getByText("เกินเพดานเล็กน้อย")).toBeTruthy();
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

describe("ตัวกรองช่วงวันที่บน Overview", () => {
  const rangeModel = () => model({
    monthView: false, rangeLabel: "15 – 21 ก.ย.", compareLabel: "ช่วงก่อนหน้า", overallPace: null,
    summary: { ...model().summary, prevRevenue: 1600000, prevSpend: 190000, spendChangePct: 9.38 },
    brands: brands.map((b) => ({ ...b, prevRevenue: b.revenue * .9, prevSpend: b.spend * .9, spendChangePct: 11.11, pace2: null })),
  });

  it("ใช้ภาษาของช่วงที่เลือกและไม่แสดง pace/คาดการณ์รายเดือน", () => {
    const { container } = show(rangeModel());
    expect(screen.getByText("15 – 21 ก.ย. · ยอดขาย ค่าแอด และประสิทธิภาพตามช่วงที่เลือก")).toBeTruthy();
    expect(screen.getAllByText("ช่วงที่เลือก").length).toBeGreaterThan(0);
    expect(screen.queryByText("ควรถึงวันนี้")).toBeNull();
    expect(screen.queryByText("คาดปิดเดือน")).toBeNull();
    expect(container.querySelectorAll(".pg")).toHaveLength(0);
  });

  it("ตารางแบรนด์เทียบช่วงก่อนหน้าและยังเปิดรายละเอียดแบรนด์ได้", () => {
    const onSelect = vi.fn();
    render(<MemoryRouter><AdsWorkspace v={rangeModel()} ads={ads()} controls={null} selected={null} onSelect={onSelect}
      ChannelCard={() => null} SalePipeline={() => null} settings={{}} updateAdsControl={() => {}} toast={() => {}} /></MemoryRouter>);
    const table = document.querySelector(".aw-brandtable");
    expect(within(table).getByRole("columnheader", { name: "เทียบช่วงก่อนหน้า" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("row", { name: /TEAMDEE/ })).getByText("฿1,560,880.00"));
    expect(onSelect).toHaveBeenCalledWith("b_td");
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

/* 25 ก.ย. (รีวิว UX ข้อ 2–4): เปอร์เซ็นต์สองตัวต้องบอกว่าเทียบกับอะไร · งบใช้ช้าห้ามเรียก "ตามแผน" · "ควรทำ" ห้ามเหมือนกันทุกแถว */
describe("ป้ายเปอร์เซ็นต์และคำแนะนำ", () => {
  const slowSpender = brand("b_jd", "JK Design", 20789, 100000, 3000, 20000);   // งบ 21.42% ของที่ควรใช้ (ตัดไม่ปัด)
  const v = () => model({ brands: [...brands, slowSpender], pipelines: { b_td: { items: [] }, b_ta: { items: [] }, b_jd: { items: [] } } });

  it("การ์ดแบรนด์: % ของเป้าเดือนของแบรนด์นั้น (เดิมเขียน 'ของเป้ารวม' ทั้งที่ไม่ใช่เป้ารวม) · บรรทัดจังหวะขึ้นต้นด้วย 'จังหวะ'", () => {
    const { container } = show(v());
    const card = [...container.querySelectorAll(".aw-brand")].find((b) => b.textContent.includes("TEAMDEE"));
    expect(card.textContent).toContain("44.59% ของเป้าเดือน");            // 1,560,880 ÷ 3,500,000
    expect(card.textContent).not.toContain("ของเป้ารวม");
    expect(card.querySelector(".aw-brand-line").textContent).toMatch(/^จังหวะ 63\.70% · ช้ากว่าแผน$/);
  });
  it("หัวการ์ด: 'ของเป้าทั้งเดือน' กับ 'ของที่ควรได้ถึงวันนี้' — คนละตัวหาร อ่านแล้วไม่สับสน", () => {
    const { container } = show(v());
    const hero = container.querySelector(".aw-hero");
    expect(hero.textContent).toContain("ของเป้าทั้งเดือน");
    expect(hero.textContent).toContain("ของที่ควรได้ถึงวันนี้");
  });
  it("งบที่ใช้ช้ากว่าแผนชัดเจน = 'ใช้ช้ากว่าแผน' ไม่ใช่ 'ตามแผน' · คำแนะนำไม่ซ้ำกันทุกแถว", () => {
    const { container } = show(v());
    const row = [...container.querySelectorAll("tr")].find((r) => r.textContent.includes("JK Design"));
    expect(row.textContent).toContain("21.42% ใช้ช้ากว่าแผน");
    expect(row.textContent).not.toContain("ตามแผน ");
    const advice = [...container.querySelectorAll("tbody tr")].map((r) => r.lastElementChild?.textContent);
    expect(new Set(advice).size).toBeGreaterThan(1);
  });
});

describe("รีวิว UX 25 ก.ย. ข้อ 10 และ 16", () => {
  it("ROAS/%Ads ที่ยังไม่ตั้งเป้า = 'ยังไม่ตั้งเป้า' ไม่ใช่ 'ทำได้ — ยังตัดสินใจไม่ได้'", () => {
    const { container } = show(model());
    const eff = container.querySelector(".aw-efficiency");
    expect(eff.textContent).not.toContain("ยังตัดสินใจไม่ได้");
    expect(eff.textContent).toContain("ยังไม่ตั้งเป้า");
  });
  it("ตารางแบรนด์: ทุกช่องมี data-label ให้จอมือถือแสดงเป็นการ์ดได้ (ชื่อหัวคอลัมน์ตรงกับ thead)", () => {
    const { container } = show(model());
    const heads = [...container.querySelectorAll(".aw-brandtable thead th")].slice(1).map((th) => th.textContent);
    for (const row of container.querySelectorAll(".aw-brandtable tbody tr")) {
      expect([...row.querySelectorAll("td")].map((td) => td.dataset.label)).toEqual(heads);
    }
  });
});

/* 26 ก.ย. (สเปก overview-cash): กล่องเงินจริงต่อจากงบ · ยกเลิกเฉพาะเมื่อมี · TMK บอกตรงๆ · ตารางมีคอลัมน์เงินเข้า */
describe("กล่องเงินจริง", () => {
  const row = (p) => ({ tracked: true, spend: 100000, revenue: 1131214, cash: 848244, deposits: 130, depositValue: 1140104, gap: -282970, cashPerSpend: 8.48244, cancelled: 0, cancelledValue: 0, refunds: 0, ...p });
  const cash = { overall: { ...row({ cash: 3309446.88, gap: 159156, cashPerSpend: 10.339 }), excluded: ["JUNTAKARN"] },
    byBrand: { b_td: row({ cash: 2461202.88, gap: 442126, revenue: 2019076.88 }), b_ta: row({ tracked: false, cash: null, deposits: null, depositValue: null, gap: null, cashPerSpend: null, cancelled: 2, cancelledValue: 588 }) } };
  const panel = () => screen.getByRole("group", { name: "เงินจริง" });

  it("ภาพรวม: เงินเข้าแล้วตัวใหญ่ · เกินยอดขาย · มัดจำ · เงินเข้าต่อค่าแอด · ป้ายไม่รวม", () => {
    show(model({ cash }));
    const p = panel();
    expect(p.textContent).toContain("฿3,309,446.88");
    // ชุด A ข้อ 7: บอกฐานยอดขายที่เทียบ (แบรนด์ที่มีเงินเข้า) — ไม่งั้นลบกับยอดขายใหญ่ด้านบนแล้วได้คนละคำตอบ
    expect(p.textContent).toContain("เงินเข้าเกินยอดขายของแบรนด์ที่มีข้อมูลเงินเข้า (฿1,131,214.00) อยู่ ฿159,156.00");
    expect(p.textContent).toMatch(/ได้ออเดอร์ \(จ่ายมัดจำ\)130 ราย/);
    expect(p.textContent).toContain("10.33×");                                        // เงินเข้าต่อค่าแอด ตัดไม่ปัด
    expect(p.textContent).toContain("เงินเข้า/มัดจำไม่รวม JUNTAKARN");
    expect(p.textContent).not.toContain("ยกเลิก");                                   // ไม่มียกเลิก = ไม่ขึ้นบรรทัด
  });
  it("เงินเข้าน้อยกว่ายอดขาย = ยังเก็บเงินไม่ครบ", () => {
    show(model({ cash: { overall: { ...row(), excluded: [] }, byBrand: {} } }));
    expect(panel().textContent).toContain("ยังเก็บเงินไม่ครบ ฿282,970.00");
  });
  it("แบรนด์ที่ระบบขายไม่มีเงินเข้า (TMK) = บอกตรงๆ · บรรทัดยกเลิกขึ้นเมื่อมี", () => {
    show(model({ cash }));
    fireEvent.click(screen.getAllByRole("button", { name: /t around/ })[0]);
    // ทดสอบละเอียด 27 ก.ย.: เดิมเขียน "ระบบ TMK" ทุกแบรนด์ที่ไม่มีเงินเข้า แม้แบรนด์นั้นไม่ได้ใช้ TMK
    expect(panel().textContent).toContain("ระบบขายของแบรนด์นี้ยังไม่ส่งข้อมูลเงินเข้าและมัดจำ");
    expect(panel().textContent).not.toContain("TMK");
    expect(panel().textContent).toContain("ยกเลิก 2 รายการ · ฿588.00");
  });
  it("ยกเลิกที่ระบบขายไม่ได้ใส่มูลค่า = บอกแค่จำนวน ไม่ขึ้น ฿0.00 (เห็นจริง 26 ก.ย.)", () => {
    show(model({ cash: { overall: { ...row({ cancelled: 1, cancelledValue: 0 }), excluded: [] }, byBrand: {} } }));
    const line = panel().querySelector(".aw-cash-cancel").textContent;
    expect(line).toBe("ยกเลิก 1 รายการ");
  });
  /* รีวิวโค้ด 28 ก.ย.: มีคืนเงินแต่ไม่มียกเลิก เคยขึ้น "ยกเลิก 0 รายการ · คืนเงิน …" */
  it("คืนเงินอย่างเดียว = บอกแค่คืนเงิน ไม่ขึ้น 'ยกเลิก 0 รายการ'", () => {
    show(model({ cash: { overall: { ...row({ cancelled: 0, cancelledValue: 0, refunds: 1200 }), excluded: [] }, byBrand: {} } }));
    expect(panel().querySelector(".aw-cash-cancel").textContent).toBe("คืนเงิน ฿1,200.00");
  });
  it("ตารางแบรนด์มีคอลัมน์เงินเข้า (ไม่รู้ = —) · data-label ตรงหัวคอลัมน์", () => {
    const { container } = show(model({ cash }));
    const heads = [...container.querySelectorAll(".aw-brandtable thead th")].map((th) => th.textContent);
    expect(heads).toContain("เงินเข้า");
    const cells = [...container.querySelectorAll('.aw-brandtable td[data-label="เงินเข้า"]')].map((td) => td.textContent);
    expect(cells).toEqual(["฿3,309,446.88", "—", "฿2,461,202.88"]);   // แถวแบรนด์เรียงตามความด่วน (27 ก.ย.) — t around (ไม่มีเงินเข้า) มาก่อน TEAMDEE
  });
  it("ข้อมูลตัวอย่าง (ไม่มี cash) = ไม่มีกล่องและไม่มีคอลัมน์", () => {
    const { container } = show(model());
    expect(screen.queryByRole("group", { name: "เงินจริง" })).toBeNull();
    expect(container.querySelector('.aw-brandtable td[data-label="เงินเข้า"]')).toBeNull();
  });
});

/* 26 ก.ย. (สเปก overview-cash): เชิงอรรถรวมที่ "สูตรและที่มา" · คงเฉพาะข้อความเตือนสถานะข้อมูล · ระหว่างโหลดไม่โชว์ค่าหลอก */
describe("เชิงอรรถที่เดียว + สถานะโหลด", () => {
  const withExcluded = () => model({ summary: { ...model().summary, excludedWaiting: ["JUNTAKARN"], targetExcluded: ["t around"] },
    overallPipeline: { ...model().overallPipeline, excluded: ["JUNTAKARN"] } });
  it("เนื้อหาหลักไม่มีเชิงอรรถ (.aw-key) นอก 'สูตรและที่มา' · ป้ายสั้น 'ไม่รวม' ยังอยู่ข้างตัวเลขรวม", () => {
    const { container } = show(withExcluded());
    const stray = [...container.querySelectorAll(".aw-layout .aw-key")].filter((n) => !n.closest(".aw-notes") && !n.closest(".aw-trend, .aw-trends, [class*=trend]"));
    expect(stray.map((n) => n.textContent)).toEqual([]);
    expect(container.querySelector(".aw-hero").textContent).toContain("ไม่รวม JUNTAKARN");
    expect(container.querySelector(".aw-efficiency details")).toBeNull();                        // "สูตรที่ใช้" ย้ายไปรวม
  });
  it("'สูตรและที่มา' พับไว้ท้ายหน้า รวมขีดบนแถบ · สูตร · แบรนด์ที่ไม่รวมพร้อมเหตุผล", () => {
    const { container } = show(withExcluded());
    const notes = screen.getByText("สูตรและที่มา").closest("details");
    expect(notes.open).toBe(false);
    expect(notes.textContent).toMatch(/ขีดบนแถบ.*ROAS =.*%Ads =.*เงินเข้าต่อค่าแอด =/s);
    expect(notes.textContent).toContain("รอเชื่อมแหล่งข้อมูลยอดขาย");
    expect(notes.textContent).toContain("เป้ารวมยังไม่รวม t around");
    expect(notes.textContent).toMatch(/funnel.*ไม่รวม JUNTAKARN/);
    expect(container.querySelector(".aw-notes")).toBe(notes);
  });
  it("ข้อความเตือนสถานะข้อมูลยังอยู่ในกล่อง (ค่าแอดค้าง)", () => {
    const stale = model({ overallPace: { ...model().overallPace, budget: { ...model().overallPace.budget, reason: "stale" } } });
    show(stale);
    expect(screen.getByText(/ยังตัดสินจังหวะงบไม่ได้/)).toBeTruthy();
  });
  it("กำลังโหลด = ไม่โชว์ hero/หน้าปัด/ตาราง (เดิมขึ้น 'ยังไม่ตั้งเป้า' · 'ตามแผน' · 0)", () => {
    const { container } = show(model(), ads("loading"));
    expect(container.querySelector(".aw-hero")).toBeNull();
    expect(container.querySelector(".aw-brandtable")).toBeNull();
    expect(screen.getByText(/กำลังโหลดตัวเลขจริง/)).toBeTruthy();
  });
});

it("ชุด A ข้อ 7: บรรทัดยกเลิกบอกว่านับทุกแบรนด์ เมื่อกล่องไม่รวมบางแบรนด์", () => {
  const c = { tracked: true, spend: 100, revenue: 1000, cash: 900, deposits: 1, depositValue: 10, gap: -100, cashPerSpend: 9, cancelled: 6, cancelledValue: 588, refunds: 0, excluded: ["JUNTAKARN"] };
  show(model({ cash: { overall: c, byBrand: {} } }));
  expect(screen.getByRole("group", { name: "เงินจริง" }).querySelector(".aw-cash-cancel").textContent).toBe("ยกเลิก 6 รายการ · ฿588.00 · นับทุกแบรนด์");
});

describe("ภาพรวม — โหลดไม่สำเร็จ / มุมช่วงวัน (ชุด A ข้อ 5)", () => {
  it("มุมเดือนโหลดพัง = ไม่โชว์ hero/ตาราง (เดิม ฿0.00 · ยังไม่ตั้งเป้า)", () => {
    const { container } = show(model(), ads("error"));
    expect(container.querySelector(".aw-hero")).toBeNull();
    expect(container.querySelector(".aw-brandtable")).toBeNull();
  });
  it("มุมช่วงวัน: กำลังโหลด / โหลดพัง = ไม่โชว์ตัวเลข", () => {
    for (const st of ["loading", "error"]) {
      const { container, unmount } = show(model({ monthView: false }), ads(st));
      expect(container.querySelector(".aw-hero")).toBeNull();
      unmount();
    }
  });
});

/* ชุด C ข้อ 13: งบติดลบเคยขึ้น "งบคงเหลือ ฿-7,780.32" → ต้องเป็น "ใช้เกินงบ ฿7,780.32" */
describe("ใช้เกินงบ", () => {
  it("ค่าแอดเกินงบ = ป้าย 'ใช้เกินงบ' กับยอดบวก ไม่ใช่งบคงเหลือติดลบ", () => {
    const over = paceSet(1825399, 4100000, 262780.32, 255000);
    const { container } = show(model({ overallPace: over, summary: { ...model().summary, spend: 262780.32 } }));
    const facts = [...container.querySelectorAll(".aw-facts > div")].map((d) => d.textContent);
    expect(facts.some((t) => t.startsWith("ใช้เกินงบ") && t.includes("฿7,780.32"))).toBe(true);
    expect(container.textContent).not.toContain("฿-");
  });
});


/* อาร์ตเคาะ 27 ก.ย.: กรอกเงินเข้าไม่ครบทุกวัน = รวมเฉพาะวันที่กรอก + บอกจำนวนวัน */
describe("เงินจริง — กรอกไม่ครบทุกวัน", () => {
  const partialCash = { overall: { tracked: true, cash: 3000, revenue: 3000, gap: 0, deposits: 1, depositValue: 100, cashPerSpend: 3, cancelled: 0, cancelledValue: 0, refunds: 0,
    excluded: [], partial: [{ name: "TEAMDEE", days: 24, total: 27 }] }, byBrand: {} };
  it("บอกว่านับเฉพาะวันที่กรอก พร้อมจำนวนวันต่อแบรนด์ · ฐานเทียบคือยอดขายของวันเดียวกัน", () => {
    show(model({ cash: partialCash }));
    const text = screen.getByRole("group", { name: "เงินจริง" }).textContent;
    expect(text).toContain("นับเฉพาะวันที่ระบบขายกรอกเงินเข้า · TEAMDEE 24/27 วัน");
    expect(text).toContain("เท่ายอดขายของวันที่กรอก");
  });
});

/* ทดสอบละเอียดรอบ 2: ยอดขาย/เป้าโหลดพัง = บอกตรงๆ + ลองใหม่ ห้ามขึ้น "ยังไม่ตั้งเป้า" (อ่านเป็นว่าทีมขายยังไม่ตั้ง) */
it("ยอดขายหรือเป้าโหลดไม่สำเร็จ = กล่องแจ้ง + ลองใหม่ · ไม่ขึ้น 'ยังไม่ตั้งเป้า'", () => {
  const broken = { ...ads(), pilot: { ...ads().pilot, salesFailed: true } };
  const { container } = show(model(), broken);
  expect(screen.getByRole("alert").textContent).toContain("โหลดยอดขายและเป้าไม่สำเร็จ");
  expect(within(screen.getByRole("alert")).getByRole("button", { name: "ลองใหม่" })).toBeTruthy();
  // ข้อความที่อ่านเป็น "ทีมขายยังไม่ตั้ง / ไม่มีข้อมูล" ห้ามขึ้น (ประโยคในกล่องแจ้งที่บอกว่า "ไม่ได้แปลว่ายังไม่ตั้งเป้า" ขึ้นได้)
  expect(container.textContent).not.toMatch(/ยังไม่ตั้งเป้าเดือนนี้|เป้าเดือนนี้ยังไม่ตั้งเป้า|ยังไม่มีข้อมูล/);
});

/* ทดสอบละเอียดรอบ 2 (หน้าจริง): ช่วง 1–30 มิ.ย. แต่ค่าแอดในระบบเริ่ม 18 มิ.ย. → ROAS 32.35× (ยอดขายทั้งเดือน ÷ ค่าแอดครึ่งเดือน) ไม่มีคำเตือน */
it("ช่วงที่เลือกเริ่มก่อนวันแรกที่มีค่าแอด = แจ้งชัด + ROAS/%Ads ไม่แสดง", () => {
  const early = { ...ads(), pilot: { ...ads().pilot, summary: { from: "2026-09-10" } } };
  const { container } = show(model({ monthView: false, rangeLabel: "1 – 21 ก.ย.", compareLabel: "ช่วงก่อนหน้า", overallPace: null,
    brands: brands.map((b) => ({ ...b, prevRevenue: b.revenue, prevSpend: b.spend, spendChangePct: 0, pace2: null })) }), early);
  expect(screen.getByRole("alert").textContent).toContain("ระบบมีข้อมูลค่าแอดตั้งแต่ 10 ก.ย.");
  const facts = [...container.querySelectorAll(".aw-range-facts > div")].map((d) => d.textContent);
  expect(facts.find((t) => t.startsWith("ROAS"))).toBe("ROAS—");
});
it("มุมมองเดือน: เดือนที่เริ่มก่อนวันแรกที่มีค่าแอด = แจ้ง + ROAS ไม่แสดง", () => {
  const early = { ...ads(), pilot: { ...ads().pilot, summary: { from: "2026-09-10" } } };
  show(model(), early);
  expect(screen.getByRole("alert").textContent).toContain("ระบบมีข้อมูลค่าแอดตั้งแต่ 10 ก.ย.");
  expect(document.body.textContent).not.toContain("8.78×");
});

/* ทดสอบแบบผู้ใช้จริง: %Ads (ยิ่งน้อยยิ่งดี) เคยขึ้น "ทำได้ 146.52% เกินเป้า" อ่านเป็นข่าวดี */
it("%Ads บอกเป็น % ของเพดาน ไม่ใช่ 'ทำได้' · ROAS บอกเป็น % ของเป้า", () => {
  const goals = { overall: { roas: { target: 8, pct: 1.0975, paceState: "ontrack", kind: "rate_higher" }, pctAds: { target: 0.1, pct: 1.379, paceState: "bad", kind: "rate_lower" } }, byBrand: {} };
  const { container } = show(model({ goals }));
  const foot = [...container.querySelectorAll(".aw-metric-foot")].map((f) => f.textContent);
  expect(foot.some((t) => /ทำได้ 109\.75% ของเป้า/.test(t))).toBe(true);
  expect(foot.some((t) => /137\.90% ของเพดาน · เกินเพดาน/.test(t))).toBe(true);
  expect(foot.some((t) => /ทำได้ 137/.test(t))).toBe(false);
});

/* ทดสอบแบบผู้ใช้จริง: หัวหน้าบอก "1 – 27 ก.ย." แต่ค่าแอดดึงวันละครั้งตอนเช้า มีถึงเมื่อวาน — ไม่มีที่ไหนบอก */
it("กล่องงบบอกว่าค่าแอดมีถึงวันไหน เมื่อยังไม่ถึงวันนี้ · วันที่แสดงแบบไทย", () => {
  const { container } = show(model({ spendThrough: "2026-09-20" }));
  expect(container.textContent).toContain("ค่าแอดถึง 20 ก.ย. (ดึงวันละครั้งตอนเช้า)");
  expect(container.textContent).not.toContain("2026-09-20");
});

/* อาร์ตเคาะ 27 ก.ย.: จังหวะคิดถึงวันที่ข้อมูลครบ → ทุกคำว่า "ถึงวันนี้" ต้องบอกวันนั้นแทน ไม่งั้นตัวเลขกับคำขัดกัน */
it("มี asOf: ป้ายจังหวะบอกวันที่ใช้คิด ไม่ใช่ 'วันนี้'", () => {
  const { container } = show(model({ asOf: "2026-09-20" }));
  const t = container.textContent;
  expect(t).toContain("ควรถึง 20 ก.ย.");
  expect(t).toContain("ควรใช้ถึง 20 ก.ย.");
  expect(t).toContain("ของที่ควรได้ถึง 20 ก.ย.");
  expect(t).not.toMatch(/ถึงวันนี้|ใช้วันนี้/);
});

/* ทดสอบแบบใช้งานจริง 27 ก.ย. (อาร์ต "แก้เลยตามนี้"): บรรทัดสรุปบนสุด + ตารางแบรนด์เรียงตามความด่วน */
describe("บรรทัดสรุปผู้บริหาร · ตารางเรียงตามความด่วน", () => {
  it("ภาพรวมเดือนนี้: คาดขาดเป้า · เกินงบกี่แบรนด์ · เรื่องแรก (กดแล้วเปิดแบรนด์นั้น)", () => {
    const onSelect = vi.fn();
    render(<MemoryRouter><AdsWorkspace v={model()} ads={ads()} controls={null} onSelect={onSelect}
      ChannelCard={() => null} SalePipeline={() => null} settings={{}} updateAdsControl={() => {}} toast={() => {}} /></MemoryRouter>);
    const line = document.querySelector(".aw-digest");
    // 1,825,399 × 30 ÷ 21 = 2,607,712.857… แสดง ฿2,607,712.85 → ขาด 4,100,000 − 2,607,712.85 = 1,492,287.15 (บวกกลับได้เท่าเป้า)
    expect(line.textContent).toBe("คาดขาดเป้า ฿1,492,287.15 · ค่าแอดเกินงบ 1 แบรนด์ · เรื่องแรก: t around — ตรวจแคมเปญ/ครีเอทีฟทันที");   // งบรวม 207,827.08 ยังไม่เกิน 255,000
    fireEvent.click(within(line).getByRole("button", { name: "t around" }));
    expect(onSelect).toHaveBeenCalledWith("b_ta");
  });
  /* ตรวจรอบ 27 ก.ย. ดึก: มือถือเห็นแถบเลือกแบรนด์ก่อนบรรทัดสรุป → บรรทัดสรุปต้องมาก่อนแถบแบรนด์ในลำดับหน้า */
  it("บรรทัดสรุปอยู่ก่อนแถบเลือกแบรนด์ (มือถืออ่านบนลงล่าง)", () => {
    const { container } = show(model());
    const digest = container.querySelector(".aw-digest"), rail = container.querySelector(".aw-brands");
    expect(digest.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("งบรวมเกินแล้ว = บอกก่อนว่าเกินงบรวม แล้วค่อยบอกจำนวนแบรนด์", () => {
    const over = model({ overallPace: paceSet(1825399, 4100000, 262780.32, 255000) });
    const { container } = show(over);
    expect(container.querySelector(".aw-digest").textContent).toContain("ค่าแอดเกินงบรวมแล้ว (เกิน 1 แบรนด์)");
  });
  it("ตารางแบรนด์: แถวภาพรวมบนสุด แล้วเรียงแบรนด์ที่ด่วนกว่าก่อน (t around เกินงบ มาก่อน TEAMDEE)", () => {
    const { container } = show(model());
    const names = [...container.querySelectorAll(".aw-brandtable tbody th")].map((th) => th.textContent);
    expect(names[0]).toBe("ภาพรวมทุกแบรนด์");
    expect(names.slice(1).map((n) => ["t around", "TEAMDEE"].find((x) => n.endsWith(x)))).toEqual(["t around", "TEAMDEE"]);
  });
  /* ตรวจรอบ 28 ก.ย.: แถบเลือกแบรนด์เรียงตามลำดับเดิม แต่ตารางเรียงตามความด่วน — สองที่ต้องเรียงเหมือนกัน */
  it("แถบเลือกแบรนด์เรียงตามความด่วนเหมือนตาราง (ภาพรวมบนสุด)", () => {
    const { container } = show(model());
    const names = [...container.querySelectorAll(".aw-brands .aw-brand strong")].map((el) => el.textContent);
    expect(names).toEqual(["ภาพรวมทุกแบรนด์", "t around", "TEAMDEE"]);
  });
  it("ไม่ใช่เดือนนี้ = ไม่มีบรรทัดสรุป (ไม่มีจังหวะให้คาด)", () => {
    const { container } = show(model({ monthView: false, overallPace: null, brands: brands.map((b) => ({ ...b, prevRevenue: b.revenue, prevSpend: b.spend, spendChangePct: 0, pace2: null })) }));
    expect(container.querySelector(".aw-digest")).toBeNull();
  });
});

/* ตรวจรอบ 27 ก.ย. ดึก: ช่วง "วันนี้" ขึ้น ฿0.00 · ▼ 100.00% แดงทั้งหน้า ทั้งที่ข้อมูลดึงวันละครั้งตอนเช้า (ของวันนี้ยังไม่มา)
   → ยังไม่มีตัวเลขของวันนี้ = บอกว่าจะเข้าเมื่อไร + ปุ่มดูเมื่อวาน ไม่โชว์การเทียบที่หลอกตา */
describe("ช่วงวันนี้ที่ข้อมูลยังไม่เข้า", () => {
  const zero = (b) => ({ ...b, revenue: 0, spend: 0, prevRevenue: b.revenue, prevSpend: b.spend, revChangePct: -100, spendChangePct: -100, pace2: null });
  const todayModel = (over = {}) => model({ monthView: false, rangeLabel: "27 ก.ย. 2569", compareLabel: "ช่วงก่อนหน้า", overallPace: null, dataThrough: "2026-09-26",
    range: { start: new Date("2026-09-27T00:00:00"), end: new Date("2026-09-28T00:00:00") },
    summary: { ...model().summary, revenue: 0, spend: 0, revChangePct: -100, spendChangePct: -100 }, brands: brands.map(zero), ...over });
  const showToday = (v) => render(<MemoryRouter initialEntries={["/mkt/ads?period=today&compare=prev"]}><AdsWorkspace v={v} ads={{ ...ads(), pilot: { ...ads().pilot, summary: { provisionalToday: true } } }} controls={null} todayOnly
    ChannelCard={() => null} SalePipeline={() => null} settings={{}} updateAdsControl={() => {}} toast={() => {}} /></MemoryRouter>);
  it("ค่าแอดและยอดขายเป็น 0 = กล่องบอกว่าข้อมูลเข้าพรุ่งนี้ + ลิงก์ดูเมื่อวาน · ไม่มี ▼ 100.00%", () => {
    const { container } = showToday(todayModel());
    const box = container.querySelector(".aw-today-pending");
    expect(box.textContent).toContain("ข้อมูลของ 27 ก.ย. 2569 ยังไม่เข้า");
    expect(box.textContent).toContain("ตอนนี้มีข้อมูลถึง 26 ก.ย.");
    // ลิงก์ไปวันล่าสุดที่มีข้อมูลจริง ไม่ใช่ "เมื่อวาน" (หลังเที่ยงคืนก่อนตี 5 เมื่อวานก็ยังไม่มีข้อมูล) · คงตัวกรองอื่นไว้
    const link = within(box).getByRole("link", { name: "ดูข้อมูลล่าสุด (26 ก.ย.)" });
    expect(link.getAttribute("href")).toBe("/mkt/ads?period=custom&compare=prev&from=2026-09-26&to=2026-09-26");
    expect(container.textContent).not.toContain("100.00%");
    expect(container.querySelector(".ads-source-flag")).toBeNull();   // ไม่พูดซ้ำบนแถบที่มา
  });
  it("มีตัวเลขของวันนี้แล้ว (เช่นกดดึงเอง) = แสดงหน้าปกติ", () => {
    const { container } = showToday(todayModel({ summary: { ...model().summary, revenue: 0, spend: 120.5 } }));
    expect(container.querySelector(".aw-today-pending")).toBeNull();
  });
  it("เมื่อวานตอนดึก (ก่อนรอบตี 5) ก็ขึ้นกล่องเดียวกัน — ช่วงอยู่หลังวันที่มีข้อมูล", () => {
    const { container } = show(todayModel({ rangeLabel: "27 ก.ย. 2569" }));
    expect(container.querySelector(".aw-today-pending")).toBeTruthy();
  });
  it("ช่วงที่มีข้อมูลแล้วแต่ยอดเป็น 0 จริง = หน้าปกติ (ไม่ใช่ข้อมูลยังไม่เข้า)", () => {
    const { container } = show(todayModel({ dataThrough: "2026-09-27" }));
    expect(container.querySelector(".aw-today-pending")).toBeNull();
  });
});

/* รีวิวโค้ด 28 ก.ย.: วันที่ 1 ของเดือน (ค่าเริ่มต้น "เดือนนี้") ช่วงว่างเพราะข้อมูลถึงสิ้นเดือนก่อน — เดิมขึ้น ฿0.00 · ทำได้ 0.00% */
it("เดือนนี้วันที่ 1 (ยังไม่มีข้อมูลของเดือนนี้) = กล่องข้อมูลยังไม่เข้า ไม่ใช่ ฿0.00", () => {
  const empty = model({ rangeLabel: "1 ต.ค. 2569", dataThrough: "2026-09-30",
    range: { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-01T00:00:00") },
    summary: { ...model().summary, revenue: 0, spend: 0 } });
  const { container } = show(empty);
  expect(container.querySelector(".aw-today-pending").textContent).toContain("ข้อมูลของ 1 ต.ค. 2569 ยังไม่เข้า");
  expect(container.querySelector(".aw-hero")).toBeNull();
});
