create table atlas.intake (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('url','text','file')),
  content text not null,
  property text,
  status text not null default 'new' check (status in ('new','processed','failed')),
  processed_at timestamptz,
  notes text
);

alter table atlas.intake enable row level security;
-- No policies created: service_role only. Anon/authenticated get nothing.

grant all privileges on table atlas.intake to service_role;
alter default privileges in schema atlas grant all privileges on tables to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'atlas-intake',
  'atlas-intake',
  false,
  10485760,
  array[
    'text/plain',
    'text/markdown',
    'application/pdf'
  ]::text[]
) on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
