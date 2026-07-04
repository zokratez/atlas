alter table atlas.intake
  add column if not exists source_chars int,
  add column if not exists analyzed_chars int,
  add column if not exists coverage_pct numeric,
  add column if not exists coverage_method text
    check (
      coverage_method is null
      or coverage_method in (
        'full_text',
        'truncated',
        'transcript',
        'transcript_partial',
        'vision',
        'metadata_only'
      )
    );

alter table atlas.findings
  add column if not exists intake_coverage jsonb;

-- Live also has nullable atlas.findings.coverage_pct and
-- atlas.findings.study_method from the first manual apply.
-- They are intentionally unused by the app; intake_coverage is the
-- canonical finding-level receipt shape.

create index if not exists atlas_intake_coverage_idx
  on atlas.intake (coverage_pct);
