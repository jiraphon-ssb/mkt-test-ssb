/* รายงานประชุม — ตอบคำถามที่ประชุมถามจากตัวเลขชุดเดียวกับหน้า Overview/แคมเปญ/Creative */
import { describe, expect, it } from "vitest";
import { reportSales, reportEfficiency, reportFunnel, reportDrivers, reportCampaigns, reportCreatives, reportHeadline } from "../src/modules/marketing/report/meetingReport.js";

const overview = {
  monthView: true, compareLabel: "ช่วงก่อนหน้า",
  summary: {
    revenue: 2393138, prevRevenue: 2541000, revChangePct: -5.82, revTarget: 5400000, revPct: 0.4431,
    revPace: { expectedSpend: 3060000, forecast: 4223184.7, forecastOver: -1176815.3 },
    spend: 329567.65, prevSpend: 266400, spendChangePct: 23.71, budget: 345000, excludedWaiting: ["JUNTAKARN"],
  },
  brands: [
    { id: "b_td", name: "TEAMDEE", salesSource: "sales", revenue: 1229642, prevRevenue: 1000000, spend: 130000, prevSpend: 100000 },
    { id: "b_jd", name: "JK Design", salesSource: "sales", revenue: 943412, prevRevenue: 1300000, spend: 90000, prevSpend: 80000 },
    { id: "b_jt", name: "JUNTAKARN", salesSource: "waiting", revenue: null, prevRevenue: null, spend: 57607.39, prevSpend: 40000 },
    { id: "b_ta", name: "t around", salesSource: "sales", revenue: 220084, prevRevenue: 241000, spend: 50000, prevSpend: 46400 },
  ],
  overallPipeline: {
    worstKey: "qualified",
    items: [
      { key: "inquiries", label: "คนทัก (ทีมกรอก)", value: 2642, before: null, conv: null },
      { key: "qualified", label: "Lead", value: 354, before: 336, conv: 0.134 },
      { key: "deposits", label: "ได้ออเดอร์", value: 330, before: null, conv: 0.932 },
      { key: "closed", label: "ยืนยันออเดอร์", value: 173, before: 160, conv: 0.524 },
      { key: "roas", label: "ROAS", value: 8.79, before: 10.2, sense: "higher", fmt: "roas" },
      { key: "pctAds", label: "%Ads", value: 0.159, before: 0.12, sense: "lower", fmt: "pct1" },
      { key: "cpl", label: "CPL", value: 768.24, before: 610, sense: "lower", fmt: "money" },
      { key: "cac", label: "CAC", value: null, before: null, sense: "lower", fmt: "money" },
    ],
  },
  goals: { overall: { roas: { state: "set", tone: "emerald", text: "ถึงเป้า", target: 8.76 }, pctAds: { state: "set", tone: "rose", text: "เกินเป้า", target: 0.1141 }, cpl: { state: "unset", tone: "zinc", text: "ยังไม่ตั้งเป้า", target: null } } },
};

describe("reportSales", () => {
  it("ยอด เทียบช่วงก่อน และ (เดือนนี้) เป้า ควรได้วันนี้ คาดสิ้นเดือน ส่วนต่างจากเป้า", () => {
    expect(reportSales(overview)).toEqual({
      revenue: 2393138, prevRevenue: 2541000, change: -5.82, target: 5400000, pctOfTarget: 0.4431,
      expectedToDate: 3060000, forecast: 4223184.7, forecastGap: -1176815.3, monthView: true, excluded: ["JUNTAKARN"],
    });
  });
  it("ช่วงที่ไม่ใช่เดือนนี้: ไม่มีเป้า/คาดการณ์ (null) ไม่ใช่ 0", () => {
    expect(reportSales({ ...overview, monthView: false })).toMatchObject({ target: null, forecast: null, forecastGap: null, expectedToDate: null });
  });
});

describe("reportEfficiency", () => {
  it("ค่าแอด + ROAS %Ads CPL CAC พร้อม % เปลี่ยน ทิศที่ดี และผลเทียบเป้า", () => {
    const rows = reportEfficiency(overview);
    expect(rows.map((r) => r.key)).toEqual(["spend", "roas", "pctAds", "cpl", "cac"]);
    expect(rows[0]).toMatchObject({ value: 329567.65, before: 266400, sense: "lower", fmt: "money" });
    expect(rows[1]).toMatchObject({ value: 8.79, goal: { tone: "emerald", text: "ถึงเป้า", target: 8.76 } });
    expect(rows[1].change).toBeCloseTo(-13.82, 2);
    expect(rows[3].goal).toBeNull();
    expect(rows[4]).toMatchObject({ value: null, change: null });
  });
});

describe("reportFunnel", () => {
  it("4 ขั้นพร้อมอัตราแปลงและขั้นที่หล่นแรงสุด", () => {
    const f = reportFunnel(overview);
    expect(f.stages.map((s) => s.label)).toEqual(["คนทัก (ทีมกรอก)", "Lead", "ได้ออเดอร์", "ยืนยันออเดอร์"]);
    expect(f.worst).toMatchObject({ label: "Lead", from: "คนทัก (ทีมกรอก)", conv: 0.134 });
  });
});

describe("reportDrivers — อะไรทำให้ตัวเลขเปลี่ยน", () => {
  it("ยอดขาย: ส่วนต่างรายแบรนด์ เรียงตามขนาด · แบรนด์ไม่มีข้อมูลไม่นับ · สัดส่วนของส่วนต่างรวม", () => {
    const d = reportDrivers(overview);
    expect(d.revenue.map((r) => [r.name, r.delta])).toEqual([["JK Design", -356588], ["TEAMDEE", 229642], ["t around", -20916]]);
    expect(d.revenueTotalDelta).toBe(-147862);
    expect(d.spend.map((r) => r.name)).toEqual(["TEAMDEE", "JUNTAKARN", "JK Design", "t around"]);
  });
});

