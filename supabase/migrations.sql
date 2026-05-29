-- Run this in Supabase SQL Editor to apply updates
-- Safe to run multiple times

-- 1. Add optional email to entries table
alter table entries add column if not exists email text default null;

-- 2. Update entries_close_at on all existing matches to kickoff + 105 minutes
update matches
set entries_close_at = kickoff_at + interval '105 minutes'
where entries_close_at = kickoff_at;

-- 3. Insert demo match (always available, never expires)
insert into matches (
  home_team, away_team, home_flag, away_flag,
  kickoff_at, entries_close_at, stage, is_active, result
) values (
  'USA', 'Ireland', '🇺🇸', '🇮🇪',
  now() - interval '10 minutes',
  now() + interval '100 minutes',
  'Demo Match',
  false,
  null
) on conflict do nothing;

-- 4. Create a function that keeps the demo match always open
-- We'll handle this in the app instead of the DB
