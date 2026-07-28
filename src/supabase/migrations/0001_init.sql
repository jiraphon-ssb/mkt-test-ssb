-- ============================================================
-- SSB Content Pipeline — Supabase schema + RLS
-- digital twin ของ Content Pipeline SOP v1.1 (Spec ข้อ 3 + 8)
-- รันบน Supabase (Postgres): supabase db push หรือ paste ใน SQL editor
-- MVP demo ใช้ localStorage; ไฟล์นี้พร้อมสำหรับวันย้ายขึ้น Supabase จริง
-- ============================================================

-- ---------- enums ----------
create type role_t          as enum ('team_lead','content_owner','performance_marketer');
create type brand_mode_t    as enum ('grow','maintain','rebuild');
create type track_t         as enum ('content','project');
create type card_status_t   as enum ('idea','brief','draft','review','scheduled','published','measured','done');
create type pillar_t        as enum ('sale_campaign','knowledge','social_proof','brand');
create type review_action_t as enum ('approve','reject');

-- ---------- profiles ----------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role         role_t not null default 'content_owner',
  active       boolean not null default true
);

-- ---------- brands ----------
create table brands (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  mode          brand_mode_t not null default 'maintain',
  default_owner uuid references profiles(id),
  color         text not null default '#F26B21',
  active        boolean not null default true
);

