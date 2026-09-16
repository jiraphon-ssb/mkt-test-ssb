-- ประวัติการทำงานของตัวดึงอัตโนมัติ (pg_cron → ads-cron) — หนึ่งแถวต่อหนึ่งรอบ
-- ต่างจาก ad_sync_runs ตรงที่บันทึกทุกรอบ รวมรอบที่ "ไม่มีอะไรต้องทำ" และรอบที่พังก่อนเริ่มงาน
create table if not exists public.ad_cron_ticks (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source text not null default 'pg_cron' check (source in ('pg_cron','manual')),
  status text not null default 'running' check (status in ('running','success','partial','failed')),
  planned integer not null default 0 check (planned >= 0),
  synced integer not null default 0 check (synced >= 0),
  reconciled integer not null default 0 check (reconciled >= 0),
  failed integer not null default 0 check (failed >= 0),
  rows_written bigint not null default 0 check (rows_written >= 0),
  sync_every_hours integer,
  error_code text,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) < 100000)
);

create index if not exists ad_cron_ticks_started_idx on public.ad_cron_ticks(started_at desc);

alter table public.ad_cron_ticks enable row level security;
-- อ่านได้ทุกคนที่ล็อกอิน (เหมือน ad_sync_runs) · เขียนได้เฉพาะ service role เพราะไม่มี policy insert/update/delete
drop policy if exists ads_cron_ticks_read on public.ad_cron_ticks;
create policy ads_cron_ticks_read on public.ad_cron_ticks for select to authenticated using (true);

revoke insert, update, delete on public.ad_cron_ticks from anon, authenticated;
