-- ท่อยอดขายจากระบบพี่ทัช (ssbgroup-platform) แบบอ่านตรง — เพิ่มช่องเก็บให้ครบ
--
-- เปลี่ยนแผนจาก 20260916160000: เลิกให้ฝั่งขายเปิดฟังก์ชัน mkt_* ใหม่ มาใช้ secret key อ่านของที่มีอยู่แล้ว
--   · RPC sale_dashboard_facts  → คนทัก ลีด ได้ออเดอร์ ยืนยันออเดอร์ เงินเข้า ยกเลิก (นิยามเดียวกับแดชบอร์ดขาย)
--   · ตาราง sale_goal / sale_target → เป้ารายเดือนต่อแบรนด์ (sale_goal มีเวอร์ชัน + งบแอดรายแพลตฟอร์ม)
-- ตัวแปลงอยู่ที่ supabase/functions/_shared/salesFacts.js (factsToDailyRows · goalRowsToSalesGoals)
--
-- ไม่มีตารางใหม่ · RLS และสิทธิ์ของทั้งสองตารางคงเดิม (อ่าน: authenticated · เขียน: service role ผ่าน sales-sync)
-- ค่าเริ่มคงที่ = แก้แค่ metadata ไม่ rewrite ตาราง · check ต้องไล่ตรวจแถวเดิม แต่ทั้งสองตารางยังไม่มีข้อมูลจากท่อนี้

alter table public.business_daily_facts
  add column if not exists leads_new integer not null default 0 check (leads_new >= 0),
  add column if not exists deposit_value numeric(18,4) not null default 0 check (deposit_value >= 0),
  add column if not exists orders_new integer not null default 0 check (orders_new >= 0),
  add column if not exists revenue_new numeric(18,4) not null default 0 check (revenue_new >= 0),
  add column if not exists cash_received numeric(18,4) not null default 0,
  add column if not exists cancelled integer not null default 0 check (cancelled >= 0),
  add column if not exists cancelled_value numeric(18,4) not null default 0 check (cancelled_value >= 0),
  add column if not exists inquiries_by_channel jsonb not null default '{}'::jsonb
    check (jsonb_typeof(inquiries_by_channel) = 'object' and pg_column_size(inquiries_by_channel) < 4096),
  add column if not exists inquiry_filled boolean;

comment on column public.business_daily_facts.leads_new is 'ลีดใหม่ของลูกค้าใหม่ (sale_dashboard_facts kind=lead is_new)';
comment on column public.business_daily_facts.deposit_value is 'มูลค่าดีลที่ได้ออเดอร์/เริ่มออกแบบวันนั้น (kind=won) — deposits คือจำนวน';
comment on column public.business_daily_facts.orders_new is 'ออเดอร์ยืนยันของลูกค้าใหม่ (ใบแรกของลูกค้ารายนั้น)';
comment on column public.business_daily_facts.revenue_new is 'ยอดขายจากลูกค้าใหม่ — ใช้คิด ROAS ลูกค้าใหม่ · gross_revenue คือยอดรวม';
comment on column public.business_daily_facts.cash_received is 'เงินเข้าสุทธิวันนั้น (คืนเงินหักแล้ว) ติดลบได้';
comment on column public.business_daily_facts.cancelled is 'ออเดอร์ที่ยืนยันแล้วถูกยกเลิกวันนั้น — ไม่หักจาก gross_revenue (เป้าของระบบขายวัดจากยอดยืนยันล้วน)';
comment on column public.business_daily_facts.inquiries_by_channel is 'คนทักแยกช่องทางที่ทีมขายกรอก เช่น {"FB": 30, "Line": 12}';
comment on column public.business_daily_facts.inquiry_filled is 'null = แหล่งนี้ไม่รายงาน · false = ทีมยังไม่กรอกวันนั้น (ไม่ใช่ไม่มีคนทัก) · true = กรอกแล้ว';

alter table public.ad_sales_goals
  add column if not exists sales_new_target numeric(18,4),
  add column if not exists sales_old_target numeric(18,4),
  add column if not exists deposits_target numeric(18,4),
  add column if not exists inquiry_target numeric(18,4),
  add column if not exists platform_budgets jsonb not null default '{}'::jsonb
    check (jsonb_typeof(platform_budgets) = 'object' and pg_column_size(platform_budgets) < 2048),
  add column if not exists goal_source text check (goal_source in ('sale_goal', 'sale_target'));

comment on column public.ad_sales_goals.platform_budgets is 'งบแอดรายแพลตฟอร์มจาก sale_goal.ads เช่น {"meta": 70000} — แทนการหารงบแบรนด์เฉลี่ย';
comment on column public.ad_sales_goals.goal_source is 'sale_goal = เป้าแบบใหม่มีเวอร์ชัน · sale_target = แบบเก่า 6 ตัว (version 0 · ไม่มีงบแอด/CPL/ROAS)';

-- ย้อนกลับ:
-- alter table public.business_daily_facts drop column if exists leads_new, drop column if exists deposit_value, drop column if exists orders_new, drop column if exists revenue_new, drop column if exists cash_received, drop column if exists cancelled, drop column if exists cancelled_value, drop column if exists inquiries_by_channel, drop column if exists inquiry_filled;
-- alter table public.ad_sales_goals drop column if exists sales_new_target, drop column if exists sales_old_target, drop column if exists deposits_target, drop column if exists inquiry_target, drop column if exists platform_budgets, drop column if exists goal_source;
