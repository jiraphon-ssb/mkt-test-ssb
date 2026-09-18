/* หน้า Sync — แปลงข้อมูลท่อยอดขาย / creative / สิทธิ์ เป็นสิ่งที่หน้าจอบอกได้ (pure) */
import { describe, it, expect } from "vitest";
import {
  coverageMatrix, goalGaps, inventorySources, creativeRunView, tokenDaysLeft, checkVerdictView, pipelineRunView, SALES_BRAND_IDS, backfillRanges, latestBy, jkSourceRow,
} from "../src/modules/marketing/ads/syncSources.js";

const fact = (brand_id, fact_date, patch = {}) => ({ brand_id, fact_date, inquiries: 0, inquiry_filled: false, qualified_leads: 0, deposits: 0, orders: 0, gross_revenue: 0, ...patch });
const days = (brand, from, to, patch = () => ({})) => {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    out.push(fact(brand, iso, patch(iso)));
  }
  return out;
};

describe("แบรนด์ที่ระบบขายเป็นแหล่ง", () => {
  // 18 ก.ย. 69: เปิด JUNTAKARN (b_jt) หลังท่อข้อมูลจากระบบ TMK ทำงานจริง — ยอดขาย/ROAS ภาพรวมรวมแบรนด์นี้แล้ว
  it("TD · JD · TA · JUNTAKARN → brand id ของเรา", () => {
    expect(SALES_BRAND_IDS).toEqual(["b_td", "b_jk", "b_ta", "b_jt"]);
  });
});

describe("coverageMatrix — ความครบรายเดือน × ตัวชี้วัด × แบรนด์", () => {
  const facts = [
    // TD: ส.ค. ครบทุกวันแต่ทีมไม่กรอกคนทักเลย · ได้ออเดอร์เพิ่งมีตั้งแต่ 1 ก.ย. · ก.ย. กรอกคนทักบางวัน
    ...days("b_td", "2026-08-01", "2026-08-31", () => ({ qualified_leads: 3, orders: 1, gross_revenue: 1000 })),
    ...days("b_td", "2026-09-01", "2026-09-17", (iso) => ({ qualified_leads: 2, deposits: 1, orders: 1, gross_revenue: 900, inquiry_filled: iso <= "2026-09-15" })),
  ];
  const out = coverageMatrix(facts, { brandIds: ["b_td", "b_jt", "b_none"], from: "2026-08-01", to: "2026-09-17" });
  const cell = (brandId, metric, month) => out.rows.find((r) => r.brandId === brandId && r.metric === metric).cells.find((c) => c.month === month);

  it("คอลัมน์เป็นเดือนในช่วง", () => {
    expect(out.months).toEqual(["2026-08", "2026-09"]);
  });
  it("คนทัก: ไม่กรอกเลย = not_filled · กรอกบางวัน = partial พร้อมจำนวน · นับถึงวันสุดท้ายของช่วง", () => {
    expect(cell("b_td", "inquiries", "2026-08")).toMatchObject({ state: "not_filled", filled: 0, days: 31 });
    expect(cell("b_td", "inquiries", "2026-09")).toMatchObject({ state: "partial", filled: 15, days: 17 });
  });
  it("ได้ออเดอร์ก่อนวันแรกที่มีข้อมูล = no_data · เดือนที่เริ่มมีกลางเดือน = partial พร้อมวันเริ่ม", () => {
    expect(cell("b_td", "deposits", "2026-08")).toMatchObject({ state: "no_data" });
    expect(cell("b_td", "deposits", "2026-09")).toMatchObject({ state: "full" });
  });
  it("ยอดขาย/ออเดอร์มีตั้งแต่ต้นช่วง = full", () => {
    expect(cell("b_td", "gross_revenue", "2026-08")).toMatchObject({ state: "full" });
  });
  it("แบรนด์ที่ยังไม่มีแหล่งเลย = waiting_source ทุกช่อง ไม่ใช่ no_data", () => {
    expect(out.rows.filter((r) => r.brandId === "b_none").every((r) => r.cells.every((c) => c.state === "waiting_source"))).toBe(true);
  });
  /* JUNTAKARN มีแหล่งแล้ว แต่ระบบขายของแบรนด์นี้ไม่มีขั้น Lead และมัดจำ
     ช่องพวกนั้นต้องบอกว่า "ไม่มีขั้นนี้" ไม่ใช่ "ทีมยังไม่กรอก" (คนอ่านจะไปตามทีมให้กรอกของที่ไม่มีอยู่) */
  it("JUNTAKARN: ขั้นที่ระบบขายไม่มี = no_stage · ขั้นที่มีคิดตามข้อมูลปกติ", () => {
    expect(cell("b_jt", "qualified_leads", "2026-09").state).toBe("no_stage");
    expect(cell("b_jt", "deposits", "2026-09").state).toBe("no_stage");
    expect(cell("b_jt", "inquiries", "2026-09").state).not.toBe("no_stage");
    expect(cell("b_jt", "gross_revenue", "2026-09").state).not.toBe("no_stage");
  });
  it("วันนี้ยังไม่ปิดและทีมยังไม่กรอก = ไม่นับเป็นวันที่ขาด (16/16 ไม่ใช่ 16/17) · บอกว่าเดือนนั้นยังเปิดอยู่", () => {
    const sep = days("b_td", "2026-09-01", "2026-09-17", (iso) => ({ inquiry_filled: iso < "2026-09-17" }));
    const out2 = coverageMatrix(sep, { brandIds: ["b_td"], from: "2026-09-01", to: "2026-09-17", today: "2026-09-17" });
    expect(out2.rows.find((r) => r.metric === "inquiries").cells[0]).toMatchObject({ state: "full", filled: 16, days: 16 });
    expect(out2.ranges).toEqual([{ month: "2026-09", start: "2026-09-01", end: "2026-09-17", partialStart: false, open: true }]);
  });
  it("ช่วงของแต่ละเดือน: เริ่มกลางเดือน = partialStart · ตัวชี้วัดที่เริ่มเก็บทีหลังบอกวันเริ่ม (since)", () => {
    const f = [...days("b_td", "2026-06-18", "2026-06-30"), ...days("b_td", "2026-09-01", "2026-09-02", () => ({ deposits: 1 }))];
    const m = coverageMatrix(f, { brandIds: ["b_td"], from: "2026-06-18", to: "2026-09-02" });
    expect(m.ranges[0]).toMatchObject({ month: "2026-06", start: "2026-06-18", end: "2026-06-30", partialStart: true, open: false });
    expect(m.rows.find((r) => r.metric === "deposits").cells[0]).toMatchObject({ state: "no_data", since: "2026-09-01" });
  });
  it("เดือนที่ข้อมูลเริ่มกลางเดือน (18 มิ.ย.) นับวันจากต้นช่วง ไม่ใช่ต้นเดือน", () => {
    const june = coverageMatrix(days("b_td", "2026-06-18", "2026-06-30", () => ({ inquiry_filled: true })), { brandIds: ["b_td"], from: "2026-06-18", to: "2026-06-30" });
    expect(june.rows.find((r) => r.metric === "inquiries").cells[0]).toMatchObject({ state: "full", filled: 13, days: 13 });
  });
});

