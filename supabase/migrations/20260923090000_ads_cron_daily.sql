-- ดึงอัตโนมัติวันละครั้ง ตี 5 เวลาไทย (23 ก.ย. — อาร์ตสั่ง: ไม่ให้หนักเครื่องฝั่งระบบขาย SSB/TMK และ Meta)
-- เดิม: '7 * * * *' ทุกชั่วโมง · ใหม่: 05:00–05:50 ไทย ทุก 10 นาที (pg_cron ใช้ UTC → 22:xx UTC)
-- รอบ 05:00 ทำงานหลัก · 05:10–05:50 เก็บตกงานที่ไม่ทันเพดานเวลา Edge Function (400 วิ)
-- แต่ละแหล่งถูกดึงได้วันละครั้งตามวันที่ไทย — ads-cron ตัดสินเอง (supabase/functions/_shared/dailySchedule.js)
-- นิพจน์ต้องตรงกับ DAILY_CRON_EXPR ในไฟล์นั้น (tests/adsMigrations.test.js ตรวจ)
-- รันซ้ำได้: ถอด job เดิม (ถ้ามี) แล้วตั้งใหม่ · ย้อนกลับ = ตั้ง '7 * * * *' กลับด้วยคำสั่งเดียวกัน
select cron.unschedule('ads-sync-tick') where exists (select 1 from cron.job where jobname = 'ads-sync-tick');
select cron.schedule('ads-sync-tick', '0,10,20,30,40,50 22 * * *', $$select ads_ops.cron_tick();$$);
