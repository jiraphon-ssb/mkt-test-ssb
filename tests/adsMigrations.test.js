/* ตรวจว่า migration ของ ads (0005–0007) และ Edge Functions อ้างอิงเฉพาะสิ่งที่มีบนฐานจริง (mkt_* baseline) หรือสร้างเองก่อนใช้
   — กันเคส push แล้วพังเพราะอ้าง brands/profiles/my_role() ที่ไม่มีในโปรเจกต์นี้ */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const baseline = read("supabase/migrations/20260914000000_remote_baseline.sql");
const migrations = ["0005_ads_data.sql", "0006_ad_creatives.sql", "0007_meta_oauth.sql", "0008_harden_mkt_save_state.sql"].map((f) => [f, read(`src/supabase/migrations/${f}`)]);
const tables = (sql) => [...sql.matchAll(/create table (?:if not exists )?([a-z_]+)/g)].map((m) => m[1]);
const remoteTables = new Set(tables(baseline));

describe("ads migrations vs ฐานจริง", () => {
  it("baseline ของฐานจริงมีแต่ mkt_* (ไม่มี profiles/brands)", () => {
    expect(remoteTables.has("mkt_brand")).toBe(true);
    expect(remoteTables.has("mkt_profile")).toBe(true);
    expect(remoteTables.has("brands")).toBe(false);
    expect(remoteTables.has("profiles")).toBe(false);
  });
  it("ทุก foreign key ใน 0005–0007 ชี้ไปตารางที่มีจริง หรือที่สร้างก่อนหน้าในชุดเดียวกัน หรือ auth.users", () => {
    const known = new Set([...remoteTables, "auth.users"]);
    for (const [file, sql] of migrations) {
      for (const t of tables(sql)) known.add(t);
      for (const m of sql.matchAll(/references ([a-z_.]+)\(/g)) expect(known.has(m[1]), `${file}: references ${m[1]} ที่ยังไม่มี`).toBe(true);
    }
  });
  it("ไม่ใช้ my_role() · touch_updated_at และ mkt_is_team_lead ถูกสร้างก่อนใช้", () => {
    const all = migrations.map(([, s]) => s.replace(/--[^\n]*/g, "")).join("\n");   // ตัดคอมเมนต์ SQL ออกก่อนตรวจ
    expect(all.includes("my_role()")).toBe(false);
    expect(all.indexOf("create or replace function touch_updated_at")).toBeLessThan(all.indexOf("execute function touch_updated_at"));
    expect(all.indexOf("create or replace function mkt_is_team_lead")).toBeLessThan(all.indexOf("mkt_is_team_lead()"));
    expect(all).toContain("alter table mkt_profile add column if not exists auth_user_id uuid");
  });
  it("trigger กัน client แก้คอลัมน์สิทธิ์ทั้ง INSERT · UPDATE · DELETE (H1/H2/NEW-2) · เช็คบทบาท connection ไม่ใช่ JWT claim (M4)", () => {
    const sql = migrations[0][1];
    expect(sql).toContain("create trigger mkt_profile_guard_privileges before insert or update or delete on mkt_profile");
    expect(sql).toMatch(/tg_op = 'DELETE'[\s\S]*old\.auth_user_id is not null or old\.role = 'team_lead'/);
    expect(sql).toMatch(/current_user in \('service_role', 'postgres'\)/);
    expect(sql).toMatch(/tg_op = 'INSERT'[\s\S]*new\.role = 'team_lead'/);
    expect(sql).toMatch(/new\.role is distinct from old\.role/);
    expect(sql.includes("request.jwt.claims")).toBe(false);
  });
  it("RLS เปิดทุกตาราง ads · อ่านได้เฉพาะ authenticated · ไม่มี policy เขียน facts จาก client", () => {
    const sql = migrations[0][1] + migrations[1][1];
    for (const t of ["ad_connections", "ad_sync_runs", "ad_daily_facts", "business_daily_facts", "ad_targets", "ad_rules", "ad_creatives"]) {
      expect(sql).toContain(`alter table ${t} enable row level security`);
      expect(sql, t).toMatch(new RegExp(`create policy \\w+ on ${t} for select to authenticated using \\(true\\)`));
    }
    expect(/create policy \w+ on ad_daily_facts for (all|insert|update)/.test(sql)).toBe(false);
    expect(/create policy \w+ on ad_sync_runs for (all|insert|update)/.test(sql)).toBe(false);
  });
  it("FK ไป mkt_brand/mkt_profile ห้าม cascade (NEW-1: mkt_save_state ลบ+ใส่คืนทั้งก้อนทุกครั้งที่บันทึก) · ต้อง deferrable", () => {
    const sql = migrations.map(([, x]) => x.replace(/--[^\n]*/g, "")).join("\n");
    expect(/references mkt_(brand|profile)\(id\) on delete cascade/.test(sql)).toBe(false);
    const fks = [...sql.matchAll(/references mkt_(?:brand|profile)\(id\)[^,\n]*/g)].map((m) => m[0]);
    expect(fks.length).toBe(6);
    for (const fk of fks) expect(fk).toContain("on delete no action deferrable initially deferred");
  });
  it("0008 กัน mkt_save_state: anon เรียกไม่ได้ · ต้องมี session · คง auth_user_id · ไม่ใช่ team_lead ยกระดับ/ลบคนอื่นไม่ได้ (H3/NEW-2)", () => {
    const sql = migrations[3][1];
    expect(sql).toContain("alter function public.mkt_save_state(jsonb) rename to mkt_save_state_raw");
    expect(sql).toContain("revoke execute on function public.mkt_save_state_raw(jsonb) from public, anon, authenticated");
    expect(sql).toContain("revoke execute on function public.mkt_save_state(jsonb) from public, anon");
    expect(sql).toMatch(/security definer set search_path = ''/);
    expect(sql).toMatch(/if \(select auth\.uid\(\)\) is null then[\s\S]*raise exception 'AUTH_REQUIRED'/);
    expect(sql).toMatch(/update public\.mkt_profile p set auth_user_id = s\.auth_user_id/);
    expect(sql).toMatch(/if not caller_is_lead then[\s\S]*set role = s\.role, active = s\.active/);
    expect(sql).toMatch(/insert into public\.mkt_profile[\s\S]*s\.role = 'team_lead' or s\.auth_user_id is not null/);
  });
  it("Edge Function ตรวจสิทธิ์จาก mkt_profile.auth_user_id ไม่ใช่ profiles", () => {
    const fn = read("supabase/functions/_shared/adsOAuth.ts");
    expect(fn).toContain('from("mkt_profile")');
    expect(fn).toContain('eq("auth_user_id"');
    expect(fn.includes('from("profiles")')).toBe(false);
  });
});

describe("0009 เก็บ settings.ads_control ลงฐาน", () => {
  const sql = readFileSync(new URL("../src/supabase/migrations/0009_mkt_settings_ads_control.sql", import.meta.url), "utf8");
  it("เพิ่มคอลัมน์ jsonb object · wrapper ยังกันสิทธิ์ครบเหมือน 0008 · เขียน ads_control เฉพาะ team_lead", () => {
    expect(sql).toContain("alter table public.mkt_settings add column if not exists ads_control jsonb not null default '{}'::jsonb");
    expect(sql).toMatch(/if \(select auth\.uid\(\)\) is null then[\s\S]*AUTH_REQUIRED/);
    expect(sql).toMatch(/security definer set search_path = ''/);
    expect(sql).toMatch(/update public\.mkt_profile p set auth_user_id = s\.auth_user_id/);
    expect(sql).toMatch(/if caller_is_lead and jsonb_typeof\(payload->'settings'->'ads_control'\) = 'object' then/);
    expect(sql).toContain("revoke execute on function public.mkt_save_state(jsonb) from public, anon");
  });
});