describe("goalGaps — เป้าเดือนนี้มาจากไหน ขาดช่องไหน", () => {
  it("เป้าแบบเก่า: มียอด/ออเดอร์/มัดจำ/ลีด/คนทัก · ขาดงบแอด CPL ROAS %Ads CAC ต้นทุนต่อทัก", () => {
    const out = goalGaps({ goal_source: "sale_target", version: 0, sales_target: 3300000, orders_target: 193, deposits_target: 206, leads_target: 344, inquiry_target: 1173, ad_budget: null, cpl: null, roas: null, pct_ads_new: null, cac: null, cpi: null });
    expect(out.source).toBe("sale_target");
    // "ยอดลูกค้าใหม่" เป็นช่องที่เพิ่มมา 18 ก.ย. 69 (ตั้งเองได้ในหน้าตั้งค่า) เป้าแบบเก่าไม่มีให้
    expect(out.missing).toEqual(["ยอดลูกค้าใหม่", "งบแอด", "CPL", "ROAS", "%Ads", "CAC", "ต้นทุนต่อทัก"]);
    expect(out.present).toHaveLength(5);
  });
  /* 18 ก.ย. 69: 0 = ตั้งใจให้เป็นศูนย์ (เดือนที่พักแอด) ไม่ใช่ "ยังไม่ตั้ง"
     ท่อ sync เขียน null เมื่อไม่ได้ตั้งอยู่แล้ว 0 จึงมาจากคนกรอกเองเท่านั้น */
  it("งบแอด 0 = ตั้งแล้ว (ตั้งใจให้เป็นศูนย์) · ไม่มีค่า = ยังไม่ตั้ง · ไม่มีเป้าเลย = none", () => {
    expect(goalGaps({ goal_source: "sale_goal", version: 2, sales_target: 1, ad_budget: 0 }).present).toContain("งบแอด");
    expect(goalGaps({ goal_source: "sale_goal", version: 2, sales_target: 1, ad_budget: null }).missing).toContain("งบแอด");
    expect(goalGaps(null)).toMatchObject({ source: "none", present: [] });
  });
});

