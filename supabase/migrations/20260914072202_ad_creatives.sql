-- Creative metadata for read-only ad review. Media binaries and access tokens are
-- deliberately not stored here; connector workers refresh expiring Meta URLs.

create table ad_creatives (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references ad_connections(id) on delete cascade,
  provider text not null check (provider in ('meta','google','tiktok','shopee')),
  external_creative_id text not null,
  external_ad_id text not null default '',
  campaign_id text not null default '',
  ad_group_id text not null default '',
  name text not null default '',
  format text not null default 'unknown' check (format in ('image','video','carousel','dynamic','catalog','unknown')),
  primary_text text,
  headline text,
  description text,
  call_to_action text,
  destination_url text,
  permalink_url text,
  preview_url text,
  effective_story_id text,
  instagram_media_id text,
  media_assets jsonb not null default '[]'::jsonb check (jsonb_typeof(media_assets) = 'array'),
  source_spec jsonb not null default '{}'::jsonb check (jsonb_typeof(source_spec) = 'object'),
  source_updated_at timestamptz,
  media_refreshed_at timestamptz,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, external_creative_id, external_ad_id)
);

alter table ad_daily_facts add column creative_id text not null default '';

create index ad_creatives_connection_idx on ad_creatives(connection_id, external_ad_id);
create index ad_creatives_campaign_idx on ad_creatives(connection_id, campaign_id);
create index ad_daily_facts_creative_idx on ad_daily_facts(connection_id, creative_id, fact_date);

create trigger ad_creatives_touch before update on ad_creatives
  for each row execute function touch_updated_at();

alter table ad_creatives enable row level security;
create policy ads_creatives_read on ad_creatives for select to authenticated using (true);

-- Writes stay service-role only, matching ad_daily_facts and ad_sync_runs.
