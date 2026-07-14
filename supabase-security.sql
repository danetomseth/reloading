-- ============================================================================
-- LRS Tracker — per-user security (Row Level Security)
-- Run this ONCE in your Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run.
-- ============================================================================

-- 1) Give each table an owner column that defaults to the signed-in user.
alter table public.rifles   add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table public.loads    add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table public.sessions add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;

-- 2) Enable Row Level Security on every table.
alter table public.rifles   enable row level security;
alter table public.loads    enable row level security;
alter table public.sessions enable row level security;

-- 3) Policies: a user can only read/write their OWN rows.
drop policy if exists "own rifles"   on public.rifles;
drop policy if exists "own loads"    on public.loads;
drop policy if exists "own sessions" on public.sessions;

create policy "own rifles"   on public.rifles   for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own loads"    on public.loads    for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sessions" on public.sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 4) CLAIM YOUR EXISTING DATA (run after signing up once)
-- Your rifles/loads created before you had an account have no owner, so RLS
-- hides them. This assigns all ownerless rows to your account.
-- EASY VERSION — works while you are the ONLY user in the project:
-- ============================================================================
update public.rifles   set user_id = (select id from auth.users limit 1) where user_id is null;
update public.loads    set user_id = (select id from auth.users limit 1) where user_id is null;
update public.sessions set user_id = (select id from auth.users limit 1) where user_id is null;

-- If you ever have multiple users, use your specific UID instead
-- (Authentication → Users → copy id):
-- update public.rifles set user_id = 'YOUR-USER-ID' where user_id is null;
