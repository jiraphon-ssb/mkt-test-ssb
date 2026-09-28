/* กฎคัดครีเอทีฟ: ค่าแอดที่ใช้ไป เทียบกับผลที่ได้ (การซื้อ/ผลลัพธ์จาก Meta/คลิก ฯลฯ) ตามเกณฑ์ที่ทีมตั้ง */
import { describe, expect, it } from "vitest";
import { CREATIVE_RULE_METRICS, parseRuleNumber, incompleteRules, normalizeCreativeRules, evaluateCreativeRule, evaluateCreativeRules, creativeRuleSummary, filterByRuleOutcome, describeRule, ruleTitle } from "../src/modules/marketing/creatives/creativeRules.js";

const row = (patch = {}) => ({ key: "a", brandId: "b_td", spend: 3000, purchases: 2, leads: 10, clicks: 300, impressions: 60000, roas: 4, ctr: 0.005, frequency: 1.8, cpa: 1500, cpl: 300, cpc: 10, ...patch });
const rule = (patch = {}) => ({ id: "r1", name: "CPA ไม่เกิน 1,000", brandId: "all", metric: "cpa", op: "lte", value: 1000, minSpend: 0, ...patch });

describe("normalizeCreativeRules", () => {
  it("เก็บเฉพาะกฎที่ตัวชี้วัดรู้จัก · ค่าติดลบ/ไม่ใช่ตัวเลข = ยังไม่ใส่ค่า (null) · ไม่มี id = สร้างให้", () => {
    const out = normalizeCreativeRules([rule(), { metric: "unknown" }, rule({ id: "", value: "abc", minSpend: -5, op: "x" })]);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ value: null, minSpend: 0, op: "lte" });
    expect(out[1].id).toBeTruthy();
    expect(normalizeCreativeRules(null)).toEqual([]);
  });
  it("ตัวชี้วัดที่เลือกได้ครอบคลุมต้นทุนต่อผล อัตราส่วน และจำนวน", () => {
    expect(CREATIVE_RULE_METRICS.map((m) => m.key)).toEqual(["cpa", "cpl", "cpc", "cpm", "roas", "ctr", "frequency", "purchases", "leads", "spend"]);
  });
});

describe("parseRuleNumber — พิมพ์แบบคนพิมพ์จริงได้", () => {
  it("รับคอมมา สกุลเงิน หน่วย และช่องว่าง · ว่าง = null · อ่านไม่ออก = NaN (ให้หน้าจอเตือน)", () => {
    expect(parseRuleNumber("1,000")).toBe(1000);
    expect(parseRuleNumber(" ฿1,500.50 ")).toBe(1500.5);
    expect(parseRuleNumber("3x")).toBe(3);
    expect(parseRuleNumber("3 เท่า")).toBe(3);
    expect(parseRuleNumber("1.5%")).toBe(1.5);
    expect(parseRuleNumber(2)).toBe(2);
    expect(parseRuleNumber("")).toBeNull();
    expect(parseRuleNumber(null)).toBeNull();
    expect(Number.isNaN(parseRuleNumber("abc"))).toBe(true);
    expect(Number.isNaN(parseRuleNumber("-5"))).toBe(true);
  });
  it("normalize ใช้ตัวเดียวกัน (ค่าที่พิมพ์ว่า 1,000 ไม่หาย) · incompleteRules บอกกฎที่ยังไม่มีค่าเกณฑ์", () => {
    const [r] = normalizeCreativeRules([rule({ value: "1,000", minSpend: "฿500" })]);
    expect(r).toMatchObject({ value: 1000, minSpend: 500 });
    expect(incompleteRules([rule({ value: "" }), rule({ id: "r2", value: "3" }), rule({ id: "r3", value: "abc" })]).map((x) => x.id)).toEqual(["r1", "r3"]);
  });
});

