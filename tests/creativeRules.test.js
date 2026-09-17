/* กฎคัดครีเอทีฟ: ค่าแอดที่ใช้ไป เทียบกับผลที่ได้ (การซื้อ/คนทัก/คลิก ฯลฯ) ตามเกณฑ์ที่ทีมตั้ง */
import { describe, expect, it } from "vitest";
import { CREATIVE_RULE_METRICS, parseRuleNumber, incompleteRules, normalizeCreativeRules, evaluateCreativeRule, evaluateCreativeRules, creativeRuleSummary, filterByRuleOutcome, describeRule } from "../src/modules/marketing/creatives/creativeRules.js";

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
  it("ต้นทุนต่อการซื้อเกินเพดาน = ไม่ผ่าน พร้อมเหตุผลที่มีตัวเลขจริง", () => {
    const r = evaluateCreativeRule(row(), rule());
    expect(r.status).toBe("fail");
    expect(r.actual).toBe(1500);
    expect(r.text).toBe("ต้นทุนต่อการซื้อ ฿1,500.00 เกินเพดาน ฿1,000.00");
  });
  it("อยู่ในเพดาน = ผ่าน · อย่างน้อย (gte) ใช้กับ ROAS/CTR (CTR กรอกเป็น %)", () => {
    expect(evaluateCreativeRule(row({ purchases: 4 }), rule()).status).toBe("pass");
    expect(evaluateCreativeRule(row(), rule({ metric: "roas", op: "gte", value: 3 })).status).toBe("pass");
    const ctr = evaluateCreativeRule(row(), rule({ metric: "ctr", op: "gte", value: 1 }));
    expect(ctr.status).toBe("fail");
    expect(ctr.text).toBe("CTR 0.50% ต่ำกว่าเกณฑ์ 1.00%");
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
    expect(describeRule(rule({ minSpend: 500 }))).toBe("ต้นทุนต่อการซื้อ ไม่เกิน ฿1,000.00 · เมื่อใช้เงินแล้วอย่างน้อย ฿500.00");
  });
});
