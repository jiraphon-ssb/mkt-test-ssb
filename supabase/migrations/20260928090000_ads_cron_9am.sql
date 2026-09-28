-- ย้ายรอบดึงอัตโนมัติจากตี 5 เป็น 09:00 เวลาไทย (28 ก.ย. — อาร์ตสั่ง)
-- เหตุผล: แอดของทีมเปิดช่วง 07:00–07:30 ดึงตี 5 สถานะโฆษณาเป็น "ปิดอยู่" ทุกแถว · ทีมขายกรอกยอดเมื่อวานตอนเช้า ดึง 9 โมงได้ข้อมูลครบกว่า
-- 09:00–09:50 ไทย ทุก 10 นาที = 02:00–02:50 UTC (pg_cron ใช้ UTC) · รอบ 09:00 ทำงานหลัก · 09:10–09:50 เก็บตกงานที่ไม่ทันเพดาน Edge Function
-- นิพจน์ต้องตรงกับ DAILY_CRON_EXPR ใน supabase/functions/_shared/dailySchedule.js (tests/adsMigrations.test.js ตรวจ)
-- รันซ้ำได้: ถอด job เดิมแล้วตั้งใหม่
-- ย้อนกลับ (ตี 5 แบบเดิม): select cron.unschedule('ads-sync-tick'); select cron.schedule('ads-sync-tick', '0,10,20,30,40,50 22 * * *', $$select ads_ops.cron_tick();$$);
--   และคืน DAILY_RUN_HOUR = 5 ในไฟล์ dailySchedule.js แล้ว deploy ads-cron ใหม่
select cron.unschedule('ads-sync-tick') where exists (select 1 from cron.job where jobname = 'ads-sync-tick');
select cron.schedule('ads-sync-tick', '0,10,20,30,40,50 2 * * *', $$select ads_ops.cron_tick();$$);