describe("evaluateCreativeRule", () => {
  it("กฎหน่วยบาทไม่ตัดสินบัญชีต่างสกุลเงิน", () => {
    expect(evaluateCreativeRule(row({ currency: "USD" }), rule())).toMatchObject({ status: "nodata", text: "กฎนี้ตั้งเป็นบาท แต่บัญชีใช้ USD" });
  });
  it("ต้นทุนต่อการซื้อเกินเพดาน = ไม่ผ่าน พร้อมเหตุผลที่มีตัวเลขจริง", () => {
    const r = evaluateCreativeRule(row(), rule());
    expect(r.status).toBe("fail");
    expect(r.actual).toBe(1500);
    expect(r.text).toBe("ต้นทุนต่อการซื้อ (Meta) ฿1,500.00 เกินเพดาน ฿1,000.00");
  });
  it("อยู่ในเพดาน = ผ่าน · อย่างน้อย (gte) ใช้กับ ROAS/CTR (CTR กรอกเป็น %)", () => {
    expect(evaluateCreativeRule(row({ purchases: 4 }), rule()).status).toBe("pass");
    expect(evaluateCreativeRule(row(), rule({ metric: "roas", op: "gte", value: 3 })).status).toBe("pass");
    const ctr = evaluateCreativeRule(row(), rule({ metric: "ctr", op: "gte", value: 1 }));
    expect(ctr.status).toBe("fail");
    expect(ctr.text).toBe("CTR ทั้งหมด 0.50% ต่ำกว่าเกณฑ์ 1.00%");
  });
  it("ใช้เงินเกินเพดานแล้วยังไม่มีการซื้อเลย = ไม่ผ่าน (ไม่ใช่ข้ามเพราะหารไม่ได้)", () => {
    const r = evaluateCreativeRule(row({ purchases: 0, cpa: null, spend: 2500 }), rule());
    expect(r.status).toBe("fail");
    expect(r.text).toBe("ใช้ไป ฿2,500.00 ยังไม่มีการซื้อ (เพดาน ฿1,000.00 ต่อการซื้อ)");
  });
  it("ยังไม่มีการซื้อแต่ใช้เงินยังไม่ถึงเพดาน = ยังตัดสินไม่ได้", () => {
    expect(evaluateCreativeRule(row({ purchases: 0, cpa: null, spend: 600 }), rule()).status).toBe("pending");
  });
  it("บัญชีไม่วัดการซื้อ (null) = ไม่มีข้อมูล · ใช้เงินน้อยกว่าขั้นต่ำ = ยังตัดสินไม่ได้", () => {
    expect(evaluateCreativeRule(row({ purchases: null, cpa: null }), rule()).status).toBe("nodata");
    // เว้นวรรคระหว่าง "ไม่มีข้อมูล" กับชื่อตัวชี้วัด (26 ก.ย. เห็นจริง "ไม่มีข้อมูลROAS จากการซื้อ")
    expect(evaluateCreativeRule(row({ purchases: null, cpa: null }), rule()).text).toMatch(/^ไม่มีข้อมูล \S/);
    const low = evaluateCreativeRule(row({ spend: 300 }), rule({ minSpend: 500 }));
    expect(low.status).toBe("pending");
    expect(low.text).toBe("ใช้ไป ฿300.00 ยังไม่ถึงขั้นต่ำ ฿500.00");
  });
  it("CPM คิดจากค่าแอด ÷ impressions × 1,000 · กฎของแบรนด์อื่น = ไม่เข้าข่าย · ยังไม่ใส่ค่า = ไม่ตัดสิน", () => {
    expect(evaluateCreativeRule(row(), rule({ metric: "cpm", value: 60 })).actual).toBe(50);
    expect(evaluateCreativeRule(row(), rule({ brandId: "b_jk" })).status).toBe("na");
    expect(evaluateCreativeRule(row(), rule({ value: null })).status).toBe("na");
  });
});

