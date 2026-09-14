-- เก็บ settings.ads_control (mapping บัญชี · แหล่งข้อมูล · เป้ารายแบรนด์ · กฎ) ลงฐาน
-- ของเดิม: mkt_settings มีแค่คอลัมน์บอร์ดคอนเทนต์ → หน้าตั้งค่า ads บันทึกแล้วหายเมื่อโหลดหน้าใหม่
-- mkt_load_state อ่านด้วย to_jsonb(s) อยู่แล้ว → คอลัมน์ใหม่ขึ้นใน data.settings.ads_control อัตโนมัติ
-- การเขียน: เฉพาะ team_lead (เป้า/mapping บัญชีโฆษณาเป็นค่าระดับผู้ดูแล) ผ่าน wrapper mkt_save_state

alter table public.mkt_settings add column if not exists ads_control jsonb not null default '{}'::jsonb
  check (jsonb_typeof(ads_control) = 'object' and pg_column_size(ads_control) < 200000);

-- baseline เปิด policy mkt_settings_open ให้ anon/authenticated ทำได้ทุกอย่างผ่าน REST → ข้าม gate team_lead ของ wrapper ได้
-- ปิดการเขียนตรงจาก client ทั้งหมด (เขียนผ่าน mkt_save_state ซึ่งเป็น SECURITY DEFINER เท่านั้น)
-- authenticated ยังต้อง SELECT เพราะ mkt_load_state เป็น SECURITY INVOKER · anon ไม่ต้องอ่าน (load_state ถูก revoke จาก anon ใน 0008)
revoke insert, update, delete, truncate on public.mkt_settings from anon, authenticated;
revoke select on public.mkt_settings from anon;

create or replace function public.mkt_save_state(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_is_lead boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  caller_is_lead := exists (
    select 1 from public.mkt_profile p
    where p.auth_user_id = (select auth.uid()) and p.active and p.role = 'team_lead'
  );

  create temp table if not exists mkt_priv_snapshot (
    id text primary key, display_name text, auth_user_id uuid, role text, active boolean
  ) on commit drop;
  delete from pg_temp.mkt_priv_snapshot where true;
  insert into pg_temp.mkt_priv_snapshot
    select p.id, p.display_name, p.auth_user_id, p.role, p.active from public.mkt_profile p;

  perform public.mkt_save_state_raw(payload);

  if not caller_is_lead then
    insert into public.mkt_profile (id, display_name, role, active)
    select s.id, s.display_name, s.role, s.active
    from pg_temp.mkt_priv_snapshot s
    where (s.role = 'team_lead' or s.auth_user_id is not null)
      and not exists (select 1 from public.mkt_profile p where p.id = s.id);
  end if;

  update public.mkt_profile p set auth_user_id = s.auth_user_id
  from pg_temp.mkt_priv_snapshot s where s.id = p.id;

  if not caller_is_lead then
    update public.mkt_profile p set role = s.role, active = s.active
    from pg_temp.mkt_priv_snapshot s where s.id = p.id;
    update public.mkt_profile p set role = 'content_owner'
    where p.role = 'team_lead'
      and not exists (select 1 from pg_temp.mkt_priv_snapshot s where s.id = p.id);
  end if;

  -- ads_control: team_lead เท่านั้น · payload ไม่มีค่า/ไม่ใช่ object = คงค่าเดิม
  if caller_is_lead and jsonb_typeof(payload->'settings'->'ads_control') = 'object' then
    update public.mkt_settings set ads_control = payload->'settings'->'ads_control' where id = 1;
  end if;
end $$;

revoke execute on function public.mkt_save_state(jsonb) from public, anon;
grant execute on function public.mkt_save_state(jsonb) to authenticated;
