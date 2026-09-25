-- 0014 · สถานะเปิด/ปิดของโฆษณา (effective_status ของ Meta) — ตารางครีเอทีฟบอกว่าโฆษณา/แคมเปญเปิดหรือปิด (25 ก.ย. 69)
-- ads-creatives เขียนค่านี้ทุกรอบรีเฟรช (วันละครั้งตี 5) · null = ยังไม่เคยดึงหลังเพิ่มคอลัมน์ → หน้าจอขึ้น "ไม่ทราบสถานะ" ไม่เดา
-- ลำดับ deploy: รัน migration นี้ก่อน → deploy ads-creatives → ค่อยปล่อยหน้าเว็บ (หน้าเว็บ select คอลัมน์นี้ ไม่มีคอลัมน์ = โหลดครีเอทีฟพัง)
-- รันซ้ำได้ · ย้อนกลับ: alter table public.ad_creatives drop column if exists effective_status;
alter table public.ad_creatives add column if not exists effective_status text;

do $$ begin
  alter table public.ad_creatives add constraint ad_creatives_effective_status_shape
    check (effective_status is null or effective_status ~ '^[A-Z_]{1,40}$');
exception when duplicate_object then null; end $$;
