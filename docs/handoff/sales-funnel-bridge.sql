-- ════════════════════════════════════════════════════════════════════════════
-- เฟส 2 — mkt_funnel_daily: จำนวนคนทัก/ลีด/มัดจำ/ออเดอร์ รายวันต่อแบรนด์ ให้ระบบ Marketing
-- รันในโปรเจกต์ขาย (ssbgroup-platform) · ใช้ต่อจากเฟส 1 (mkt_revenue_daily)
--
-- ทำไมต้องมี: หน้า ads รู้แค่ "คนทักจาก Meta" แต่ไม่รู้ว่าเข้าระบบขายจริงกี่คน กลายเป็นลีดกี่คน
--            ปิดได้กี่ออเดอร์ → วางคู่กันจะเห็นทันทีว่าหล่นหายตรงไหนของ funnel
-- คืนอะไร: แค่ "จำนวน" ต่อแบรนด์ต่อวัน ไม่มีชื่อ/เบอร์/ที่อยู่/ดีล/พนักงานขาย
-- ใครเรียกได้: service_role เท่านั้น
--
-- ⚠️ จุดที่ต้องตัดสินใจ (ขอความเห็นพี่ทัช):
--   นิยาม inq / lead / won / book อยู่ใน sale_dashboard_facts (0192) ซึ่งเป็น security invoker
--   และมีด่าน sale_is_member() — service_role จึงเรียกไม่ได้ตรงๆ เลือกทางใดทางหนึ่ง
--   (ก) ให้ฟังก์ชันนี้ owned by postgres แล้วเรียก sale_dashboard_facts ข้างใน (ตัวเลขตรงกับแดชบอร์ด 100%)
--   (ข) คัดลอกนิยามมาเขียนใหม่ในฟังก์ชันนี้ (แยกจากกัน เสี่ยงนิยามเพี้ยนเมื่อแดชบอร์ดแก้)
--   ผมเสนอ (ก) — ตัวเลขต้องมาจากที่เดียวเสมอ ไม่งั้นสองระบบจะเถียงกันเอง
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.mkt_funnel_daily(p_from date, p_to date)
returns table (
  brand      text,
  day        date,
  inquiries  integer,   -- คนทัก (kind = 'inq')
  leads      integer,   -- ลีด (kind = 'lead')
  deposits   integer,   -- มัดจำออกแบบ (kind = 'won')
  orders     integer    -- ออเดอร์ที่ booking (kind = 'book')
)
language sql
stable
security definer      -- ต้อง owned by role ที่ผ่าน sale_is_member() ตามทางเลือก (ก)
set search_path = public
as $$
  select f.brand,
         f.day,
         coalesce(sum(f.n) filter (where f.kind = 'inq'),  0)::int,
         coalesce(sum(f.n) filter (where f.kind = 'lead'), 0)::int,
         coalesce(sum(f.n) filter (where f.kind = 'won'),  0)::int,
         coalesce(sum(f.n) filter (where f.kind = 'book'), 0)::int
  from public.sale_dashboard_facts(p_from, least(p_to, p_from + 399), null, 'all') f
  where (select auth.role()) = 'service_role'
    and f.brand in ('TD','JD','TA','JK','SF')
  group by 1, 2
  order by 2, 1;
$$;

comment on function public.mkt_funnel_daily(date, date) is
  'จำนวน คนทัก/ลีด/มัดจำ/ออเดอร์ รายวันต่อแบรนด์ สำหรับระบบ Marketing · service_role เท่านั้น · ไม่มีข้อมูลลูกค้า';

revoke execute on function public.mkt_funnel_daily(date, date) from public, anon, authenticated;
grant  execute on function public.mkt_funnel_daily(date, date) to service_role;
