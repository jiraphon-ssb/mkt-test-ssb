-- 0012 — ยอดค่าแอดรายเดือนต่อบัญชี (ทำให้ "เงินออกนอกระบบ" ใช้งานได้จริง · B1 22 ก.ย. 69)
-- ปัญหาที่แก้: บัญชีที่ยังไม่ได้เชื่อมเข้าระบบไม่มีแถวใน ad_daily_facts เลย จึงไม่รู้ว่าใช้เงินไปเท่าไร
-- ของเดิมออกแบบไว้เทียบส่วนต่างของ amount_spent (ยอดสะสมตลอดชีพ) ระหว่าง snapshot สองรอบ
-- แต่ตารางเก็บแถวเดียวต่อบัญชีแบบ upsert = ไม่มีค่าก่อนหน้าให้เทียบ ป้ายเตือนจึงไม่มีวันขึ้น
-- ทางแก้: ถาม Meta ตรงๆ ด้วย insights ระดับบัญชี แล้วเก็บเป็น map เดือน → สตางค์
-- เก็บเป็น jsonb ในแถวเดิม (ไม่ตั้งตารางใหม่): อ่านทีเดียวพร้อม snapshot อยู่แล้ว · 8 บัญชี × 12 เดือน = เล็กมาก
-- rollback: alter table ad_account_snapshots drop column if exists month_spend;

alter table ad_account_snapshots
  add column if not exists month_spend jsonb not null default '{}'::jsonb;

do $$ begin
  alter table ad_account_snapshots
    add constraint ad_account_snapshots_month_spend_shape
    check (jsonb_typeof(month_spend) = 'object' and pg_column_size(month_spend) < 20000);
exception when duplicate_object then null; end $$;
