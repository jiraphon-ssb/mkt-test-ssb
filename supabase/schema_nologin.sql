-- ============================================================
--  SSB Content Pipeline — สคีมาเต็ม "โหมดไม่ต้องล็อกอิน" (no-login)
--  รันไฟล์นี้ไฟล์เดียวจบใน Supabase → SQL Editor → New query → Run
--
--  โหมดนี้คืออะไร: ทุกคนที่ถือ anon key เข้าถึงข้อมูลได้เต็ม (อ่าน+เขียน)
--  ไม่มี auth.users ไม่มี login — เหมาะกับ "เดโม/ใช้ในทีมหลังไฟร์วอลล์"
--  ⚠️ ห้ามใส่ข้อมูลลูกค้าจริง/ความลับ เพราะใครมี URL+anon key ก็แก้ได้
--     วันขึ้นใช้จริงค่อยเปลี่ยนเป็น RLS + auth (ผัง RPC อยู่ใน INTEGRATION.md)
--
--  รันซ้ำได้ (idempotent) — drop ของเดิมก่อนสร้างใหม่
-- ============================================================

-- ---------- 0) ล้างของเดิม (เฉพาะของโปรเจกต์นี้) ----------
drop function if exists mkt_save_state(jsonb);
drop function if exists mkt_load_state();
drop view if exists mkt_card_metrics_rollup;
drop table if exists mkt_card_note cascade;
drop table if exists mkt_attachment cascade;
drop table if exists mkt_reference_link cascade;
drop table if exists mkt_review_action cascade;
drop table if exists mkt_status_history cascade;
drop table if exists mkt_channel_run cascade;
drop table if exists mkt_card cascade;
drop table if exists mkt_channel cascade;
drop table if exists mkt_brand cascade;
drop table if exists mkt_profile cascade;
drop table if exists mkt_settings cascade;
drop table if exists mkt_option_list cascade;

-- ============================================================
--  1) ตารางหลัก
--  หมายเหตุ: id เป็น text ทุกตาราง เพราะแอปสร้างรหัสอ่านออก (CT-001, u_arm, b_td)
--  ไม่ใช่ uuid — โหมดนี้ให้ client สร้าง id ได้ (ของจริงย้ายไป gen ที่ server)
-- ============================================================

create table mkt_profile (
  id            text primary key,
  display_name  text not null,
  role          text not null default 'content_owner'
                check (role in ('team_lead','content_owner','performance_marketer','viewer')),
  active        boolean not null default true
);

create table mkt_brand (
  id            text primary key,
  name          text not null,
  mode          text not null default 'maintain' check (mode in ('grow','maintain','rebuild')),
  default_owner text references mkt_profile(id) on delete set null,
  color         text not null default '#5a6472',
  logo          text not null default '',
  active        boolean not null default true
);

create table mkt_channel (
  id         text primary key,
  name       text not null,
  kind       text not null default 'feed',          -- feed | short_video | broadcast
  tool       text not null default '',
  best_time  text not null default '',
  color      text not null default '#5a6472',
  logo       text not null default '',
  active     boolean not null default true
);

