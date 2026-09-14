-- Meta OAuth credentials and the ad accounts visible to each authorization.
-- These tables are service-role only: browser clients never receive token data.

create table ad_provider_authorizations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta','google','tiktok','shopee')),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_user_id text not null,
  provider_user_name text not null default '',
  token_ciphertext text not null,
  token_iv text not null,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected','expired','revoked','error')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,user_id,provider_user_id)
);

create table ad_authorized_accounts (
  authorization_id uuid not null references ad_provider_authorizations(id) on delete cascade,
  external_account_id text not null,
  account_name text not null default '',
  account_status integer,
  currency text,
  timezone text,
  business_id text,
  discovered_at timestamptz not null default now(),
  primary key(authorization_id,external_account_id)
);

create table ad_oauth_states (
  state_hash text primary key,
  provider text not null check (provider in ('meta','google','tiktok','shopee')),
  user_id uuid not null references auth.users(id) on delete cascade,
  return_to text not null default '/mkt/ads?panel=settings',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index ad_authorizations_user_idx on ad_provider_authorizations(user_id,provider,status);
create index ad_oauth_states_expiry_idx on ad_oauth_states(expires_at);

create trigger ad_provider_authorizations_touch before update on ad_provider_authorizations
  for each row execute function touch_updated_at();

alter table ad_provider_authorizations enable row level security;
alter table ad_authorized_accounts enable row level security;
alter table ad_oauth_states enable row level security;

-- Deliberately no client policies. OAuth Edge Functions use service_role and expose
-- only safe status/account metadata; encrypted tokens never leave the backend.
