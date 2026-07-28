-- ============================================================
-- 0004 — ตามระบบให้ทัน UI รุ่นปัจจุบัน (ก.ค. 2026)
--   1) 3 ขั้นท้ายเดิน "รายช่องทาง" (channel_runs) — งานใบเดียวลงหลายช่อง
--      ตั้งเวลา/ขึ้นจริง/เก็บตัวเลข แยกกันต่อช่องทาง แล้ว rollup เป็นยอดการ์ด
--   2) โน้ตประจำการ์ด (card_notes) — คุยงาน/ตีกลับ/แนบรูป อยู่กับการ์ด
--   3) ไฟล์แนบรุ่นใหม่ — ชนิดเพิ่ม + ผูกกับช่องทาง/โน้ตได้
-- ที่มา: เดโมเก็บ channel_runs เป็น json ในการ์ด — ของจริงแยกตาราง
--        เพื่อ query ตัวเลขรายช่องทาง/รายแพลตฟอร์มได้ตรงๆ
-- ============================================================

-- ---------- 1) รายช่องทางของ 3 ขั้นท้าย ----------
create table if not exists channel_runs (
  id            bigint generated always as identity primary key,
  card_id       text not null references cards(id) on delete cascade,
  channel       text not null,                        -- "Facebook" / "TikTok" / ...
  kind          text not null default 'social',       -- facebook|tiktok|line_oa|ig|youtube|social (นิยามที่ mktRules.channelKindOf)
  -- Scheduled: ตั้งเวลาในเครื่องมือจริงแล้ว
  scheduled_at  timestamptz,
  tool          text,                                 -- เครื่องมือที่ใช้ตั้ง (มาจาก settings.scheduler_tools)
  schedule_ref  text,                                 -- ลิงก์/รหัสโพสต์ในเครื่องมือ
  -- Published: ขึ้นจริง + ดูแลคอมเมนต์ 24 ชม.แรก
  post_url      text,
  live_ok       boolean not null default false,
  comments_handled boolean not null default false,
  -- Measured: ตัวเลขคนละชุดตามชนิดช่องทาง (นิยามที่ mktRules.runMetricFields)
  metrics       jsonb,
  measured_at   timestamptz,
  unique (card_id, channel)
);
create index if not exists channel_runs_card_idx on channel_runs (card_id);

-- ยอดการ์ด = ผลรวมทุกช่องทาง (สูตรเดียวกับ mktRules.rollupCardMetrics — อย่าให้แตกเป็น 2 ที่)
create or replace view card_metrics_rollup as
  select
    card_id,
    sum((metrics->>'reach')::numeric)      as reach,
    sum((metrics->>'engagement')::numeric) as engagement,
    sum((metrics->>'leads')::numeric)      as leads,
    sum((metrics->>'spend')::numeric)      as spend,
    max(measured_at)                       as measured_at,
    count(*) filter (where metrics is not null) as measured_channels,
    count(*)                               as total_channels
  from channel_runs
  group by card_id;

-- 0003 เคยใช้คอลัมน์ระดับการ์ด — ถูกแทนด้วย channel_runs แล้ว
-- (scheduled_channels / post_link / published_checks) ปล่อยว่างไว้ก่อน อย่าเพิ่ง drop
-- จนกว่าจะ backfill ข้อมูลเก่าเข้า channel_runs เสร็จ

-- ---------- 2) โน้ตประจำการ์ด ----------
create table if not exists card_notes (
  id         text primary key,                        -- gen ฝั่ง server (pattern เดียวกับรหัสการ์ด)
  card_id    text not null references cards(id) on delete cascade,
  stage      text not null,                           -- ขั้นที่จดโน้ต (idea..measured)
  kind       text not null default 'note'
             check (kind in ('note', 'reject')),      -- reject = สร้างอัตโนมัติจาก RPC ตีกลับ
  body       text not null default '',
  author_id  uuid not null references profiles(id),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists card_notes_card_idx on card_notes (card_id, pinned desc, created_at desc);

-- กติกาที่บังคับใน RPC (ไม่ใช่ trigger — ให้เหมือนกติกา review เดิม):
--   mkt_review_reject  → insert card_notes (kind='reject', pinned=true) ในทรานแซกชันเดียวกัน
--   mkt_review_approve → update card_notes set pinned=false where kind='reject' (แก้จบแล้ว)
--   แก้/ลบโน้ตได้เฉพาะ author ตัวเอง (kind='note' เท่านั้น — โน้ตตีกลับแก้ไม่ได้)

-- ---------- 3) ไฟล์แนบรุ่นใหม่ ----------
-- ชนิดที่เพิ่มหลัง 0002: งานจริงขั้น Draft + หลักฐานรายช่องทาง + รูปในโน้ต
alter type attachment_type_t add value if not exists 'draft_work';
alter type attachment_type_t add value if not exists 'schedule_proof';
alter type attachment_type_t add value if not exists 'live_proof';
alter type attachment_type_t add value if not exists 'insight_proof';
alter type attachment_type_t add value if not exists 'note_image';

-- ผูกไฟล์กับช่องทาง (หลักฐาน 3 ขั้นท้าย) หรือกับโน้ต (รูปในโน้ต)
alter table brief_attachments add column if not exists channel text;
alter table brief_attachments add column if not exists note_id text references card_notes(id) on delete cascade;
create index if not exists brief_attachments_note_idx on brief_attachments (note_id) where note_id is not null;

-- ---------- RLS (pattern เดิมของ 0002) ----------
alter table channel_runs enable row level security;
alter table card_notes   enable row level security;
-- อ่าน: ทุกคนที่เห็นการ์ด · เขียน: ผ่าน SECURITY DEFINER RPC เท่านั้น
create policy channel_runs_read on channel_runs for select using (can_view_card(card_id));
create policy card_notes_read   on card_notes   for select using (can_view_card(card_id));

-- NOTE (demo → จริง):
-- เดโมเก็บ channel_runs ใน cards.channel_runs (json) และโน้ตใน localStorage key card_notes
-- ตอนย้าย: mktRules.channelRuns() คือจุดอ่านจุดเดียว — เปลี่ยนให้อ่านจากตารางนี้แทน
