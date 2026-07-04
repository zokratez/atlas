create table if not exists atlas.assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  property text not null,
  kind text not null check (kind in ('video','image','text')),
  title text not null,
  description text,
  file_path text,
  thumbnail_path text,
  raw_video_path text,
  duration_seconds int,
  intended_channels text[] default '{}',
  status text not null default 'shelf'
    check (status in ('shelf','scheduled','posted','retired')),
  posted_action_id uuid,
  recommendation jsonb,
  notes text
);

alter table atlas.assets enable row level security;
-- No policies created: service_role only. Anon/authenticated get nothing.

create index if not exists atlas_assets_status_property_idx
  on atlas.assets (status, property, created_at desc);

grant all privileges on atlas.assets to service_role;