describe("หลายกฎ · สรุป · กรอง", () => {
  const rules = [rule({ brandId: "b_td" }), rule({ id: "r2", name: "ROAS อย่างน้อย 3", metric: "roas", op: "gte", value: 3 })];
  const rows = [row({ key: "fail", spend: 3000 }), row({ key: "pass", cpa: 800, spend: 1600 }), row({ key: "nodata", purchases: null, cpa: null, spend: 500 }), row({ key: "other", brandId: "b_jk", spend: 900 })];

  it("ทุกกฎ: ไม่ผ่านข้อใดข้อหนึ่ง = ไม่ผ่าน · ผ่านทุกข้อที่เข้าข่าย = ผ่าน", () => {
    expect(evaluateCreativeRules(rows[0], rules, "all").status).toBe("fail");
    expect(evaluateCreativeRules(rows[1], rules, "all").status).toBe("pass");
    expect(evaluateCreativeRules(rows[1], rules, "r2").status).toBe("pass");
    expect(evaluateCreativeRules(rows[0], rules, "none")).toBeNull();
  });
  it("สรุปนับชิ้นและค่าแอดที่ใช้กับชิ้นที่ไม่ผ่าน", () => {
    const summary = creativeRuleSummary(rows, rules, "r1");
    expect(summary).toEqual({ pass: 1, fail: 1, pending: 0, nodata: 1, na: 1, failSpend: 3000 });
  });
  it("กรองตามผล · 'ยังตัดสินไม่ได้' รวมไม่มีข้อมูล", () => {
    expect(filterByRuleOutcome(rows, rules, "r1", "fail").map((r) => r.key)).toEqual(["fail"]);
    expect(filterByRuleOutcome(rows, rules, "r1", "pending").map((r) => r.key)).toEqual(["nodata"]);
    expect(filterByRuleOutcome(rows, rules, "none", "fail")).toBe(rows);
  });
  it("คำอธิบายกฎอ่านเป็นประโยค", () => {
    expect(describeRule(rule({ minSpend: 500 }))).toBe("ต้นทุนต่อการซื้อ (Meta) ไม่เกิน ฿1,000.00 · เมื่อใช้เงินแล้วอย่างน้อย ฿500.00");
  });
  it("ชื่อกฎทั่วไปแบบเก่าแสดงชื่อ metric ที่ตรงกับข้อมูล Meta", () => {
    expect(ruleTitle(rule({ name: "คัด roas", metric: "roas" }))).toBe("ROAS จากการซื้อ (Meta)");
    expect(ruleTitle(rule({ name: "คัด CPL", metric: "cpl" }))).toBe("ต้นทุนต่อผลลัพธ์จาก Meta");
    expect(ruleTitle(rule({ name: "คัดCTR", metric: "ctr" }))).toBe("CTR ทั้งหมด");
    expect(ruleTitle(rule({ name: "ชิ้นชนะสำหรับโปรเดือนนี้", metric: "roas" }))).toBe("ชิ้นชนะสำหรับโปรเดือนนี้");
  });
});

/* ชุด C ข้อ 10 (ตรวจรอบละเอียด 26 ก.ย.): ข้อมูลจริงเป็นธุรกิจทักแชท Meta แทบไม่เห็นการซื้อ
   การ์ดบอก "ต้นทุนดี" แต่ผลกฎบอก "ไม่ผ่าน ROAS 0.40×" · แถบกฎ "ไม่ผ่าน 36 ชิ้น ฿267,542" มาจากกฎ ROAS ที่ใช้ไม่ได้
   → แถวที่ roasFromMeta:false กฎที่อิงการซื้อของ Meta = ไม่มีข้อมูล (บอกเหตุผล) ไม่ใช่ไม่ผ่าน */
describe("กฎที่อิงการซื้อของ Meta กับข้อมูลจริง", () => {
  const real = { spend: 5000, leads: 50, purchases: 1, revenue: 2000, roas: 0.4, roasFromMeta: false };
  const rule = (metric, value, op) => ({ id: metric, metric, value, op: op ?? (metric === "roas" || metric === "purchases" ? "gte" : "lte"), minSpend: 0, brandId: "all" });
  it("กฎ ROAS = nodata พร้อมเหตุผล ไม่ใช่ไม่ผ่าน", () => {
    const out = evaluateCreativeRule(real, rule("roas", 2));
    expect(out.status).toBe("nodata");
    expect(out.text).toMatch(/ระบบขาย/);
  });
  it("กฎอื่นยังตัดสินตามปกติ (รวมต้นทุนต่อการซื้อ — ชิ้นที่ Meta เห็นการซื้อจริงใช้ได้)", () => {
    expect(evaluateCreativeRule(real, rule("cpl", 50)).status).toBe("fail");    // 5000 ÷ 50 = 100 > 50
    expect(evaluateCreativeRule(real, rule("cpa", 1000)).status).toBe("fail");  // 5000 ÷ 1
  });
  it("ข้อมูลจำลอง (ไม่มีธง) ยังใช้กฎ ROAS ได้", () => {
    expect(evaluateCreativeRule({ ...real, roasFromMeta: undefined }, rule("roas", 2)).status).toBe("fail");
  });
  it("adsCreativeRows ติดธง roasFromMeta ให้ทุกแถว", async () => {
    const { adsCreativeRows } = await import("../src/modules/marketing/adsOverview.js");
    const card = { id: "a", track: "project", status: "measured", archived: true, brand_id: "b1", campaign: "c1", creative: "A", source: "meta", ad_platform: "Meta Ads",
      brief: { channels: ["Meta Ads"] }, metrics: { spend: 100, leads: 2, impressions: 1000, clicks: 10, measured_at: "2026-09-05T10:00:00.000Z" } };
    const range = { start: new Date("2026-09-01"), end: new Date("2026-09-10") };
    expect(adsCreativeRows([card], range, [], undefined, { roasFromMeta: false })[0].roasFromMeta).toBe(false);
  });
});

