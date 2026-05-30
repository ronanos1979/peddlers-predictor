-- =============================================================
-- PEDDLER'S PREDICTOR — MASTER SQL
-- Run this once on a fresh Supabase project (or local Postgres)
-- Last updated: May 2026
-- =============================================================

-- =============================================================
-- 1. TABLES
-- =============================================================

-- Pubs
create table if not exists pubs (
  id          text primary key,
  name        text not null,
  city        text not null,
  lat         double precision not null,
  lng         double precision not null,
  radius_m    integer not null default 300,
  daily_code  text not null default 'PEDDLER1'
);

-- Matches
create table if not exists matches (
  id               uuid primary key default gen_random_uuid(),
  home_team        text not null,
  away_team        text not null,
  home_flag        text not null default '',
  away_flag        text not null default '',
  kickoff_at       timestamptz not null,
  entries_close_at timestamptz not null,
  stage            text not null default 'Group Stage',
  result           text check (result in ('home','draw','away')) default null,
  is_active        boolean not null default false
);

-- Entries
create table if not exists entries (
  id             uuid primary key default gen_random_uuid(),
  pub_id         text references pubs(id),
  match_id       uuid references matches(id),
  name           text not null,
  phone          text not null,
  email          text default null,
  pick           text not null check (pick in ('home','draw','away')),
  is_correct     boolean default null,
  raffle_entries integer not null default 0,
  created_at     timestamptz not null default now(),
  unique(phone, match_id)
);

-- Golden Boot (top scorer) picks
create table if not exists scorer_picks (
  id           uuid primary key default gen_random_uuid(),
  pub_id       text references pubs(id),
  phone        text not null,
  name         text not null,
  player_name  text not null,
  player_team  text not null,
  player_id    integer,
  created_at   timestamptz not null default now(),
  is_correct   boolean default null,
  unique(phone)
);

-- Team data cache (populated by /api/team, refreshed weekly)
create table if not exists team_cache (
  team_id    integer primary key,
  team_name  text not null,
  data       jsonb not null,
  cached_at  timestamptz not null default now()
);

create index if not exists team_cache_name_idx on team_cache (team_name);

-- =============================================================
-- 2. ROW LEVEL SECURITY
-- =============================================================

alter table pubs          enable row level security;
alter table matches        enable row level security;
alter table entries        enable row level security;
alter table scorer_picks   enable row level security;
alter table team_cache     enable row level security;

-- Public read on pubs and matches
create policy "Public read pubs"
  on pubs for select using (true);

create policy "Public read matches"
  on matches for select using (true);

-- Public read + insert on entries
create policy "Public read entries"
  on entries for select using (true);

create policy "Public insert entries"
  on entries for insert with check (true);

create policy "Public update entries"
  on entries for update using (true);

-- Public read + insert on scorer picks
create policy "Public read scorer_picks"
  on scorer_picks for select using (true);

create policy "Public insert scorer_picks"
  on scorer_picks for insert with check (true);

-- =============================================================
-- 3. PUB DATA
-- =============================================================

insert into pubs (id, name, city, lat, lng, radius_m, daily_code) values
  ('haverhill', 'The Peddler''s Daughter', 'Haverhill, MA', 42.7762, -71.0773, 300, 'PEDDLER1'),
  ('nashua',    'The Peddler''s Daughter', 'Nashua, NH',    42.7654, -71.4676, 300, 'PEDDLER1')
on conflict (id) do nothing;

-- =============================================================
-- 4. DEMO MATCH
-- =============================================================

insert into matches (
  home_team, away_team, home_flag, away_flag,
  kickoff_at, entries_close_at, stage, is_active
) values (
  'USA', 'Ireland', '🇺🇸', '🇮🇪',
  now() - interval '10 minutes',
  now() + interval '100 minutes',
  'Demo Match',
  false
) on conflict do nothing;

-- =============================================================
-- 5. WORLD CUP 2026 — ALL 104 MATCHES
-- All times UTC (ET = UTC-4 in summer)
-- entries_close_at = kickoff + 105 minutes (covers full match)
-- Knockout round teams filled in by admin as tournament progresses
-- =============================================================

-- Clear existing test/placeholder matches first (keeps demo match)
delete from matches where stage != 'Demo Match';

