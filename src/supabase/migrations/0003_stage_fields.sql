-- ============================================================
-- 0003 — ปิด schema drift: ฟิลด์ที่ UI ใช้แล้วแต่ยังไม่มีใน DB
--         + เปิดตัวเลขผลงานให้ Dashboard (Spec ข้อ 7)
-- ที่มา: audit เทียบ types.ts กับ 0001/0002 เจอ 7 ฟิลด์ที่ยังไม่ลง schema
-- ============================================================

-- ---------- ขั้น 1 Idea: Owner ยืนยันว่าอยู่ในแผน/คุ้มทำ ----------
-- SOP: "ไอเดียนี้อยู่ใน Monthly Plan หรือ Owner เห็นว่าคุ้มทำ" — คนติ๊ก ไม่ผ่านอัตโนมัติ
alter table cards add column if not exists plan_confirmed boolean not null default false;

-- ---------- ข้อมูลทั่วไปของการ์ด ----------
alter table cards add column if not exists description text;

-- สมาชิกที่ร่วม — array ของ profiles.id
alter table cards add column if not exists members uuid[] not null default '{}';

-- ---------- ขั้น 5 Scheduled ----------
-- ช่องทางที่ "ตั้งเวลาในเครื่องมือจริงแล้ว" (ต้องครบตาม brief.channels ก่อนไป Published)
alter table cards add column if not exists scheduled_channels text[] not null default '{}';

-- ---------- ขั้น 6 Published ----------
alter table cards add column if not exists post_link text;
-- {live_ok, comments_handled} — ยืนยันขึ้นจริง + ดูแลคอมเมนต์ 24 ชม.แรก
alter table cards add column if not exists published_checks jsonb not null default '{}'::jsonb;

-- ---------- ขั้น 7 Measured ----------
-- {reach, engagement, leads, spend, cpl, measured_at}
-- นิยามล็อกตาม Report Template กลาง (SOP: ทุก brand มาตรฐานเดียวกัน)
alter table cards add column if not exists metrics jsonb;

-- ตัวเลขต้องไม่ติดลบ
alter table cards drop constraint if exists metrics_non_negative;
alter table cards add constraint metrics_non_negative check (
  metrics is null or (
    coalesce((metrics->>'reach')::numeric, 0) >= 0
    and coalesce((metrics->>'engagement')::numeric, 0) >= 0
    and coalesce((metrics->>'leads')::numeric, 0) >= 0
    and coalesce((metrics->>'spend')::numeric, 0) >= 0
    and coalesce((metrics->>'cpl')::numeric, 0) >= 0
  )
);

create index if not exists cards_measured_idx on cards ((metrics->>'measured_at'))
  where metrics is not null;

-- ============================================================
-- Audit: การ "ปิดงาน/เก็บเข้ากรุ" ก็ต้องมีร่องรอย (Spec ข้อ 8)
-- convention: from_status = to_status = สเตจเดิม → แปลว่าปิดงาน ไม่ใช่ย้ายขั้น
-- ไม่ต้องแก้ schema — status_history รองรับอยู่แล้ว
-- ============================================================

-- ============================================================
-- Spec ข้อ 7 — view ส่งข้อมูลให้ Dashboard (posts_raw)
-- เดิม 0001 ส่งแค่ metadata · ตอนนี้เพิ่มตัวเลขผลงาน + ER ที่คำนวณให้แล้ว
-- ============================================================
drop view if exists posts_measured;

create view posts_measured as
  select
    c.id,
    c.brand_id,
    b.name                                   as brand_name,
    c.status,
    c.track,
    c.pillar,
    c.is_realtime,
    (c.brief->>'publish_at')::timestamptz    as post_date,
    c.brief->'channels'                      as channels,
    c.brief->>'format'                       as format,
    c.post_link,
    (c.metrics->>'reach')::numeric           as reach,
    (c.metrics->>'engagement')::numeric      as engagement,
    (c.metrics->>'leads')::numeric           as leads,
    (c.metrics->>'spend')::numeric           as spend,
    (c.metrics->>'cpl')::numeric             as cpl,
    -- ER = engagement / reach (กันหารศูนย์)
    case
      when coalesce((c.metrics->>'reach')::numeric, 0) > 0
      then (c.metrics->>'engagement')::numeric / (c.metrics->>'reach')::numeric
    end                                      as engagement_rate,
    (c.metrics->>'measured_at')::timestamptz as measured_at,
    c.archived
  from cards c
  join brands b on b.id = c.brand_id
  where c.status in ('measured', 'done')
    and c.metrics is not null;

-- ป้ายผล 🟢🟡🔴 ไม่เก็บใน DB — คำนวณสดเทียบค่าเฉลี่ย brand ตามสูตร SOP
-- (เกินค่าเฉลี่ย = เขียว · ตามค่าเฉลี่ย = เหลือง · ต่ำกว่าครึ่ง = แดง)
create view brand_er_baseline as
  select brand_id, avg(engagement_rate) as avg_er, count(*) as measured_count
  from posts_measured
  where engagement_rate is not null
  group by brand_id;

-- NOTE (demo → จริง):
-- ฝั่ง demo คำนวณ ER/ป้ายผลใน src/domain/rules.ts (engagementRate, brandAverageER, resultLabel)
-- ตอนย้ายขึ้น Supabase ให้ Dashboard อ่านจาก 2 view นี้แทน เพื่อไม่ให้สูตรแตกเป็น 2 ที่
