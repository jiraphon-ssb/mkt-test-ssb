-- Rollback สำหรับ 0005_ads_data · 0006_ad_creatives · 0007_meta_oauth · 0008_harden_mkt_save_state (รันย้อนลำดับ)
-- ใช้เมื่อ push แล้วต้องถอนออก — ไม่แตะตาราง mkt_* เดิม ยกเว้นคอลัมน์/trigger ที่ 0005 เพิ่ม และ wrapper ที่ 0008 ครอบ
-- ตรวจก่อนรัน: ตารางเหล่านี้ยังไม่มีข้อมูลจริงที่ต้องเก็บ (ขั้น Pilot ข้อมูลอยู่ใน mock)

begin;

-- 0008: คืน mkt_save_state ของเดิม (SECURITY DEFINER เปิดให้ anon เหมือน baseline — ระวัง: เปิดช่องโหว่ H3 กลับมา)
drop function if exists mkt_save_state(jsonb);
alter function mkt_save_state_raw(jsonb) rename to mkt_save_state;
grant execute on function mkt_save_state(jsonb) to anon, authenticated;
grant execute on function mkt_load_state() to anon, authenticated;

-- 0007
drop table if exists ad_oauth_states;
drop table if exists ad_authorized_accounts;
drop table if exists ad_provider_authorizations;

-- 0006
alter table if exists ad_daily_facts drop column if exists creative_id;
drop table if exists ad_creatives;

-- 0005 (ตาราง)
drop table if exists ad_rules;
drop table if exists ad_targets;
drop table if exists business_daily_facts;
drop table if exists ad_daily_facts;
drop table if exists ad_sync_runs;
drop table if exists ad_connections;

-- 0005 (สะพานสิทธิ์บน mkt_profile)
drop function if exists mkt_is_team_lead();
drop trigger if exists mkt_profile_guard_privileges on mkt_profile;
drop function if exists mkt_guard_profile_privileges();
alter table mkt_profile drop column if exists auth_user_id;
-- touch_updated_at() ปล่อยไว้ได้ (generic, ไม่มีผลข้างเคียง) — ถ้าต้องการลบ: drop function if exists touch_updated_at();

commit;

-- หลัง rollback: mark ทั้ง 4 เวอร์ชันว่า reverted ไม่งั้น db push รอบถัดไปจะข้ามไฟล์
--   supabase migration repair --status reverted 20260914072735 20260914072204 20260914072202 20260914072200
