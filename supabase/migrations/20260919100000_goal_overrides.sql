-- ============================================================
-- เป้าที่คนแก้เองในหน้าตั้งค่า (ad_sales_goal_overrides) + ปลดล็อก goal_source ให้รับเป้าจากระบบ TMK
-- ข้อตกลง 18 ก.ย. 2569: "อะไรชนะ — ในหน้าตั้งค่าเราชนะ" ทีละช่อง ทีละเดือน ทีละแบรนด์
--
-- ทำไมต้องแยกตาราง ไม่เก็บรวมใน ad_sales_goals:
--   ท่อ sales-sync upsert ทับ ad_sales_goals ทุกวัน (onConflict brand_id,month)
--   ถ้าเก็บค่าที่คนแก้ไว้ในตารางเดียวกัน รอบดึงพรุ่งนี้จะเขียนทับหายทันที
--   แยกตารางแล้ว ท่อไม่มีโค้ดและไม่มีเหตุให้แตะตารางนี้เลย → ของที่คนแก้ปลอดภัยแม้โค้ดฝั่ง sync จะพลาด
--
-- กติกาค่า: null = "ไม่ได้แก้ช่องนี้" (ตกไปใช้ค่าจากระบบขาย) · มีค่า = ชนะเสมอ แม้ต้นทางจะเปลี่ยนทีหลัง
--           0 = ตั้งใจให้เป็นศูนย์ (ต่างจาก null) — ฝั่งเว็บส่ง null มาเมื่อผู้ใช้ล้างช่อง
-- ============================================================

-- ⚠️ FK ห้ามเป็น on delete cascade: mkt_save_state ลบ mkt_brand ทั้งตารางแล้วใส่คืนทุกครั้งที่บันทึกบอร์ด
--    (remote_baseline: `delete from mkt_brand where true`) — cascade = เป้าที่คนตั้งไว้หายทุกครั้งที่มีคนเซฟบอร์ด
--    และตารางนี้ไม่มีท่อไหนเติมกลับให้ (ต่างจาก ad_sales_goals ที่ sync เขียนใหม่ได้ทุกวัน)
--    ใช้รูปเดียวกับ ad_connections / ad_targets: no action deferrable initially deferred
create table if not exists public.ad_sales_goal_overrides (
  brand_id        text not null references public.mkt_brand(id) on delete no action deferrable initially deferred,
  month           date not null,
  sales_target    numeric(18,4) check (sales_target    is null or sales_target    >= 0),
  ad_budget       numeric(18,4) check (ad_budget       is null or ad_budget       >= 0),
  orders_target   numeric(18,4) check (orders_target   is null or orders_target   >= 0),
  deposits_target numeric(18,4) check (deposits_target is null or deposits_target >= 0),
  leads_target    numeric(18,4) check (leads_target    is null or leads_target    >= 0),
  inquiry_target  numeric(18,4) check (inquiry_target  is null or inquiry_target  >= 0),
  cpl             numeric(18,4) check (cpl             is null or cpl             >= 0),
  cac             numeric(18,4) check (cac             is null or cac             >= 0),
  cpi             numeric(18,4) check (cpi             is null or cpi             >= 0),
  roas            numeric(12,4) check (roas            is null or roas            >= 0),
  -- เก็บเป็นสัดส่วน 0–1 เหมือน ad_sales_goals.pct_ads_new (หน้าเว็บรับ "12%" แล้วแปลงให้)
  pct_ads_new     numeric(10,4) check (pct_ads_new is null or (pct_ads_new >= 0 and pct_ads_new <= 1)),
  note            text check (note is null or length(note) <= 500),
  updated_at      timestamptz not null default now(),
  updated_by      text references public.mkt_profile(id) on delete no action deferrable initially deferred,
  primary key (brand_id, month),
  -- เดือนต้องเป็นวันที่ 1 เสมอ (คีย์เดียวกับ ad_sales_goals.month) ไม่งั้น merge ไม่เจอคู่
  constraint ad_sales_goal_overrides_month_start check (month = date_trunc('month', month)::date)
);

comment on table public.ad_sales_goal_overrides is
  'เป้าที่คนแก้เองในหน้าตั้งค่าเป้า — ชนะค่าที่ดึงมาจากระบบขายทีละช่อง ทีละเดือน · ท่อ sync ห้ามเขียนตารางนี้';
