-- Ads data foundation: connections, normalized facts, targets, rules and sync audit.
-- Provider access tokens are deliberately absent. Edge Functions must keep encrypted
-- credentials in server-side secrets or a dedicated vault.
--
-- ปรับให้เข้ากับ schema ที่ deploy จริง (mkt_* · id เป็น text · ไม่มี profiles/brands/my_role()):
--   brand_id  → text references mkt_brand(id)   (NO ACTION DEFERRABLE INITIALLY DEFERRED — ห้าม cascade:
--   updated_by → text references mkt_profile(id)  mkt_save_state ลบ+ใส่คืนทั้งก้อนทุกครั้งที่บันทึกบอร์ด ถ้า cascade ข้อมูล ads จะหายทุกครั้ง)
--   สิทธิ์ team_lead ตรวจผ่าน mkt_is_team_lead() ซึ่งอ่าน mkt_profile.auth_user_id (ผูกกับ auth.users)

-- 0) สะพานสิทธิ์ + helper ที่ฐาน mkt_* ยังไม่มี
alter table mkt_profile add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
comment on column mkt_profile.auth_user_id is 'ผูกผู้ใช้ Supabase Auth กับโปรไฟล์ทีม — ใช้ตรวจสิทธิ์ team_lead ใน RLS และ Edge Functions';

create or replace function touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- คอลัมน์สิทธิ์ (auth_user_id · role · active) เปลี่ยนได้เฉพาะเจ้าของโปรเจกต์ (postgres/SQL Editor) หรือ service_role
-- schema mkt_* เดิมเปิดให้ anon/authenticated เขียนได้ทุกตาราง → ถ้าไม่กันทั้ง INSERT และ UPDATE
-- คนที่มี anon key จะ insert/patch โปรไฟล์ตัวเองเป็น team_lead + ผูก auth_user_id แล้วยกระดับสิทธิ์ได้
-- ใช้ current_user (บทบาทของ connection ที่ PostgREST SET ROLE ให้) ไม่ใช่ JWT claim ที่ SQL Editor ไม่มี
create or replace function mkt_guard_profile_privileges() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('service_role', 'postgres') then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if new.auth_user_id is not null or new.role = 'team_lead' then
      raise exception 'สร้างโปรไฟล์ team_lead หรือผูก auth_user_id ได้เฉพาะผู้ดูแลระบบ' using errcode = '42501';
    end if;
  elsif tg_op = 'DELETE' then
    if old.auth_user_id is not null or old.role = 'team_lead' then
      raise exception 'ลบโปรไฟล์ team_lead หรือโปรไฟล์ที่ผูกผู้ใช้ได้เฉพาะผู้ดูแลระบบ' using errcode = '42501';
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if new.auth_user_id is distinct from old.auth_user_id
       or new.role is distinct from old.role
       or new.active is distinct from old.active then
      raise exception 'เปลี่ยน role/active/auth_user_id ได้เฉพาะผู้ดูแลระบบ' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists mkt_profile_guard_privileges on mkt_profile;
create trigger mkt_profile_guard_privileges before insert or update or delete on mkt_profile
  for each row execute function mkt_guard_profile_privileges();

-- security invoker (ไม่ bypass RLS) — mkt_profile อ่านได้อยู่แล้วตาม policy ของ schema นี้ · (select auth.uid()) ให้ planner cache ค่าเดียวต่อ query
create or replace function mkt_is_team_lead() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.mkt_profile p
    where p.auth_user_id = (select auth.uid()) and p.active and p.role = 'team_lead'
  );
$$;

create table if not exists ad_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta','google','tiktok','shopee')),
  brand_id text not null references mkt_brand(id) on delete no action deferrable initially deferred,
  external_account_id text not null,
  account_name text not null default '',
  currency text not null default 'THB' check (length(currency) = 3),
  timezone text not null default 'Asia/Bangkok',
  status text not null default 'pending' check (status in ('pending','connected','expired','error','disabled')),
  config jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_account_id)
);

create table if not exists ad_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references ad_connections(id) on delete cascade,
  mode text not null check (mode in ('incremental','backfill','reconcile')),
  range_from date,
  range_to date,
  status text not null check (status in ('queued','running','success','partial','failed')),
  rows_read integer not null default 0,
  rows_written integer not null default 0,
  error_code text,
  error_detail text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists ad_daily_facts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references ad_connections(id) on delete cascade,
  fact_date date not null,
  level text not null default 'account' check (level in ('account','campaign','ad_group','ad')),
  campaign_id text not null default '',
  campaign_name text not null default '',
  ad_group_id text not null default '',
  ad_group_name text not null default '',
  ad_id text not null default '',
  ad_name text not null default '',
  spend numeric(18,4),
  reach bigint,
  impressions bigint,
  clicks bigint,
  leads numeric(18,4),
  attributed_conversions numeric(18,4),
  attributed_value numeric(18,4),
  attribution_window text,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  unique(connection_id, fact_date, level, campaign_id, ad_group_id, ad_id)
);

