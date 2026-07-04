alter table atlas.results
  add column if not exists channel text default 'general';

update atlas.results
set channel = 'general'
where channel is null;

create index if not exists atlas_results_property_channel_idx
  on atlas.results (property, channel, created_at desc);
