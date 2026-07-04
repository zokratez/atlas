# Atlas Supabase Schema

This repo NEVER pushes migration history. Project `vrxmnuvedakrrpvetybq`'s history is owned by the via repo. Atlas schema changes = SQL file here + applied by Claude via MCP + verified.

The migration file in `supabase/migrations/0001_atlas_schema.sql` is the canonical record for Atlas schema v1. Do not run `supabase db push` from this repo.

`supabase/config.toml` records the currently applied API exposure needed by Mission Control server routes: `atlas` is included in PostgREST exposed schemas, while RLS stays enabled and no anon/authenticated policies are created. Do not run `supabase config push` from this repo unless you first verify the full diff, because the Supabase CLI may also offer unrelated Auth config changes for the shared `via` project.
