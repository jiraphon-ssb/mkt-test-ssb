/* ads-creatives — ดึง creative ของโฆษณาที่มีค่าแอดใน 30 วันล่าสุด → ad_creatives (upsert)
   อ่านจาก /act_x/ads (Graph v26 เลิกรองรับ ?ids=) แล้วคัดเฉพาะ ad ที่มีค่าแอด สูงสุด 400 ตัวเรียงตามค่าแอด
   งบเวลา 90 วินาทีต่อคำขอ · ยังไม่จบคืน nextCursor ให้ client เรียกต่อ (คืนแค่ cursor ไม่คืน URL)
   สิทธิ์ team_lead · token ถอดรหัสฝั่ง server · ไม่เก็บไฟล์สื่อ เก็บ URL ที่ Meta ส่งมา (หมดอายุได้ ดึงใหม่ทับ) */
import { activeMemberUserIds, adminClient, corsHeaders, decryptToken, graphVersion, isServiceRole, json, requireTeamLead } from "../_shared/adsOAuth.ts";
import { publicSyncCode } from "../_shared/adsSyncJob.js";
import { syncError, todayInTimeZone } from "../_shared/metaInsights.js";
import { applyImageHashUrls, creativeRowFromAd, enrichRowsWithPosts, fetchAccountCreatives, fetchImageUrls, hashesNeedingUrl, OAUTH_SCOPES, rankAdIdsBySpend } from "../_shared/metaCreative.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ADS = 400;
const WINDOW_DAYS = 30;
const TIME_BUDGET_MS = 90_000;   // เผื่อก่อนเพดาน Edge Function (~150 วินาที)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  const startedAt = Date.now();
  try {
    // service role = ads-cron รีเฟรชอัตโนมัติวันละครั้ง · นอกนั้นต้องเป็น team_lead ตามเดิม
    const { db } = isServiceRole(request) ? { db: adminClient() } : await requireTeamLead(request);
    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body.connectionId === "string" && UUID.test(body.connectionId) ? body.connectionId : null;
    if (!connectionId) throw syncError("CONNECTION_ID_REQUIRED");
    const after = typeof body.after === "string" && body.after ? body.after : null;   // รูปแบบตรวจอีกชั้นใน buildAccountAdsUrl

    const { data: connection } = await db.from("ad_connections")
      .select("id,provider,external_account_id,timezone,status,authorization_id").eq("id", connectionId).maybeSingle();
    if (!connection) throw syncError("CONNECTION_NOT_FOUND");
    if (connection.provider !== "meta") throw syncError("PROVIDER_NOT_SUPPORTED");
    if (connection.status === "disabled" || !connection.authorization_id) throw syncError("CONNECTION_NOT_READY");
    const { data: authorization } = await db.from("ad_provider_authorizations")
      .select("id,user_id,token_ciphertext,token_iv,status,expires_at,scopes").eq("id", connection.authorization_id).maybeSingle();
    if (!authorization || authorization.status !== "connected" || !(await activeMemberUserIds(db)).has(authorization.user_id)) throw syncError("AUTHORIZATION_NOT_READY");
    if (authorization.expires_at && new Date(authorization.expires_at).getTime() <= Date.now()) throw syncError("META_TOKEN_INVALID");

    // ad ที่มีค่าแอดใน 30 วันล่าสุด (ตาม timezone บัญชี)
    const today = todayInTimeZone(new Date(), connection.timezone);
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - (WINDOW_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
    const facts: { ad_id: string; spend: number | null }[] = [];
    for (let from = 0; from < 50_000; from += 1000) {
      const { data, error } = await db.from("ad_daily_facts").select("ad_id,spend")
        .eq("connection_id", connection.id).eq("level", "ad").gte("fact_date", since).range(from, from + 999);
      if (error) throw error;
      facts.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const wanted = new Set(rankAdIdsBySpend(facts, MAX_ADS));
    if (!wanted.size) return json(request, { total: 0, saved: 0, pages: 0, nextCursor: null });

    const token = await decryptToken(authorization.token_ciphertext, authorization.token_iv);
    const { ads, pages, after: nextCursor, lastError } = await fetchAccountCreatives(connection.external_account_id, wanted, {
      version: graphVersion(), fetch, token, sleep, after, deadline: startedAt + TIME_BUDGET_MS,
    });
    // ข้อความ error ของ Meta (ไม่มี token) ไว้วินิจฉัยใน log ฝั่ง server เท่านั้น
    if (lastError) console.error("[ads-creatives] meta", connection.id, String(lastError).slice(0, 300));
    const now = new Date().toISOString();
    let rows = ads.map((ad) => creativeRowFromAd(ad, connection.id, now)).filter(Boolean);

    /* อัลบั้ม/carousel: Meta ส่ง image_hash มาโดยไม่มี URL → ทุกชิ้นตกไปใช้ภาพระดับ creative ตัวเดียวกัน
       ขอ URL ตาม hash ก่อน (บัญชีเดียวกัน ใช้ ads_read ที่มีอยู่) แล้วค่อยให้ขั้นดึงจากโพสต์ทำที่เหลือ */
    const hashes = hashesNeedingUrl(rows);
    let hashImages: { resolved: number; asked: number; reason: string | null } = { resolved: 0, asked: hashes.length, reason: null };
    if (hashes.length) {
      const found = await fetchImageUrls({ version: graphVersion(), accountId: connection.external_account_id, hashes, fetch, token, sleep, deadline: Date.now() + 20_000 });
      rows = applyImageHashUrls(rows, found.urls);
      hashImages = { resolved: found.urls.size, asked: hashes.length, reason: found.reason };
      if (found.reason) console.error("[ads-creatives] image hashes", connection.id, found.reason);
    }

    // โฆษณาแบบบูสต์โพสต์เพจ: Meta ให้แค่รูปโปรไฟล์เพจ → ดึงภาพจากโพสต์จริงด้วย Page token (ในหน่วยความจำเท่านั้น)
    const scopes: string[] = authorization.scopes ?? [];
    let postMedia: { enriched: number; needed: number; missingPages: number; usedUserToken: number; businesses: number; reason: string | null } = { enriched: 0, needed: 0, missingPages: 0, usedUserToken: 0, businesses: 0, reason: null };
    if (scopes.includes("pages_read_engagement") && scopes.includes("pages_show_list")) {
      /* ให้เวลาขั้นนี้อย่างน้อย 30 วินาทีเสมอ — เดิมผูกกับ startedAt ถ้าดึง ad ใช้เวลาเต็มงบ 90 วิ
         ขั้นนี้จะเหลือแค่ 20 วิ แล้วจบด้วย DEADLINE โดยไม่มีใครเห็น (เพดาน function จริง ~150 วิ) */
      const budget = Math.min(startedAt + 140_000, Date.now() + 30_000);
      const enriched = await enrichRowsWithPosts(rows, { version: graphVersion(), fetch, token, sleep, deadline: budget, scopes });
      rows = enriched.rows;
      postMedia = {
        enriched: enriched.enriched, needed: enriched.needed, missingPages: enriched.missingPages.length,
        usedUserToken: enriched.usedUserToken, businesses: enriched.businesses, reason: enriched.reason,
      };
      if (enriched.reason || enriched.missingPages.length) console.error("[ads-creatives] post media", connection.id, enriched.reason ?? "", `missingPages=${enriched.missingPages.join(",")}`);
    } else if (rows.some((row) => row.source_spec?.object_type === "STATUS")) {
      postMedia = { enriched: 0, needed: 0, missingPages: 0, usedUserToken: 0, businesses: 0, reason: "NEEDS_RECONNECT" };
    }
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("ad_creatives").upsert(rows.slice(i, i + 200), { onConflict: "connection_id,external_creative_id,external_ad_id" });
      if (error) { console.error("[ads-creatives] write", error.message); throw syncError("SYNC_WRITE_FAILED"); }
    }
    /* สิทธิ์ที่ token ปัจจุบันยังไม่มี — บอกตรงๆ ว่าต้องกดเชื่อม Meta ใหม่ถึงจะได้ความสามารถนั้น
       (เช่น business_management ที่เพิ่มทีหลัง: ไม่มีแล้วเพจใต้ Business จะยังหาไม่เจอ) */
    const missingScopes = OAUTH_SCOPES.filter((scope) => !scopes.includes(scope));
    return json(request, { total: wanted.size, saved: rows.length, pages, nextCursor, hashImages, postMedia, missingScopes });
  } catch (error) {
    const code = publicSyncCode(error, "CREATIVE_SYNC_FAILED");
    console.error("[ads-creatives]", code, error instanceof Error ? error.message : error, (error as { detail?: string })?.detail ?? "");
    const status = code === "AUTH_REQUIRED" ? 401 : code === "TEAM_LEAD_REQUIRED" ? 403 : code === "CONNECTION_NOT_FOUND" ? 404
      : ["CONNECTION_ID_REQUIRED", "CURSOR_INVALID"].includes(code) ? 400 : ["CONNECTION_NOT_READY", "AUTHORIZATION_NOT_READY", "PROVIDER_NOT_SUPPORTED"].includes(code) ? 409 : 502;
    return json(request, { error: code }, status);
  }
});