create index if not exists ad_daily_facts_date_idx on ad_daily_facts(fact_date);
create index if not exists ad_daily_facts_connection_idx on ad_daily_facts(connection_id, fact_date);

create table if not exists business_daily_facts (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references mkt_brand(id) on delete no action deferrable initially deferred,
  fact_date date not null,
  source text not null check (source in ('crm','pos','shopee','manual')),
  external_record_id text not null,
  inquiries integer not null default 0,
  qualified_leads integer not null default 0,
  deposits integer not null default 0,
  orders integer not null default 0,
  gross_revenue numeric(18,4) not null default 0,
  refunds numeric(18,4) not null default 0,
  net_revenue numeric(18,4) generated always as (gross_revenue - refunds) stored,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  unique(source, external_record_id)
);

create table if not exists ad_targets (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references mkt_brand(id) on delete no action deferrable initially deferred,
  target_month date not null check (target_month = date_trunc('month', target_month)::date),
  revenue_target numeric(18,4) not null default 0,
  spend_budget numeric(18,4) not null default 0,
  min_roas numeric(10,4),
  max_ads_percent numeric(10,4),
  max_cpl numeric(18,4),
  updated_by text references mkt_profile(id) on delete no action deferrable initially deferred,
  updated_at timestamptz not null default now(),
  unique(brand_id, target_month)
);

create table if not exists ad_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id text references mkt_brand(id) on delete no action deferrable initially deferred,
  rule_key text not null,
  threshold numeric(18,4) not null,
  window_size integer,
  enabled boolean not null default true,
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  updated_by text references mkt_profile(id) on delete no action deferrable initially deferred,
  updated_at timestamptz not null default now()
);

create unique index if not exists ad_rules_scope_key_uidx
  on ad_rules(coalesce(brand_id, ''), rule_key);

-- index คอลัมน์ FK ทุกตัว (Postgres ไม่สร้างให้เอง — JOIN/CASCADE จะ seq scan) ตาม supabase-postgres-best-practices
create index if not exists ad_connections_brand_idx on ad_connections(brand_id);
create index if not exists ad_sync_runs_connection_idx on ad_sync_runs(connection_id, started_at desc);
create index if not exists business_daily_facts_brand_date_idx on business_daily_facts(brand_id, fact_date);
create index if not exists ad_rules_brand_idx on ad_rules(brand_id);
create index if not exists ad_targets_updated_by_idx on ad_targets(updated_by);
create index if not exists ad_rules_updated_by_idx on ad_rules(updated_by);

create trigger ad_connections_touch before update on ad_connections
  for each row execute function touch_updated_at();

alter table ad_connections enable row level security;
alter table ad_sync_runs enable row level security;
alter table ad_daily_facts enable row level security;
alter table business_daily_facts enable row level security;
alter table ad_targets enable row level security;
alter table ad_rules enable row level security;

drop policy if exists ads_connections_read on ad_connections;
create policy ads_connections_read on ad_connections for select to authenticated using (true);
drop policy if exists ads_connections_admin on ad_connections;
create policy ads_connections_admin on ad_connections for all to authenticated using (mkt_is_team_lead()) with check (mkt_is_team_lead());
drop policy if exists ads_sync_read on ad_sync_runs;
create policy ads_sync_read on ad_sync_runs for select to authenticated using (true);
drop policy if exists ads_facts_read on ad_daily_facts;
create policy ads_facts_read on ad_daily_facts for select to authenticated using (true);
drop policy if exists business_facts_read on business_daily_facts;
create policy business_facts_read on business_daily_facts for select to authenticated using (true);
drop policy if exists ads_targets_read on ad_targets;
create policy ads_targets_read on ad_targets for select to authenticated using (true);
drop policy if exists ads_targets_admin on ad_targets;
create policy ads_targets_admin on ad_targets for all to authenticated using (mkt_is_team_lead()) with check (mkt_is_team_lead());
drop policy if exists ads_rules_read on ad_rules;
create policy ads_rules_read on ad_rules for select to authenticated using (true);
drop policy if exists ads_rules_admin on ad_rules;
create policy ads_rules_admin on ad_rules for all to authenticated using (mkt_is_team_lead()) with check (mkt_is_team_lead());

-- ad_daily_facts, business_daily_facts and ad_sync_runs are written by service-role
-- Edge Functions only. There is intentionally no authenticated-client write policy.
