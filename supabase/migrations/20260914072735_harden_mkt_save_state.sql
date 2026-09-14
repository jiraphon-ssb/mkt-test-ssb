-- Harden mkt_save_state (H3 จาก security review 2026-09-14)
-- ของเดิม: SECURITY DEFINER · anon เรียกได้ · ลบ mkt_profile ทั้งตารางแล้ว insert role จาก JSON ของผู้เรียก
--          และไม่ใส่ auth_user_id กลับ → (1) ใครก็ตั้งตัวเองเป็น team_lead ได้ (2) ล้างการผูก OAuth ทุกคน (3) anon ล้างข้อมูลได้
-- แนวทาง: เก็บของเดิมไว้เป็น mkt_save_state_raw (เรียกจาก wrapper เท่านั้น) แล้ว wrapper ใหม่ชื่อเดิม
--          · ต้องมี session · anon เรียกไม่ได้
--          · auth_user_id ไม่เคยมาจาก payload — คืนค่าเดิมทุกครั้ง
--          · ผู้เรียกที่ไม่ใช่ team_lead: คง role/active ของแถวเดิม · แถวใหม่ห้ามเป็น team_lead
--            · โปรไฟล์ที่มีสิทธิ์ (team_lead หรือผูกผู้ใช้) ที่ payload ไม่ส่งมา = ใส่คืน (กันลบคนอื่นทิ้ง)
-- หมายเหตุ: ภายใน SECURITY DEFINER current_user = เจ้าของฟังก์ชัน → trigger mkt_profile_guard_privileges ปล่อยผ่าน
--           การป้องกันบนเส้นทางนี้จึงอยู่ที่ wrapper นี้ทั้งหมด (มีเทสใน tests/adsMigrations.test.js)

alter function public.mkt_save_state(jsonb) rename to mkt_save_state_raw;
revoke execute on function public.mkt_save_state_raw(jsonb) from public, anon, authenticated;

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

  -- snapshot คอลัมน์สิทธิ์ก่อนของเดิมลบ/เขียนทับ (temp table ต่อ session · ทิ้งตอน commit)
  create temp table if not exists mkt_priv_snapshot (
    id text primary key, display_name text, auth_user_id uuid, role text, active boolean
  ) on commit drop;
  delete from pg_temp.mkt_priv_snapshot where true;
  insert into pg_temp.mkt_priv_snapshot
    select p.id, p.display_name, p.auth_user_id, p.role, p.active from public.mkt_profile p;

  perform public.mkt_save_state_raw(payload);

  -- ผู้เรียกที่ไม่ใช่ team_lead: โปรไฟล์ที่มีสิทธิ์ซึ่ง payload ไม่ส่งมา → ใส่คืน
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
end $$;

revoke execute on function public.mkt_save_state(jsonb) from public, anon;
grant execute on function public.mkt_save_state(jsonb) to authenticated;

-- โหลดสถานะเปิดให้ authenticated เท่านั้น (anon key เป็นสาธารณะ ไม่ควรอ่านการ์ด/โปรไฟล์ทั้งหมดได้โดยไม่ล็อกอิน)
revoke execute on function public.mkt_load_state() from public, anon;
grant execute on function public.mkt_load_state() to authenticated;