describe("reportCampaigns", () => {
  const row = (name, tag, spend, extra = {}) => ({ key: name, name, brand: "TEAMDEE", spend, cpl: 90, leads: 10, prev: { spend: spend / 2 }, decision: { tag, label: tag, tone: "rose", why: `why ${name}`, next: `next ${name}` }, ...extra });
  const rows = [row("A", "stop", 5000), row("B", "fix", 9000), row("C", "watch", 20000), row("D", "fix", 1000), row("E", "wait", 300, { prev: { spend: null } })];
  it("นับตามคำแนะนำ · รายการที่ต้องทำ (หยุด/แก้) เรียงค่าแอดมากก่อน · ค่าแอดรวมที่ต้องตัดสินใจ", () => {
    const c = reportCampaigns(rows);
    expect(c.counts).toEqual({ stop: 1, fix: 2, watch: 1, wait: 1 });
    expect(c.actions.map((r) => r.name)).toEqual(["B", "A", "D"]);
    expect(c.actionSpend).toBe(15000);
    expect(c.topSpend.map((r) => r.name)).toEqual(["C", "B", "A"]);
    expect(c.movers.map((r) => [r.name, r.delta])).toEqual([["C", 10000], ["B", 4500], ["A", 2500]]);
  });
});

describe("reportCreatives", () => {
  const cr = (creative, spend, purchases, extra = {}) => ({ key: creative, creative, brand: "TEAMDEE", spend, purchases, cpa: purchases > 0 ? spend / purchases : null, cpl: 80, fatigue: false, ...extra });
  const rows = [cr("ดี", 3000, 6), cr("ดีกว่า", 2000, 5), cr("เผา", 4000, 0), cr("เผาน้อย", 1200, 0), cr("เล็ก", 500, 0), cr("ล้า", 5000, 2, { fatigue: true }), cr("ไม่รู้", 6000, null)];
  it("คุ้มสุด (ต้นทุนต่อการซื้อต่ำ) · ใช้เงินแต่ยังไม่มีการซื้อ (≥ ฿1,000) · เริ่มล้า", () => {
    const c = reportCreatives(rows);
    expect(c.best.map((r) => r.creative)).toEqual(["ดีกว่า", "ดี", "ล้า"]);
    expect(c.noPurchase.map((r) => r.creative)).toEqual(["เผา", "เผาน้อย"]);
    expect(c.noPurchaseSpend).toBe(5200);
    expect(c.fatigue).toEqual({ count: 1, spend: 5000 });
    expect(c.tracksPurchases).toBe(true);
  });
});

describe("reportHeadline — สรุป 1 นาที", () => {
  it("ประโยคสั้นตอบคำถามหลัก พร้อมโทน (ดี/ต้องคุย)", () => {
    const lines = reportHeadline({
      sales: reportSales(overview), efficiency: reportEfficiency(overview), funnel: reportFunnel(overview), drivers: reportDrivers(overview),
      campaigns: { counts: { stop: 1, fix: 2 }, actionSpend: 15000 }, creatives: { noPurchase: [{}, {}], noPurchaseSpend: 5200, fatigue: { count: 1, spend: 5000 }, tracksPurchases: true },
      compareLabel: "ช่วงก่อนหน้า",
    });
    expect(lines).toEqual([
      { key: "sales", tone: "rose", text: "ยอดขาย ฿2,393,138.00 (-5.82% เทียบช่วงก่อนหน้า) · ทำได้ 44.31% ของเป้า · คาดสิ้นเดือน ฿4,223,184.70 ต่ำกว่าเป้า ฿1,176,815.30" },
      { key: "spend", tone: "amber", text: "ค่าแอด ฿329,567.65 (+23.71%) · ROAS 8.79× (ถึงเป้า) · %Ads 15.90% (เกินเป้า)" },
      { key: "driver", tone: "zinc", text: "ยอดขายเปลี่ยนมากสุดจาก JK Design (-฿356,588.00)" },
      { key: "funnel", tone: "amber", text: "ลูกค้าหล่นมากสุดช่วง คนทัก (ทีมกรอก) → Lead (ผ่าน 13.40%)" },
      { key: "campaigns", tone: "rose", text: "แคมเปญควรพิจารณาหยุด 1 · ควรแก้ 2 (ค่าแอดรวม ฿15,000.00)" },
      { key: "creatives", tone: "amber", text: "ครีเอทีฟใช้เงินเกิน ฿1,000 แต่ยังไม่มีการซื้อ 2 ชิ้น (฿5,200.00) · เริ่มล้า 1 ชิ้น" },
    ]);
  });
  it("แคมเปญไม่มีที่ต้องหยุด/แก้: บอกจำนวนที่ติดตามและรอข้อมูลด้วย (ไม่ให้ดูเหมือนตรวจครบแล้วทุกตัว)", () => {
    const [line] = reportHeadline({ campaigns: { counts: { watch: 55, wait: 13 }, actionSpend: 0 } });
    expect(line).toEqual({ key: "campaigns", tone: "zinc", text: "ไม่มีแคมเปญที่ควรหยุดหรือแก้ตามกฎ · ติดตาม 55 · รอข้อมูล 13" });
  });
});
