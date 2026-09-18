-- ============================================================
-- ad_sales_goal_overrides: เพิ่มช่อง "เป้ายอดลูกค้าใหม่" ให้ตั้งเองได้
-- เหตุผล: หน้า Overview มีปุ่มสลับ "ยอดรวม / ยอดใหม่" — โหมดยอดใหม่เทียบกับ sales_new_target
--   ซึ่งมาจากระบบขายอย่างเดียว ตั้งเองไม่ได้ → คนตั้งเป้ายอดขายเองแล้วสลับไปโหมดยอดใหม่
--   จะเห็นเป้าเด้งกลับไปเป็นของระบบขายเงียบๆ (รีวิว 18 ก.ย. 69 ข้อ 3)
-- เพิ่มคอลัมน์เดียว ไม่แตะข้อมูลเดิม · null = ไม่ได้แก้ช่องนี้ (กติกาเดียวกับช่องอื่น) · idempotent
-- ============================================================
alter table public.ad_sales_goal_overrides
  add column if not exists sales_new_target numeric(18,4);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ad_sales_goal_overrides'::regclass
      and conname = 'ad_sales_goal_overrides_sales_new_target_check'
  ) then
    alter table public.ad_sales_goal_overrides
      add constraint ad_sales_goal_overrides_sales_new_target_check
      check (sales_new_target is null or sales_new_target >= 0);
  end if;
end $$;

comment on column public.ad_sales_goal_overrides.sales_new_target is
  'เป้ายอดลูกค้าใหม่ของเดือน — ใช้ตอนหน้า Overview อยู่โหมด "ยอดใหม่" (คู่กับ ad_sales_goals.sales_new_target)';

-- ============================================================
-- VERIFY
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_name = 'ad_sales_goal_overrides' and column_name = 'sales_new_target';
--   -- ต้องได้ numeric · YES
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.ad_sales_goal_overrides'::regclass and conname like '%sales_new_target%';
--
-- ROLLBACK (ค่าที่คนตั้งไว้ในช่องนี้หายถาวร — สำรองก่อนถ้ามีคนใช้แล้ว)
--   alter table public.ad_sales_goal_overrides drop column if exists sales_new_target;
-- ============================================================
