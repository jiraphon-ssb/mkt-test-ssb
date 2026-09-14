-- ads sync worker (Meta Pilot): ผูก connection กับ OAuth · กันรันซ้อน · แทนที่ยอดรายวันแบบ atomic
-- เขียนโดย Edge Functions (service_role) เท่านั้น — browser อ่านได้ตาม policy เดิมของ 0005

-- 1) connection รู้ว่าจะใช้ token ของ authorization ไหน (token ยังอยู่ใน ad_provider_authorizations ที่ client อ่านไม่ได้)
alter table public.ad_connections add column if not exists authorization_id uuid
  references public.ad_provider_authorizations(id) on delete set null;
create index if not exists ad_connections_authorization_idx on public.ad_connections(authorization_id);

-- 2) CTR ลิงก์ต้องใช้ link clicks แยกจาก clicks ทั้งหมด
alter table public.ad_daily_facts add column if not exists link_clicks bigint check (link_clicks is null or link_clicks >= 0);

-- 3) บันทึกว่าใครสั่ง + สรุปผลของ run
alter table public.ad_sync_runs add column if not exists triggered_by uuid references auth.users(id) on delete set null;
alter table public.ad_sync_runs add column if not exists summary jsonb not null default '{}'::jsonb
  check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) < 20000);
create index if not exists ad_sync_runs_triggered_by_idx on public.ad_sync_runs(triggered_by);

-- กันรันซ้อนบัญชีเดียวกัน: มีได้ครั้งละ 1 run ที่ยังไม่จบ (worker ปิด run ค้างเกิน 15 นาทีเป็น failed ก่อนเริ่มใหม่)
create unique index if not exists ad_sync_runs_one_active_uidx
  on public.ad_sync_runs(connection_id) where status in ('queued', 'running');

-- 4) connection จัดการผ่าน Edge Function ads-connections เท่านั้น
-- ของเดิมให้ team_lead เขียนตรงผ่าน REST ได้ → ตั้ง authorization_id ชี้ token ของคนอื่นได้โดยไม่ผ่านการตรวจบัญชี
drop policy if exists ads_connections_admin on public.ad_connections;
revoke insert, update, delete, truncate on public.ad_connections from anon, authenticated;
-- facts / runs: RLS ไม่มี policy เขียนอยู่แล้ว · ถอนสิทธิ์ระดับตารางซ้ำอีกชั้น
revoke insert, update, delete, truncate on public.ad_daily_facts from anon, authenticated;
revoke insert, update, delete, truncate on public.ad_sync_runs from anon, authenticated;

-- 5) แทนที่ยอดของช่วงวันทั้งก้อนใน transaction เดียว: ลบช่วงเดิม → ใส่ชุดใหม่ → ปิด run
-- ถ้า insert พัง (แถวผิดรูป/ซ้ำ) ทั้งหมด rollback → ยอดเดิมยังอยู่ ไม่มีช่วงว่างครึ่งๆ กลางๆ
create or replace function public.ads_replace_daily_facts(
  p_run_id uuid, p_connection_id uuid, p_level text, p_from date, p_to date, p_rows jsonb, p_summary jsonb default '{}'::jsonb
) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  written integer;
begin
  if p_level not in ('account', 'campaign', 'ad_group', 'ad') then
    raise exception 'LEVEL_INVALID' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 186 then
    raise exception 'SYNC_RANGE_INVALID' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ROWS_INVALID' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.ad_sync_runs r
    where r.id = p_run_id and r.connection_id = p_connection_id and r.status = 'running'
  ) then
    raise exception 'RUN_NOT_RUNNING' using errcode = '55000';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
    where (e->>'fact_date')::date not between p_from and p_to
  ) then
    raise exception 'ROW_OUTSIDE_RANGE' using errcode = '22023';
  end if;

  delete from public.ad_daily_facts f
  where f.connection_id = p_connection_id and f.level = p_level and f.fact_date between p_from and p_to;

  insert into public.ad_daily_facts (
    connection_id, fact_date, level, campaign_id, campaign_name, ad_group_id, ad_group_name, ad_id, ad_name,
    spend, reach, impressions, clicks, link_clicks, leads, attributed_conversions, attributed_value,
    attribution_window, source_updated_at
  )
  select p_connection_id, x.fact_date, p_level,
    coalesce(x.campaign_id, ''), coalesce(x.campaign_name, ''), coalesce(x.ad_group_id, ''), coalesce(x.ad_group_name, ''),
    coalesce(x.ad_id, ''), coalesce(x.ad_name, ''),
    x.spend, x.reach, x.impressions, x.clicks, x.link_clicks, x.leads, x.attributed_conversions, x.attributed_value,
    x.attribution_window, now()
  from jsonb_to_recordset(p_rows) as x(
    fact_date date, campaign_id text, campaign_name text, ad_group_id text, ad_group_name text, ad_id text, ad_name text,
    spend numeric, reach bigint, impressions bigint, clicks bigint, link_clicks bigint, leads numeric,
    attributed_conversions numeric, attributed_value numeric, attribution_window text
  );
  get diagnostics written = row_count;

  update public.ad_sync_runs
  set status = 'success', rows_written = written, finished_at = now(),
      summary = coalesce(p_summary, '{}'::jsonb), error_code = null, error_detail = null
  where id = p_run_id;

  update public.ad_connections
  set status = 'connected', last_success_at = now(), last_error_code = null, last_error_at = null
  where id = p_connection_id;

  return written;
end $$;

revoke execute on function public.ads_replace_daily_facts(uuid, uuid, text, date, date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ads_replace_daily_facts(uuid, uuid, text, date, date, jsonb, jsonb) to service_role;
