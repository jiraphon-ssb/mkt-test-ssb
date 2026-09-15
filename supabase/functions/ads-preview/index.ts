/* ads-preview — ตัวอย่างโฆษณาจริงจาก Meta (Ad Preview API · ads_read) ให้ดูภาพ/เล่นคลิปตามที่ลูกค้าเห็น
   คืนแค่ src ของ iframe ที่ผ่านการตรวจ (https://www.facebook.com/ads/api/preview_iframe.php) ไม่คืน HTML
   สิทธิ์ team_lead · ad ต้องอยู่ในข้อมูลของ connection นั้น · token ถอดรหัสฝั่ง server */
import { activeMemberUserIds, corsHeaders, decryptToken, graphVersion, json, requireTeamLead } from "../_shared/adsOAuth.ts";
import { publicSyncCode } from "../_shared/adsSyncJob.js";
import { fetchGraphJson, syncError } from "../_shared/metaInsights.js";
import { buildAdPreviewUrl, extractPreviewSrc, previewDiagnostics, PREVIEW_FORMATS } from "../_shared/metaCreative.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { db } = await requireTeamLead(request);
    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body.connectionId === "string" && UUID.test(body.connectionId) ? body.connectionId : null;
    if (!connectionId) throw syncError("CONNECTION_ID_REQUIRED");
    const adId = typeof body.adId === "string" && /^\d{1,30}$/.test(body.adId) ? body.adId : null;
    if (!adId) throw syncError("AD_ID_INVALID");
    const format = PREVIEW_FORMATS.includes(body.format) ? body.format : "MOBILE_FEED_STANDARD";

    const { data: connection } = await db.from("ad_connections").select("id,provider,status,authorization_id").eq("id", connectionId).maybeSingle();
    if (!connection) throw syncError("CONNECTION_NOT_FOUND");
    if (connection.provider !== "meta") throw syncError("PROVIDER_NOT_SUPPORTED");
    if (connection.status === "disabled" || !connection.authorization_id) throw syncError("CONNECTION_NOT_READY");
    // ad ต้องเป็นของบัญชีนี้ (มียอดหรือ creative ในฐาน) — ไม่ใช้ token ไปดูโฆษณาอื่น
    const { data: known } = await db.from("ad_creatives").select("external_ad_id").eq("connection_id", connection.id).eq("external_ad_id", adId).limit(1);
    if (!known?.length) {
      const { data: fact } = await db.from("ad_daily_facts").select("ad_id").eq("connection_id", connection.id).eq("ad_id", adId).limit(1);
      if (!fact?.length) throw syncError("AD_NOT_FOUND");
    }
    const { data: authorization } = await db.from("ad_provider_authorizations")
      .select("id,user_id,token_ciphertext,token_iv,status,expires_at").eq("id", connection.authorization_id).maybeSingle();
    if (!authorization || authorization.status !== "connected" || !(await activeMemberUserIds(db)).has(authorization.user_id)) throw syncError("AUTHORIZATION_NOT_READY");
    if (authorization.expires_at && new Date(authorization.expires_at).getTime() <= Date.now()) throw syncError("META_TOKEN_INVALID");

    const token = await decryptToken(authorization.token_ciphertext, authorization.token_iv);
    const { payload } = await fetchGraphJson(buildAdPreviewUrl({ version: graphVersion(), adId, format }), { fetch, token, sleep, maxRetries: 1, baseDelayMs: 1000, maxDelayMs: 1000 });
    const previewBody = payload?.data?.[0]?.body;
    const src = extractPreviewSrc(previewBody);
    if (!src) {
      // รูปแบบที่ตรวจไม่ผ่าน (ไม่มี query/token) ไว้วินิจฉัยใน log ฝั่ง server
      console.error("[ads-preview] shape", format, JSON.stringify({ items: Array.isArray(payload?.data) ? payload.data.length : null, ...previewDiagnostics(previewBody) }));
      throw syncError("PREVIEW_UNAVAILABLE");
    }
    return json(request, { src, format });
  } catch (error) {
    const code = publicSyncCode(error, "PREVIEW_UNAVAILABLE");
    console.error("[ads-preview]", code, error instanceof Error ? error.message : error, (error as { detail?: string })?.detail ?? "");
    const status = code === "AUTH_REQUIRED" ? 401 : code === "TEAM_LEAD_REQUIRED" ? 403 : ["CONNECTION_NOT_FOUND", "AD_NOT_FOUND"].includes(code) ? 404
      : ["CONNECTION_ID_REQUIRED", "AD_ID_INVALID"].includes(code) ? 400 : ["CONNECTION_NOT_READY", "AUTHORIZATION_NOT_READY", "PROVIDER_NOT_SUPPORTED"].includes(code) ? 409 : 502;
    return json(request, { error: code }, status);
  }
});