/* ทดสอบละเอียด 27 ก.ย.: หน้าจริงขึ้น "ผ่าน 0 · ยังตัดสินไม่ได้ 210" — กฎ ROAS ที่ข้ามบนข้อมูลจริงกลายเป็น "ไม่มีข้อมูล"
   แล้วทับผลของกฎอื่นทุกชิ้น (ใช้ "ทุกกฎ") → ชิ้นที่ผ่านกฎ CTR ก็ไม่มีวันผ่าน */
describe("กฎที่ข้ามบนข้อมูลจริงไม่ทับกฎอื่น", () => {
  const real = { spend: 5000, leads: 50, impressions: 100000, ctr: 0.04, roas: 0.4, roasFromMeta: false };
  const rules = [
    { id: "roas", metric: "roas", op: "gte", value: 2, minSpend: 0, brandId: "all" },
    { id: "ctr", metric: "ctr", op: "gte", value: 3, minSpend: 0, brandId: "all" },
  ];
  it("ทุกกฎ: ROAS ถูกข้าม · CTR 4% ผ่านเกณฑ์ 3% = ผ่าน", () => {
    expect(evaluateCreativeRules(real, rules, "all").status).toBe("pass");
    expect(creativeRuleSummary([real], rules, "all")).toMatchObject({ pass: 1, nodata: 0 });
  });
  it("ทุกกฎ: CTR ไม่ผ่าน = ไม่ผ่าน (ไม่ใช่ยังตัดสินไม่ได้)", () => {
    expect(evaluateCreativeRules({ ...real, ctr: 0.01 }, rules, "all").status).toBe("fail");
  });
  it("เลือกกฎ ROAS อย่างเดียว = ไม่มีข้อมูล พร้อมเหตุผล", () => {
    const out = evaluateCreativeRules(real, rules, "roas");
    expect(out.status).toBe("nodata");
    expect(out.text).toMatch(/ระบบขาย/);
  });
});

/* ทดสอบละเอียดรอบ 2 (agent): "฿50.00 เกินเพดาน ฿50.00" — ตัดสินที่ความละเอียดเดียวกับที่แสดง */
it("ค่าที่แสดงเท่าเพดานพอดี = ผ่าน ไม่ใช่ 'เกินเพดาน' ตัวเลขเดียวกัน", () => {
  const rule = { id: "c", metric: "cpl", op: "lte", value: 50, minSpend: 0, brandId: "all" };
  expect(evaluateCreativeRule({ spend: 150.01, leads: 3 }, rule).status).toBe("pass");
  expect(evaluateCreativeRule({ spend: 0.1 + 0.2, leads: 1 }, { ...rule, value: 0.3 }).status).toBe("pass");
});

/* ทดสอบละเอียดรอบ 2 (agent): ช่องกรอกตัวเลข (กฎ + ยอดใบแจ้งยอดหน้าบิล) รับขยะ — "5 x 3" → 53 · "1,2,3" → 123 */
it("parseRuleNumber: ตัวเลขสองชุดคั่นช่องว่าง/x หรือคอมมาผิดตำแหน่ง = อ่านไม่ออก", () => {
  for (const bad of ["5 x 3", "0x10", "1,2,3", "12 34"]) expect(parseRuleNumber(bad)).toBeNaN();
  for (const [ok, v] of [["180,900", 180900], ["1,234.50", 1234.5], ["3x", 3], ["฿ 500", 500], ["1.5 %", 1.5], ["2 เท่า", 2]]) expect(parseRuleNumber(ok)).toBe(v);
});

/* รีวิวโค้ด 28 ก.ย.: กฎ ROAS ≥ 2.01 กับค่าจริง 2.01 เคยขึ้น "ต่ำกว่าเกณฑ์" (ตัดเพี้ยนเป็น 2.00) */
it("ROAS ≥ 2.01 กับค่าจริง 2.01 = ผ่าน", () => {
  expect(evaluateCreativeRule(row({ roas: 2.01 }), rule({ metric: "roas", op: "gte", value: 2.01 })).status).toBe("pass");
});
