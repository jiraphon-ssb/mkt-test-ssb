import { describe, expect, it } from "vitest";
import { creativeLibrarySummary, filterCreativeLibrary } from "../src/modules/marketing/creatives/creativeLibrary.js";

const rows = [
  { key: "a", creative: "ภาพ A", brand: "TEAMDEE", brandId: "b1", platform: "Meta Ads", campaigns: ["Always on"], spend: 3000, purchases: 2, cpa: 1500, roas: 4, cpl: 300, ctr: .02, frequency: 2, fatigue: false, asset: { media: [{ imageUrl: "https://example.com/a.jpg" }] } },
  { key: "b", creative: "วิดีโอ B", brand: "JUNTAKARN", brandId: "b2", platform: "Meta Ads", campaigns: ["Lead"], spend: 1000, purchases: 5, cpa: 200, roas: 2, cpl: 500, ctr: .01, frequency: 4, fatigue: true, asset: null },
];

describe("Creative Library", () => {
  it("สรุปจำนวน สื่อพร้อม ความล้า และค่าแอดจากแถวที่แสดง", () => {
    expect(creativeLibrarySummary(rows)).toEqual({ count: 2, withMedia: 1, tired: 1, spend: 4000, purchases: 7 });
  });
  it("กรองแบรนด์ สถานะ คำค้น และเรียง metric ได้", () => {
    expect(filterCreativeLibrary(rows, { brand: "b2", platform: "all", state: "fatigue" }).map((row) => row.key)).toEqual(["b"]);
    expect(filterCreativeLibrary(rows, { brand: "all", platform: "all", state: "all", query: "always" }).map((row) => row.key)).toEqual(["a"]);
    expect(filterCreativeLibrary(rows, { brand: "all", platform: "all", state: "all", sort: "cpl" }).map((row) => row.key)).toEqual(["a", "b"]);
  });
  it("เรียงการซื้อมากสุด / ต้นทุนต่อการซื้อต่ำสุด · ไม่มีข้อมูลอยู่ท้าย", () => {
    const more = [...rows, { ...rows[0], key: "c", purchases: null, cpa: null }];
    expect(filterCreativeLibrary(more, { sort: "purchases" }).map((row) => row.key)).toEqual(["b", "a", "c"]);
    expect(filterCreativeLibrary(more, { sort: "cpa" }).map((row) => row.key)).toEqual(["b", "a", "c"]);
  });
  it("การซื้อรวม: ทุกชิ้นไม่รู้ = null (ไม่ใช่ 0)", () => {
    expect(creativeLibrarySummary([{ ...rows[0], purchases: null }]).purchases).toBeNull();
  });
});
