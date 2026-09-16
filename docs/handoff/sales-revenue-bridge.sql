-- ════════════════════════════════════════════════════════════════════════════
-- mkt_revenue_daily — ประตูอ่านอย่างเดียวให้ระบบ Marketing (ssb-content-pipeline)
-- รันในโปรเจกต์ขาย (ssbgroup-platform) · เขียนโดย Marketing ส่งให้พี่ทัชรีวิว/รันเอง
--
-- ทำอะไร: คืนรายได้รายวันต่อแบรนด์ตามนิยาม P&L (วันรับรู้รายได้ = วันจ่ายงวดแรก)
-- ไม่คืนอะไร: ไม่มีชื่อลูกค้า เบอร์ ที่อยู่ เลขที่ใบเสนอราคา ราคาต่อชิ้น หรือ id ใดๆ ของดีล
-- ใครเรียกได้: service_role เท่านั้น (Edge Function ฝั่ง Marketing) · anon/authenticated เรียกไม่ได้
-- ปลอดภัยยังไง: security definer แต่ล็อก search_path · อ่านอย่างเดียว ไม่มี insert/update/delete
--               · จำกัดช่วงไม่เกิน 400 วันต่อครั้ง · ไม่แตะ RLS ของตารางอื่น
-- ถอนออกเมื่อไหร่ก็ได้: drop function public.mkt_revenue_daily(date, date);
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.mkt_revenue_daily(p_from date, p_to date)
returns table (
  brand    text,      -- TD | JD | TA | JK | SF
  day      date,      -- วันรับรู้รายได้ (= วันจ่ายงวดแรก) หรือวันที่แก้ยอด
  revenue  numeric,   -- Σ recognized_amount ของวันนั้น + Σ delta ของ correction ที่ลงวันนั้น
  orders   integer    -- จำนวนดีลที่รับรู้รายได้วันนั้น (correction ไม่นับเป็นออเดอร์ใหม่)
)
language sql
stable
security definer
set search_path = public
as $$
  with span as (
    select p_from as f,
           least(p_to, p_from + 399) as t          -- กันขอช่วงยาวเกินจนล็อกฐาน
  ),
  recognized as (
    -- รายได้ตามนิยาม P&L: ดีลที่รับรู้รายได้แล้วและไม่ได้ถอนยืนยัน
    select d.brand, d.revenue_recognized_date as day, sum(d.recognized_amount) as amount, count(*)::int as orders
    from public.sale_deal d, span s
    where d.revenue_recognized_date between s.f and s.t
      and d.recognized_amount is not null
      and not d.confirm_reverted
      and d.brand in ('TD','JD','TA','JK','SF')
    group by 1, 2
  ),
  corrections as (
    -- ยกเลิก/แก้ยอดหลังส่ง — ลงวันที่แก้ เหมือนที่ vw_budget_rev_brand ทำ
    select d.brand, c.correction_date as day, sum(c.delta) as amount, 0::int as orders
    from public.sale_revenue_correction c
    join public.sale_deal d on d.id = c.deal_id, span s
    where c.correction_date between s.f and s.t
      and d.brand in ('TD','JD','TA','JK','SF')
    group by 1, 2
  ),
  merged as (
    select * from recognized
    union all
    select * from corrections
  )
  select m.brand, m.day, sum(m.amount)::numeric as revenue, sum(m.orders)::int as orders
  from merged m
  where (select auth.role()) = 'service_role'      -- ด่านสิทธิ์: มีแต่ระบบเท่านั้นที่เรียกได้
  group by 1, 2
  order by 2, 1;
$$;

comment on function public.mkt_revenue_daily(date, date) is
  'รายได้รายวันต่อแบรนด์ตามนิยาม P&L (วันจ่ายงวดแรก + correction) สำหรับระบบ Marketing · service_role เท่านั้น · ไม่มีข้อมูลลูกค้า';

revoke execute on function public.mkt_revenue_daily(date, date) from public, anon, authenticated;
grant  execute on function public.mkt_revenue_daily(date, date) to service_role;

-- ── ทดสอบหลังรัน (ควรได้ค่าว่างเมื่อเรียกด้วยสิทธิ์ผู้ใช้ทั่วไป และได้ข้อมูลเมื่อเรียกด้วย service key) ──
-- select * from public.mkt_revenue_daily('2026-09-01', '2026-09-16');