comment on column public.ad_sales_goal_overrides.month is 'วันที่ 1 ของเดือน (คีย์เดียวกับ ad_sales_goals.month)';
comment on column public.ad_sales_goal_overrides.pct_ads_new is 'สัดส่วน 0–1 (12% = 0.12) — หน่วยเดียวกับ ad_sales_goals.pct_ads_new';
comment on column public.ad_sales_goal_overrides.updated_by is 'mkt_profile.id ของคนที่แก้ล่าสุด — ใช้บอกบนหน้าจอว่าใครตั้งค่านี้ไว้';

create index if not exists ad_sales_goal_overrides_month_idx on public.ad_sales_goal_overrides(month desc);

-- RLS: อ่านได้ทุกคนที่ล็อกอิน (ทุกหน้าใช้ค่านี้คิดเลข) · เขียนได้เฉพาะหัวหน้าทีม
alter table public.ad_sales_goal_overrides enable row level security;
drop policy if exists ad_goal_overrides_read on public.ad_sales_goal_overrides;
create policy ad_goal_overrides_read on public.ad_sales_goal_overrides
  for select to authenticated using (true);
-- ต้องมีทั้ง using และ with check: using คุมแถวที่แก้/ลบได้ · with check คุมค่าที่เขียนลงไป
-- (ขาด with check = คนที่ไม่ใช่หัวหน้าทีมยังแทรกแถวใหม่ได้)
drop policy if exists ad_goal_overrides_write on public.ad_sales_goal_overrides;
create policy ad_goal_overrides_write on public.ad_sales_goal_overrides
  for all to authenticated using (public.mkt_is_team_lead()) with check (public.mkt_is_team_lead());
revoke all on public.ad_sales_goal_overrides from anon;

-- เป้าของ JUNTAKARN มาจากหน้าตั้งค่าเป้าของระบบ TMK (tmk_monthly_history)
-- เดิม check รับแค่ sale_goal / sale_target → เฟสใหม่จะโดน 23514 ทุกครั้งเหมือนที่เคยเจอกับ source='tmk'
alter table public.ad_sales_goals drop constraint if exists ad_sales_goals_goal_source_check;
alter table public.ad_sales_goals add constraint ad_sales_goals_goal_source_check
  check (goal_source is null or goal_source in ('sale_goal', 'sale_target', 'tmk_month'));
comment on column public.ad_sales_goals.goal_source is
  'sale_goal = เป้าแบบใหม่มีเวอร์ชัน · sale_target = แบบเก่า 6 ตัว · tmk_month = เป้าเดือนจากระบบ TMK (JUNTAKARN)';

-- ============================================================
-- VERIFY
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conname in ('ad_sales_goals_goal_source_check', 'ad_sales_goal_overrides_month_start');
--   -- ต้องเห็น 'tmk_month' และ month = date_trunc
--
--   select count(*) from public.ad_sales_goal_overrides;          -- 0 แถว ไม่ error = ตารางพร้อม
--
--   select polname, pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as check_expr
--   from pg_policy where polrelid = 'public.ad_sales_goal_overrides'::regclass;
--   -- ต้องมี 2 policy: read (true) · write (mkt_is_team_lead ทั้งสองช่อง)
--
--   select confdeltype from pg_constraint
--   where conrelid = 'public.ad_sales_goal_overrides'::regclass and contype = 'f';
--   -- ต้องเป็น 'a' (no action) ทั้งคู่ — ห้ามเป็น 'c' (cascade) ไม่งั้นเซฟบอร์ดทีเป้าหายที
--
-- ROLLBACK (ลบตารางนี้ = ค่าที่คนตั้งไว้หายถาวร ไม่มีท่อไหนเติมกลับ — สำรองก่อน)
--   create table ad_sales_goal_overrides_backup as select * from public.ad_sales_goal_overrides;
--   drop table if exists public.ad_sales_goal_overrides;
--   alter table public.ad_sales_goals drop constraint if exists ad_sales_goals_goal_source_check;
--   alter table public.ad_sales_goals add constraint ad_sales_goals_goal_source_check
--     check (goal_source in ('sale_goal', 'sale_target'));
--   -- (ต้องลบแถว goal_source = 'tmk_month' ออกก่อน ไม่งั้น constraint เดิมเพิ่มกลับไม่ได้)
-- ============================================================
