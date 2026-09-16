-- ดึง Meta อัตโนมัติ: pg_cron ยิง Edge Function ads-cron ทุกชั่วโมง (ตัว function เช็คเองว่าบัญชีไหนถึงรอบตาม "ดึงทุก X ชั่วโมง")
-- ความลับอยู่ใน Vault ไม่ได้ฝังใน migration — ต้องสร้าง 2 ค่านี้ก่อน job จะทำงาน:
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/ads-cron', 'ads_cron_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'ads_cron_key');
-- ยังไม่มีค่าใน Vault = tick ข้ามเงียบๆ (ไม่ error ไม่ยิงมั่ว)
create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists ads_ops;
revoke all on schema ads_ops from public, anon, authenticated;

create or replace function ads_ops.cron_tick()
returns bigint
language plpgsql
security definer
set search_path = ads_ops, vault, net, public
as $$
declare
  fn_url text;
  fn_key text;
  request_id bigint;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'ads_cron_url';
  select decrypted_secret into fn_key from vault.decrypted_secrets where name = 'ads_cron_key';
  if fn_url is null or fn_key is null then
    raise notice 'ads_ops.cron_tick: ยังไม่มี ads_cron_url/ads_cron_key ใน Vault — ข้ามรอบนี้';
    return null;
  end if;
  select net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || fn_key),
    body := jsonb_build_object('source', 'pg_cron', 'at', now()),
    timeout_milliseconds := 280000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function ads_ops.cron_tick() from public, anon, authenticated;

-- ทุกชั่วโมงที่นาทีที่ 7 (เลี่ยงนาทีศูนย์ที่ระบบอื่นชอบยิงพร้อมกัน) — ตัว Edge Function เป็นคนกรองว่าถึงรอบจริงไหม
select cron.unschedule('ads-sync-tick') where exists (select 1 from cron.job where jobname = 'ads-sync-tick');
select cron.schedule('ads-sync-tick', '7 * * * *', $$select ads_ops.cron_tick();$$);
