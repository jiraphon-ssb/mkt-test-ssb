import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import { parseOrigins, publicErrorCode, requestAppOrigin, resolveReturnUrl, returnTarget } from "./returnTo.js";
import { bearerToken, isServiceRoleToken } from "./serviceAuth.js";
export { publicErrorCode };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function env(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

export function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ผู้เรียกเป็น service role หรือไม่ (pg_cron → ads-cron → ads-sync) — ตรรกะอยู่ใน serviceAuth.js พร้อมเทส */
export function isServiceRole(request: Request) {
  return isServiceRoleToken(bearerToken(request.headers.get("authorization")), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "");
}

export function allowedOrigins() {
  return parseOrigins(Deno.env.get("ADS_ALLOWED_ORIGINS") ?? "http://localhost:5173,http://127.0.0.1:5173");
}

/** origin ค่าเริ่มของแอป (ใช้เมื่อคำขอไม่มี Origin ที่อยู่ใน allowlist) */
export function appOrigin() {
  const origin = parseOrigins(env("ADS_APP_ORIGIN"))[0];
  if (!origin) throw new Error("ADS_APP_ORIGIN must be an http(s) origin");
  return origin;
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  // origin ที่ไม่อยู่ใน allowlist = ไม่ส่ง ACAO เลย (ไม่ fallback ไป allowed[0] ที่ซ่อน misconfig)
  return {
    ...(allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** สมาชิกทีม = ผู้ใช้ Auth ที่ผูกกับ mkt_profile ที่ active (role ใดก็ได้) — เชื่อม/ดู/ยกเลิก Meta ของตัวเองได้ */
export async function requireMember(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new Error("AUTH_REQUIRED");
  const db = adminClient();
  const { data: authData, error: authError } = await db.auth.getUser(jwt);
  if (authError || !authData.user) throw new Error("AUTH_REQUIRED");
  // สิทธิ์อ่านจาก mkt_profile (schema ที่ deploy จริง) ผ่านคอลัมน์ auth_user_id — ดู migration 0005 (client แก้ role/active/auth_user_id ไม่ได้)
  const { data: profile } = await db.from("mkt_profile").select("id,display_name,role,active").eq("auth_user_id", authData.user.id).maybeSingle();
  if (!profile?.active) throw new Error("MEMBER_REQUIRED");
  return { db, user: authData.user, profile, isLead: profile.role === "team_lead" };
}

/** auth user id ของสมาชิกที่โปรไฟล์ยัง active — ใช้กรอง token ของคนที่ออกจากทีมแล้ว */
export async function activeMemberUserIds(db: ReturnType<typeof adminClient>) {
  const { data, error } = await db.from("mkt_profile").select("auth_user_id").eq("active", true).not("auth_user_id", "is", null);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.auth_user_id as string));
}

/** ผูกบัญชีกับแบรนด์ · สั่งดึงข้อมูล = team_lead เท่านั้น */
export async function requireTeamLead(request: Request) {
  const member = await requireMember(request).catch((error) => {
    throw error instanceof Error && error.message === "MEMBER_REQUIRED" ? new Error("TEAM_LEAD_REQUIRED") : error;
  });
  if (!member.isLead) throw new Error("TEAM_LEAD_REQUIRED");
  return member;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function randomState() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function sha256(value: string) {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function encryptionKey() {
  const raw = base64ToBytes(env("ADS_TOKEN_ENCRYPTION_KEY"));
  if (raw.byteLength !== 32) throw new Error("ADS_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(token));
  return { ciphertext: bytesToBase64(new Uint8Array(cipher)), iv: bytesToBase64(iv) };
}

export async function decryptToken(ciphertext: string, iv: string) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(ciphertext));
  return decoder.decode(plain);
}

/** ทางกลับ = origin ของหน้าที่กดเชื่อม (ต้องอยู่ใน ADS_ALLOWED_ORIGINS) + path ในโมดูล — ตรวจด้วย URL parser (returnTo.js + เทส) */
export function oauthReturnTarget(request: Request, path: unknown) {
  return returnTarget(path, requestAppOrigin(request.headers.get("origin"), allowedOrigins(), appOrigin()));
}

export function appRedirect(stored: unknown, params: Record<string,string>) {
  const url = new URL(resolveReturnUrl(stored, allowedOrigins(), appOrigin()));
  Object.entries(params).forEach(([key,value]) => url.searchParams.set(key,value));
  return Response.redirect(url.toString(), 302);
}

export function graphVersion() {
  return Deno.env.get("META_GRAPH_VERSION")?.trim() || "v26.0";
}

export async function graph(path: string, token: string, params: Record<string,string> = {}, method = "GET") {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}${path}`);
  Object.entries(params).forEach(([key,value]) => url.searchParams.set(key,value));
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json();
  if (!response.ok || payload?.error) throw new Error(payload?.error?.message || `Meta API ${response.status}`);
  return payload;
}
