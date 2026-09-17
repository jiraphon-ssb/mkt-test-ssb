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

import { creativeFormatOf, formatBreakdown, FORMAT_LABELS } from "../src/modules/marketing/creatives/creativeLibrary.js";

describe("รูปแบบชิ้นงาน — จาก format ของ Meta ก่อน ไม่มีค่อยอ่านจากชื่อ", () => {
  it("format ของ Meta มาก่อน · ไม่รู้ = อ่านคำนำหน้าชื่อ (VDO / PIC / Album) · อ่านไม่ออก = ไม่ระบุ", () => {
    expect(creativeFormatOf({ creative: "PIC | ภาพ", asset: { format: "video" } })).toBe("video");
    expect(creativeFormatOf({ creative: "VDO | ถามไว-ตอบไว", asset: { format: "unknown" } })).toBe("video");
    expect(creativeFormatOf({ creative: "PIC | ขอบคุณรีวิว", asset: null })).toBe("image");
    expect(creativeFormatOf({ creative: "Album_TD_สร้างภาพลักษณ์" })).toBe("album");
    expect(creativeFormatOf({ creative: "x", asset: { format: "carousel" } })).toBe("carousel");
    expect(creativeFormatOf({ creative: "Sale_Contents_T-D_Messages_CORE" })).toBe("unknown");
    expect(FORMAT_LABELS.video).toBe("วิดีโอ");
  });

  it("สรุปตามรูปแบบ: จำนวน ค่าแอด สัดส่วน CPL การซื้อ ต้นทุนต่อการซื้อ CTR · เรียงค่าแอดมากก่อน · การซื้อไม่รู้ทั้งกลุ่ม = null", () => {
    const rows = [
      { creative: "VDO | a", spend: 3000, leads: 30, purchases: 3, clicks: 100, impressions: 10000, fatigue: true },
      { creative: "VDO | b", spend: 1000, leads: 10, purchases: 1, clicks: 50, impressions: 5000, fatigue: false },
      { creative: "PIC | c", spend: 2000, leads: 40, purchases: null, clicks: 200, impressions: 10000, fatigue: false },
    ];
    expect(formatBreakdown(rows)).toEqual([
      { format: "video", label: "วิดีโอ", count: 2, spend: 4000, spendShare: 4000 / 6000, leads: 40, cpl: 100, purchases: 4, cpa: 1000, ctr: 150 / 15000, fatigue: 1 },
      { format: "image", label: "ภาพ", count: 1, spend: 2000, spendShare: 2000 / 6000, leads: 40, cpl: 50, purchases: null, cpa: null, ctr: 0.02, fatigue: 0 },
    ]);
  });
});

describe("กรองตามรูปแบบ", () => {
  it("format = video เหลือเฉพาะวิดีโอ · all/ไม่ส่ง = ทั้งหมด", () => {
    const rows = [{ key: "v", creative: "VDO | a", spend: 1 }, { key: "p", creative: "PIC | b", spend: 2 }];
    expect(filterCreativeLibrary(rows, { format: "video" }).map((r) => r.key)).toEqual(["v"]);
    expect(filterCreativeLibrary(rows, { format: "all" }).map((r) => r.key)).toEqual(["p", "v"]);
  });
});