create table mkt_card (
  id                text primary key,               -- CT-001 …
  track             text not null default 'content' check (track in ('content','project')),
  status            text not null default 'idea'
                    check (status in ('idea','brief','draft','review','scheduled','published','measured')),
  brand_id          text references mkt_brand(id) on delete restrict,
  owner_id          text references mkt_profile(id) on delete set null,
  title             text not null default '',
  pillar            text,                            -- sale_campaign | knowledge | social_proof | brand
  is_realtime       boolean not null default false,
  plan_confirmed    boolean not null default false,
  starred           boolean not null default false,  -- ★ ต้นแบบในหน้าคลัง
  archived          boolean not null default false,  -- ปิดงานแล้ว = อยู่หน้าคลัง แก้ไม่ได้
  brief             jsonb  not null default '{}'::jsonb,   -- โจทย์ + สเปคงาน + ฉากคลิป/รายภาพ
  self_check        jsonb  not null default '{}'::jsonb,
  metrics           jsonb,                            -- ยอดรวม (คิดจาก mkt_channel_run — ดู view ล่าง)
  draft_link        text not null default '',
  first_pass        boolean,                          -- เขียนครั้งเดียว ห้ามรีเซ็ต
  entered_review_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index mkt_card_status_idx  on mkt_card (status) where not archived;
create index mkt_card_brand_idx   on mkt_card (brand_id);
create index mkt_card_archive_idx on mkt_card (archived, updated_at desc);

-- 3 ขั้นท้ายเดินรายช่องทาง — งานใบเดียวลงหลายช่อง ตัวเลขแยกกัน
create table mkt_channel_run (
  card_id          text not null references mkt_card(id) on delete cascade,
  channel          text not null,
  scheduled_at     timestamptz,
  scheduler_tool   text not null default '',
  schedule_ref     text not null default '',
  post_url         text not null default '',
  posted_at        timestamptz,
  live_ok          boolean not null default false,
  comments_handled boolean not null default false,
  metrics          jsonb,
  measured_at      timestamptz,
  primary key (card_id, channel)
);

create table mkt_status_history (
  id          text primary key,
  card_id     text not null references mkt_card(id) on delete cascade,
  from_status text,
  to_status   text,
  moved_by    text references mkt_profile(id) on delete set null,
  moved_at    timestamptz not null default now()
);
create index mkt_history_card_idx on mkt_status_history (card_id, moved_at desc);

create table mkt_review_action (
  id                  text primary key,
  card_id             text not null references mkt_card(id) on delete cascade,
  action              text not null check (action in ('approve','reject')),
  reason              text not null default '',
  direction_pack_ref  text not null default '',
  acted_by            text references mkt_profile(id) on delete set null,
  acted_at            timestamptz not null default now(),
  wait_hours          numeric
);
create index mkt_review_card_idx on mkt_review_action (card_id, acted_at desc);

create table mkt_card_note (
  id         text primary key,
  card_id    text not null references mkt_card(id) on delete cascade,
  stage      text not null default 'idea',
  kind       text not null default 'note' check (kind in ('note','reject','lesson')),
  text       text not null default '',
  author_id  text references mkt_profile(id) on delete set null,
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index mkt_note_card_idx on mkt_card_note (card_id, pinned desc, created_at desc);

create table mkt_attachment (
  id              text primary key,
  card_id         text not null references mkt_card(id) on delete cascade,
  note_id         text references mkt_card_note(id) on delete cascade,
  channel         text,
  attachment_type text not null default 'reference',
  -- brief_file | brief_image | brand_guideline | reference | draft_work
  -- | schedule_proof | live_proof | insight_proof | note_image
  file_name       text not null default '',
  file_url        text not null default '',
  mime_type       text not null default '',
  file_size       bigint not null default 0,
  caption         text,
  sort_order      int not null default 0,
  uploaded_by     text references mkt_profile(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index mkt_att_card_idx on mkt_attachment (card_id, sort_order);

create table mkt_reference_link (
  id         text primary key,
  card_id    text not null references mkt_card(id) on delete cascade,
  url        text not null,
  link_type  text not null default 'other',
  title      text not null default '',
  note       text not null default '',
  added_by   text references mkt_profile(id) on delete set null,
  created_at timestamptz not null default now()
);
create index mkt_link_card_idx on mkt_reference_link (card_id);

-- ตั้งค่าระบบ (แถวเดียว) — SLA, เป้าผ่านรอบแรก, กวาดล้างไอเดีย, flex slot
create table mkt_settings (
  id                     int primary key default 1 check (id = 1),
  sla_hours              int not null default 24,
  first_pass_target      numeric not null default 0.8,
  first_pass_window_weeks int not null default 4,
  idea_purge_days        int not null default 60,
  flex_slot_per_week     int not null default 2
);
insert into mkt_settings (id) values (1);

-- ลิสต์ตัวเลือกที่แก้ได้ในหน้าตั้งค่า (ขนาดภาพ / ชนิดช็อต / เครื่องมือตั้งเวลา / ความยาวคลิป)
create table mkt_option_list (
  list   text not null check (list in ('size_presets','shot_types','scheduler_tools','video_lengths')),
  value  text not null,
  sort_order int not null default 0,
  primary key (list, value)
);

-- ยอดของการ์ด = ผลรวมทุกช่องทาง (สูตรเดียวกับ mktRules.rollupCardMetrics — ห้ามคิดซ้ำสองที่)
create view mkt_card_metrics_rollup as
  select
    card_id,
    sum((metrics->>'reach')::numeric)      as reach,
    sum((metrics->>'engagement')::numeric) as engagement,
    sum((metrics->>'leads')::numeric)      as leads,
    sum((metrics->>'spend')::numeric)      as spend,
    max(measured_at)                       as measured_at,
    count(*) filter (where metrics is not null) as measured_channels,
    count(*)                               as total_channels
  from mkt_channel_run
  group by card_id;

-- ============================================================
--  2) RLS — โหมดไม่ล็อกอิน: anon ทำได้ทุกอย่าง
--  (เปิด RLS ไว้เพื่อให้เปลี่ยนเป็นโหมดมีสิทธิ์ทีหลังได้โดยไม่ต้องรื้อ
--   วันนั้นแค่ลบ policy *_open แล้วใส่ policy ที่ตรวจ auth.uid())
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'mkt_profile','mkt_brand','mkt_channel','mkt_card','mkt_channel_run',
    'mkt_status_history','mkt_review_action','mkt_card_note',
    'mkt_attachment','mkt_reference_link','mkt_settings','mkt_option_list'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_open', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      t || '_open', t);
  end loop;
end $$;

-- ============================================================
--  3) สองฟังก์ชันที่แอปเรียก (แทน localStorage)
--     mkt_load_state()  → ก้อน jsonb เดียว รูปร่างเหมือน data ในแอปเป๊ะ
--     mkt_save_state()  → เขียนทับทั้งก้อนในทรานแซกชันเดียว
--  ทำแบบ "แทนที่ทั้งก้อน" เพราะโหมดเดโมแอปถือ state ทั้งหมดในหน่วยความจำอยู่แล้ว
--  (ของจริงค่อยแตกเป็น RPC ราย action — ผังอยู่ใน INTEGRATION.md)
-- ============================================================
create or replace function mkt_load_state()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'profiles',        coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from mkt_profile p), '[]'::jsonb),
    'brands',          coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from mkt_brand b), '[]'::jsonb),
    'channels',        coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from mkt_channel c), '[]'::jsonb),
    'cards',           coalesce((select jsonb_agg(
                          to_jsonb(c) || jsonb_build_object('channel_runs',
                            coalesce((select jsonb_agg(to_jsonb(r) - 'card_id' order by r.channel)
                                      from mkt_channel_run r where r.card_id = c.id), '[]'::jsonb))
                          order by c.updated_at desc) from mkt_card c), '[]'::jsonb),
    'status_history',  coalesce((select jsonb_agg(to_jsonb(h) order by h.moved_at) from mkt_status_history h), '[]'::jsonb),
    'review_actions',  coalesce((select jsonb_agg(to_jsonb(a) order by a.acted_at) from mkt_review_action a), '[]'::jsonb),
    'card_notes',      coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from mkt_card_note n), '[]'::jsonb),
    'attachments',     coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order) from mkt_attachment a), '[]'::jsonb),
    'reference_links', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from mkt_reference_link l), '[]'::jsonb),
    'settings',        coalesce((select to_jsonb(s) - 'id' from mkt_settings s where s.id = 1), '{}'::jsonb),
    'size_presets',    coalesce((select jsonb_agg(value order by sort_order) from mkt_option_list where list = 'size_presets'), '[]'::jsonb),
    'shot_types',      coalesce((select jsonb_agg(value order by sort_order) from mkt_option_list where list = 'shot_types'), '[]'::jsonb),
    'scheduler_tools', coalesce((select jsonb_agg(value order by sort_order) from mkt_option_list where list = 'scheduler_tools'), '[]'::jsonb),
    'video_lengths',   coalesce((select jsonb_agg(value order by sort_order) from mkt_option_list where list = 'video_lengths'), '[]'::jsonb)
  );
