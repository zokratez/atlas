create table if not exists atlas.properties (
  slug text primary key,
  display_name text not null,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into atlas.properties (slug, display_name, color, active)
values
  ('store', 'PACO Peptide', '#7dd3fc', true),
  ('huh', 'Huh? Learn Spanish', '#fda4af', true),
  ('restaurant', 'Motel West / PACO', '#facc15', true),
  ('general', 'General', '#a3a3a3', true)
on conflict (slug) do update
set display_name = excluded.display_name,
    color = excluded.color,
    active = true;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conrelid::regclass as table_name, conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    join pg_namespace n
      on n.oid = c.connamespace
    where n.nspname = 'atlas'
      and c.contype = 'c'
      and a.attname = 'property'
      and c.conrelid::regclass::text in (
        'atlas.findings',
        'atlas.actions',
        'atlas.experiments',
        'atlas.results',
        'atlas.intake',
        'atlas.specimens',
        'atlas.assets'
      )
  loop
    execute format('alter table %s drop constraint if exists %I', constraint_record.table_name, constraint_record.conname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_findings_property_fk'
  ) then
    alter table atlas.findings
      add constraint atlas_findings_property_fk
      foreign key (property) references atlas.properties(slug)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_actions_property_fk'
  ) then
    alter table atlas.actions
      add constraint atlas_actions_property_fk
      foreign key (property) references atlas.properties(slug)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_results_property_fk'
  ) then
    alter table atlas.results
      add constraint atlas_results_property_fk
      foreign key (property) references atlas.properties(slug)
      not valid;
  end if;
end $$;

alter table atlas.properties enable row level security;
-- No policies created: service_role routes only. Anon/authenticated get nothing.

grant all privileges on atlas.properties to service_role;
