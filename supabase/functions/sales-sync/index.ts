/* sales-sync — ดึงยอดขายจริงรายวันต่อแบรนด์จากระบบขายของพี่ทัช (ssbgroup-platform) ลง business_daily_facts + ad_sales_goals
   สิทธิ์: service role เท่านั้น (ads-cron เรียกวันละครั้ง) · ฝั่งขายอ่านด้วย secret key (SALES_API_KEY)
   แหล่ง: RPC sale_dashboard_facts (นิยามเดียวกับแดชบอร์ดขาย) + ตาราง sale_goal / sale_target
   ดึงย้อนหลัง 14 วันทุกครั้ง เพราะยอดแก้ย้อนหลังได้ (ถอนยืนยัน/ยกเลิก) แล้วทับทั้งช่องวัน×แบรนด์ด้วย external_record_id
   ข้อมูลลูกค้าไม่ข้ามมา: ขอ facts แค่ FACT_COLUMNS (ตัดรหัสลูกค้า/ดีล/เซล/ข้อความเหตุผลตั้งแต่ฝั่งขาย) และตรวจซ้ำก่อนเขียน
   แบรนด์: TD · JD · TA เท่านั้น — JK ข้อมูลจริงอยู่อีกโปรเจกต์ (ดู SALES_SOURCE_BRANDS) */
import { adminClient, corsHeaders, isServiceRole, json } from "../_shared/adsOAuth.ts";
import { SALES_SOURCE_BRANDS, factWindows, factsToDailyRows, goalRowsToSalesGoals } from "../_shared/salesFacts.js";
import {
  PAGE_LIMIT, describeSalesKey, describeSalesUrl, doorState, factsProbeUrl, goalProbeUrl,
  goalsUrl, monthsToSync, probeVerdict, summarizeFacts, summarizeGoals, targetsUrl,
} from "../_shared/salesBridge.js";
import { todayInTimeZone } from "../_shared/metaInsights.js";
import {
  inventoryUrls, monthsBackStart, pagedUrl, rpcShape, summarizeApMarketing, summarizeBudgetInventory,
  summarizeGoalInventory, summarizePctTargets, summarizeSpendInventory, summarizeTargetInventory,
} from "../_shared/salesInventory.js";

const LOOKBACK_DAYS = 14;
const MAX_DAYS = 400;
const WINDOW_DAYS = 3;        // 7 วันจริงได้ ~680 แถว → ก้อนละ 3 วัน ~300 แถว เผื่อวันพีคให้ห่างเพดาน 1,000
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = (date: Date) => date.toISOString().slice(0, 10);

