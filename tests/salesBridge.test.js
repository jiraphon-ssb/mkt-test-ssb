/* ตรวจค่าที่ใช้ต่อระบบขาย — บอกได้ว่าใส่ URL/KEY ถูกไหมโดยไม่ต้องเห็นค่าจริง
   ของจริงที่เจอ: sales-sync ตอบ read:0 ได้ทั้งตอนใส่ถูกแต่ประตูยังไม่เปิด และตอนใส่ URL ผิด (404 เหมือนกัน) แยกไม่ออก */
import { describe, it, expect } from "vitest";
import { describeSalesKey, describeSalesUrl, doorState, projectRef, FACT_COLUMNS, factsProbeUrl, goalProbeUrl, summarizeFacts, summarizeGoals, probeVerdict, goalsUrl, targetsUrl, monthsToSync, PAGE_LIMIT } from "../supabase/functions/_shared/salesBridge.js";

const jwt = (claims) => ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");
const OWN = "https://lzvftqhffqefqupwulus.supabase.co";
const SALES = "https://abcdefghijklmnopqrst.supabase.co";

describe("projectRef", () => {
  it("อ่าน ref จาก URL โปรเจกต์ · ยอมให้มี / ท้าย · URL อื่นคืน null", () => {
    expect(projectRef(SALES)).toBe("abcdefghijklmnopqrst");
    expect(projectRef(`${SALES}/`)).toBe("abcdefghijklmnopqrst");
    expect(projectRef(`${SALES}/rest/v1`)).toBe(null);
    expect(projectRef("https://supabase.com/dashboard/project/abcdefghijklmnopqrst")).toBe(null);
    expect(projectRef("")).toBe(null);
  });
});

describe("describeSalesUrl — URL ที่ใส่ใช้ได้ไหม", () => {
  it("URL โปรเจกต์ขายถูกรูปแบบ", () => {
    expect(describeSalesUrl(SALES, OWN)).toEqual({ set: true, host: "abcdefghijklmnopqrst.supabase.co", looksLikeProjectUrl: true, sameAsThisProject: false });
  });
  it("ใส่ URL ของโปรเจกต์ marketing เอง = ผิด (ฟังก์ชันจะหาไม่เจอแล้วดูเหมือนแค่ประตูยังไม่เปิด)", () => {
    expect(describeSalesUrl(OWN, OWN)).toMatchObject({ looksLikeProjectUrl: true, sameAsThisProject: true });
  });
  it("ใส่ลิงก์ dashboard หรือต่อ /rest/v1 มาเอง = ไม่ใช่ URL โปรเจกต์", () => {
    expect(describeSalesUrl("https://supabase.com/dashboard/project/abcdefghijklmnopqrst", OWN).looksLikeProjectUrl).toBe(false);
    expect(describeSalesUrl(`${SALES}/rest/v1`, OWN).looksLikeProjectUrl).toBe(false);
  });
  it("ไม่ได้ใส่ / ใส่ขยะ = บอกตามจริง ไม่ throw", () => {
    expect(describeSalesUrl("", OWN)).toEqual({ set: false, host: null, looksLikeProjectUrl: false, sameAsThisProject: false });
    expect(describeSalesUrl("ไม่ใช่ url", OWN)).toMatchObject({ set: true, host: null, looksLikeProjectUrl: false });
  });
});

