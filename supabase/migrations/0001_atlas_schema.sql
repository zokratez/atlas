create schema if not exists atlas;

create table atlas.findings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent text not null,
  property text not null check (property in ('store','huh','restaurant','general')),
  claim text not null,
  evidence text,
  source_url text,
  confidence numeric check (confidence between 0 and 1),
  tags text[] default '{}'
);

create table atlas.experiments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  property text not null,
  hypothesis text not null,
  action text not null,
  metric text not null,
  result jsonb,
  verdict text check (verdict in ('keep','kill','blemish')),
  verdict_at timestamptz,
  notes text
);

create table atlas.actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent text not null,
  property text not null,
  kind text not null check (kind in ('post','email','page','outreach','other')),
  channel text,
  payload jsonb not null,
  compliance_status text not null default 'unchecked'
    check (compliance_status in ('unchecked','passed','failed')),
  compliance_notes text,
  status text not null default 'pending'
    check (status in ('pending','approved','killed','published','auto')),
  decided_at timestamptz
);

create table atlas.results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  property text not null,
  source text not null,          -- stripe|allaypay|tiktok|plausible|manual
  metric text not null,
  value numeric not null,
  period_start date,
  period_end date,
  raw jsonb
);

create table atlas.costs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent text not null,
  provider text not null,
  tokens_in int,
  tokens_out int,
  usd numeric(10,4) not null
);

create table atlas.decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action_id uuid references atlas.actions(id),
  decision text not null check (decision in ('approve','kill','edit')),
  reason text
);

create table atlas.flags (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into atlas.flags (key, value) values
  ('engine_enabled', 'false'::jsonb),
  ('daily_cost_cap_usd', '5'::jsonb);

alter table atlas.findings enable row level security;
alter table atlas.experiments enable row level security;
alter table atlas.actions enable row level security;
alter table atlas.results enable row level security;
alter table atlas.costs enable row level security;
alter table atlas.decisions enable row level security;
alter table atlas.flags enable row level security;
-- No policies created: service_role only. Anon/authenticated get nothing.
