-- ============================================================================
-- LRS Tracker — per-rifle load IDs, rifle links, ballistic profiles.
-- Run ONCE in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run. Run it BEFORE opening the updated app.
-- ============================================================================

-- 1) New columns
alter table public.rifles   add column if not exists code       text;  -- load ID prefix, e.g. "25CM"
alter table public.rifles   add column if not exists zero_range text;  -- yards
alter table public.loads    add column if not exists legacy_ids text;  -- JSON array of earlier IDs
alter table public.loads    add column if not exists rifle_id   text;  -- rifles.id
alter table public.loads    add column if not exists ballistics text;  -- JSON ballistic profile + truing
alter table public.sessions add column if not exists rifle_id   text;

-- 2) Safety copy of every current ID before the app renumbers anything.
--    Row Level Security is on with no policies, so the API can't read it;
--    view it here in the SQL editor if you ever need it.
create table if not exists public.load_id_backup as
  select id, load_id, lot_number, rifle, user_id, now() as backed_up_at from public.loads;
alter table public.load_id_backup enable row level security;

-- 3) Link existing loads and sessions to rifles by name (rename-proof from now on)
update public.loads l set rifle_id = r.id
  from public.rifles r
  where l.rifle_id is null
    and lower(trim(l.rifle)) = lower(trim(r.name))
    and l.user_id is not distinct from r.user_id;

update public.sessions s set rifle_id = r.id
  from public.rifles r
  where s.rifle_id is null
    and lower(trim(s.rifle)) = lower(trim(r.name))
    and s.user_id is not distinct from r.user_id;

-- 4) Keep each load's current ID as a legacy ID (the app adds the new one on top)
update public.loads set legacy_ids = json_build_array(load_id)::text
  where legacy_ids is null and coalesce(load_id, '') <> '';

-- 5) One load ID per user. Skipped (with a notice) if duplicates already exist:
--    use "Upgrade load IDs" in the app, then run this file again.
do $$
begin
  if exists (
    select 1 from public.loads
    where coalesce(load_id, '') <> ''
    group by user_id, load_id having count(*) > 1
  ) then
    raise notice 'Duplicate load IDs found; unique index skipped. Upgrade IDs in the app, then re-run.';
  else
    create unique index if not exists loads_user_load_id_key
      on public.loads (user_id, load_id) where coalesce(load_id, '') <> '';
  end if;
end $$;
