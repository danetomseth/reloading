-- ============================================================================
-- LRS Tracker — reload Groups
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run.
-- ============================================================================

-- A group organizes reloads. Membership is stored on the group as a JSON array
-- of load ids (matching how loads.chrono_sessions / loads.ladder are stored),
-- so a load can belong to many groups with no change to the loads table.
create table if not exists public.groups (
  id         text primary key,
  name       text not null default '',
  load_ids   text not null default '[]',   -- JSON array of load id strings
  notes      text not null default '',
  user_id    uuid default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Per-user security, same pattern as rifles/loads/sessions.
alter table public.groups enable row level security;

drop policy if exists "own groups" on public.groups;
create policy "own groups" on public.groups for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
