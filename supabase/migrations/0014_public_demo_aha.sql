alter table atlas.intake
  add column if not exists tags text[] not null default '{}',
  add column if not exists submitter_email text,
  add column if not exists submitter_ip_hash text,
  add column if not exists receipt_token uuid not null default gen_random_uuid(),
  add column if not exists delivered_at timestamptz,
  add column if not exists public_demo_result jsonb;

create index if not exists atlas_intake_public_demo_status_idx
  on atlas.intake (status, created_at)
  where tags @> array['public_demo']::text[];

create index if not exists atlas_intake_submitter_email_idx
  on atlas.intake (lower(submitter_email), created_at)
  where submitter_email is not null;

create unique index if not exists atlas_intake_receipt_token_idx
  on atlas.intake (receipt_token);

insert into atlas.flags (key, value)
values
  ('public_demo_daily_cost_cap_usd', '2'::jsonb),
  ('public_demo_enabled', 'true'::jsonb)
on conflict (key) do nothing;