describe("describeSalesKey — คีย์ชนิดไหน (ไม่คืนค่าคีย์ออกมาเด็ดขาด)", () => {
  it("คีย์ JWT แบบเก่า: บอก role และตรวจว่าเป็นของโปรเจกต์เดียวกับ URL", () => {
    const service = jwt({ role: "service_role", ref: "abcdefghijklmnopqrst" });
    expect(describeSalesKey(service, SALES)).toEqual({ set: true, kind: "service_role", refMatchesUrl: true });
    expect(describeSalesKey(jwt({ role: "anon", ref: "abcdefghijklmnopqrst" }), SALES)).toMatchObject({ kind: "anon", refMatchesUrl: true });
    expect(describeSalesKey(jwt({ role: "service_role", ref: "lzvftqhffqefqupwulus" }), SALES)).toMatchObject({ refMatchesUrl: false });
    expect(JSON.stringify(describeSalesKey(service, SALES))).not.toContain(service);
  });
  it("คีย์แบบใหม่ของ Supabase: แยก secret กับ publishable จากคำนำหน้า", () => {
    expect(describeSalesKey("sb_secret_xxxxxxxx", SALES)).toEqual({ set: true, kind: "secret", refMatchesUrl: null });
    expect(describeSalesKey("sb_publishable_xxxxxxxx", SALES)).toEqual({ set: true, kind: "publishable", refMatchesUrl: null });
  });
  it("ไม่ได้ใส่ / อ่านไม่ออก = บอกตามจริง ไม่ throw", () => {
    expect(describeSalesKey("", SALES)).toEqual({ set: false, kind: null, refMatchesUrl: null });
    expect(describeSalesKey("abc.def", SALES)).toEqual({ set: true, kind: "unknown", refMatchesUrl: null });
    expect(describeSalesKey("aaa.!!!.bbb", SALES)).toEqual({ set: true, kind: "unknown", refMatchesUrl: null });
  });
});

describe("doorState — ประตูแต่ละบานฝั่งระบบขายอยู่ในสถานะไหน", () => {
  it("เปิดแล้ว / ยังไม่สร้าง / คีย์ใช้ไม่ได้ / คีย์ไม่มีสิทธิ์ / อื่นๆ", () => {
    expect(doorState(200, null)).toBe("open");
    expect(doorState(404, "PGRST202")).toBe("missing");
    expect(doorState(404, "42883")).toBe("missing");
    expect(doorState(401, null)).toBe("bad_key");
    expect(doorState(403, "42501")).toBe("no_permission");
    expect(doorState(401, "42501")).toBe("no_permission");
  });
  it("404 ที่ไม่ใช่ของ PostgREST = URL ผิด ไม่ใช่ 'ประตูยังไม่เปิด' (เดิมนับรวมกันจนแยกไม่ออก)", () => {
    expect(doorState(404, null)).toBe("error");
    expect(doorState(500, null)).toBe("error");
  });
});

/* ── เฟส 1: ตรวจของจริงของพี่ทัช (sale_dashboard_facts + sale_goal) ด้วย secret key ──
   คีย์มีสิทธิ์ทั้งฐานข้อมูล จึงต้องคุมที่ "คอลัมน์ที่ขอ" — ข้อมูลส่วนตัวต้องไม่ข้ามมาตั้งแต่ต้นทาง */
describe("factsProbeUrl — ขอเฉพาะคอลัมน์ตัวเลขรวม", () => {
  const url = new URL(factsProbeUrl(SALES));
  it("เรียก RPC sale_dashboard_facts ของโปรเจกต์ขาย", () => {
    expect(url.origin + url.pathname).toBe(`${SALES}/rest/v1/rpc/sale_dashboard_facts`);
  });
  it("select มีแค่คอลัมน์ที่อนุญาต ครบตามลำดับ", () => {
    expect(url.searchParams.get("select")).toBe(FACT_COLUMNS.join(","));
    expect(FACT_COLUMNS).toEqual(["kind", "day", "brand", "channel", "n", "amount", "is_new"]);
  });
  it("ห้ามมีรหัสลูกค้า/ดีล/เซล หรือข้อความเหตุผล (อาจมีชื่อลูกค้าพิมพ์อยู่)", () => {
    for (const col of ["customer_id", "deal_id", "rep", "reason", "source", "category", "stage", "deal_kind"]) {
      expect(url.searchParams.get("select").split(",")).not.toContain(col);
    }
  });
  it("URL ท้ายมี / ก็ไม่เกิด // ซ้อน", () => {
    expect(factsProbeUrl(`${SALES}/`)).toBe(factsProbeUrl(SALES));
  });
});

