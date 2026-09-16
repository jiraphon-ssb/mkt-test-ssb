-- เป้ารายเดือนต่อแบรนด์ที่ดึงมาจากระบบขาย (เฟส 3) — หน้า ads อ่านอย่างเดียว เขียนได้เฉพาะ sales-sync (service role)
-- เป้าที่ตั้งในหน้าตั้งค่าของ ads ยังอยู่ตามเดิม ใช้เป็นตัวสำรองเมื่อแบรนด์นั้นยังไม่มีเป้าในระบบขาย
create table if not exists public.ad_sales_goals (
  brand_id      text not null references public.mkt_brand(id) on delete cascade,
  month         date not null,
  version       integer not null default 1 check (version >= 0),
  sales_target  numeric(18,4),
  ad_budget     numeric(18,4),
  cpl           numeric(18,4),
  cac           numeric(18,4),
  roas          numeric(12,4),
  leads_target  numeric(18,4),
  orders_target numeric(18,4),
  synced_at     timestamptz not null default now(),
  primary key (brand_id, month)
);

create index if not exists ad_sales_goals_month_idx on public.ad_sales_goals(month desc);

alter table public.ad_sales_goals enable row level security;
drop policy if exists ad_sales_goals_read on public.ad_sales_goals;
create policy ad_sales_goals_read on public.ad_sales_goals for select to authenticated using (true);
revoke insert, update, delete on public.ad_sales_goals from anon, authenticated;
