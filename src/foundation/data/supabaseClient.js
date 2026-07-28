import { createClient } from "@supabase/supabase-js";

/* The one Supabase client for the app. Created from env (PUBLIC anon key only).
   If env is missing the client is null — the app still runs (cashflow uses
   sample data); only AP, which needs the backend, surfaces a clear error.
   Per กติกาเหล็ก #1, nothing imports this directly except apiClient + auth. */

// .trim() guards against a stray newline/space pasted into the env var (a
// trailing newline in the anon key makes it an invalid fetch header value →
// "Failed to execute 'fetch' on 'Window': Invalid value").
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;

/** Throw a friendly error if a backend call is attempted without config. */
export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า Supabase — ใส่ VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY ใน .env (ดู .env.example)"
    );
  }
  return supabase;
}
