-- 0017 — ad_spend_daily: กันนับซ้ำข้ามระดับ + ไม่ทิ้งค่าแอดย้อนหลังของบัญชีที่ปิด
-- (ฝั่ง SSB PLATFORM ทักท้วง 8 ต.ค. 69 — ถูกทั้งสองข้อ)
--
-- 1) 0016 บวกทุก level ตรงๆ ปลอดภัยเฉพาะตอนที่บัญชีหนึ่งเขียนระดับเดียว ซึ่งเป็นแค่ความบังเอิญของวันนี้
--    ถ้าบัญชี×วันเดียวกันมีทั้ง campaign และ ad ยอดจะเป็นสองเท่า
--    → ต่อบัญชี×วัน ใช้ระดับเดียว: account > campaign > ad_group > ad (ระดับบนคือยอดรวม ระดับล่างคือรายละเอียดของยอดเดียวกัน)
--    แถวที่ไม่รู้ค่าแอด (null) ไม่เข้าแข่ง — ระดับบนว่างแต่ระดับล่างมียอด ให้ใช้ระดับล่าง
-- 2) 0016 กรอง status <> 'disabled' → ปิดบัญชีวันไหน ค่าแอดที่จ่ายไปแล้วหายย้อนหลังทั้งหมด
--    เงินที่จ่ายไปแล้วคือจ่ายไปแล้ว สถานะการเชื่อมต่อวันนี้ไม่ควรแก้ประวัติ
--
-- คอลัมน์ ชื่อ ลำดับ ชนิด เท่าเดิมทุกตัว — ผู้ใช้เดิมไม่ต้องแก้อะไร
-- rollback: รัน create or replace view จาก 0016 ซ้ำ

create or replace view public.ad_spend_daily
with (security_invoker = on) as
with ranked as (
  select
    f.connection_id, f.fact_date, f.spend, f.impressions, f.clicks, f.ingested_at,
    case f.level when 'account' then 1 when 'campaign' then 2 when 'ad_group' then 3 else 4 end as level_rank,
    min(case f.level when 'account' then 1 when 'campaign' then 2 when 'ad_group' then 3 else 4 end)
      over (partition by f.connection_id, f.fact_date) as best_rank
  from public.ad_daily_facts f
  where f.spend is not null
)
select
  r.fact_date,
  c.brand_id,
  c.provider,
  c.currency,
  sum(r.spend)                                   as spend,
  sum(r.impressions)                             as impressions,
  sum(r.clicks)                                  as clicks,
  count(distinct c.external_account_id)::integer as accounts,
  max(r.ingested_at)                             as ingested_at
from ranked r
join public.ad_connections c on c.id = r.connection_id
where r.level_rank = r.best_rank
group by r.fact_date, c.brand_id, c.provider, c.currency;

grant select on public.ad_spend_daily to authenticated, service_role;
