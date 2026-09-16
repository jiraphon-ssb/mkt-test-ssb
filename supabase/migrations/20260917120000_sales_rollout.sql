-- ยึดข้อมูลระบบขายของพี่ทัชทั้งหมด — ข้อ 1 หลังบ้าน (แผน docs/superpowers/plans/2026-09-17-sales-data-rollout.md)
--
-- 1) data_pipeline_runs — ประวัติรอบดึงข้อมูลที่ไม่ใช่ Meta insights (ยอดขาย · creative · สำรวจแหล่ง)
--    เดิมไม่มีที่เก็บเลย: รอบที่สั่งเองหายไปทั้งหมด รอบจาก cron มีแค่ใน ad_cron_ticks.detail → หน้า Sync มองไม่เห็นท่อพวกนี้
--    อ่าน: ทุกคนที่ล็อกอิน (เหมือนตาราง ads อื่น) · เขียน: service role ผ่าน Edge Function เท่านั้น · เก็บ 90 วัน (ads-cron ลบ)
-- 2) ad_sales_goals + ช่องที่หน้าเป้าหมายของพี่ทัชมีแต่เรายังไม่เก็บ — แทนแท็บเป้าของเราที่จะถูกถอด
-- 3) business_daily_facts.channel_funnel — คนทัก/ลีด/ได้ออเดอร์/ยืนยัน แยกช่องทางแชท (FB · Line) สำหรับ "คนทักคู่กัน"
-- ค่าเริ่มคงที่ = แก้ metadata ไม่ rewrite ตาราง

create table if not exists public.data_pipeline_runs (
  id            uuid primary key default gen_random_uuid(),
  pipeline      text not null check (pipeline in ('sales', 'creatives', 'inventory')),
  connection_id uuid references public.ad_connections(id) on delete set null,
  trigger_kind  text not null default 'cron' check (trigger_kind in ('cron', 'manual')),
  triggered_by  uuid references auth.users(id) on delete set null,
  status        text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  range_from    date,
  range_to      date,
  rows_read     integer check (rows_read >= 0),
  rows_written  integer check (rows_written >= 0),
  summary       jsonb not null default '{}'::jsonb
    check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) < 32768),
  error_code    text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,64}$'),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  check (range_from is null or range_to is null or range_from <= range_to)
);
comment on table public.data_pipeline_runs is 'ประวัติรอบดึงข้อมูลนอก Meta insights: sales (ระบบขาย) · creatives · inventory (สำรวจแหล่ง) — summary เป็นจำนวน/สถานะเท่านั้น ห้ามเก็บแถวดิบ';

create index if not exists data_pipeline_runs_recent_idx
  on public.data_pipeline_runs (pipeline, started_at desc);
create index if not exists data_pipeline_runs_connection_idx
  on public.data_pipeline_runs (connection_id, started_at desc) where connection_id is not null;

alter table public.data_pipeline_runs enable row level security;
drop policy if exists data_pipeline_runs_read on public.data_pipeline_runs;
create policy data_pipeline_runs_read on public.data_pipeline_runs
  for select to authenticated using (true);
revoke insert, update, delete, truncate on public.data_pipeline_runs from anon, authenticated;

alter table public.ad_sales_goals
  add column if not exists pct_ads_new numeric(10,4),
  add column if not exists cpi numeric(18,4),
  add column if not exists i2l numeric(10,4),
  add column if not exists caps jsonb not null default '{}'::jsonb
    check (jsonb_typeof(caps) = 'object' and pg_column_size(caps) < 1024),
  add column if not exists assumptions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(assumptions) = 'object' and pg_column_size(assumptions) < 2048),
  add column if not exists share_new numeric(6,4),
  add column if not exists other_cost numeric(18,4),
  add column if not exists platform_pct jsonb not null default '{}'::jsonb
    check (jsonb_typeof(platform_pct) = 'object' and pg_column_size(platform_pct) < 1024);

comment on column public.ad_sales_goals.pct_ads_new is 'งบแอด ÷ ยอดลูกค้าใหม่ (targets.pct_ads_new) — %Ads หลักของหน้า ads';
comment on column public.ad_sales_goals.cpi is 'ต้นทุนต่อคนทักที่ต้องทำได้ (งบ ÷ คนทัก)';
comment on column public.ad_sales_goals.i2l is 'ทัก → Lead ที่ตั้งไว้ (สัดส่วน 0–1)';
comment on column public.ad_sales_goals.caps is 'เพดาน/ขั้นต่ำที่ต้องคุม {cpl, cpi, i2l(%)} — ใช้แทนเพดาน CPL ในหน้าตั้งค่าเดิม';
comment on column public.ad_sales_goals.assumptions is 'สมมติฐานของเป้า {aov_new, aov_old, lead_to_deposit_new/old, deposit_to_order_new/old}';
comment on column public.ad_sales_goals.platform_pct is 'สัดส่วนงบต่อแพลตฟอร์ม (%) {meta, google, tiktok}';

alter table public.business_daily_facts
  add column if not exists channel_funnel jsonb not null default '{}'::jsonb
    check (jsonb_typeof(channel_funnel) = 'object' and pg_column_size(channel_funnel) < 4096);
comment on column public.business_daily_facts.channel_funnel is 'ต่อช่องทางแชท {FB: {inquiries, leads, deposits, orders}, Line: {...}, other: {...}} · วันไม่มีเหตุการณ์ = {}';

-- ย้อนกลับ:
-- drop table if exists public.data_pipeline_runs;
-- alter table public.ad_sales_goals drop column if exists pct_ads_new, drop column if exists cpi, drop column if exists i2l, drop column if exists caps, drop column if exists assumptions, drop column if exists share_new, drop column if exists other_cost, drop column if exists platform_pct;
-- alter table public.business_daily_facts drop column if exists channel_funnel;
