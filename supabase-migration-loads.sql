-- ============================================================================
-- LRS Tracker — add Load ID + Ladder Development columns to the loads table.
-- Run ONCE in Supabase Dashboard → SQL Editor → New query → Run.
-- Required before saving loads with the auto Load ID or a ladder test.
-- Safe to re-run.
-- ============================================================================

alter table public.loads add column if not exists load_id text;  -- auto Load ID, e.g. "250715-K7Q"
alter table public.loads add column if not exists ladder  text;  -- JSON: up to 10 {charge, velocity, group_size}
