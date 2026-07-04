insert into atlas.flags (key, value)
values
  ('run_scout_requested', 'false'::jsonb),
  ('run_lens_requested', 'false'::jsonb),
  ('run_quill_requested', 'false'::jsonb)
on conflict (key) do nothing;
