import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import { safeReturnTo as pickReturnTo, publicErrorCode } from "./returnTo.js";
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

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowed = (Deno.env.get("ADS_ALLOWED_ORIGINS") ?? "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174")
    .split(",").map((item) => item.trim()).filter(Boolean);
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

export async function requireTeamLead(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new Error("AUTH_REQUIRED");
  const db = adminClient();
  const { data: authData, error: authError } = await db.auth.getUser(jwt);
  if (authError || !authData.user) throw new Error("AUTH_REQUIRED");
  // สิทธิ์อ่านจาก mkt_profile (schema ที่ deploy จริง) ผ่านคอลัมน์ auth_user_id — ดู migration 0005
  const { data: profile } = await db.from("mkt_profile").select("id,role,active").eq("auth_user_id", authData.user.id).maybeSingle();
  if (!profile?.active || profile.role !== "team_lead") throw new Error("TEAM_LEAD_REQUIRED");
  return { db, user: authData.user, profile };
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

/** ทางกลับต้องอยู่ใน ADS_APP_ORIGIN เท่านั้น — ตรวจด้วย URL parser (ดู returnTo.js + เทส) ไม่ใช่ string prefix */
export function safeReturnTo(value: unknown) {
  return pickReturnTo(value, env("ADS_APP_ORIGIN"));
}

export function appRedirect(path: string, params: Record<string,string>) {
  const url = new URL(safeReturnTo(path), env("ADS_APP_ORIGIN"));
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
