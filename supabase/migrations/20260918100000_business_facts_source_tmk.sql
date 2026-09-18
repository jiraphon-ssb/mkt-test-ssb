-- business_daily_facts: รับ source 'tmk' (ยอดขาย JUNTAKARN จากระบบ TMK Operation)
-- เดิม check จำกัดไว้แค่ crm/pos/shopee/manual → เฟส JK ของ sales-sync จะโดน 23514 ทุกครั้ง (JK_WRITE_FAILED)
-- เพิ่มค่าอย่างเดียว ไม่ลบค่าเดิม ไม่แตะข้อมูลที่มีอยู่ · idempotent
alter table public.business_daily_facts drop constraint if exists business_daily_facts_source_check;
alter table public.business_daily_facts add constraint business_daily_facts_source_check
  check (source in ('crm', 'pos', 'shopee', 'manual', 'tmk'));

-- VERIFY
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'business_daily_facts_source_check';
--   -- ต้องเห็น 'tmk' อยู่ในรายการ
--
-- ROLLBACK (ต้องลบแถว source='tmk' ออกก่อน ไม่งั้น constraint เดิมเพิ่มกลับไม่ได้)
--   delete from public.business_daily_facts where source = 'tmk';
--   alter table public.business_daily_facts drop constraint if exists business_daily_facts_source_check;
--   alter table public.business_daily_facts add constraint business_daily_facts_source_check
--     check (source in ('crm', 'pos', 'shopee', 'manual'));
