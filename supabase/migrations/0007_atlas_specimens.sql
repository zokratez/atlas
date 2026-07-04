create table if not exists atlas.specimens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  platform text,
  account_handle text,
  post_url text,
  property text,
  channel text,
  format text,
  observed_metrics jsonb,
  observed_at timestamptz,
  comment_sentiment text,
  mechanics text[] default '{}',
  dissection text,
  engagement_ratios jsonb,
  authenticity text check (authenticity in ('high','medium','low','unknown')) default 'unknown',
  authenticity_reason text,
  intake_id uuid,
  pattern_ids uuid[] default '{}'
);

alter table atlas.specimens enable row level security;
-- No policies created: service_role only. Anon/authenticated get nothing.

create index if not exists atlas_specimens_property_channel_idx
  on atlas.specimens (property, channel, created_at desc);

create index if not exists atlas_specimens_observed_at_idx
  on atlas.specimens (observed_at desc);

grant all privileges on atlas.specimens to service_role;
