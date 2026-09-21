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
  it("ปิดการเขียน mkt_settings ตรงผ่าน REST (anon/authenticated) · anon อ่านไม่ได้ · มีเพดานขนาด", () => {
    expect(sql).toContain("revoke insert, update, delete, truncate on public.mkt_settings from anon, authenticated");
    expect(sql).toContain("revoke select on public.mkt_settings from anon");
    expect(sql).toMatch(/pg_column_size\(ads_control\) < \d+/);
  });
});

describe("0010 ads sync worker", () => {
  const sql = readFileSync(new URL("../src/supabase/migrations/0010_ads_sync_worker.sql", import.meta.url), "utf8");
  const code = sql.replace(/--[^\n]*/g, "");
  it("connection ผูก authorization (set null เมื่อ token ถูกลบ) · facts มี link_clicks · run มีคนสั่ง/สรุป", () => {
    expect(code).toMatch(/alter table public\.ad_connections add column if not exists authorization_id uuid\s+references public\.ad_provider_authorizations\(id\) on delete set null/);
    expect(code).toContain("alter table public.ad_daily_facts add column if not exists link_clicks bigint");
    expect(code).toMatch(/summary jsonb not null default '\{\}'::jsonb\s+check \(jsonb_typeof\(summary\) = 'object' and pg_column_size\(summary\) < \d+\)/);
  });
  it("กันรันซ้อน: unique partial index ต่อ connection เฉพาะ run ที่ยังไม่จบ", () => {
    expect(code).toMatch(/create unique index if not exists ad_sync_runs_one_active_uidx\s+on public\.ad_sync_runs\(connection_id\) where status in \('queued', 'running'\)/);
  });
  it("client เขียน ad_connections / facts / runs ไม่ได้ (เขียนผ่าน Edge Function เท่านั้น)", () => {
    expect(code).toContain("drop policy if exists ads_connections_admin on public.ad_connections");
    for (const t of ["ad_connections", "ad_daily_facts", "ad_sync_runs"]) {
      expect(code).toContain(`revoke insert, update, delete, truncate on public.${t} from anon, authenticated`);
    }
  });
  it("RPC แทนที่ยอด: invoker · search_path ว่าง · เฉพาะ service_role · ตรวจช่วง/run ก่อนลบ", () => {
    expect(code).toMatch(/function public\.ads_replace_daily_facts\([\s\S]*?\) returns integer\s+language plpgsql security invoker set search_path = ''/);
    expect(code).toContain("revoke execute on function public.ads_replace_daily_facts(uuid, uuid, text, date, date, jsonb, jsonb) from public, anon, authenticated");
    expect(code).toContain("grant execute on function public.ads_replace_daily_facts(uuid, uuid, text, date, date, jsonb, jsonb) to service_role");
    const body = code.slice(code.indexOf("create or replace function public.ads_replace_daily_facts"));
    for (const guard of ["LEVEL_INVALID", "SYNC_RANGE_INVALID", "RUN_NOT_RUNNING", "ROW_OUTSIDE_RANGE"]) {
      expect(body.indexOf(guard), guard).toBeGreaterThan(-1);
      expect(body.indexOf(guard), guard).toBeLessThan(body.indexOf("delete from public.ad_daily_facts"));
    }
    expect(body.indexOf("delete from public.ad_daily_facts")).toBeLessThan(body.indexOf("insert into public.ad_daily_facts"));
    expect(body).toMatch(/set status = 'success', rows_written = written/);
  });
  it("มี rollback ของ 0010", () => {
    const down = readFileSync(new URL("../src/supabase/migrations/rollback/0005-0008_down.sql", import.meta.url), "utf8");
    expect(down).toContain("drop function if exists public.ads_replace_daily_facts");
    expect(down).toContain("alter table public.ad_connections drop column if exists authorization_id");
  });
});

