-- 0015 — นำเข้าค่าแอดจากไฟล์ CSV (Google Ads · ChatGPT ads)
-- spec: docs/superpowers/specs/2026-10-08-ads-multi-provider-import-design.md
--
-- ทำไมไม่ชนกับของเดิม: Meta เขียน level='ad' เท่านั้น (metaInsights.js ตั้ง level: "ad" ตายตัว)
-- แถวที่มาจากไฟล์เป็น level='account' จึงอยู่คนละช่องของ unique key เดิม
--   unique(connection_id, fact_date, level, campaign_id, ad_group_id, ad_id)
-- และ upsert ด้วยคีย์นี้ = อัปไฟล์เดิมซ้ำกี่รอบยอดก็ไม่บวกซ้ำ
--
-- สิทธิ์: ตารางอ่านได้ (RLS select) แต่เขียนตรงไม่ได้ — ทางเดียวคือ RPC ที่ตรวจ team_lead เอง (pattern เดียวกับ 0013)
--
-- rollback:
--   drop function if exists mkt_ads_import_facts(jsonb, jsonb);
--   drop index if exists ad_daily_facts_import_batch_idx;
--   alter table ad_daily_facts drop column if exists import_batch_id;
--   drop table if exists ad_import_batches;
--   alter table ad_authorized_accounts drop column if exists login_customer_id, drop column if exists is_manager;
--   alter table ad_connections drop constraint if exists ad_connections_provider_check;
--   alter table ad_connections add constraint ad_connections_provider_check
--     check (provider in ('meta','google','tiktok','shopee'));

-- 1) เปิดทางให้ ChatGPT ads — เพิ่มค่าเดียว ของเดิมอยู่ครบ
-- ไม่เดาชื่อ constraint: ฐานจริงอาจตั้งชื่อไว้ไม่ตรงกับที่ Postgres ตั้งให้อัตโนมัติ
-- ถ้า drop ไม่โดนแล้ว add ตัวใหม่ จะเหลือ 2 ตัวซ้อนกัน แล้วใส่ 'openai' ไม่ได้ทั้งที่ดูเหมือนสำเร็จ
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.ad_connections'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%provider%'
  loop
    execute format('alter table public.ad_connections drop constraint %I', c.conname);
  end loop;
end $$;

alter table ad_connections add constraint ad_connections_provider_check
  check (provider in ('meta','google','tiktok','shopee','openai'));

-- 2) ประวัติการนำเข้า — 1 แถว = 1 ไฟล์
create table if not exists ad_import_batches (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google','openai')),
  connection_id uuid not null references ad_connections(id) on delete cascade,
  file_name text not null default '',
  file_hash text not null unique,
  date_from date not null,
  date_to date not null,
  row_count integer not null default 0,
  spend_total numeric(18,4) not null default 0,
  imported_by text references mkt_profile(id) on delete no action deferrable initially deferred,
  created_at timestamptz not null default now()
);
comment on table ad_import_batches is 'ประวัติการนำเข้าค่าแอดจากไฟล์ — file_hash กันอัปไฟล์เดิมซ้ำโดยไม่ตั้งใจ';

-- 3) ที่มาของแถว — ลบประวัติไฟล์แล้วตัวเลขต้องไม่หาย (set null ไม่ใช่ cascade)
alter table ad_daily_facts add column if not exists import_batch_id uuid
  references ad_import_batches(id) on delete set null;
comment on column ad_daily_facts.import_batch_id is 'แถวนี้มาจากไฟล์ไหน — null = มาจาก API · ใช้ย้อนลบทั้งก้อนเมื่ออัปผิดไฟล์';

create index if not exists ad_daily_facts_import_batch_idx on ad_daily_facts (import_batch_id);

alter table ad_import_batches enable row level security;
drop policy if exists ads_import_batches_read on ad_import_batches;
create policy ads_import_batches_read on ad_import_batches for select to authenticated using (true);

-- 3.5) ของที่ Google ต้องใช้แต่ Meta ไม่มี
-- บัญชีลูกใต้บัญชีผู้จัดการ (MCC) ต้องเรียกผ่านบัญชีผู้จัดการ — ไม่รู้ว่าตัวไหนก็เรียกไม่ได้เลย
-- บัญชีผู้จัดการเองยิงรายงานไม่ได้ ต้องกันไม่ให้คนเลือกตั้งแต่หน้าจอ
alter table ad_authorized_accounts add column if not exists login_customer_id text;
alter table ad_authorized_accounts add column if not exists is_manager boolean not null default false;
comment on column ad_authorized_accounts.login_customer_id is 'Google: บัญชีผู้จัดการที่ต้องใส่ใน header login-customer-id · null = เรียกบัญชีนี้ตรงได้';
comment on column ad_authorized_accounts.is_manager is 'Google: บัญชีผู้จัดการ (MCC) — ยิงรายงานไม่ได้ ใช้เป็นทางผ่านอย่างเดียว';

-- 4) ทางเขียนทางเดียว
-- p_batch: {provider, connection_id, file_name, file_hash, date_from, date_to, row_count, spend_total, imported_by}
-- p_rows : [{fact_date, spend}] — ระดับบัญชีเท่านั้น campaign/ad_group/ad ใช้ค่าว่างตาม default ของตาราง
create or replace function mkt_ads_import_facts(p_batch jsonb, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_connection uuid := (p_batch->>'connection_id')::uuid;
  v_batch_id uuid;
  v_before integer;
  v_after integer;
  v_rows integer;
begin
  if not public.mkt_is_team_lead() then
    raise exception 'นำเข้าค่าแอดได้เฉพาะ Team Lead' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_array_length(p_rows) = 0 then
    raise exception 'ไม่มีแถวให้นำเข้า' using errcode = '22023';
  end if;

  insert into public.ad_import_batches
    (provider, connection_id, file_name, file_hash, date_from, date_to, row_count, spend_total, imported_by)
  values (
    p_batch->>'provider',
    v_connection,
    coalesce(p_batch->>'file_name', ''),
    p_batch->>'file_hash',
    (p_batch->>'date_from')::date,
    (p_batch->>'date_to')::date,
    coalesce((p_batch->>'row_count')::integer, 0),
    coalesce((p_batch->>'spend_total')::numeric, 0),
    p_batch->>'imported_by'
  )
  returning id into v_batch_id;

  select count(*) into v_before from public.ad_daily_facts
   where connection_id = v_connection and level = 'account';

  insert into public.ad_daily_facts (connection_id, fact_date, level, spend, import_batch_id, source_updated_at)
  select v_connection, (r->>'fact_date')::date, 'account', (r->>'spend')::numeric, v_batch_id, now()
    from jsonb_array_elements(p_rows) as r
  on conflict (connection_id, fact_date, level, campaign_id, ad_group_id, ad_id)
  do update set spend = excluded.spend,
                import_batch_id = excluded.import_batch_id,
                source_updated_at = excluded.source_updated_at,
                ingested_at = now();

  select count(*) into v_after from public.ad_daily_facts
   where connection_id = v_connection and level = 'account';

  v_rows := jsonb_array_length(p_rows);
  return jsonb_build_object('batch_id', v_batch_id, 'inserted', v_after - v_before, 'updated', v_rows - (v_after - v_before));
end;
$$;

revoke insert, update, delete, truncate on public.ad_import_batches
  from anon, authenticated;
revoke all on function mkt_ads_import_facts(jsonb, jsonb) from anon;
grant execute on function mkt_ads_import_facts(jsonb, jsonb) to authenticated;
