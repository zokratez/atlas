create table if not exists atlas.operators (
  email text primary key,
  name text,
  role text not null default 'curator'
    check (role in ('owner','curator','viewer')),
  added_at timestamptz not null default now()
);

alter table atlas.operators enable row level security;
-- No policies created: service_role routes only. Anon/authenticated get nothing.

insert into atlas.operators (email, name, role)
values
  ('sam@pacopeptide.com', 'Sam Oteo', 'owner'),
  ('tortillabar@me.com', 'Sam Oteo', 'owner')
on conflict (email) do update
set role = 'owner',
    name = excluded.name;

alter table atlas.decisions
  add column if not exists operator_email text;

alter table atlas.results
  add column if not exists operator_email text;

alter table atlas.actions
  add column if not exists scheduled_for timestamptz;

alter table atlas.assets
  add column if not exists scheduled_for timestamptz,
  add column if not exists recommended_for timestamptz;

alter table atlas.findings
  add column if not exists pinned boolean not null default false,
  add column if not exists cadence text
    check (cadence is null or cadence in ('weekly','monthly','quarterly'));

create table if not exists atlas.finding_reads (
  finding_id uuid not null,
  operator_email text not null,
  read_at timestamptz not null default now(),
  primary key (finding_id, operator_email)
);

alter table atlas.finding_reads enable row level security;
-- No policies created: service_role routes only. Anon/authenticated get nothing.

create index if not exists atlas_decisions_operator_created_idx
  on atlas.decisions (operator_email, created_at desc);

create index if not exists atlas_results_operator_created_idx
  on atlas.results (operator_email, created_at desc);

create index if not exists atlas_actions_scheduled_for_idx
  on atlas.actions (scheduled_for);

create index if not exists atlas_assets_schedule_idx
  on atlas.assets (scheduled_for, recommended_for);

create index if not exists atlas_findings_pinned_idx
  on atlas.findings (pinned, cadence, created_at desc);

grant all privileges on atlas.operators to service_role;
grant all privileges on atlas.finding_reads to service_role;