describe("inventorySources — แหล่งอื่นในระบบขาย จากรอบสำรวจล่าสุด", () => {
  const summary = {
    goals: { state: "open", rowCount: 0, summary: {} },
    legacyTargets: { state: "open", rowCount: 18, summary: { "2026-09-01": { TD: 6 } } },
    adSpendCsv: { state: "open", rowCount: 0, summary: {} },
    budget: { state: "open", rowCount: 0, summary: {} },
    marketingPctTarget: { state: "open", rowCount: 0, summary: { active: 0, scopes: [] } },
    marketingExpenseAp: { state: "open", rowCount: 11, summary: { "2026-09": { count: 10, tagged: 9, brands: {}, statuses: { pending_approval: 9, rejected: 1 } } } },
    plRevenue: { state: "open", rowCount: 0, summary: { months: [], entities: [] } },
    pipeline: { state: "open", summary: { type: "object", keys: ["aging"] } },
    insight: { state: "bad_key", code: null },
  };
  const out = Object.fromEntries(inventorySources(summary).map((s) => [s.key, s]));
  it("มีข้อมูล / ระบบพร้อมแต่ยังไม่มีคนกรอก / เรียกได้ / อ่านไม่ได้", () => {
    expect(out.goals.state).toBe("empty");
    expect(out.legacyTargets.state).toBe("has_data");
    expect(out.adSpendCsv.state).toBe("empty");
    expect(out.budget.state).toBe("empty");
    expect(out.marketingPctTarget.state).toBe("empty");
    expect(out.marketingExpenseAp).toMatchObject({ state: "has_data" });
    expect(out.marketingExpenseAp.detail).toContain("รออนุมัติ 9");
    expect(out.plRevenue.state).toBe("unreadable");
    expect(out.pipeline.state).toBe("callable");
    expect(out.insight.state).toBe("unreadable");
  });
  it("ยังไม่เคยสำรวจ = ว่าง (หน้าจอบอกให้กดสำรวจ)", () => {
    expect(inventorySources(null)).toEqual([]);
  });
});

describe("creativeRunView", () => {
  it("สรุปภาพจริงจากโพสต์ % · hash · เพจที่เข้าไม่ถึง · สิทธิ์ที่ขาด", () => {
    const view = creativeRunView({ status: "partial", rows_written: 207, summary: { total: 207, withPostMedia: 129, creativeOnly: 1, hashImages: { asked: 8, resolved: 8 }, postMedia: { needed: 130, enriched: 129, missingPages: 0 }, missingScopes: [], hasMore: false }, error_code: null });
    expect(view).toMatchObject({ total: 207, postMediaPct: 129 / 207, hash: "8/8", missingPages: 0, needsReconnect: false, tone: "warn" });
  });
  it("ขาดสิทธิ์ = ต้องเชื่อมใหม่ · ไม่มีรอบ = null", () => {
    expect(creativeRunView({ status: "success", summary: { total: 1, missingScopes: ["business_management"] } }).needsReconnect).toBe(true);
    expect(creativeRunView(null)).toBe(null);
  });
});

describe("tokenDaysLeft / checkVerdictView / pipelineRunView", () => {
  it("วันที่เหลือของ token (ปัดลง) · ไม่มีวันหมดอายุ = null · หมดแล้ว = 0", () => {
    const now = Date.parse("2026-09-17T00:00:00Z");
    expect(tokenDaysLeft("2026-11-14T08:46:00Z", now)).toBe(58);
    expect(tokenDaysLeft(null, now)).toBe(null);
    expect(tokenDaysLeft("2026-09-01T00:00:00Z", now)).toBe(0);
  });
  it("ผลตรวจการเชื่อมต่อเป็นภาษาคน · ระดับความรุนแรง", () => {
    expect(checkVerdictView("ready")).toMatchObject({ tone: "ok" });
    expect(checkVerdictView("no_goal_this_month")).toMatchObject({ tone: "warn" });
    expect(checkVerdictView("wrong_key_kind")).toMatchObject({ tone: "bad" });
    expect(checkVerdictView("อะไรไม่รู้").title).toBeTruthy();
  });
  it("รอบดึง: ผู้สั่ง · สถานะ · ข้อความ error ภาษาไทย · ยังไม่จบ = กำลังทำงาน", () => {
    expect(pipelineRunView({ trigger_kind: "manual", status: "failed", error_code: "SALES_EMPTY_RESULT", started_at: "2026-09-17T01:00:00Z", finished_at: "2026-09-17T01:00:05Z" }))
      .toMatchObject({ trigger: "กดเอง", statusLabel: "ไม่สำเร็จ", tone: "bad", durationMs: 5000 });
    expect(pipelineRunView({ trigger_kind: "manual", status: "failed", error_code: "SALES_EMPTY_RESULT" }).errorText).toContain("ไม่เขียนทับ");
    expect(pipelineRunView({ trigger_kind: "cron", status: "running", started_at: "2026-09-17T01:00:00Z", finished_at: null })).toMatchObject({ trigger: "อัตโนมัติ", statusLabel: "กำลังทำงาน", durationMs: null });
  });
});