insert into matches (home_team, away_team, home_flag, away_flag, kickoff_at, entries_close_at, stage, is_active) values

-- ── JUNE 11 ──────────────────────────────────────────────────
('Mexico',      'South Africa',        '🇲🇽','🇿🇦', '2026-06-11 19:00:00+00', '2026-06-11 20:45:00+00', 'Group A', false),
('South Korea', 'Czechia',             '🇰🇷','🇨🇿', '2026-06-12 02:00:00+00', '2026-06-12 03:45:00+00', 'Group A', false),

-- ── JUNE 12 ──────────────────────────────────────────────────
('Canada',      'Bosnia & Herzegovina','🇨🇦','🇧🇦', '2026-06-12 19:00:00+00', '2026-06-12 20:45:00+00', 'Group B', false),
('USA',         'Paraguay',            '🇺🇸','🇵🇾', '2026-06-13 01:00:00+00', '2026-06-13 02:45:00+00', 'Group D', false),

-- ── JUNE 13 ──────────────────────────────────────────────────
('Qatar',       'Switzerland',         '🇶🇦','🇨🇭', '2026-06-13 19:00:00+00', '2026-06-13 20:45:00+00', 'Group B', false),
('Brazil',      'Morocco',             '🇧🇷','🇲🇦', '2026-06-13 22:00:00+00', '2026-06-13 23:45:00+00', 'Group C', false),
('Haiti',       'Scotland',            '🇭🇹','🏴󠁧󠁢󠁳󠁣󠁴󠁿', '2026-06-14 01:00:00+00', '2026-06-14 02:45:00+00', 'Group C', false),
('Australia',   'Türkiye',             '🇦🇺','🇹🇷', '2026-06-14 04:00:00+00', '2026-06-14 05:45:00+00', 'Group D', false),

-- ── JUNE 14 ──────────────────────────────────────────────────
('Germany',     'Curaçao',             '🇩🇪','🇨🇼', '2026-06-14 17:00:00+00', '2026-06-14 18:45:00+00', 'Group E', false),
('Netherlands', 'Japan',               '🇳🇱','🇯🇵', '2026-06-14 20:00:00+00', '2026-06-14 21:45:00+00', 'Group F', false),
('Ivory Coast', 'Ecuador',             '🇨🇮','🇪🇨', '2026-06-14 23:00:00+00', '2026-06-15 00:45:00+00', 'Group E', false),
('Tunisia',     'Sweden',              '🇹🇳','🇸🇪', '2026-06-15 02:00:00+00', '2026-06-15 03:45:00+00', 'Group F', false),

-- ── JUNE 15 ──────────────────────────────────────────────────
('Spain',       'Cape Verde',          '🇪🇸','🇨🇻', '2026-06-15 16:00:00+00', '2026-06-15 17:45:00+00', 'Group H', false),
('Belgium',     'Egypt',               '🇧🇪','🇪🇬', '2026-06-15 19:00:00+00', '2026-06-15 20:45:00+00', 'Group G', false),
('Saudi Arabia','Uruguay',             '🇸🇦','🇺🇾', '2026-06-15 22:00:00+00', '2026-06-15 23:45:00+00', 'Group H', false),
('Iran',        'New Zealand',         '🇮🇷','🇳🇿', '2026-06-16 01:00:00+00', '2026-06-16 02:45:00+00', 'Group G', false),

-- ── JUNE 16 ──────────────────────────────────────────────────
('France',      'Senegal',             '🇫🇷','🇸🇳', '2026-06-16 19:00:00+00', '2026-06-16 20:45:00+00', 'Group I', false),
('Iraq',        'Norway',              '🇮🇶','🇳🇴', '2026-06-16 22:00:00+00', '2026-06-16 23:45:00+00', 'Group I', false),
('Argentina',   'Algeria',             '🇦🇷','🇩🇿', '2026-06-17 01:00:00+00', '2026-06-17 02:45:00+00', 'Group J', false),
('Austria',     'Jordan',              '🇦🇹','🇯🇴', '2026-06-17 04:00:00+00', '2026-06-17 05:45:00+00', 'Group J', false),

