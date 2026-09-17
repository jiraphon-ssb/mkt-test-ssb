/* กราฟแนวโน้ม: โหมดสะสม + เส้นเป้าตามจังหวะ — logic ล้วน */
import { describe, expect, it } from "vitest";
import { ADDITIVE_TREND_KEYS, canCumulate, cumulativeSeries, targetPaceSeries } from "../src/modules/marketing/ads/trendSeries.js";

describe("cumulativeSeries", () => {
  const through = (values) => (i) => values[i];

  it("ยอดที่บวกได้: วันที่ไม่มีค่า = ช่องว่าง (ไม่ลากยอดเดิมต่อให้ดูเหมือนวันนั้นเป็น 0)", () => {
    expect(cumulativeSeries({ key: "revenue", daily: [100, null, 50], valueThrough: through([100, 100, 150]) })).toEqual([100, null, 150]);
  });

  it("อัตราส่วน: คิดใหม่จากยอดรวมถึงวันนั้น แม้วันนั้นเองหารไม่ได้ (เช่น ไม่มีค่าแอดวันนั้น)", () => {
    expect(cumulativeSeries({ key: "roas", daily: [20, null], valueThrough: through([20, 30]) })).toEqual([20, 30]);
  });

  it("หลังวันสุดท้ายที่มีได้ (อนาคต) = null · valueThrough undefined = null", () => {
    expect(cumulativeSeries({ key: "roas", daily: [1, 1, 1], valueThrough: through([1, undefined, 3]), lastIndex: 1 })).toEqual([1, null, null]);
  });

  it("ตัวที่บวกได้ครบชุด · Frequency สะสมไม่ได้ (Reach รวมข้ามวันไม่ได้)", () => {
    expect(ADDITIVE_TREND_KEYS).toEqual(["spend", "revenue", "inquiry", "leads", "deposits", "orders", "impressions"]);
    expect(canCumulate("frequency")).toBe(false);
    expect(canCumulate("roas")).toBe(true);
  });
});

describe("targetPaceSeries — เป้าเดือนเฉลี่ยตามวันของเดือน", () => {
  const local = (d) => new Date(2026, 8, d).toISOString();

  it("วันที่ d ของเดือน 30 วัน = เป้า × d/30", () => {
    expect(targetPaceSeries([local(1), local(15), local(30)], 3000)).toEqual([100, 1500, 3000]);
  });

  it("ไม่มีเป้า / เป้า ≤ 0 = null ทั้งเส้น", () => {
    expect(targetPaceSeries([local(1)], null)).toBeNull();
    expect(targetPaceSeries([local(1)], 0)).toBeNull();
  });
});
