alter table atlas.intake
  add column if not exists finding_ids uuid[] not null default '{}';

alter table atlas.specimens
  add column if not exists is_own boolean not null default false,
  add column if not exists action_id uuid references atlas.actions(id);

create index if not exists atlas_intake_created_idx
  on atlas.intake (created_at desc);

create index if not exists atlas_specimens_is_own_idx
  on atlas.specimens (is_own, created_at desc);

create index if not exists atlas_specimens_action_idx
  on atlas.specimens (action_id);
