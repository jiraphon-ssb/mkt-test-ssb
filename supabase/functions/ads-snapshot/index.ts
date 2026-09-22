/* ads-snapshot — ดึง snapshot บัญชีแอดทุกตัวที่ token เห็น "ตอนนี้เลย" จากปุ่มในหน้า Sync
   (spec docs/superpowers/specs/2026-09-22-billing-recon.md — ปกติ ads-cron เก็บทุกชั่วโมงอยู่แล้ว
   ปุ่มนี้มีไว้ตอนไม่อยากรอรอบ เช่น เพิ่งเปิดหน้า บิล & กระทบยอด ครั้งแรก)
   สิทธิ์ team_lead (หรือ service role) · token ถอดรหัสฝั่ง server · เขียนตาราง ad_account_snapshots อย่างเดียว */
import { adminClient, corsHeaders, decryptToken, graphVersion, isServiceRole, json, requireTeamLead } from "../_shared/adsOAuth.ts";
import { publicSyncCode } from "../_shared/adsSyncJob.js";
import { todayInTimeZone } from "../_shared/metaInsights.js";
import { fetchAccountMonthSpend, fetchAccountSnapshots, monthsToFetch } from "../_shared/adsAccountSnapshot.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { db } = isServiceRole(request) ? { db: adminClient() } : await requireTeamLead(request);
    const { data: authorization } = await db.from("ad_provider_authorizations")
      .select("token_ciphertext,token_iv").eq("status", "connected").limit(1).maybeSingle();
    if (!authorization) return json(request, { error: "AUTHORIZATION_NOT_READY" }, 409);
    const token = await decryptToken(authorization.token_ciphertext, authorization.token_iv);
    const rows = await fetchAccountSnapshots({ fetch, token, sleep, version: graphVersion() });
    if (rows.length) {
      // ยอดเดือนต่อบัญชี (รวมบัญชีที่ยังไม่ได้เชื่อม) — ทับเฉพาะเดือนที่ดึง ไม่ลบเดือนเก่า
      const months = monthsToFetch(todayInTimeZone(new Date(), "Asia/Bangkok"));
      const monthSpend = await fetchAccountMonthSpend({
        fetch, token, sleep, version: graphVersion(),
        accountIds: rows.map((row) => row.external_account_id), months,
      });
      const { data: prior } = await db.from("ad_account_snapshots").select("external_account_id,month_spend");
      const priorById = new Map((prior ?? []).map((row) => [row.external_account_id, row.month_spend ?? {}]));
      const fetchedAt = new Date().toISOString();
      const { error } = await db.from("ad_account_snapshots")
        .upsert(rows.map((row) => ({
          ...row, fetched_at: fetchedAt,
          month_spend: { ...(priorById.get(row.external_account_id) ?? {}), ...(monthSpend[row.external_account_id] ?? {}) },
        })), { onConflict: "external_account_id" });
      if (error) throw error;
    }
    return json(request, { accounts: rows.length });
  } catch (error) {
    const code = publicSyncCode(error);
    console.error("[ads-snapshot]", code, error instanceof Error ? error.message : "");
    return json(request, { error: code }, 500);
  }
});