-- ── JUNE 17 ──────────────────────────────────────────────────
('Portugal',    'Congo DR',            '🇵🇹','🇨🇩', '2026-06-17 17:00:00+00', '2026-06-17 18:45:00+00', 'Group K', false),
('England',     'Croatia',             '🏴󠁧󠁢󠁥󠁮󠁧󠁿','🇭🇷', '2026-06-17 20:00:00+00', '2026-06-17 21:45:00+00', 'Group L', false),
('Ghana',       'Panama',              '🇬🇭','🇵🇦', '2026-06-17 23:00:00+00', '2026-06-18 00:45:00+00', 'Group L', false),
('Uzbekistan',  'Colombia',            '🇺🇿','🇨🇴', '2026-06-18 02:00:00+00', '2026-06-18 03:45:00+00', 'Group K', false),

-- ── JUNE 18 ──────────────────────────────────────────────────
('Czechia',     'South Africa',        '🇨🇿','🇿🇦', '2026-06-18 16:00:00+00', '2026-06-18 17:45:00+00', 'Group A', false),
('Switzerland', 'Bosnia & Herzegovina','🇨🇭','🇧🇦', '2026-06-18 19:00:00+00', '2026-06-18 20:45:00+00', 'Group B', false),
('Canada',      'Qatar',               '🇨🇦','🇶🇦', '2026-06-18 22:00:00+00', '2026-06-18 23:45:00+00', 'Group B', false),
('Mexico',      'South Korea',         '🇲🇽','🇰🇷', '2026-06-19 01:00:00+00', '2026-06-19 02:45:00+00', 'Group A', false),

-- ── JUNE 19 ──────────────────────────────────────────────────
('USA',         'Australia',           '🇺🇸','🇦🇺', '2026-06-19 19:00:00+00', '2026-06-19 20:45:00+00', 'Group D', false),
('Scotland',    'Morocco',             '🏴󠁧󠁢󠁳󠁣󠁴󠁿','🇲🇦', '2026-06-19 19:00:00+00', '2026-06-19 20:45:00+00', 'Group C', false),
('Brazil',      'Haiti',               '🇧🇷','🇭🇹', '2026-06-20 01:00:00+00', '2026-06-20 02:45:00+00', 'Group C', false),
('Türkiye',     'Paraguay',            '🇹🇷','🇵🇾', '2026-06-20 04:00:00+00', '2026-06-20 05:45:00+00', 'Group D', false),

-- ── JUNE 20 ──────────────────────────────────────────────────
('Netherlands', 'Sweden',              '🇳🇱','🇸🇪', '2026-06-20 17:00:00+00', '2026-06-20 18:45:00+00', 'Group F', false),
('Germany',     'Ivory Coast',         '🇩🇪','🇨🇮', '2026-06-20 20:00:00+00', '2026-06-20 21:45:00+00', 'Group E', false),
('Ecuador',     'Curaçao',             '🇪🇨','🇨🇼', '2026-06-21 00:00:00+00', '2026-06-21 01:45:00+00', 'Group E', false),
('Tunisia',     'Japan',               '🇹🇳','🇯🇵', '2026-06-21 04:00:00+00', '2026-06-21 05:45:00+00', 'Group F', false),

-- ── JUNE 21 ──────────────────────────────────────────────────
('Spain',       'Saudi Arabia',        '🇪🇸','🇸🇦', '2026-06-21 16:00:00+00', '2026-06-21 17:45:00+00', 'Group H', false),
('Belgium',     'Iran',                '🇧🇪','🇮🇷', '2026-06-21 19:00:00+00', '2026-06-21 20:45:00+00', 'Group G', false),
('Uruguay',     'Cape Verde',          '🇺🇾','🇨🇻', '2026-06-21 22:00:00+00', '2026-06-21 23:45:00+00', 'Group H', false),
('New Zealand', 'Egypt',               '🇳🇿','🇪🇬', '2026-06-22 01:00:00+00', '2026-06-22 02:45:00+00', 'Group G', false),

-- ── JUNE 22 ──────────────────────────────────────────────────
('Argentina',   'Austria',             '🇦🇷','🇦🇹', '2026-06-22 17:00:00+00', '2026-06-22 18:45:00+00', 'Group J', false),
('France',      'Iraq',                '🇫🇷','🇮🇶', '2026-06-22 21:00:00+00', '2026-06-22 22:45:00+00', 'Group I', false),
('Norway',      'Senegal',             '🇳🇴','🇸🇳', '2026-06-23 00:00:00+00', '2026-06-23 01:45:00+00', 'Group I', false),
('Jordan',      'Algeria',             '🇯🇴','🇩🇿', '2026-06-23 03:00:00+00', '2026-06-23 04:45:00+00', 'Group J', false),