describe("ads-oauth-callback ขอเฉพาะ field ที่สิทธิ์ ads_read อ่านได้", () => {
  it("ไม่ขอ field business ของ ad account (ต้องใช้ business_management ซึ่งเราไม่ขอ)", () => {
    const fn = readFileSync(new URL("../supabase/functions/ads-oauth-callback/index.ts", import.meta.url), "utf8");
    const fields = fn.match(/adaccounts\?fields=([^&"`]+)/)?.[1]?.split(",") ?? [];
    expect(fields).toEqual(expect.arrayContaining(["id", "name", "account_status", "currency", "timezone_name"]));
    expect(fields).not.toContain("business");
  });
});

describe("20260917090000 ช่องเก็บของท่อยอดขายจากระบบพี่ทัช", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260917090000_sales_bridge_direct.sql", import.meta.url), "utf8");
  const code = sql.replace(/--[^\n]*/g, "");
  it("เพิ่มคอลัมน์ที่ factsToDailyRows / goalRowsToSalesGoals เขียนครบ แบบรันซ้ำได้", () => {
    for (const col of ["leads_new", "deposit_value", "orders_new", "revenue_new", "cash_received", "cancelled", "cancelled_value", "inquiries_by_channel", "inquiry_filled"]) {
      expect(code, col).toMatch(new RegExp(`add column if not exists ${col}\\b`));
    }
    for (const col of ["sales_new_target", "sales_old_target", "deposits_target", "inquiry_target", "platform_budgets", "goal_source"]) {
      expect(code, col).toMatch(new RegExp(`add column if not exists ${col}\\b`));
    }
  });
  it("jsonb ต้องเป็น object และมีเพดานขนาด · ที่มาของเป้ารับแค่ 2 ค่า", () => {
    expect(code).toMatch(/inquiries_by_channel jsonb not null default '\{\}'::jsonb\s+check \(jsonb_typeof\(inquiries_by_channel\) = 'object' and pg_column_size\(inquiries_by_channel\) < \d+\)/);
    expect(code).toMatch(/platform_budgets jsonb not null default '\{\}'::jsonb\s+check \(jsonb_typeof\(platform_budgets\) = 'object' and pg_column_size\(platform_budgets\) < \d+\)/);
    expect(code).toContain("check (goal_source in ('sale_goal', 'sale_target'))");
  });
  it("ไม่เปิดช่องเขียนจาก client — ไม่สร้าง policy และไม่ grant สิทธิ์เขียนเพิ่ม", () => {
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/grant\s+(insert|update|delete|all)/i);
  });
  it("มีวิธีย้อนกลับครบทุกคอลัมน์", () => {
    for (const col of ["leads_new", "inquiries_by_channel", "inquiry_filled", "platform_budgets", "goal_source"]) {
      expect(sql, col).toMatch(new RegExp(`--.*drop column if exists[^\\n]*${col}`));
    }
  });
});

describe("20260917120000 ประวัติรอบดึงข้อมูลกลาง + ช่องเป้าครบ + funnel แยกช่องทาง", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260917120000_sales_rollout.sql", import.meta.url), "utf8");
  const code = sql.replace(/--[^\n]*/g, "");
  it("data_pipeline_runs: แยกท่อ · ผู้สั่ง · สถานะ · summary จำกัดขนาด · error code รูปแบบตายตัว", () => {
    expect(code).toContain("create table if not exists public.data_pipeline_runs");
    expect(code).toContain("check (pipeline in ('sales', 'creatives', 'inventory'))");
    expect(code).toContain("check (trigger_kind in ('cron', 'manual'))");
    expect(code).toContain("check (status in ('running', 'success', 'partial', 'failed'))");
    expect(code).toMatch(/summary\s+jsonb not null default '\{\}'::jsonb\s+check \(jsonb_typeof\(summary\) = 'object' and pg_column_size\(summary\) < \d+\)/);
    expect(code).toMatch(/error_code\s+text check \(error_code is null or error_code ~ '\^\[A-Z0-9_\]\{1,64\}\$'\)/);
    expect(code).toContain("references public.ad_connections(id) on delete set null");
    expect(code).toContain("references auth.users(id) on delete set null");
  });
  it("RLS เปิด · อ่านได้เฉพาะ authenticated · client เขียนไม่ได้", () => {
    expect(code).toContain("alter table public.data_pipeline_runs enable row level security");
    expect(code).toMatch(/create policy data_pipeline_runs_read on public\.data_pipeline_runs\s+for select to authenticated using \(true\)/);
    expect(code).toContain("revoke insert, update, delete, truncate on public.data_pipeline_runs from anon, authenticated");
    expect(code).not.toMatch(/grant\s+(insert|update|delete|all)/i);
  });
  it("index สำหรับหน้า Sync อ่านรอบล่าสุดต่อท่อ", () => {
    expect(code).toMatch(/create index if not exists data_pipeline_runs_recent_idx\s+on public\.data_pipeline_runs \(pipeline, started_at desc\)/);
  });
  it("ช่องเป้าครบตามหน้าเป้าหมายของพี่ทัช · funnel แยกช่องทาง · jsonb เป็น object มีเพดาน", () => {
    for (const col of ["pct_ads_new", "cpi", "i2l", "caps", "assumptions", "share_new", "other_cost", "platform_pct"]) {
      expect(code, col).toMatch(new RegExp(`alter table public\\.ad_sales_goals[\\s\\S]*add column if not exists ${col}\\b`));
    }
    for (const col of ["caps", "assumptions", "platform_pct"]) {
      expect(code, col).toMatch(new RegExp(`${col} jsonb not null default '\\{\\}'::jsonb\\s+check \\(jsonb_typeof\\(${col}\\) = 'object' and pg_column_size\\(${col}\\) < \\d+\\)`));
    }
    expect(code).toMatch(/channel_funnel jsonb not null default '\{\}'::jsonb\s+check \(jsonb_typeof\(channel_funnel\) = 'object' and pg_column_size\(channel_funnel\) < \d+\)/);
  });
  it("มีวิธีย้อนกลับ", () => {
    expect(sql).toMatch(/--.*drop table if exists public\.data_pipeline_runs/);
    expect(sql).toMatch(/--.*drop column if exists[^\n]*channel_funnel/);
    expect(sql).toMatch(/--.*drop column if exists[^\n]*platform_pct/);
  });
});