describe("goalProbeUrl — เป้าเดือนนี้ อ่านแค่แบรนด์ เดือน เวอร์ชัน", () => {
  it("อ่านตาราง sale_goal กรองเดือน ไม่ดึงผู้สร้าง/เหตุผล", () => {
    const url = new URL(goalProbeUrl(SALES, "2026-09-01"));
    expect(url.pathname).toBe("/rest/v1/sale_goal");
    expect(url.searchParams.get("select")).toBe("brand,month,version");
    expect(url.searchParams.get("month")).toBe("eq.2026-09-01");
  });
  it("เดือนรูปแบบผิด = throw (กันฉีดค่าเข้า filter)", () => {
    expect(() => goalProbeUrl(SALES, "2026-09")).toThrow();
    expect(() => goalProbeUrl(SALES, "2026-09-01&select=*")).toThrow();
  });
});

describe("summarizeFacts — สรุปเป็นจำนวน ไม่ส่งแถวดิบออกไป", () => {
  const rows = [
    { kind: "inq", day: "2026-09-10", brand: "TD", channel: "FB", n: 12, amount: 0, is_new: null },
    { kind: "inq", day: "2026-09-11", brand: "TD", channel: "Line", n: 5, amount: 0, is_new: null },
    { kind: "lead", day: "2026-09-10", brand: "TD", channel: "FB", n: 1, amount: 30000, is_new: true },
    { kind: "book", day: "2026-09-11", brand: "JD", channel: "Line", n: 1, amount: 52000.5, is_new: false },
  ];
  it("นับแถว / n / ยอด ต่อชนิด · แบรนด์ที่เจอ · วันที่มีการกรอกคนทักต่อแบรนด์", () => {
    const out = summarizeFacts(rows);
    expect(out.rows).toBe(4);
    expect(out.byKind.inq).toEqual({ rows: 2, n: 17, amount: 0 });
    expect(out.byKind.book).toEqual({ rows: 1, n: 1, amount: 52000.5 });
    expect(out.brands).toEqual(["JD", "TD"]);
    expect(out.inquiryDays).toEqual({ TD: 2 });
  });
  it("ตรวจคอลัมน์ที่ได้กลับมาจริง — ถ้าฝั่งขายส่งคอลัมน์เกินมา ต้องจับได้", () => {
    expect(summarizeFacts(rows).extraColumns).toEqual([]);
    expect(summarizeFacts([{ ...rows[0], customer_id: "x", deal_id: "y" }]).extraColumns).toEqual(["customer_id", "deal_id"]);
  });
  it("ไม่ใช่ array / ว่าง = สรุปว่าง ไม่ throw", () => {
    expect(summarizeFacts(null)).toMatchObject({ rows: 0, brands: [], extraColumns: [] });
  });
  it("ผลสรุปไม่มีแถวดิบติดออกไป", () => {
    expect(JSON.stringify(summarizeFacts(rows))).not.toContain("2026-09-10");
  });
});

describe("summarizeGoals", () => {
  it("นับแบรนด์ที่มีเป้า และเวอร์ชันล่าสุดต่อแบรนด์", () => {
    const out = summarizeGoals([
      { brand: "TD", month: "2026-09-01", version: 1 }, { brand: "TD", month: "2026-09-01", version: 2 },
      { brand: "JD", month: "2026-09-01", version: 1 },
    ]);
    expect(out).toEqual({ rows: 3, brands: { JD: 1, TD: 2 } });
    expect(summarizeGoals(undefined)).toEqual({ rows: 0, brands: {} });
  });
});