-- ── JUNE 23 ──────────────────────────────────────────────────
('Portugal',    'Uzbekistan',          '🇵🇹','🇺🇿', '2026-06-23 17:00:00+00', '2026-06-23 18:45:00+00', 'Group K', false),
('England',     'Ghana',               '🏴󠁧󠁢󠁥󠁮󠁧󠁿','🇬🇭', '2026-06-23 20:00:00+00', '2026-06-23 21:45:00+00', 'Group L', false),
('Panama',      'Croatia',             '🇵🇦','🇭🇷', '2026-06-23 23:00:00+00', '2026-06-24 00:45:00+00', 'Group L', false),
('Colombia',    'Congo DR',            '🇨🇴','🇨🇩', '2026-06-24 02:00:00+00', '2026-06-24 03:45:00+00', 'Group K', false),

-- ── JUNE 24 ──────────────────────────────────────────────────
('Switzerland', 'Canada',              '🇨🇭','🇨🇦', '2026-06-24 19:00:00+00', '2026-06-24 20:45:00+00', 'Group B', false),
('Bosnia & Herzegovina','Qatar',       '🇧🇦','🇶🇦', '2026-06-24 19:00:00+00', '2026-06-24 20:45:00+00', 'Group B', false),
('Brazil',      'Scotland',            '🇧🇷','🏴󠁧󠁢󠁳󠁣󠁴󠁿', '2026-06-24 22:00:00+00', '2026-06-24 23:45:00+00', 'Group C', false),
('Morocco',     'Haiti',               '🇲🇦','🇭🇹', '2026-06-24 22:00:00+00', '2026-06-24 23:45:00+00', 'Group C', false),
('Mexico',      'Czechia',             '🇲🇽','🇨🇿', '2026-06-25 01:00:00+00', '2026-06-25 02:45:00+00', 'Group A', false),
('South Korea', 'South Africa',        '🇰🇷','🇿🇦', '2026-06-25 01:00:00+00', '2026-06-25 02:45:00+00', 'Group A', false),

-- ── JUNE 25 ──────────────────────────────────────────────────
('Ecuador',     'Germany',             '🇪🇨','🇩🇪', '2026-06-25 20:00:00+00', '2026-06-25 21:45:00+00', 'Group E', false),
('Curaçao',     'Ivory Coast',         '🇨🇼','🇨🇮', '2026-06-25 20:00:00+00', '2026-06-25 21:45:00+00', 'Group E', false),
('Tunisia',     'Netherlands',         '🇹🇳','🇳🇱', '2026-06-25 23:00:00+00', '2026-06-26 00:45:00+00', 'Group F', false),
('Japan',       'Sweden',              '🇯🇵','🇸🇪', '2026-06-25 23:00:00+00', '2026-06-26 00:45:00+00', 'Group F', false),
('USA',         'Türkiye',             '🇺🇸','🇹🇷', '2026-06-26 02:00:00+00', '2026-06-26 03:45:00+00', 'Group D', false),
('Paraguay',    'Australia',           '🇵🇾','🇦🇺', '2026-06-26 02:00:00+00', '2026-06-26 03:45:00+00', 'Group D', false),

-- ── JUNE 26 ──────────────────────────────────────────────────
('Norway',      'France',              '🇳🇴','🇫🇷', '2026-06-26 19:00:00+00', '2026-06-26 20:45:00+00', 'Group I', false),
('Senegal',     'Iraq',                '🇸🇳','🇮🇶', '2026-06-26 19:00:00+00', '2026-06-26 20:45:00+00', 'Group I', false),
('Uruguay',     'Spain',               '🇺🇾','🇪🇸', '2026-06-27 00:00:00+00', '2026-06-27 01:45:00+00', 'Group H', false),
('Cape Verde',  'Saudi Arabia',        '🇨🇻','🇸🇦', '2026-06-27 00:00:00+00', '2026-06-27 01:45:00+00', 'Group H', false),
('New Zealand', 'Belgium',             '🇳🇿','🇧🇪', '2026-06-27 03:00:00+00', '2026-06-27 04:45:00+00', 'Group G', false),
('Egypt',       'Iran',                '🇪🇬','🇮🇷', '2026-06-27 03:00:00+00', '2026-06-27 04:45:00+00', 'Group G', false),

