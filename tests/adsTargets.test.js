import { describe, it, expect } from "vitest";
import { TARGET_METRICS, normalizeTargets, combineTargets, targetProgress, goalsFor, periodForTargets, pipelineValues } from "../src/modules/marketing/adsTargets.js";

const metric = (key) => TARGET_METRICS.find((m) => m.key === key);
const MONTH = { mode: "month", elapsed: 0.5 };              // ผ่านไปครึ่งเดือน
const WEEK = { mode: "range", rangeDays: 7, monthDays: 28 }; // ช่วง 7 วัน ในเดือน 28 วัน

describe("normalizeTargets — ค่าจากหน้าตั้งค่า → หน่วยเดียวกับตัวชี้วัด", () => {
  it("%Ads เก็บเป็นเปอร์เซ็นต์ → แปลงเป็นสัดส่วน · 0/ว่าง/ติดลบ = ยังไม่ตั้ง (null)", () => {
    expect(normalizeTargets({ roas: 4, pctAds: 20, cpl: 500, inquiries: 300, qualified: 0, deposits: null, closed: -1 }))
      .toEqual({ roas: 4, pctAds: 0.2, cpl: 500, inquiries: 300, qualified: null, deposits: null, closed: null });
    expect(normalizeTargets(undefined).roas).toBeNull();
  });
});

describe("combineTargets — เป้าภาพรวมทุกแบรนด์", () => {
  const td = { roas: 4, pctAds: 20, cpl: 400, budget: 30_000, revenue: 150_000, inquiries: 100, qualified: 60, deposits: 10, closed: 8 };
  const jt = { roas: 2, pctAds: 40, cpl: 200, budget: 10_000, revenue: 25_000, inquiries: 50, qualified: 30, deposits: 5, closed: 4 };
  it("นับ = ผลรวม · ROAS ถ่วงด้วยงบ · %Ads ถ่วงด้วยเป้ายอดขาย · CPL ถ่วงด้วยเป้าคนทัก", () => {
    const c = combineTargets([td, jt]);
    expect(c.inquiries).toBe(150);
    expect(c.closed).toBe(12);
    expect(c.roas).toBeCloseTo((4 * 30_000 + 2 * 10_000) / 40_000);      // 3.5
    expect(c.pctAds).toBeCloseTo((0.2 * 150_000 + 0.4 * 25_000) / 175_000);
    expect(c.cpl).toBeCloseTo((400 * 100 + 200 * 50) / 150);
    expect(c.coverage).toEqual({ brands: 2 });
  });
  it("มีแบรนด์ไหนยังไม่ตั้งเป้าตัวนั้น → เป้ารวมตัวนั้นเป็น null (ไม่เดาจากบางแบรนด์) + บอกว่าตั้งกี่แบรนด์", () => {
    const c = combineTargets([td, { ...jt, inquiries: 0, roas: null }]);
    expect(c.inquiries).toBeNull();
    expect(c.roas).toBeNull();
    expect(c.qualified).toBe(90);
    expect(c.missing.inquiries).toBe(1);
  });
  it("ไม่มีน้ำหนัก (งบ/ยอดขายไม่ได้ตั้ง) → เฉลี่ยเท่ากัน", () => {
    const c = combineTargets([{ roas: 4 }, { roas: 2 }]);
    expect(c.roas).toBe(3);
  });
});