/** error ที่ตั้งใจโยน — code เป็นค่าที่ส่งกลับไปให้ ads-cron บันทึก (ไม่มีรายละเอียดจากฝั่งขาย) */
const fail = (code: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(code), { code, ...extra });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isServiceRole(request)) return json(request, { error: "SERVICE_ROLE_REQUIRED" }, 401);

  const url = Deno.env.get("SALES_API_URL")?.trim();
  const key = Deno.env.get("SALES_API_KEY")?.trim();
  const body = await request.json().catch(() => ({}));

  /* โหมดตรวจ { check: true } — เฟส 1: secret key ใช้กับของจริงของพี่ทัชได้ไหม ก่อนสร้างท่อจริง
     อ่านอย่างเดียว · ไม่เขียนอะไรลงฐานข้อมูล · คืนแค่จำนวนสรุป ไม่คืนแถวดิบ ไม่คืนค่า URL/KEY จริง
     facts ขอเฉพาะคอลัมน์ใน FACT_COLUMNS (ตัดรหัสลูกค้า/ดีล/เซลตั้งแต่ฝั่งขาย) และตรวจซ้ำว่าไม่มีคอลัมน์เกินกลับมา */
  if (body?.check === true) {
    const keyInfo = describeSalesKey(key, url);
    const urlInfo = describeSalesUrl(url, Deno.env.get("SUPABASE_URL"));
    if (!url || !key) return json(request, { check: true, verdict: probeVerdict({ key: keyInfo }), url: urlInfo, key: keyInfo });

    const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
    const probe = async (target: string, init: RequestInit, summarize: (rows: unknown) => unknown) => {
      try {
        const response = await fetch(target, { ...init, headers, signal: AbortSignal.timeout(30_000) });
        const payload = await response.json().catch(() => null);
        const code = (payload as { code?: string } | null)?.code ?? null;
        const state = doorState(response.status, code);
        return { status: response.status, state, ...(state === "open" ? { summary: summarize(payload) } : { code }) };
      } catch {
        return { status: null, state: "unreachable" };
      }
    };
    const today = day(new Date());
    const weekAgo = day(new Date(Date.now() - 6 * 86_400_000));
    const facts = await probe(factsProbeUrl(url), {
      method: "POST", body: JSON.stringify({ p_from: weekAgo, p_to: today, p_brands: null, p_scope: "all" }),
    }, summarizeFacts);
    const goals = await probe(goalProbeUrl(url, `${today.slice(0, 7)}-01`), { method: "GET" }, summarizeGoals);
    // PostgREST คืนไม่เกิน 1,000 แถวต่อครั้ง — ถ้าชนเพดาน ท่อจริงต้องแบ่งหน้า
    const truncated = (facts as { summary?: { rows?: number } }).summary?.rows === 1000;
    return json(request, {
      check: true, verdict: probeVerdict({ key: keyInfo, facts, goals }),
      url: urlInfo, key: keyInfo, range: { from: weekAgo, to: today }, facts, goals, truncated,
    });
  }

  /* โหมดสำรวจ { inventory: true } — ระบบขายมีข้อมูลอะไรจริง เดือนไหน แบรนด์ไหน ครบแค่ไหน (ย้อน 3 เดือน)
     อ่านอย่างเดียว · ไม่เขียนอะไรลงฐานข้อมูล · URL และคอลัมน์ล็อกไว้ใน salesInventory.js (ไม่ขอคอลัมน์ระบุตัวคน/ผู้ขาย)
     คืนแค่จำนวน ชื่อช่อง และช่วงวันที่ — ไม่คืนยอดเงิน ข้อความ หรือแถวดิบ */
  if (body?.inventory === true) {
    if (!url || !key) return json(request, { inventory: true, verdict: "not_configured" });
    const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
    const today = todayInTimeZone(new Date(), "Asia/Bangkok");
    const since = monthsBackStart(today, 3) as string;
    const weekAgo = day(new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000));
    const urls = inventoryUrls(url, { since, today });
    type Door = { status: number | null; state: string; code?: string | null; rows?: unknown[]; truncated?: boolean };

    const read = async (target: string, init: RequestInit = {}): Promise<Door & { payload?: unknown }> => {
      try {
        const response = await fetch(target, { ...init, headers, signal: AbortSignal.timeout(30_000) });
        const payload = await response.json().catch(() => null);
        const code = (payload as { code?: string } | null)?.code ?? null;
        const state = doorState(response.status, code);
        return state === "open" ? { status: response.status, state, payload } : { status: response.status, state, code };
      } catch {
        return { status: null, state: "unreachable" };
      }
    };
    /** ทั้งตารางแบบแบ่งหน้า (สูงสุด 20 หน้า = 20,000 แถว) */
    const readAll = async (target: string): Promise<Door> => {
      const rows: unknown[] = [];
      for (let page = 0; page < 20; page += 1) {
        const result = await read(pagedUrl(target, page * 1000));
        if (result.state !== "open") return { status: result.status, state: result.state, code: result.code };
        const list = Array.isArray(result.payload) ? result.payload : [];
        rows.push(...list);
        if (list.length < 1000) return { status: result.status, state: "open", rows };
      }
      return { status: 200, state: "open", rows, truncated: true };
    };
    const summarize = (door: Door & { payload?: unknown }, fn: (rows: unknown) => unknown) => {
      const { payload: _payload, rows, ...meta } = door;
      return door.state === "open" ? { ...meta, rowCount: Array.isArray(rows ?? _payload) ? (rows ?? _payload as unknown[]).length : null, summary: fn(rows ?? _payload) } : meta;
    };
    const rpcBody = { method: "POST", body: JSON.stringify({ p_from: weekAgo, p_to: today, p_brands: null, p_scope: "all" }) };

    const [goals, targets, spend, pct, ap, pl, versions, lines, pipeline, insight] = await Promise.all([
      read(urls.goals), read(urls.targets), readAll(urls.spend), read(urls.pctTargets), readAll(urls.apMarketing),
      read(urls.plRevenue), read(urls.budgetVersions), readAll(urls.budgetLines),
      read(urls.pipeline, rpcBody), read(urls.insight, rpcBody),
    ]);
    const budget = lines.state === "open" && versions.state === "open"
      ? { status: lines.status, state: "open", rowCount: (lines.rows ?? []).length, truncated: lines.truncated ?? false, summary: summarizeBudgetInventory(lines.rows, versions.payload) }
      : { lines: { status: lines.status, state: lines.state, code: lines.code }, versions: { status: versions.status, state: versions.state, code: versions.code } };

    return json(request, {
      inventory: true, since, today,
      goals: summarize(goals, summarizeGoalInventory),
      legacyTargets: summarize(targets, summarizeTargetInventory),
      adSpendCsv: summarize(spend, summarizeSpendInventory),
      budget,
      marketingPctTarget: summarize(pct, summarizePctTargets),
      marketingExpenseAp: summarize(ap, summarizeApMarketing),
      plRevenue: summarize(pl, (rows) => {
        const list = Array.isArray(rows) ? rows as { entity?: string; ym?: string }[] : [];
        return { months: [...new Set(list.map((row) => row.ym))].filter(Boolean).sort(), entities: [...new Set(list.map((row) => row.entity))].filter(Boolean).sort() };
      }),
      pipeline: summarize(pipeline, rpcShape),
      insight: summarize(insight, rpcShape),
    });
  }

  // ยังไม่ได้ตั้งค่า = ไม่ใช่ความผิดพลาด — บอกให้รู้แล้วจบ
  if (!url || !key) return json(request, { skipped: "SALES_API_NOT_CONFIGURED" }, 200);

  const today = todayInTimeZone(new Date(), "Asia/Bangkok");
  const to = typeof body?.to === "string" && ISO.test(body.to) ? body.to : today;
  const span = Math.min(MAX_DAYS, Math.max(1, Number(body?.days) || LOOKBACK_DAYS));
  const from = typeof body?.from === "string" && ISO.test(body.from) ? body.from
    : day(new Date(Date.parse(`${to}T00:00:00Z`) - (span - 1) * 86_400_000));
  if (from > to) return json(request, { error: "SALES_RANGE_INVALID" }, 400);

  const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  const call = async (target: string, init: RequestInit = {}) => {
    const response = await fetch(target, { ...init, headers, signal: AbortSignal.timeout(60_000) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const code = (payload as { code?: string } | null)?.code ?? null;
      throw fail("SALES_READ_FAILED", { status: response.status, state: doorState(response.status, code) });
    }
    if (!Array.isArray(payload)) throw fail("SALES_RESPONSE_INVALID");
    return payload as Record<string, unknown>[];
  };

  /** facts ของช่วงหนึ่ง — ได้ครบเพดานพอดีแปลว่าอาจถูกตัด: แตกเป็นรายวันแล้วขอใหม่ · วันเดียวยังชนเพดาน = หยุด ไม่เขียนข้อมูลขาด */
  const factsFor = async (range: { from: string; to: string }): Promise<Record<string, unknown>[]> => {
    const rows = await call(factsProbeUrl(url), {
      method: "POST",
      body: JSON.stringify({ p_from: range.from, p_to: range.to, p_brands: SALES_SOURCE_BRANDS, p_scope: "all" }),
    });
    if (rows.length < PAGE_LIMIT) return rows;
    if (range.from === range.to) throw fail("SALES_PAGE_LIMIT", { day: range.from });
    const out: Record<string, unknown>[] = [];
    for (const single of factWindows(range.from, range.to, 1)) out.push(...await factsFor(single));
    return out;
  };

  let facts: Record<string, unknown>[] = [];
  try {
    for (const range of factWindows(from, to, WINDOW_DAYS)) facts.push(...await factsFor(range));
  } catch (error) {
    const detail = error as { code?: string; status?: number; state?: string; day?: string };
    console.error("[sales-sync] facts", detail.code, detail.status ?? "", detail.state ?? "", detail.day ?? "");
    return json(request, { error: detail.code ?? "SALES_READ_FAILED", status: detail.status ?? null, state: detail.state ?? null }, 502);
  }

  // ด่านสุดท้ายก่อนเขียน: ฝั่งขายต้องไม่ส่งคอลัมน์เกินที่ขอ (เช่นถ้ามีคนแก้ฟังก์ชันจนไม่สน select)
  const { extraColumns } = summarizeFacts(facts);
  if (extraColumns.length) {
    console.error("[sales-sync] column leak", extraColumns.join(","));
    return json(request, { error: "SALES_COLUMN_LEAK" }, 502);
  }
  // 14 วัน 3 แบรนด์ไม่มีเหตุการณ์เลยเป็นไปไม่ได้ — น่าจะเป็นด่านสิทธิ์ของฝั่งขายคืนชุดว่าง ห้ามเขียนศูนย์ทับของจริง
  if (!facts.length) return json(request, { error: "SALES_EMPTY_RESULT", from, to }, 502);

  const rows = factsToDailyRows(facts, { from, to }).map((row) => ({ ...row, source_updated_at: new Date().toISOString() }));
  const db = adminClient();
  const { error: writeError } = await db.from("business_daily_facts").upsert(rows, { onConflict: "source,external_record_id" });
  if (writeError) {
    console.error("[sales-sync] write", writeError.message);
    return json(request, { error: "SALES_WRITE_FAILED" }, 502);
  }

  /* เป้า — พังได้โดยไม่ทำให้ยอดขายที่เขียนสำเร็จแล้วพังตาม แต่ต้องบอกในผลลัพธ์ ไม่เงียบ */
  const months = monthsToSync(today);
  let goals: { written: number; bySource: Record<string, number>; error: string | null } = { written: 0, bySource: {}, error: null };
  try {
    const [goalRows, targetRows] = await Promise.all([call(goalsUrl(url, months)), call(targetsUrl(url, months))]);
    const goalOut = goalRowsToSalesGoals({ goals: goalRows, targets: targetRows });
    if (goalOut.length) {
      const { error } = await db.from("ad_sales_goals")
        .upsert(goalOut.map((goal) => ({ ...goal, synced_at: new Date().toISOString() })), { onConflict: "brand_id,month" });
      if (error) throw fail("SALES_GOALS_WRITE_FAILED", { detail: error.message });
    }
    const bySource: Record<string, number> = {};
    for (const goal of goalOut) bySource[goal.goal_source] = (bySource[goal.goal_source] ?? 0) + 1;
    goals = { written: goalOut.length, bySource, error: null };
  } catch (error) {
    const detail = error as { code?: string; detail?: string };
    console.error("[sales-sync] goals", detail.code, detail.detail ?? "");
    goals = { written: 0, bySource: {}, error: detail.code ?? "SALES_GOALS_FAILED" };
  }

  console.log(`[sales-sync] ${from}→${to} facts=${facts.length} rows=${rows.length} goals=${goals.written}${goals.error ? ` goalsError=${goals.error}` : ""}`);
  return json(request, { from, to, read: facts.length, written: rows.length, brands: SALES_SOURCE_BRANDS, goals });
});