-- ── JUNE 27 ──────────────────────────────────────────────────
('Panama',      'England',             '🇵🇦','🏴󠁧󠁢󠁥󠁮󠁧󠁿', '2026-06-27 21:00:00+00', '2026-06-27 22:45:00+00', 'Group L', false),
('Croatia',     'Ghana',               '🇭🇷','🇬🇭', '2026-06-27 21:00:00+00', '2026-06-27 22:45:00+00', 'Group L', false),
('Colombia',    'Portugal',            '🇨🇴','🇵🇹', '2026-06-28 00:00:00+00', '2026-06-28 01:45:00+00', 'Group K', false),
('Congo DR',    'Uzbekistan',          '🇨🇩','🇺🇿', '2026-06-28 00:00:00+00', '2026-06-28 01:45:00+00', 'Group K', false),
('Argentina',   'Jordan',              '🇦🇷','🇯🇴', '2026-06-28 03:00:00+00', '2026-06-28 04:45:00+00', 'Group J', false),
('Algeria',     'Austria',             '🇩🇿','🇦🇹', '2026-06-28 03:00:00+00', '2026-06-28 04:45:00+00', 'Group J', false),

-- ── ROUND OF 32 (June 28 – July 4) ───────────────────────────
-- Teams filled in by admin as group stage completes
('Group A Winner',    'Group B Runner-up',      '🏳','🏳', '2026-06-28 19:00:00+00', '2026-06-28 20:45:00+00', 'Round of 32', false),
('Group C Winner',    'Group D Runner-up',      '🏳','🏳', '2026-06-28 23:00:00+00', '2026-06-29 00:45:00+00', 'Round of 32', false),
('Group A Runner-up', 'Group B Runner-up',      '🏳','🏳', '2026-06-29 19:00:00+00', '2026-06-29 20:45:00+00', 'Round of 32', false),
('Group E Winner',    '3rd Place (A/B/C/D/F)',  '🏳','🏳', '2026-06-29 20:30:00+00', '2026-06-29 22:15:00+00', 'Round of 32', false),
('Group F Winner',    'Group C Runner-up',      '🏳','🏳', '2026-06-30 01:00:00+00', '2026-06-30 02:45:00+00', 'Round of 32', false),
('Group E Runner-up', 'Group I Runner-up',      '🏳','🏳', '2026-06-30 17:00:00+00', '2026-06-30 18:45:00+00', 'Round of 32', false),
('Group I Winner',    '3rd Place (C/D/F/G/H)',  '🏳','🏳', '2026-06-30 21:00:00+00', '2026-06-30 22:45:00+00', 'Round of 32', false),
('Group A Winner',    '3rd Place (C/E/F/H/I)',  '🏳','🏳', '2026-07-01 01:00:00+00', '2026-07-01 02:45:00+00', 'Round of 32', false),
('Group L Winner',    '3rd Place (E/H/I/J/K)',  '🏳','🏳', '2026-07-01 16:00:00+00', '2026-07-01 17:45:00+00', 'Round of 32', false),
('Group G Winner',    '3rd Place (A/E/H/I/J)',  '🏳','🏳', '2026-07-01 20:00:00+00', '2026-07-01 21:45:00+00', 'Round of 32', false),
('Group D Winner',    '3rd Place (B/E/F/I/J)',  '🏳','🏳', '2026-07-02 00:00:00+00', '2026-07-02 01:45:00+00', 'Round of 32', false),
('Group H Winner',    'Group J Runner-up',      '🏳','🏳', '2026-07-02 19:00:00+00', '2026-07-02 20:45:00+00', 'Round of 32', false),
('Group K Runner-up', 'Group L Runner-up',      '🏳','🏳', '2026-07-02 23:00:00+00', '2026-07-03 00:45:00+00', 'Round of 32', false),
('Group B Winner',    '3rd Place (E/F/G/I/J)',  '🏳','🏳', '2026-07-03 03:00:00+00', '2026-07-03 04:45:00+00', 'Round of 32', false),
('Group D Runner-up', 'Group G Runner-up',      '🏳','🏳', '2026-07-03 18:00:00+00', '2026-07-03 19:45:00+00', 'Round of 32', false),
('Group J Winner',    'Group H Runner-up',      '🏳','🏳', '2026-07-03 22:00:00+00', '2026-07-03 23:45:00+00', 'Round of 32', false),
('Group K Winner',    '3rd Place (D/E/I/J/L)',  '🏳','🏳', '2026-07-04 01:30:00+00', '2026-07-04 03:15:00+00', 'Round of 32', false),

