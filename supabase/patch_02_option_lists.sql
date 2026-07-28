-- ============================================================
--  แพตช์ 02 — ลิสต์ตัวเลือกในหน้าตั้งค่ากลายเป็นค่าว่าง
--  สาเหตุ: ขนาดภาพ/มุมกล้อง/ความยาวคลิป เก็บเป็น "ออบเจกต์" ไม่ใช่ข้อความ
--          ของเดิมยัดลงคอลัมน์ text เลยเพี้ยนเป็นสตริง JSON ที่แอปอ่านไม่ออก
--  วิธีใช้: วางทั้งไฟล์ใน SQL Editor → Run
--          (ตาราง mkt_option_list สร้างใหม่ · ตารางอื่นและการ์ดทั้งหมดไม่ถูกแตะ)
--  เสร็จแล้วในแอปกด  ตั้งค่า → รีเซ็ตข้อมูล demo  เพื่อดันลิสต์ที่ถูกต้องขึ้นไป
-- ============================================================

drop table if exists mkt_option_list;

create table mkt_option_list (
  list  text not null check (list in ('size_presets','shot_types','scheduler_tools','video_lengths')),
  idx   int  not null,
  item  jsonb not null,
  primary key (list, idx)
);

alter table mkt_option_list enable row level security;
drop policy if exists mkt_option_list_open on mkt_option_list;
create policy mkt_option_list_open on mkt_option_list
  for all to anon, authenticated using (true) with check (true);

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
    'size_presets',    coalesce((select jsonb_agg(item order by idx) from mkt_option_list where list = 'size_presets'), '[]'::jsonb),
    'shot_types',      coalesce((select jsonb_agg(item order by idx) from mkt_option_list where list = 'shot_types'), '[]'::jsonb),
    'scheduler_tools', coalesce((select jsonb_agg(item order by idx) from mkt_option_list where list = 'scheduler_tools'), '[]'::jsonb),
    'video_lengths',   coalesce((select jsonb_agg(item order by idx) from mkt_option_list where list = 'video_lengths'), '[]'::jsonb)
  );
$$;

create or replace function mkt_save_state(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- ลบเรียงตามสายอ้างอิง (ลูกก่อนแม่)
  -- "where true" จำเป็น: Supabase เปิด pg_safeupdate ไว้ ห้าม DELETE ที่ไม่มี WHERE
  delete from mkt_attachment      where true;   delete from mkt_reference_link where true;
  delete from mkt_card_note       where true;   delete from mkt_review_action  where true;
  delete from mkt_status_history  where true;   delete from mkt_channel_run    where true;
  delete from mkt_card            where true;   delete from mkt_channel        where true;
  delete from mkt_brand           where true;   delete from mkt_profile        where true;
  delete from mkt_option_list     where true;

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

  -- jsonb_array_elements (ไม่ใช่ _text) — เก็บทั้งออบเจกต์ไว้ทั้งก้อน
  insert into mkt_option_list (list, idx, item)
  select lists.k, (v.ord - 1)::int, v.item
  from (values ('size_presets'),('shot_types'),('scheduler_tools'),('video_lengths')) as lists(k),
       lateral jsonb_array_elements(coalesce(payload->lists.k, '[]'::jsonb)) with ordinality as v(item, ord);

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