describe("backfillRanges — ดึงย้อนหลังทีละเดือน (function รับครั้งละ ≤93 วัน)", () => {
  it("แบ่งเป็นรายเดือน เดือนแรก/สุดท้ายตัดตามช่วง", () => {
    expect(backfillRanges("2026-06-18", "2026-09-17")).toEqual([
      { from: "2026-06-18", to: "2026-06-30" }, { from: "2026-07-01", to: "2026-07-31" },
      { from: "2026-08-01", to: "2026-08-31" }, { from: "2026-09-01", to: "2026-09-17" },
    ]);
  });
  it("ช่วงผิด = ไม่มีงาน", () => {
    expect(backfillRanges("2026-09-17", "2026-06-18")).toEqual([]);
  });
});

describe("latestBy — รอบล่าสุดต่อกลุ่ม", () => {
  it("เลือกแถวที่เริ่มล่าสุดต่อคีย์", () => {
    const rows = [{ connection_id: "a", started_at: "2026-09-16T01:00:00Z", n: 1 }, { connection_id: "a", started_at: "2026-09-17T01:00:00Z", n: 2 }, { connection_id: "b", started_at: "2026-09-10T01:00:00Z", n: 3 }];
    const out = latestBy(rows, (row) => row.connection_id);
    expect(out.get("a").n).toBe(2);
    expect(out.get("b").n).toBe(3);
  });
});

describe("แหล่งข้อมูลยอดขาย JUNTAKARN (ระบบ TMK)", () => {
  const jkFact = (fact_date, patch = {}) => ({ brand_id: "b_jt", fact_date, source: "tmk", orders: 2, gross_revenue: 5000, inquiries: 30, inquiry_filled: true, ...patch });
  it("มีข้อมูลล่าสุดเมื่อวาน = ปกติ · บอกนิยามที่ต่างจากแบรนด์อื่น", () => {
    const row = jkSourceRow([jkFact("2026-09-16"), jkFact("2026-09-17")], { today: "2026-09-18" });
    expect(row.state).toBe("ok");
    expect(row.fresh).toBe("2026-09-17");
    expect(row.detail).toContain("นับเฉพาะออเดอร์จากแชท");
    expect(row.detail).toContain("วันที่ออเดอร์");
  });
  it("ข้อมูลล่าสุดค้างหลายวัน = ล่าช้า · ไม่มีแถวเลย = รอเชื่อม", () => {
    expect(jkSourceRow([jkFact("2026-09-10")], { today: "2026-09-18" }).state).toBe("stale");
    expect(jkSourceRow([], { today: "2026-09-18" }).state).toBe("waiting");
    expect(jkSourceRow([jkFact("2026-09-17", { brand_id: "b_td", source: "crm" })], { today: "2026-09-18" }).state).toBe("waiting");
  });
  it("รอบล่าสุดของเฟส JK ล้ม = ขึ้นบนแถวนี้พร้อมรหัส (ไม่ไปขึ้นแถวยอดขายพี่ทัช)", () => {
    const runs = [
      { pipeline: "sales", started_at: "2026-09-17T02:00:00Z", summary: { jk: { error: null } } },
      { pipeline: "sales", started_at: "2026-09-18T02:00:00Z", summary: { jk: { error: "JK_NO_PERMISSION" } } },
    ];
    const row = jkSourceRow([jkFact("2026-09-17")], { today: "2026-09-18", runs });
    expect(row.state).toBe("error");
    expect(row.error).toBe("JK_NO_PERMISSION");
    expect(row.fresh).toBe("2026-09-17");
  });
  it("รอบล่าสุดสำเร็จหลังรอบที่ล้ม = ไม่ค้างสถานะล้ม", () => {
    const runs = [
      { pipeline: "sales", started_at: "2026-09-18T02:00:00Z", summary: { jk: { error: null } } },
      { pipeline: "sales", started_at: "2026-09-17T02:00:00Z", summary: { jk: { error: "JK_WRITE_FAILED" } } },
    ];
    expect(jkSourceRow([jkFact("2026-09-17")], { today: "2026-09-18", runs }).state).toBe("ok");
  });
});
