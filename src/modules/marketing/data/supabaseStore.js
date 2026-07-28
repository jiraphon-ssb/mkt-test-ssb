/* ============================================================
 SupabaseStore — implementation ของ DataStore ที่คุยกับ Supabase (โหมดไม่ล็อกอิน)
 คู่กับ supabase/schema_nologin.sql (ฟังก์ชัน mkt_load_state / mkt_save_state)

 วิธีใช้:
   1. รัน supabase/schema_nologin.sql ใน SQL Editor
   2. ใส่คีย์ใน .env  (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
   3. ใน DataStore.js เปลี่ยนบรรทัดสุดท้ายเป็น  export { store } from "./supabaseStore.js";

 หมายเหตุจังหวะเขียน: UI เรียก save() ทุก mutation (เดโมเขียน localStorage ทันที)
 ที่นี่ debounce 400ms แล้วยิง RPC ครั้งเดียว — กดรัวๆ ไม่ยิงถี่จนโดน rate limit
 ============================================================ */
import { supabase, isSupabaseConfigured } from "../../../foundation/data/supabaseClient.js";
import { buildSeed, DATA_VERSION } from "./seed.js";

/** cache ในหน่วยความจำ — UI อ่าน sync ได้เหมือน LocalStore (โหลดจริงทำตอน boot ครั้งเดียว) */
let cache = null;
let timer = null;

/** เติมคีย์ที่ฝั่ง DB ไม่ได้เก็บ (version) + กันคีย์ขาดจาก seed */
function withDefaults(data) {
  const seed = buildSeed();
  const out = { ...data, version: DATA_VERSION };
  for (const key of Object.keys(seed))
    if (out[key] == null || (Array.isArray(seed[key]) && !Array.isArray(out[key]))) out[key] = seed[key];
  return out;
}

export class SupabaseStore {
  /** โหลดครั้งเดียวตอน boot — ต้อง await ก่อน render โมดูล (ดู bootstrap ล่างสุด) */
  async boot() {
    if (!isSupabaseConfigured) throw new Error("ยังไม่ได้ใส่คีย์ Supabase ใน .env");
    const { data, error } = await supabase.rpc("mkt_load_state");
    if (error) throw error;
    const empty = !data?.cards?.length;
    /* ฐานว่าง (เพิ่งรัน SQL) → ดันข้อมูลเดโมขึ้นให้ครั้งแรก จะได้เปิดมาเห็นของเลย */
    cache = empty ? buildSeed() : withDefaults(data);
    if (empty) await this.flush(cache);
    return cache;
  }

  load() {
    return cache ?? (cache = buildSeed());
  }

  save(data) {
    cache = data;
    clearTimeout(timer);
    timer = setTimeout(() => this.flush(data), 400);
  }

  /** ยิงจริง — แยกไว้ให้ boot/reset เรียกตรงได้โดยไม่ต้องรอ debounce */
  async flush(data) {
    const { error } = await supabase.rpc("mkt_save_state", { payload: data });
    if (error) console.error("[supabaseStore] บันทึกไม่สำเร็จ:", error.message);
  }

  reset() {
    const seed = buildSeed();
    cache = seed;
    this.flush(seed);
    return seed;
  }

  export() {
    return JSON.stringify(this.load(), null, 2);
  }

  import(json) {
    const data = withDefaults(JSON.parse(json));
    cache = data;
    this.flush(data);
    return data;
  }
}

export const store = new SupabaseStore();

/** เรียกใน main.jsx ก่อน render: `await bootstrapSupabase()` (ไม่ใส่คีย์ = ข้ามไปใช้ localStorage) */
export async function bootstrapSupabase() {
  if (!isSupabaseConfigured) return false;
  await store.boot();
  return true;
}
