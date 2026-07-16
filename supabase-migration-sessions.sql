-- ============================================================================
-- LRS Tracker — add the multi-range DOPE column to the sessions table.
-- Run ONCE in Supabase Dashboard → SQL Editor. Required before saving a
-- session with per-range data. Safe to re-run.
-- ============================================================================

alter table public.sessions add column if not exists ranges text;  -- JSON: [{range, calc_drop, obs_drop, wind, windage_hold}]
