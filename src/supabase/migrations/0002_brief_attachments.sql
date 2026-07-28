-- ============================================================
-- 0002 — ไฟล์แนบบรีฟ + ลิงก์อ้างอิง
-- ไฟล์จริงเก็บใน Supabase Storage bucket (ไม่เก็บ base64 ใน DB)
-- ตารางนี้เก็บแค่ metadata + path/URL
-- ============================================================

create type attachment_type_t as enum (
  'brief_file', 'brief_image', 'reference', 'brand_guideline', 'other'
);

create type link_type_t as enum (
  'website', 'facebook', 'tiktok', 'youtube', 'google_drive', 'figma', 'canva', 'other'
);

-- ---------- ไฟล์แนบ ----------
create table brief_attachments (
  id              uuid primary key default gen_random_uuid(),
  card_id         uuid not null references cards(id) on delete cascade,
  attachment_type attachment_type_t not null default 'brief_file',
  file_name       text not null,
  storage_path    text not null,            -- path ใน bucket 'brief-attachments'
  mime_type       text not null,
  file_size       bigint not null check (file_size > 0),
  caption         text,
  sort_order      int not null default 0,   -- ใช้เรียงรูป
  uploaded_by     uuid not null references profiles(id),
  created_at      timestamptz not null default now()
);
create index brief_attachments_card_idx on brief_attachments(card_id, sort_order);

-- จำกัดขนาด/ประเภทที่ชั้น DB อีกชั้น (UI ตรวจก่อนแล้ว)
alter table brief_attachments
  add constraint attachment_size_limit
  check (
    (mime_type like 'image/%' and file_size <= 8  * 1024 * 1024)
    or (mime_type not like 'image/%' and file_size <= 20 * 1024 * 1024)
  );

-- ---------- ลิงก์อ้างอิง (structured — ไม่ใช่ textarea รวม) ----------
create table brief_reference_links (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references cards(id) on delete cascade,
  title      text not null default '',
  url        text not null,
  link_type  link_type_t not null default 'website',
  note       text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index brief_reference_links_card_idx on brief_reference_links(card_id);

-- URL ต้องเป็น http/https
alter table brief_reference_links
  add constraint link_url_http check (url ~* '^https?://[^\s]+\.[^\s]+');

-- ============================================================
-- RLS — สิทธิ์เดียวกับการแก้การ์ด (Spec ข้อ 2)
-- ============================================================
alter table brief_attachments      enable row level security;
alter table brief_reference_links  enable row level security;

-- อ่านได้ทุกคน (ดูการ์ดทุก brand ได้อยู่แล้ว)
create policy attachments_read on brief_attachments for select using (true);
create policy links_read       on brief_reference_links for select using (true);

-- แก้ได้ถ้าแก้การ์ดใบนั้นได้
create or replace function can_edit_card(p_card uuid) returns boolean as $$
  select exists (
    select 1 from cards c
    where c.id = p_card and (
      my_role() = 'team_lead'
      or c.owner_id = auth.uid()
      or c.brand_id in (select id from brands where default_owner = auth.uid())
    )
  )
$$ language sql stable security definer;

create policy attachments_write on brief_attachments for all
  using (can_edit_card(card_id)) with check (can_edit_card(card_id));

create policy links_write on brief_reference_links for all
  using (can_edit_card(card_id)) with check (can_edit_card(card_id));

-- ============================================================
-- Storage bucket + policy
-- รันใน dashboard หรือผ่าน storage API:
--   bucket: brief-attachments (private)
--   path แนะนำ: {card_id}/{attachment_id}-{file_name}
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('brief-attachments', 'brief-attachments', false)
  on conflict (id) do nothing;

create policy "brief attachments read" on storage.objects for select
  using (bucket_id = 'brief-attachments' and auth.role() = 'authenticated');

create policy "brief attachments write" on storage.objects for insert
  with check (bucket_id = 'brief-attachments' and auth.role() = 'authenticated');

create policy "brief attachments delete" on storage.objects for delete
  using (bucket_id = 'brief-attachments' and auth.role() = 'authenticated');

-- NOTE (demo → จริง):
-- ปัจจุบัน frontend เก็บ object URL ราย session (ไฟล์หายเมื่อ reload)
-- ตอนต่อ Supabase: upload ขึ้น bucket ก่อน → เก็บ storage_path ลงตาราง
-- แล้วอ่านด้วย createSignedUrl() ตอนแสดง/ดาวน์โหลด