-- ---------- cards (หัวใจของระบบ) ----------
create table cards (
  id                uuid primary key default gen_random_uuid(),
  track             track_t not null default 'content',
  status            card_status_t not null default 'idea',
  brand_id          uuid not null references brands(id),
  owner_id          uuid not null references profiles(id),
  title             text not null,
  pillar            pillar_t,                       -- content เท่านั้น
  is_realtime       boolean not null default false,
  brief             jsonb not null default '{}'::jsonb,  -- โครง Brief v2
  draft_link        text not null default '',
  self_check        jsonb not null default '{}'::jsonb,  -- 6 ข้อ
  first_pass        boolean,                        -- null=ยังไม่เข้า review · true/false ถาวร
  entered_review_at timestamptz,                    -- ไว้คำนวณ SLA
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index cards_status_idx on cards(status);
create index cards_brand_idx  on cards(brand_id);
create index cards_owner_idx  on cards(owner_id);

-- ---------- status_history (audit — append only) ----------
create table status_history (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references cards(id) on delete cascade,
  from_status card_status_t,
  to_status   card_status_t not null,
  moved_by    uuid not null references profiles(id),
  moved_at    timestamptz not null default now()
);
create index status_history_card_idx on status_history(card_id);

-- ---------- review_actions ----------
create table review_actions (
  id                 uuid primary key default gen_random_uuid(),
  card_id            uuid not null references cards(id) on delete cascade,
  action             review_action_t not null,
  reason             text not null default '',          -- บังคับเมื่อ reject (บังคับที่ชั้น app + trigger)
  direction_pack_ref text,                              -- อ้างข้อ Direction Pack
  acted_by           uuid not null references profiles(id),
  acted_at           timestamptz not null default now(),
  hours_in_review    numeric not null default 0
);
create index review_actions_card_idx on review_actions(card_id);

-- reject ต้องมี reason (กติกาเหล็กข้อ 2 — บังคับที่ DB ด้วย)
alter table review_actions
  add constraint reject_needs_reason
  check (action <> 'reject' or (length(btrim(reason)) >= 5 and direction_pack_ref is not null));

-- ---------- settings (key-value) ----------
create table settings (
  key   text primary key,
  value text not null
);
insert into settings(key,value) values
  ('sla_hours','24'),
  ('first_pass_target','0.80'),
  ('first_pass_window_weeks','4'),
  ('idea_purge_days','60'),
  ('flex_slot_per_week','2');

-- ---------- updated_at trigger ----------
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
create trigger cards_touch before update on cards
  for each row execute function touch_updated_at();

-- ============================================================
-- RLS (Spec ข้อ 2 permission matrix + ข้อ 8)
-- ============================================================
alter table profiles       enable row level security;
alter table brands         enable row level security;
alter table cards          enable row level security;
alter table status_history enable row level security;
alter table review_actions enable row level security;
alter table settings       enable row level security;

create or replace function my_role() returns role_t as $$
  select role from profiles where id = auth.uid()
$$ language sql stable security definer;

-- profiles: อ่านได้ทุกคน · แก้ได้เฉพาะ team_lead หรือของตัวเอง
create policy profiles_read on profiles for select using (true);
create policy profiles_write on profiles for all
  using (my_role() = 'team_lead' or id = auth.uid())
  with check (my_role() = 'team_lead' or id = auth.uid());

-- brands: อ่านได้ทุกคน · จัดการเฉพาะ team_lead
create policy brands_read on brands for select using (true);
create policy brands_admin on brands for all
  using (my_role() = 'team_lead') with check (my_role() = 'team_lead');

-- settings: อ่านได้ทุกคน · แก้เฉพาะ team_lead
create policy settings_read on settings for select using (true);
create policy settings_admin on settings for all
  using (my_role() = 'team_lead') with check (my_role() = 'team_lead');

-- cards: อ่านได้ทุกคน (ดูทุก brand)
create policy cards_read on cards for select using (true);

-- สร้าง/แก้: team_lead ทุกใบ · คนอื่นเฉพาะการ์ดตัวเอง/brand ตัวเอง
create policy cards_write on cards for all
  using (
    my_role() = 'team_lead'
    or owner_id = auth.uid()
    or brand_id in (select id from brands where default_owner = auth.uid())
  )
  with check (
    my_role() = 'team_lead'
    or owner_id = auth.uid()
    or brand_id in (select id from brands where default_owner = auth.uid())
  );

-- NOTE: การล็อก "ออกจาก review ได้เฉพาะ team_lead ผ่านปุ่ม" และ
-- "first_pass เขียนครั้งเดียว" บังคับที่ Postgres function / RPC
-- (approve_card / reject_card) — เรียกจาก client แทน update ตรง ไม่ใช่ RLS อย่างเดียว

-- status_history: อ่านได้ทุกคน · insert เท่านั้น (audit ห้ามแก้/ลบ)
create policy history_read on status_history for select using (true);
create policy history_insert on status_history for insert with check (moved_by = auth.uid() or my_role() = 'team_lead');

-- review_actions: อ่านได้ทุกคน · insert เฉพาะ team_lead
create policy review_read on review_actions for select using (true);
create policy review_insert on review_actions for insert with check (my_role() = 'team_lead');

-- ============================================================
-- RPC: บังคับกติกาเหล็กที่ระดับ DB
-- ============================================================

-- approve: เฉพาะ team_lead · การ์ดต้องอยู่ review · first_pass เขียนครั้งเดียว
create or replace function approve_card(p_card uuid) returns void as $$
declare c cards; hrs numeric;
begin
  if my_role() <> 'team_lead' then raise exception 'เฉพาะ Team Lead'; end if;
  select * into c from cards where id = p_card;
  if c.status <> 'review' then raise exception 'การ์ดไม่ได้อยู่ Review'; end if;
  hrs := greatest(0, extract(epoch from (now() - c.entered_review_at)) / 3600.0);
  update cards set
    status = case when track = 'project' then 'done'::card_status_t else 'scheduled'::card_status_t end,
    first_pass = coalesce(first_pass, true),   -- เขียนครั้งเดียว
    entered_review_at = null
    where id = p_card;
  insert into review_actions(card_id, action, acted_by, acted_at, hours_in_review)
    values (p_card, 'approve', auth.uid(), now(), round(hrs,1));
  insert into status_history(card_id, from_status, to_status, moved_by)
    values (p_card, 'review', (select status from cards where id = p_card), auth.uid());
end;
$$ language plpgsql security definer;

-- reject: เฉพาะ team_lead · reason + ref บังคับ · first_pass=false ถ้ายัง null
create or replace function reject_card(p_card uuid, p_reason text, p_ref text) returns void as $$
declare c cards; hrs numeric;
begin
  if my_role() <> 'team_lead' then raise exception 'เฉพาะ Team Lead'; end if;
  if length(btrim(coalesce(p_reason,''))) < 5 or coalesce(p_ref,'') = '' then
    raise exception 'ตีกลับต้องมีเหตุผล + อ้างข้อ Direction Pack';
  end if;
  select * into c from cards where id = p_card;
  if c.status <> 'review' then raise exception 'การ์ดไม่ได้อยู่ Review'; end if;
  hrs := greatest(0, extract(epoch from (now() - c.entered_review_at)) / 3600.0);
  update cards set status = 'draft', first_pass = coalesce(first_pass, false), entered_review_at = null
    where id = p_card;
  insert into review_actions(card_id, action, reason, direction_pack_ref, acted_by, acted_at, hours_in_review)
    values (p_card, 'reject', p_reason, p_ref, auth.uid(), now(), round(hrs,1));
  insert into status_history(card_id, from_status, to_status, moved_by)
    values (p_card, 'review', 'draft', auth.uid());
end;
$$ language plpgsql security definer;

-- ============================================================
-- View สำหรับ Dashboard (Spec ข้อ 7) — การ์ด measured ส่งต่อ
-- ============================================================
create view posts_measured as
  select id, brand_id, status, pillar, is_realtime,
         (brief->>'publish_at')::timestamptz as post_date,
         brief->'channels' as channels,
         brief->>'format' as format
  from cards
  where status in ('measured','done');
