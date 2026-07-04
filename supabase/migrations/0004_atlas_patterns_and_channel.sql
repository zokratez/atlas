alter table atlas.findings
  add column if not exists channel text default 'general';

update atlas.findings
set channel = 'general'
where channel is null;

create table if not exists atlas.patterns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  property text not null,
  channel text not null default 'general',
  name text not null,
  description text,
  support_count int not null default 0,
  source_finding_ids uuid[] not null default '{}',
  confidence numeric check (confidence between 0 and 1),
  status text not null default 'emerging'
    check (status in ('emerging','validated','fading','busted'))
);

alter table atlas.patterns enable row level security;
-- No policies created: service_role only. Anon/authenticated get nothing.

create index if not exists atlas_patterns_property_channel_idx
  on atlas.patterns (property, channel, support_count desc);

create index if not exists atlas_findings_channel_idx
  on atlas.findings (channel);

grant all privileges on atlas.patterns to service_role;
