-- Ads data foundation: connections, normalized facts, targets, rules and sync audit.
-- Provider access tokens are deliberately absent. Edge Functions must keep encrypted
-- credentials in server-side secrets or a dedicated vault.

create table ad_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta','google','tiktok','shopee')),
  brand_id uuid not null references brands(id) on delete cascade,
  external_account_id text not null,
  account_name text not null default '',
  currency text not null default 'THB' check (length(currency) = 3),
  timezone text not null default 'Asia/Bangkok',
  status text not null default 'pending' check (status in ('pending','connected','expired','error','disabled')),
  config jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_account_id)
);

create table ad_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references ad_connections(id) on delete cascade,
  mode text not null check (mode in ('incremental','backfill','reconcile')),
  range_from date,
  range_to date,
  status text not null check (status in ('queued','running','success','partial','failed')),
  rows_read integer not null default 0,
  rows_written integer not null default 0,
  error_code text,
  error_detail text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table ad_daily_facts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references ad_connections(id) on delete cascade,
  fact_date date not null,
  level text not null default 'account' check (level in ('account','campaign','ad_group','ad')),
  campaign_id text not null default '',
  campaign_name text not null default '',
  ad_group_id text not null default '',
  ad_group_name text not null default '',
  ad_id text not null default '',
  ad_name text not null default '',
  spend numeric(18,4),
  reach bigint,
  impressions bigint,
  clicks bigint,
  leads numeric(18,4),
  attributed_conversions numeric(18,4),
  attributed_value numeric(18,4),
  attribution_window text,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  unique(connection_id, fact_date, level, campaign_id, ad_group_id, ad_id)
);

create index ad_daily_facts_date_idx on ad_daily_facts(fact_date);
create index ad_daily_facts_connection_idx on ad_daily_facts(connection_id, fact_date);

create table business_daily_facts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  fact_date date not null,
  source text not null check (source in ('crm','pos','shopee','manual')),
  external_record_id text not null,
  inquiries integer not null default 0,
  qualified_leads integer not null default 0,
  deposits integer not null default 0,
  orders integer not null default 0,
  gross_revenue numeric(18,4) not null default 0,
  refunds numeric(18,4) not null default 0,
  net_revenue numeric(18,4) generated always as (gross_revenue - refunds) stored,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  unique(source, external_record_id)
);

create table ad_targets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  target_month date not null check (target_month = date_trunc('month', target_month)::date),
  revenue_target numeric(18,4) not null default 0,
  spend_budget numeric(18,4) not null default 0,
  min_roas numeric(10,4),
  max_ads_percent numeric(10,4),
  max_cpl numeric(18,4),
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  unique(brand_id, target_month)
);

create table ad_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  rule_key text not null,
  threshold numeric(18,4) not null,
  window_size integer,
  enabled boolean not null default true,
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create unique index ad_rules_scope_key_uidx
  on ad_rules(coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), rule_key);

create trigger ad_connections_touch before update on ad_connections
  for each row execute function touch_updated_at();

alter table ad_connections enable row level security;
alter table ad_sync_runs enable row level security;
alter table ad_daily_facts enable row level security;
alter table business_daily_facts enable row level security;
alter table ad_targets enable row level security;
alter table ad_rules enable row level security;

create policy ads_connections_read on ad_connections for select using (true);
create policy ads_connections_admin on ad_connections for all using (my_role() = 'team_lead') with check (my_role() = 'team_lead');
create policy ads_sync_read on ad_sync_runs for select using (true);
create policy ads_facts_read on ad_daily_facts for select using (true);
create policy business_facts_read on business_daily_facts for select using (true);
create policy ads_targets_read on ad_targets for select using (true);
create policy ads_targets_admin on ad_targets for all using (my_role() = 'team_lead') with check (my_role() = 'team_lead');
create policy ads_rules_read on ad_rules for select using (true);
create policy ads_rules_admin on ad_rules for all using (my_role() = 'team_lead') with check (my_role() = 'team_lead');

-- ad_daily_facts, business_daily_facts and ad_sync_runs are written by service-role
-- Edge Functions only. There is intentionally no authenticated-client write policy.