/* 0011 — บิล & กระทบยอด (spec docs/superpowers/specs/2026-09-22-billing-recon.md) */
describe("0011_ad_billing", () => {
  const sql = read("src/supabase/migrations/0011_ad_billing.sql");
  it("สามตารางเปิด RLS และจำกัด team_lead", () => {
    for (const t of ["ad_account_snapshots", "ad_billing_reviews", "ad_billing_charges"]) {
      expect(sql).toContain(`create table ${t}`);
      expect(sql).toContain(`alter table ${t} enable row level security`);
    }
    expect(sql.match(/mkt_is_team_lead\(\)/g).length).toBeGreaterThanOrEqual(4);
  });
  it("reviews เป็น append-only: ไม่มี policy update/delete และ revoke ไว้", () => {
    expect(sql).toContain("revoke update, delete on ad_billing_reviews");
    expect(sql).not.toMatch(/create policy [^;]* on ad_billing_reviews\s+for (update|delete)/i);
  });
  it("RPC เขียนรีวิวตรวจสิทธิ์เองและ insert เท่านั้น", () => {
    expect(sql).toContain("create or replace function mkt_billing_review_add");
    expect(sql).toContain("security definer");
    expect(sql).toMatch(/if not mkt_is_team_lead\(\) then\s*raise/i);
    // ชื่อผู้ตรวจต้องมาจาก auth.uid() ฝั่ง server — ห้ามรับจาก payload (ปลอมชื่อในหลักฐาน append-only ได้)
    expect(sql).not.toContain("p_entry->>'reviewer'");
    expect(sql).toContain("auth_user_id = auth.uid()");
    const body = sql.slice(sql.indexOf("create or replace function mkt_billing_review_add"));   // เฉพาะตัว RPC — revoke/คอมเมนต์ข้างบนมีคำว่า update โดยชอบ
    expect(body.replace(/--[^\n]*/g, "")).not.toMatch(/\b(update|delete)\s/i);
  });
});
