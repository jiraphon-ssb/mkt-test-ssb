-- ════════════════════════════════════════════════════════════════════════════
-- เฟส 3 — mkt_goal_current: เป้ารายเดือนต่อแบรนด์ (เวอร์ชันล่าสุด) ให้ระบบ Marketing
-- รันในโปรเจกต์ขาย (ssbgroup-platform)
--
-- ทำไมต้องมี: ตอนนี้เป้าถูกตั้ง 2 ที่ — sale_goal (ระบบขาย คิดย้อนจากงบแอด ÷ CPL) และหน้าตั้งค่าของ ads
--            ซึ่งจะเพี้ยนจากกันเรื่อยๆ · ถ้าดึงมาจากระบบขายที่เดียว ทุกหน้าจะพูดเลขเดียวกัน
-- คืนอะไร: เป้าระดับเดือน×แบรนด์เท่านั้น (ยอดขาย · งบแอด · CPL · CAC · ROAS · จำนวนที่ตั้งไว้)
-- ใครเรียกได้: service_role เท่านั้น
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.mkt_goal_current(p_month date)
returns table (
  brand        text,
  month        date,
  version      integer,
  sales_target numeric,   -- targets->>'sales_total'
  ad_budget    numeric,   -- targets->>'ad_budget'
  cpl          numeric,
  cac          numeric,
  roas         numeric,
  leads_target numeric,
  orders_target numeric,
  updated_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select g.brand,
         g.month,
         g.version,
         nullif(g.targets->>'sales_total','')::numeric,
         nullif(g.targets->>'ad_budget','')::numeric,
         nullif(g.targets->>'cpl','')::numeric,
         nullif(g.targets->>'cac','')::numeric,
         nullif(g.targets->>'roas','')::numeric,
         coalesce(nullif(g.targets->>'leads_new','')::numeric, 0) + coalesce(nullif(g.targets->>'leads_old','')::numeric, 0),
         coalesce(nullif(g.targets->>'orders_new','')::numeric, 0) + coalesce(nullif(g.targets->>'orders_old','')::numeric, 0),
         g.created_at
  from public.sale_goal g
  where (select auth.role()) = 'service_role'
    and g.month = date_trunc('month', p_month)::date
    and g.version = (select max(v.version) from public.sale_goal v where v.brand = g.brand and v.month = g.month)
  order by g.brand;
$$;

comment on function public.mkt_goal_current(date) is
  'เป้าเดือนปัจจุบันต่อแบรนด์ (เวอร์ชันล่าสุด) สำหรับระบบ Marketing · service_role เท่านั้น';

revoke execute on function public.mkt_goal_current(date) from public, anon, authenticated;
grant  execute on function public.mkt_goal_current(date) to service_role;