-- ── ROUND OF 16 (July 4–8) ────────────────────────────────────
('R32 M73 Winner','R32 M75 Winner','🏳','🏳', '2026-07-04 17:00:00+00', '2026-07-04 18:45:00+00', 'Round of 16', false),
('R32 M74 Winner','R32 M77 Winner','🏳','🏳', '2026-07-04 21:00:00+00', '2026-07-04 22:45:00+00', 'Round of 16', false),
('R32 M76 Winner','R32 M78 Winner','🏳','🏳', '2026-07-05 21:00:00+00', '2026-07-05 22:45:00+00', 'Round of 16', false),
('R32 M79 Winner','R32 M80 Winner','🏳','🏳', '2026-07-06 01:00:00+00', '2026-07-06 02:45:00+00', 'Round of 16', false),
('R32 M81 Winner','R32 M82 Winner','🏳','🏳', '2026-07-06 21:00:00+00', '2026-07-06 22:45:00+00', 'Round of 16', false),
('R32 M83 Winner','R32 M84 Winner','🏳','🏳', '2026-07-07 01:00:00+00', '2026-07-07 02:45:00+00', 'Round of 16', false),
('R32 M85 Winner','R32 M86 Winner','🏳','🏳', '2026-07-07 21:00:00+00', '2026-07-07 22:45:00+00', 'Round of 16', false),
('R32 M87 Winner','R32 M88 Winner','🏳','🏳', '2026-07-08 01:00:00+00', '2026-07-08 02:45:00+00', 'Round of 16', false),

-- ── QUARTER FINALS (July 10–12) ───────────────────────────────
('QF1 TBD','QF1 TBD','🏳','🏳', '2026-07-10 21:00:00+00', '2026-07-10 22:45:00+00', 'Quarter Final', false),
('QF2 TBD','QF2 TBD','🏳','🏳', '2026-07-11 01:00:00+00', '2026-07-11 02:45:00+00', 'Quarter Final', false),
('QF3 TBD','QF3 TBD','🏳','🏳', '2026-07-11 21:00:00+00', '2026-07-11 22:45:00+00', 'Quarter Final', false),
('QF4 TBD','QF4 TBD','🏳','🏳', '2026-07-12 01:00:00+00', '2026-07-12 02:45:00+00', 'Quarter Final', false),

-- ── SEMI FINALS (July 14–15) ──────────────────────────────────
('SF1 TBD','SF1 TBD','🏳','🏳', '2026-07-14 21:00:00+00', '2026-07-14 22:45:00+00', 'Semi Final', false),
('SF2 TBD','SF2 TBD','🏳','🏳', '2026-07-15 21:00:00+00', '2026-07-15 22:45:00+00', 'Semi Final', false),

-- ── THIRD PLACE & FINAL ───────────────────────────────────────
('3rd Place TBD','3rd Place TBD','🏳','🏳', '2026-07-18 21:00:00+00', '2026-07-18 22:45:00+00', 'Third Place', false),
('TBD','TBD','🏳','🏳',                      '2026-07-19 19:00:00+00', '2026-07-19 20:45:00+00', 'Final',       false);

-- =============================================================
-- 6. HELPFUL VIEWS (optional — useful for admin queries)
-- =============================================================

create or replace view leaderboard as
select
  e.name,
  e.phone,
  e.pub_id,
  count(*)                                          as total_picks,
  count(*) filter (where e.is_correct = true)       as correct_picks,
  sum(e.raffle_entries)                             as raffle_tickets,
  max(e.created_at)                                 as last_entry
from entries e
where e.match_id in (select id from matches where stage != 'Demo Match')
group by e.name, e.phone, e.pub_id
order by raffle_tickets desc, correct_picks desc;

-- =============================================================
-- DONE. Your database is fully set up.
-- =============================================================