describe("targetProgress — ทำได้เท่าไรจากเป้า และดีหรือแย่", () => {
  it("ยังไม่ตั้งเป้า / ยังไม่มีข้อมูล", () => {
    expect(targetProgress(metric("roas"), 3, null, MONTH)).toMatchObject({ state: "unset", tone: "zinc", text: "ยังไม่ตั้งเป้า" });
    expect(targetProgress(metric("roas"), null, 4, MONTH)).toMatchObject({ state: "nodata", tone: "zinc", target: 4 });
  });
  it("ROAS สูงกว่าดี: ≥ เป้า = ถึงเป้า · ≥ 90% = ใกล้เป้า · ต่ำกว่านั้น = ต่ำกว่าเป้า", () => {
    expect(targetProgress(metric("roas"), 4.4, 4, MONTH)).toMatchObject({ tone: "emerald", text: "ถึงเป้า" });
    expect(targetProgress(metric("roas"), 4.4, 4, MONTH).pct).toBeCloseTo(1.1);
    expect(targetProgress(metric("roas"), 3.7, 4, MONTH)).toMatchObject({ tone: "amber", text: "ใกล้เป้า" });
    expect(targetProgress(metric("roas"), 2, 4, MONTH)).toMatchObject({ tone: "rose", text: "ต่ำกว่าเป้า", pct: 0.5 });
  });
  it("%Ads ต่ำกว่าดี: ≤ เพดาน = อยู่ในเป้า · เกิน ≤ 10% = เกินเป้าเล็กน้อย · เกินกว่านั้น = เกินเป้า", () => {
    expect(targetProgress(metric("pctAds"), 0.18, 0.2, MONTH)).toMatchObject({ tone: "emerald", text: "อยู่ในเป้า" });
    expect(targetProgress(metric("pctAds"), 0.215, 0.2, MONTH)).toMatchObject({ tone: "amber", text: "เกินเป้าเล็กน้อย" });
    expect(targetProgress(metric("pctAds"), 0.3, 0.2, MONTH)).toMatchObject({ tone: "rose", text: "เกินเป้า" });
  });
  it("ยอดนับ โหมดเดือนนี้: เทียบเป้าเดือน (pct) แต่ตัดสินจากจังหวะที่ควรถึงวันนี้", () => {
    const p = targetProgress(metric("closed"), 45, 100, MONTH);
    expect(p).toMatchObject({ target: 100, monthTarget: 100, expected: 50, pct: 0.45, gap: -55, tone: "amber", text: "ใกล้เป้า" });
    expect(targetProgress(metric("closed"), 60, 100, MONTH)).toMatchObject({ tone: "emerald", text: "เหนือแผน" });
    expect(targetProgress(metric("closed"), 30, 100, MONTH)).toMatchObject({ tone: "rose", text: "ช้ากว่าแผน" });
  });
  it("ยอดนับ โหมดช่วงอื่น: เป้าเดือนเฉลี่ยตามจำนวนวันในช่วง", () => {
    const p = targetProgress(metric("inquiries"), 30, 112, WEEK);   // 112 × 7/28 = 28
    expect(p).toMatchObject({ target: 28, monthTarget: 112, gap: 2, tone: "emerald", text: "เหนือแผน" });
    expect(p.pct).toBeCloseTo(30 / 28);
  });
});

describe("goalsFor — จับคู่ค่าจริงกับเป้าทุกตัวชี้วัด", () => {
  it("คืน map ตาม key · ค่าที่ไม่ส่งมาเป็น nodata", () => {
    const g = goalsFor({ roas: 5, pctAds: 0.25, inquiries: 40 }, { roas: 4, pctAds: 0.2, inquiries: 112, closed: 10 }, WEEK);
    expect(g.roas.text).toBe("ถึงเป้า");
    expect(g.pctAds.text).toBe("เกินเป้า");
    expect(g.inquiries.target).toBe(28);
    expect(g.closed.state).toBe("nodata");
    expect(g.cpl.state).toBe("unset");
  });
});

describe("periodForTargets / pipelineValues", () => {
  it("เดือนนี้ = mode month + elapsed · ช่วงอื่น = rangeDays รวมหัวท้าย + จำนวนวันของเดือนวันสุดท้าย", () => {
    expect(periodForTargets({ monthView: true, today: "2026-09-15" })).toEqual({ mode: "month", elapsed: 0.5, monthDays: 30 });
    expect(periodForTargets({ monthView: false, from: "2026-09-08", to: "2026-09-14", today: "2026-09-14" })).toEqual({ mode: "range", rangeDays: 7, monthDays: 30 });
    expect(periodForTargets({ monthView: false, from: "2026-08-01", to: "2026-08-31", today: "2026-09-14" })).toEqual({ mode: "range", rangeDays: 31, monthDays: 31 });
  });
  it("pipelineValues แปลง items เป็น map · ไม่มี pipeline = {}", () => {
    expect(pipelineValues({ items: [{ key: "inquiries", value: 12 }, { key: "roas", value: 3.2 }] })).toEqual({ inquiries: 12, roas: 3.2 });
    expect(pipelineValues(null)).toEqual({});
  });
});