describe("probeVerdict — สรุปผลเป็นข้อความเดียวที่เอาไปทำต่อได้", () => {
  const open = (extra = {}) => ({ state: "open", ...extra });
  it("ครบ = ready", () => {
    expect(probeVerdict({ key: { kind: "secret" }, facts: open({ summary: { rows: 40, extraColumns: [] } }), goals: open({ summary: { rows: 4 } }) })).toBe("ready");
  });
  it("คีย์ผิดชนิด (publishable/anon) = wrong_key_kind ก่อนดูอย่างอื่น", () => {
    expect(probeVerdict({ key: { kind: "publishable" }, facts: open(), goals: open() })).toBe("wrong_key_kind");
    expect(probeVerdict({ key: { kind: "anon" }, facts: open(), goals: open() })).toBe("wrong_key_kind");
  });
  it("ยังไม่ตั้งค่า / URL หรือคีย์ใช้ไม่ได้", () => {
    expect(probeVerdict({ key: { set: false }, facts: null, goals: null })).toBe("not_configured");
    expect(probeVerdict({ key: { kind: "secret" }, facts: { state: "bad_key" }, goals: { state: "bad_key" } })).toBe("bad_key");
    expect(probeVerdict({ key: { kind: "secret" }, facts: { state: "unreachable" }, goals: { state: "error" } })).toBe("url_error");
  });
  it("อ่านเป้าได้แต่ facts ว่างเปล่า 7 วัน = ด่านสิทธิ์ของฟังก์ชันกันไว้ (ไม่ใช่ไม่มียอดขาย)", () => {
    expect(probeVerdict({ key: { kind: "secret" }, facts: open({ summary: { rows: 0, extraColumns: [] } }), goals: open({ summary: { rows: 3 } }) })).toBe("facts_empty");
  });
  it("ฝั่งขายส่งคอลัมน์เกินมา = column_leak (ต้องหยุดใช้จนกว่าจะแก้)", () => {
    expect(probeVerdict({ key: { kind: "secret" }, facts: open({ summary: { rows: 5, extraColumns: ["customer_id"] } }), goals: open({ summary: { rows: 1 } }) })).toBe("column_leak");
  });
  it("เรียก facts ไม่ได้เพราะสิทธิ์ = no_permission · เป้าเดือนนี้ยังไม่ตั้ง = no_goal_this_month", () => {
    expect(probeVerdict({ key: { kind: "secret" }, facts: { state: "no_permission" }, goals: open({ summary: { rows: 1 } }) })).toBe("no_permission");
    expect(probeVerdict({ key: { kind: "secret" }, facts: open({ summary: { rows: 9, extraColumns: [] } }), goals: open({ summary: { rows: 0 } }) })).toBe("no_goal_this_month");
  });
});

/* ── เฟส 2: ท่อจริง ── */
describe("goalsUrl / targetsUrl — อ่านเป้าเฉพาะตัวเลข ไม่ดึงผู้สร้าง/เหตุผล", () => {
  it("sale_goal: แบรนด์ เดือน เวอร์ชัน เป้า งบแอด · กรองหลายเดือน", () => {
    const url = new URL(goalsUrl(SALES, ["2026-08-01", "2026-09-01"]));
    expect(url.pathname).toBe("/rest/v1/sale_goal");
    expect(url.searchParams.get("select")).toBe("brand,month,version,targets,ads");
    expect(url.searchParams.get("month")).toBe("in.(2026-08-01,2026-09-01)");
    for (const col of ["created_by", "reason", "inputs", "base"]) expect(url.searchParams.get("select").split(",")).not.toContain(col);
  });
  it("sale_target: เดือน แบรนด์ ตัวชี้วัด จำนวน · ไม่ดึงคนแก้", () => {
    const url = new URL(targetsUrl(SALES, ["2026-09-01"]));
    expect(url.pathname).toBe("/rest/v1/sale_target");
    expect(url.searchParams.get("select")).toBe("month,brand,metric,amount");
    expect(url.searchParams.get("month")).toBe("in.(2026-09-01)");
  });
  it("เดือนรูปแบบผิด / ไม่มีเดือน = throw (กันฉีดค่าเข้า filter)", () => {
    expect(() => goalsUrl(SALES, ["2026-09-01)"])).toThrow();
    expect(() => targetsUrl(SALES, [])).toThrow();
  });
});

describe("monthsToSync — เป้าเดือนก่อนกับเดือนนี้ (ต้นเดือนหน้าจอยังดูเดือนก่อนอยู่)", () => {
  it("ปกติ / ข้ามปี", () => {
    expect(monthsToSync("2026-09-17")).toEqual(["2026-08-01", "2026-09-01"]);
    expect(monthsToSync("2026-01-03")).toEqual(["2025-12-01", "2026-01-01"]);
  });
  it("วันที่เสีย = ไม่มีเดือน", () => {
    expect(monthsToSync("17/09/2026")).toEqual([]);
  });
});

describe("PAGE_LIMIT", () => {
  it("เท่ากับเพดานแถวต่อคำขอของ PostgREST บน Supabase — ได้ครบเพดานพอดี = อาจถูกตัด ต้องแบ่งก้อนใหม่", () => {
    expect(PAGE_LIMIT).toBe(1000);
  });
});
