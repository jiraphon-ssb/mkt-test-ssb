-- ============================================================
--  แพตช์ 01 — แก้ "DELETE requires a WHERE clause"
--  สาเหตุ: Supabase เปิดส่วนขยาย pg_safeupdate ไว้ (กันลบยกตารางโดยไม่ตั้งใจ)
--  วิธีใช้: วางทั้งไฟล์นี้ใน SQL Editor แล้ว Run — ทับเฉพาะฟังก์ชัน ข้อมูลไม่หาย
--  (ถ้ารัน schema_nologin.sql ฉบับล่าสุดไปแล้ว ไม่ต้องรันไฟล์นี้)
-- ============================================================

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

grant execute on function mkt_save_state(jsonb) to anon, authenticated;
