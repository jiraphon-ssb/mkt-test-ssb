/* sales-sync — ดึงยอดขายจริงรายวันต่อแบรนด์จากระบบขาย (โปรเจกต์ ssbgroup-platform) ลง business_daily_facts
   สิทธิ์: service role เท่านั้น (ads-cron เรียกวันละครั้ง) · ปลายทางฝั่งขาย = RPC mkt_revenue_daily (อ่านอย่างเดียว)
   ดึงย้อนหลัง 14 วันทุกครั้ง เพราะยอดปรับย้อนหลังได้ (ยกเลิกออเดอร์/แก้ยอด) แล้วทับด้วย external_record_id
   ไม่มีข้อมูลลูกค้าไหลข้ามระบบ — RPC คืนแค่ตัวเลขรวมต่อแบรนด์ต่อวัน
   เฟส 2 (funnel) และเฟส 3 (เป้า) เรียกเพิ่มถ้าประตูฝั่งขายเปิดแล้ว ยังไม่เปิดก็ทำงานต่อได้ตามปกติ */
import { adminClient, corsHeaders, isServiceRole, json } from "../_shared/adsOAuth.ts";
import { funnelRowsToFacts, goalsFromSales, mergeDailyFacts, salesRowsToFacts } from "../_shared/salesFacts.js";

const LOOKBACK_DAYS = 14;
const MAX_DAYS = 400;
const day = (date: Date) => date.toISOString().slice(0, 10);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isServiceRole(request)) return json(request, { error: "SERVICE_ROLE_REQUIRED" }, 401);

  const url = Deno.env.get("SALES_API_URL")?.trim();
  const key = Deno.env.get("SALES_API_KEY")?.trim();
  // ยังไม่ได้ตั้งค่า = ไม่ใช่ความผิดพลาด (ประตูฝั่งขายอาจยังไม่เปิด) — บอกให้รู้แล้วจบ
  if (!url || !key) return json(request, { skipped: "SALES_API_NOT_CONFIGURED" }, 200);

  const body = await request.json().catch(() => ({}));
  const to = typeof body?.to === "string" ? body.to : day(new Date());
  const span = Math.min(MAX_DAYS, Math.max(1, Number(body?.days) || LOOKBACK_DAYS));
  const from = typeof body?.from === "string" ? body.from : day(new Date(Date.parse(`${to}T00:00:00Z`) - (span - 1) * 86_400_000));

  const base = url.replace(/\/+$/, "");
  /** เรียก RPC ฝั่งระบบขาย — ประตูที่ยังไม่เปิด (404/42883) ไม่ถือว่าพัง แค่ยังไม่มีเฟสนั้น */
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) return { rows: Array.isArray(payload) ? payload : [], missing: false };
    const code = (payload as { code?: string } | null)?.code ?? "";
    if (response.status === 404 || code === "PGRST202" || code === "42883") return { rows: [], missing: true };
    throw Object.assign(new Error(name), { status: response.status, detail: JSON.stringify(payload)?.slice(0, 200) });
  };

  let revenue, funnel, goalRows;
  try {
    revenue = await rpc("mkt_revenue_daily", { p_from: from, p_to: to });
    funnel = await rpc("mkt_funnel_daily", { p_from: from, p_to: to });            // เฟส 2 — ยังไม่เปิดก็ข้าม
    goalRows = await rpc("mkt_goal_current", { p_month: `${to.slice(0, 7)}-01` }); // เฟส 3 — ยังไม่เปิดก็ข้าม
  } catch (error) {
    const detail = error as { status?: number; detail?: string };
    console.error("[sales-sync] upstream", detail.status, detail.detail);
    return json(request, { error: "SALES_READ_FAILED", status: detail.status ?? null }, 502);
  }

  const goals = [...goalsFromSales(goalRows.rows)].map(([brandId, goal]) => ({ brandId, ...goal }));
  const facts = mergeDailyFacts(salesRowsToFacts(revenue.rows), funnelRowsToFacts(funnel.rows));
  const phases = { revenue: true, funnel: !funnel.missing, goals: !goalRows.missing };
  if (!facts.length) return json(request, { from, to, read: revenue.rows.length, written: 0, phases, goals });

  const db = adminClient();
  const { error } = await db.from("business_daily_facts")
    .upsert(facts.map((fact) => ({ ...fact, source_updated_at: new Date().toISOString() })), { onConflict: "source,external_record_id" });
  if (error) {
    console.error("[sales-sync] write", error.message);
    return json(request, { error: "SALES_WRITE_FAILED" }, 502);
  }
  if (goals.length) {
    const { error: goalError } = await db.from("ad_sales_goals").upsert(goals.map((goal) => ({
      brand_id: goal.brandId, month: goal.month, version: goal.version,
      sales_target: goal.salesTarget, ad_budget: goal.adBudget, cpl: goal.cpl, cac: goal.cac,
      roas: goal.roas, leads_target: goal.leadsTarget, orders_target: goal.ordersTarget, synced_at: new Date().toISOString(),
    })), { onConflict: "brand_id,month" });
    if (goalError) console.error("[sales-sync] goals", goalError.message);   // เป้าพังไม่ควรทำให้ยอดขายที่เขียนสำเร็จแล้วพังตาม
  }

  console.log(`[sales-sync] ${from}→${to} revenue=${revenue.rows.length} funnel=${funnel.rows.length} goals=${goals.length} written=${facts.length}`);
  return json(request, { from, to, read: revenue.rows.length, written: facts.length, phases, goals });
});
