/* sales-sync — ดึงยอดขายจริงรายวันต่อแบรนด์จากระบบขาย (โปรเจกต์ ssbgroup-platform) ลง business_daily_facts
   สิทธิ์: service role เท่านั้น (ads-cron เรียกวันละครั้ง) · ปลายทางฝั่งขาย = RPC mkt_revenue_daily (อ่านอย่างเดียว)
   ดึงย้อนหลัง 14 วันทุกครั้ง เพราะยอดปรับย้อนหลังได้ (ยกเลิกออเดอร์/แก้ยอด) แล้วทับด้วย external_record_id
   ไม่มีข้อมูลลูกค้าไหลข้ามระบบ — RPC คืนแค่ brand · day · revenue · orders */
import { adminClient, corsHeaders, isServiceRole, json } from "../_shared/adsOAuth.ts";
import { salesRowsToFacts } from "../_shared/salesFacts.js";

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

  let rows: unknown[] = [];
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/mkt_revenue_daily`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ p_from: from, p_to: to }),
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("[sales-sync] upstream", response.status, JSON.stringify(payload)?.slice(0, 200));
      return json(request, { error: "SALES_READ_FAILED", status: response.status }, 502);
    }
    rows = Array.isArray(payload) ? payload : [];
  } catch (error) {
    console.error("[sales-sync] fetch", error instanceof Error ? error.message : error);
    return json(request, { error: "SALES_UNREACHABLE" }, 502);
  }

  const facts = salesRowsToFacts(rows);
  if (!facts.length) return json(request, { from, to, read: rows.length, written: 0 });

  const db = adminClient();
  const { error } = await db.from("business_daily_facts")
    .upsert(facts.map((fact) => ({ ...fact, source_updated_at: new Date().toISOString() })), { onConflict: "source,external_record_id" });
  if (error) {
    console.error("[sales-sync] write", error.message);
    return json(request, { error: "SALES_WRITE_FAILED" }, 502);
  }
  console.log(`[sales-sync] ${from}→${to} read=${rows.length} written=${facts.length}`);
  return json(request, { from, to, read: rows.length, written: facts.length });
});
