-- 0011 — บิล & กระทบยอดค่าแอด (spec docs/superpowers/specs/2026-09-22-billing-recon.md)
-- ทุกตาราง: team_lead เท่านั้น (ข้อมูลการเงินบริษัท) · ad_billing_reviews = append-only ระดับ DB
-- ยังไม่รันบนฐานจริงจนกว่าอาร์ตอนุมัติ (กฎข้อ 3) · rollback: drop function mkt_billing_review_add; drop table ทั้งสาม

-- snapshot บัญชีแอดทุกตัวที่ token OAuth เห็น (รวมที่ยังไม่ได้เชื่อมเข้าระบบ) — ads-cron เขียนรอบละครั้ง
-- amount_spent/balance ของ Graph เป็น minor units (สตางค์) สะสมตลอดชีพ — เก็บดิบ แปลงตอนแสดงผล
create table if not exists ad_account_snapshots (
  external_account_id text primary key,
  account_name text not null default '',
  currency text not null default 'THB',
  account_status int,
  amount_spent_cents bigint,
  balance_cents bigint,
  fetched_at timestamptz not null default now()
);

-- ผลตรวจของคน + ยอด statement ที่บัญชีกรอก (ไม่บังคับ) — แถวใหม่เสมอ ห้ามแก้/ลบ (หลักฐานตรวจสอบย้อนหลัง)
create table if not exists ad_billing_reviews (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  external_account_id text not null,
  verdict text not null check (verdict in ('match','noted')),
  statement_amount numeric,
  note text not null default '',
  reviewer text not null,
  created_at timestamptz not null default now()
);
create index if not exists ad_billing_reviews_month_idx on ad_billing_reviews(month, external_account_id, created_at desc);

-- โครงท่อเมลใบเสร็จ (เตรียมไว้เฉยๆ ตาม spec หัวข้อ 0) — ว่างจนกว่าจะเปิดใช้ · parser เขียนเมื่อมีตัวอย่างเมลจริง
create table if not exists ad_billing_charges (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'email',
  charge_date date,
  amount numeric,
  external_account_id text,
  reference text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table ad_account_snapshots enable row level security;
alter table ad_billing_reviews enable row level security;
alter table ad_billing_charges enable row level security;

-- อ่านได้เฉพาะ team_lead · ไม่มี insert policy ฝั่ง client (snapshot/charges เขียนโดย service role ของ edge function
-- · reviews เขียนผ่าน RPC ข้างล่างเท่านั้น)
drop policy if exists snap_read on ad_account_snapshots;
create policy snap_read on ad_account_snapshots for select to authenticated using (mkt_is_team_lead());
drop policy if exists reviews_read on ad_billing_reviews;
create policy reviews_read on ad_billing_reviews for select to authenticated using (mkt_is_team_lead());
drop policy if exists charges_read on ad_billing_charges;
create policy charges_read on ad_billing_charges for select to authenticated using (mkt_is_team_lead());

-- append-only จริงระดับสิทธิ์: ต่อให้มีบั๊ก client ก็แก้/ลบแถวเดิมไม่ได้
revoke update, delete on ad_billing_reviews from anon, authenticated;

-- RPC เขียนผลตรวจ — security definer (ผ่าน RLS ได้) จึงต้องตรวจ team_lead เองในตัว และทำได้แค่ insert
-- reviewer ผูกจาก auth.uid() ฝั่ง server เสมอ (security-review 22 ก.ย.: รับจาก client = ปลอมชื่อคนตรวจได้
-- ทำลาย non-repudiation ของหลักฐาน append-only)
create or replace function mkt_billing_review_add(p_entry jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_reviewer text;
begin
  if not mkt_is_team_lead() then
    raise exception 'FORBIDDEN';
  end if;
  select coalesce(nullif(display_name, ''), auth.uid()::text) into v_reviewer
    from mkt_profile where auth_user_id = auth.uid();
  insert into ad_billing_reviews (month, external_account_id, verdict, statement_amount, note, reviewer)
  values (
    (p_entry->>'month')::date,
    p_entry->>'external_account_id',
    p_entry->>'verdict',
    nullif(p_entry->>'statement_amount','')::numeric,
    coalesce(p_entry->>'note',''),
    coalesce(v_reviewer, 'team_lead')
  )
  returning id into v_id;
  return v_id;
end $$;
