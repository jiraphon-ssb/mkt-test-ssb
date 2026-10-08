-- 0016 — ท่อค่าแอดสำหรับระบบอื่น (SSB PLATFORM ดึงไปทำการ์ดสรุปแอด)
--
-- ทำไมต้องมี view ไม่ให้เขา query ตารางดิบ:
-- ad_daily_facts เก็บหลายระดับ (level) — Meta เขียน 'ad' อย่างเดียว · ค่าแอดที่นำเข้าจากไฟล์เขียน 'account' อย่างเดียว
-- ผู้ใช้ภายนอกที่ไม่รู้กติกานี้จะกรองระดับเดียวแล้วได้ยอดขาดไปเกือบทั้งหมด "โดยไม่ error"
-- (ตรวจจริง 8 ต.ค. 69: กรองเฉพาะ level='account' ได้ ฿436.13 จากทั้งหมด ฿612,587.66 — หาย 99.93%)
-- view นี้รวมทุกระดับให้แล้ว ต่อให้วันหน้าเพิ่มระดับใหม่ ผู้ใช้ปลายทางก็ยังได้ยอดครบ
--
-- security_invoker = on → RLS ของตารางต้นทางยังบังคับใช้ตามปกติ (ไม่เปิดช่องให้ anon อ่านทะลุ)
--
-- rollback:
--   drop view if exists public.ad_spend_daily;

create or replace view public.ad_spend_daily
with (security_invoker = on) as
select
  f.fact_date,
  c.brand_id,
  c.provider,
  c.currency,
  sum(f.spend)                                   as spend,
  sum(f.impressions)                             as impressions,
  sum(f.clicks)                                  as clicks,
  count(distinct c.external_account_id)::integer as accounts,
  max(f.ingested_at)                             as ingested_at
from public.ad_daily_facts f
join public.ad_connections c on c.id = f.connection_id
where f.spend is not null
  and c.status <> 'disabled'
group by f.fact_date, c.brand_id, c.provider, c.currency;

comment on view public.ad_spend_daily is
  'ค่าแอดรายวันต่อแบรนด์ต่อช่องทาง รวมทุก level แล้ว — ทางอ่านทางเดียวสำหรับระบบภายนอก ห้ามให้ query ad_daily_facts ตรง';

grant select on public.ad_spend_daily to authenticated, service_role;
