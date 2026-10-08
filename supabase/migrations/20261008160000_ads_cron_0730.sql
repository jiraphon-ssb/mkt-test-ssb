-- ย้ายรอบดึงอัตโนมัติจาก 09:00 เป็น 07:30 เวลาไทย (8 ต.ค. 69 — อาร์ตสั่ง)
-- เหตุผล: ข้อมูลทุกแหล่งต้องดึงเสร็จก่อน 08:30 เพราะ 09:00 ต้องส่งรายงาน
-- 07:30 = เวลาเริ่มที่ช้าที่สุดที่รอบเก็บตกสุดท้าย (08:20) ยังจบก่อน 08:30
--   ยิ่งช้ายิ่งดีต่อเหตุผลเดิม (28 ก.ย.): แอดเปิด 07:00–07:30 · ทีมขายกรอกยอดเมื่อวานตอนเช้า
-- 07:30–08:20 ไทย ทุก 10 นาที = 00:30–01:20 UTC — คร่อมชั่วโมง pg_cron จึงต้องเป็น 2 job
-- นิพจน์ต้องตรงกับ DAILY_CRON_EXPRS ใน supabase/functions/_shared/dailySchedule.js (tests/adsMigrations.test.js ตรวจ)
-- รันซ้ำได้: ถอด job เดิมแล้วตั้งใหม่
-- ย้อนกลับ (09:00 แบบเดิม):
--   select cron.unschedule('ads-sync-tick'); select cron.unschedule('ads-sync-tick-2');
--   select cron.schedule('ads-sync-tick', '0,10,20,30,40,50 2 * * *', $$select ads_ops.cron_tick();$$);
--   และคืน DAILY_RUN_HOUR = 9, DAILY_RUN_MINUTE = 0 ในไฟล์ dailySchedule.js แล้ว deploy ads-cron ใหม่
select cron.unschedule('ads-sync-tick') where exists (select 1 from cron.job where jobname = 'ads-sync-tick');
select cron.unschedule('ads-sync-tick-2') where exists (select 1 from cron.job where jobname = 'ads-sync-tick-2');
select cron.schedule('ads-sync-tick', '30,40,50 0 * * *', $$select ads_ops.cron_tick();$$);
select cron.schedule('ads-sync-tick-2', '0,10,20 1 * * *', $$select ads_ops.cron_tick();$$);