$$;

create or replace function mkt_save_state(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- ลบเรียงตามสายอ้างอิง (ลูกก่อนแม่)
  delete from mkt_attachment;      delete from mkt_reference_link;
  delete from mkt_card_note;       delete from mkt_review_action;
  delete from mkt_status_history;  delete from mkt_channel_run;
  delete from mkt_card;            delete from mkt_channel;
  delete from mkt_brand;           delete from mkt_profile;
  delete from mkt_option_list;

  insert into mkt_profile (id, display_name, role, active)
  select x->>'id', x->>'display_name', coalesce(x->>'role','content_owner'), coalesce((x->>'active')::boolean, true)
  from jsonb_array_elements(coalesce(payload->'profiles','[]'::jsonb)) x;

  insert into mkt_brand (id, name, mode, default_owner, color, logo, active)
  select x->>'id', x->>'name', coalesce(x->>'mode','maintain'), nullif(x->>'default_owner',''),
         coalesce(x->>'color','#5a6472'), coalesce(x->>'logo',''), coalesce((x->>'active')::boolean, true)
  from jsonb_array_elements(coalesce(payload->'brands','[]'::jsonb)) x;

  insert into mkt_channel (id, name, kind, tool, best_time, color, logo, active)
  select x->>'id', x->>'name', coalesce(x->>'kind','feed'), coalesce(x->>'tool',''),
         coalesce(x->>'best_time',''), coalesce(x->>'color','#5a6472'), coalesce(x->>'logo',''),
         coalesce((x->>'active')::boolean, true)
  from jsonb_array_elements(coalesce(payload->'channels','[]'::jsonb)) x;

  insert into mkt_card (id, track, status, brand_id, owner_id, title, pillar, is_realtime,
                        plan_confirmed, starred, archived, brief, self_check, metrics, draft_link,
                        first_pass, entered_review_at, created_at, updated_at)
  select x->>'id', coalesce(x->>'track','content'), coalesce(x->>'status','idea'),
         nullif(x->>'brand_id',''), nullif(x->>'owner_id',''), coalesce(x->>'title',''),
         nullif(x->>'pillar',''), coalesce((x->>'is_realtime')::boolean, false),
         coalesce((x->>'plan_confirmed')::boolean, false), coalesce((x->>'starred')::boolean, false),
         coalesce((x->>'archived')::boolean, false),
         coalesce(x->'brief','{}'::jsonb), coalesce(x->'self_check','{}'::jsonb), x->'metrics',
         coalesce(x->>'draft_link',''), (x->>'first_pass')::boolean,
         (x->>'entered_review_at')::timestamptz,
         coalesce((x->>'created_at')::timestamptz, now()), coalesce((x->>'updated_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'cards','[]'::jsonb)) x;

  insert into mkt_channel_run (card_id, channel, scheduled_at, scheduler_tool, schedule_ref,
                               post_url, posted_at, live_ok, comments_handled, metrics, measured_at)
  select c->>'id', r->>'channel', (r->>'scheduled_at')::timestamptz, coalesce(r->>'scheduler_tool',''),
         coalesce(r->>'schedule_ref',''), coalesce(r->>'post_url',''), (r->>'posted_at')::timestamptz,
         coalesce((r->>'live_ok')::boolean, false), coalesce((r->>'comments_handled')::boolean, false),
         r->'metrics', (r->>'measured_at')::timestamptz
  from jsonb_array_elements(coalesce(payload->'cards','[]'::jsonb)) c,
       jsonb_array_elements(coalesce(c->'channel_runs','[]'::jsonb)) r;

  insert into mkt_status_history (id, card_id, from_status, to_status, moved_by, moved_at)
  select x->>'id', x->>'card_id', nullif(x->>'from_status',''), nullif(x->>'to_status',''),
         nullif(x->>'moved_by',''), coalesce((x->>'moved_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'status_history','[]'::jsonb)) x
  where exists (select 1 from mkt_card c where c.id = x->>'card_id');

  insert into mkt_review_action (id, card_id, action, reason, direction_pack_ref, acted_by, acted_at, wait_hours)
  select x->>'id', x->>'card_id', x->>'action', coalesce(x->>'reason',''),
         coalesce(x->>'direction_pack_ref',''), nullif(x->>'acted_by',''),
         coalesce((x->>'acted_at')::timestamptz, now()), (x->>'wait_hours')::numeric
  from jsonb_array_elements(coalesce(payload->'review_actions','[]'::jsonb)) x
  where exists (select 1 from mkt_card c where c.id = x->>'card_id');

  insert into mkt_card_note (id, card_id, stage, kind, text, author_id, pinned, created_at, updated_at)
  select x->>'id', x->>'card_id', coalesce(x->>'stage','idea'), coalesce(x->>'kind','note'),
         coalesce(x->>'text',''), nullif(x->>'author_id',''), coalesce((x->>'pinned')::boolean, false),
         coalesce((x->>'created_at')::timestamptz, now()), (x->>'updated_at')::timestamptz
  from jsonb_array_elements(coalesce(payload->'card_notes','[]'::jsonb)) x
  where exists (select 1 from mkt_card c where c.id = x->>'card_id');

  insert into mkt_attachment (id, card_id, note_id, channel, attachment_type, file_name, file_url,
                              mime_type, file_size, caption, sort_order, uploaded_by, created_at)
  select x->>'id', x->>'card_id', nullif(x->>'note_id',''), nullif(x->>'channel',''),
         coalesce(x->>'attachment_type','reference'), coalesce(x->>'file_name',''),
         coalesce(x->>'file_url',''), coalesce(x->>'mime_type',''),
         coalesce((x->>'file_size')::bigint, 0), x->>'caption',
         coalesce((x->>'sort_order')::int, 0), nullif(x->>'uploaded_by',''),
         coalesce((x->>'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'attachments','[]'::jsonb)) x
  where exists (select 1 from mkt_card c where c.id = x->>'card_id');

  insert into mkt_reference_link (id, card_id, url, link_type, title, note, added_by, created_at)
  select x->>'id', x->>'card_id', coalesce(x->>'url',''), coalesce(x->>'link_type','other'),
         coalesce(x->>'title',''), coalesce(x->>'note',''), nullif(x->>'added_by',''),
         coalesce((x->>'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'reference_links','[]'::jsonb)) x
  where exists (select 1 from mkt_card c where c.id = x->>'card_id');

  insert into mkt_option_list (list, value, sort_order)
  select k, v.value, (v.ord - 1)::int
  from (values ('size_presets'),('shot_types'),('scheduler_tools'),('video_lengths')) as lists(k),
       lateral jsonb_array_elements_text(coalesce(payload->lists.k, '[]'::jsonb)) with ordinality as v(value, ord)
  on conflict do nothing;

  update mkt_settings set
    sla_hours               = coalesce((payload->'settings'->>'sla_hours')::int, sla_hours),
    first_pass_target       = coalesce((payload->'settings'->>'first_pass_target')::numeric, first_pass_target),
    first_pass_window_weeks = coalesce((payload->'settings'->>'first_pass_window_weeks')::int, first_pass_window_weeks),
    idea_purge_days         = coalesce((payload->'settings'->>'idea_purge_days')::int, idea_purge_days),
    flex_slot_per_week      = coalesce((payload->'settings'->>'flex_slot_per_week')::int, flex_slot_per_week)
  where id = 1;
end $$;

grant execute on function mkt_load_state()      to anon, authenticated;
grant execute on function mkt_save_state(jsonb) to anon, authenticated;

-- ============================================================
--  4) ที่เก็บไฟล์แนบ (รูปงาน/แคปหลักฐาน) — เปิดสาธารณะแบบไม่ล็อกอิน
-- ============================================================
insert into storage.buckets (id, name, public)
values ('mkt-files', 'mkt-files', true)
on conflict (id) do update set public = true;

drop policy if exists mkt_files_open on storage.objects;
create policy mkt_files_open on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'mkt-files') with check (bucket_id = 'mkt-files');

-- ============================================================
--  เสร็จแล้ว — ตรวจด้วย:  select mkt_load_state();
--  ครั้งแรกจะได้อาร์เรย์ว่างทั้งหมด (ยังไม่มีข้อมูล)
--  แล้วค่อยกดในแอป: ตั้งค่า → "ส่งข้อมูลเดโมขึ้น Supabase"
-- ============================================================
