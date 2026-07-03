-- =============================================================
-- PEDDLER'S PREDICTOR — MASTER SQL
-- Run this once on a fresh Supabase project (or local Postgres)
-- Last updated: June 7 2026
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
  is_active        boolean not null default false,
  venue            text default null,  -- e.g. 'New York aka MetLife Stadium'
  home_score            integer default null,
  away_score            integer default null,
  checkin_winner_name   text default null,
  checkin_winner_phone  text default null,
  checkin_draw_at       timestamptz default null,
  hat_trick_scored      boolean default null,
  penalties_scored      boolean default null
);

-- Entries
create table if not exists entries (
  id               uuid primary key default gen_random_uuid(),
  pub_id           text references pubs(id),
  match_id         uuid references matches(id),
  name             text not null,
  phone            text not null,
  email            text default null,
  pick             text not null check (pick in ('home','draw','away')),
  is_correct       boolean default null,
  raffle_entries   integer not null default 0,
  created_at       timestamptz not null default now(),
  home_score_pred  integer default null,
  away_score_pred  integer default null,
  hat_trick_pred   boolean default null,
  penalties_pred   boolean default null,
  entry_lat        numeric(10,7) default null,
  entry_lng        numeric(10,7) default null,
  entry_distance_m integer default null,
  unique(phone, match_id)
);

-- Match attendance check-ins (for in-match prize draws)
create table if not exists check_ins (
  id          uuid primary key default gen_random_uuid(),
  pub_id      text not null references pubs(id),
  match_id    uuid not null references matches(id),
  name        text not null,
  phone       text not null,
  email       text default null,
  shared_to   text default null,   -- 'native', 'x', 'facebook', 'copy', or null
  created_at  timestamptz not null default now(),
  unique(phone, match_id)
);

alter table check_ins enable row level security;
create policy "Public insert check_ins" on check_ins for insert to anon with check (true);

-- Golden Boot (top scorer) picks
create table if not exists scorer_picks (
  id                      uuid primary key default gen_random_uuid(),
  pub_id                  text references pubs(id),
  phone                   text not null,
  name                    text not null,
  player_name             text not null,
  player_team             text not null,
  player_id               integer,
  created_at              timestamptz not null default now(),
  is_correct              boolean default null,
  potential_raffle_entries integer not null default 10,
  raffle_entries          integer not null default 0,
  unique(phone)
);

-- Tournament winner picks (one per phone, locked once submitted)
create table if not exists winner_picks (
  id                      uuid primary key default gen_random_uuid(),
  pub_id                  text references pubs(id),
  phone                   text not null,
  name                    text not null,
  team_name               text not null,
  team_flag               text not null default '',
  is_correct              boolean default null,
  raffle_entries          integer not null default 0,
  potential_raffle_entries integer not null default 15,
  created_at              timestamptz not null default now(),
  unique(phone)
);

-- User feedback / bug reports
create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  email      text,
  page       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- Analytics events — patron behaviour tracking (geo outcomes, engagement, conversions)
-- Written by /api/analytics (public insert); read by admin via service key
create table if not exists analytics_events (
  id         uuid primary key default gen_random_uuid(),
  event      text not null,
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table analytics_events enable row level security;
create policy "Public insert analytics_events"
  on analytics_events for insert to anon with check (true);

-- Team data cache (populated by admin via /api/admin-teams load_fd action)
-- team_name stores the schedule name (e.g. "USA") for direct ilike lookups
-- Squad lives in player_cache, not the data blob
create table if not exists team_cache (
  team_id            integer      primary key,
  team_name          text         not null,
  data               jsonb        not null,
  cached_at          timestamptz  not null default now(),  -- FD load date
  af_cached_at       timestamptz  default null,            -- AF enrichment date (null until first enrichment)
  fd_loaded          boolean      not null default false,
  coach_name         text,
  coach_nationality  text
);

create index if not exists team_cache_name_idx on team_cache (team_name);

-- Player cache: one row per player, structured, incremental AF enrichment
create table if not exists player_cache (
  fd_id          integer      primary key,
  team_name      text         not null,   -- schedule name, e.g. "USA"
  name           text         not null,
  age            integer,
  number         integer,
  position       text,
  photo          text         not null default '',
  photo_enriched boolean      not null default false,
  club_name      text,
  club_logo      text,
  club_enriched  boolean      not null default false,
  af_id          integer,
  cached_at      timestamptz  not null default now()
);

create index if not exists player_cache_team_name_idx on player_cache (team_name);

-- Aggregated player stats per team — avoids PostgREST row-limit issues when counting
create or replace view player_cache_stats as
select
  team_name,
  count(*)                                                               as total,
  count(*) filter (where number is not null and number > 0)             as numbers,
  count(*) filter (where photo is not null and photo != '')             as photos,
  count(*) filter (where club_name is not null and club_name != '')     as clubs
from player_cache
group by team_name;

-- =============================================================
-- 2. ROW LEVEL SECURITY
-- Note: check_ins and analytics_events have RLS enabled inline above
-- =============================================================

alter table pubs          enable row level security;
alter table matches        enable row level security;
alter table entries        enable row level security;
alter table scorer_picks   enable row level security;
alter table winner_picks   enable row level security;
alter table team_cache     enable row level security;
alter table player_cache   enable row level security;
alter table feedback       enable row level security;

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

-- Public read + insert on winner picks
create policy "Public read winner_picks"
  on winner_picks for select using (true);

create policy "Public insert winner_picks"
  on winner_picks for insert with check (true);

-- Feedback: anyone can submit, only service key (admin) can read
create policy "Public insert feedback"
  on feedback for insert with check (true);

-- player_cache: public read (team pages read via /api/team → supabaseAdmin, but allow direct reads too)
create policy "Public read player_cache"
  on player_cache for select using (true);

-- =============================================================
-- 3. PUB DATA
-- =============================================================

insert into pubs (id, name, city, lat, lng, radius_m, daily_code) values
  ('haverhill', 'The Peddler''s Daughter', 'Haverhill, MA', 42.7762, -71.0773, 20, 'PEDDLER1'),
  ('nashua',    'The Peddler''s Daughter', 'Nashua, NH',    42.7654, -71.4676, 20, 'PEDDLER1')
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
-- All times UTC. Source of truth: FIFA World Cup 2026 official schedule.
-- entries_close_at = kickoff + 105 minutes (covers full match)
-- Knockout round teams filled in by admin as tournament progresses
-- =============================================================

-- Clear existing WC matches (keeps demo match)
delete from matches where stage != 'Demo Match';

insert into matches (home_team, away_team, home_flag, away_flag, kickoff_at, entries_close_at, stage, is_active, venue) values

-- ── JUNE 11 ──────────────────────────────────────────────────
('Mexico',      'South Africa',        '🇲🇽','🇿🇦', '2026-06-11 19:00:00+00', '2026-06-11 20:45:00+00', 'Group A', false, 'Mexico City aka Estadio Azteca'),
('South Korea', 'Czechia',             '🇰🇷','🇨🇿', '2026-06-12 02:00:00+00', '2026-06-12 03:45:00+00', 'Group A', false, 'Guadalajara aka Estadio Akron'),

-- ── JUNE 12 ──────────────────────────────────────────────────
('Canada',      'Bosnia & Herzegovina','🇨🇦','🇧🇦', '2026-06-12 19:00:00+00', '2026-06-12 20:45:00+00', 'Group B', false, 'Toronto aka BMO Field'),
('USA',         'Paraguay',            '🇺🇸','🇵🇾', '2026-06-13 01:00:00+00', '2026-06-13 02:45:00+00', 'Group D', false, 'Los Angeles aka SoFi Stadium'),

-- ── JUNE 13 ──────────────────────────────────────────────────
('Qatar',       'Switzerland',         '🇶🇦','🇨🇭', '2026-06-13 19:00:00+00', '2026-06-13 20:45:00+00', 'Group B', false, 'San Francisco Bay Area aka Levi''s Stadium'),
('Brazil',      'Morocco',             '🇧🇷','🇲🇦', '2026-06-13 22:00:00+00', '2026-06-13 23:45:00+00', 'Group C', false, 'New York aka MetLife Stadium'),
('Haiti',       'Scotland',            '🇭🇹','🏴󠁧󠁢󠁳󠁣󠁴󠁿', '2026-06-14 01:00:00+00', '2026-06-14 02:45:00+00', 'Group C', false, 'Boston aka Gillette Stadium'),
('Australia',   'Türkiye',             '🇦🇺','🇹🇷', '2026-06-14 04:00:00+00', '2026-06-14 05:45:00+00', 'Group D', false, 'Vancouver aka BC Place'),

-- ── JUNE 14 ──────────────────────────────────────────────────
('Germany',     'Curaçao',             '🇩🇪','🇨🇼', '2026-06-14 17:00:00+00', '2026-06-14 18:45:00+00', 'Group E', false, 'Houston aka NRG Stadium'),
('Netherlands', 'Japan',               '🇳🇱','🇯🇵', '2026-06-14 20:00:00+00', '2026-06-14 21:45:00+00', 'Group F', false, 'Dallas aka AT&T Stadium'),
('Ivory Coast', 'Ecuador',             '🇨🇮','🇪🇨', '2026-06-14 23:00:00+00', '2026-06-15 00:45:00+00', 'Group E', false, 'Philadelphia aka Lincoln Financial Field'),
('Sweden',      'Tunisia',             '🇸🇪','🇹🇳', '2026-06-15 02:00:00+00', '2026-06-15 03:45:00+00', 'Group F', false, 'Guadalajara aka Estadio Akron'),

-- ── JUNE 15 ──────────────────────────────────────────────────
('Spain',       'Cape Verde',          '🇪🇸','🇨🇻', '2026-06-15 17:00:00+00', '2026-06-15 18:45:00+00', 'Group H', false, 'Atlanta aka Mercedes-Benz Stadium'),
('Belgium',     'Egypt',               '🇧🇪','🇪🇬', '2026-06-15 22:00:00+00', '2026-06-15 23:45:00+00', 'Group G', false, 'Seattle aka Lumen Field'),
('Saudi Arabia','Uruguay',             '🇸🇦','🇺🇾', '2026-06-15 22:00:00+00', '2026-06-15 23:45:00+00', 'Group H', false, 'Miami aka Hard Rock Stadium'),
('Iran',        'New Zealand',         '🇮🇷','🇳🇿', '2026-06-16 04:00:00+00', '2026-06-16 05:45:00+00', 'Group G', false, 'Los Angeles aka SoFi Stadium'),

-- ── JUNE 16 ──────────────────────────────────────────────────
('France',      'Senegal',             '🇫🇷','🇸🇳', '2026-06-16 19:00:00+00', '2026-06-16 20:45:00+00', 'Group I', false, 'New York aka MetLife Stadium'),
('Iraq',        'Norway',              '🇮🇶','🇳🇴', '2026-06-16 22:00:00+00', '2026-06-16 23:45:00+00', 'Group I', false, 'Boston aka Gillette Stadium'),
('Argentina',   'Algeria',             '🇦🇷','🇩🇿', '2026-06-17 01:00:00+00', '2026-06-17 02:45:00+00', 'Group J', false, 'Kansas City aka GEHA Field at Arrowhead Stadium'),
('Austria',     'Jordan',              '🇦🇹','🇯🇴', '2026-06-17 04:00:00+00', '2026-06-17 05:45:00+00', 'Group J', false, 'San Francisco Bay Area aka Levi''s Stadium'),

-- ── JUNE 17 ──────────────────────────────────────────────────
('Portugal',    'Congo DR',            '🇵🇹','🇨🇩', '2026-06-17 17:00:00+00', '2026-06-17 18:45:00+00', 'Group K', false, 'Houston aka NRG Stadium'),
('England',     'Croatia',             '🏴󠁧󠁢󠁥󠁮󠁧󠁿','🇭🇷', '2026-06-17 20:00:00+00', '2026-06-17 21:45:00+00', 'Group L', false, 'Dallas aka AT&T Stadium'),
('Ghana',       'Panama',              '🇬🇭','🇵🇦', '2026-06-17 23:00:00+00', '2026-06-18 00:45:00+00', 'Group L', false, 'Toronto aka BMO Field'),
('Uzbekistan',  'Colombia',            '🇺🇿','🇨🇴', '2026-06-18 02:00:00+00', '2026-06-18 03:45:00+00', 'Group K', false, 'Mexico City aka Estadio Azteca'),

-- ── JUNE 18 ──────────────────────────────────────────────────
('Czechia',     'South Africa',        '🇨🇿','🇿🇦', '2026-06-18 16:00:00+00', '2026-06-18 17:45:00+00', 'Group A', false, 'Atlanta aka Mercedes-Benz Stadium'),
('Switzerland', 'Bosnia & Herzegovina','🇨🇭','🇧🇦', '2026-06-18 19:00:00+00', '2026-06-18 20:45:00+00', 'Group B', false, 'Los Angeles aka SoFi Stadium'),
('Canada',      'Qatar',               '🇨🇦','🇶🇦', '2026-06-18 22:00:00+00', '2026-06-18 23:45:00+00', 'Group B', false, 'Vancouver aka BC Place'),
('Mexico',      'South Korea',         '🇲🇽','🇰🇷', '2026-06-19 01:00:00+00', '2026-06-19 02:45:00+00', 'Group A', false, 'Guadalajara aka Estadio Akron'),

-- ── JUNE 19 ──────────────────────────────────────────────────
('USA',         'Australia',           '🇺🇸','🇦🇺', '2026-06-19 19:00:00+00', '2026-06-19 20:45:00+00', 'Group D', false, 'Seattle aka Lumen Field'),
('Scotland',    'Morocco',             '🏴󠁧󠁢󠁳󠁣󠁴󠁿','🇲🇦', '2026-06-19 22:00:00+00', '2026-06-19 23:45:00+00', 'Group C', false, 'Boston aka Gillette Stadium'),
('Brazil',      'Haiti',               '🇧🇷','🇭🇹', '2026-06-20 00:30:00+00', '2026-06-20 02:15:00+00', 'Group C', false, 'Philadelphia aka Lincoln Financial Field'),
('Türkiye',     'Paraguay',            '🇹🇷','🇵🇾', '2026-06-20 03:00:00+00', '2026-06-20 04:45:00+00', 'Group D', false, 'San Francisco Bay Area aka Levi''s Stadium'),

-- ── JUNE 20 ──────────────────────────────────────────────────
('Netherlands', 'Sweden',              '🇳🇱','🇸🇪', '2026-06-20 17:00:00+00', '2026-06-20 18:45:00+00', 'Group F', false, 'Houston aka NRG Stadium'),
('Germany',     'Ivory Coast',         '🇩🇪','🇨🇮', '2026-06-20 20:00:00+00', '2026-06-20 21:45:00+00', 'Group E', false, 'Toronto aka BMO Field'),
('Ecuador',     'Curaçao',             '🇪🇨','🇨🇼', '2026-06-21 00:00:00+00', '2026-06-21 01:45:00+00', 'Group E', false, 'Kansas City aka GEHA Field at Arrowhead Stadium'),
('Tunisia',     'Japan',               '🇹🇳','🇯🇵', '2026-06-21 04:00:00+00', '2026-06-21 05:45:00+00', 'Group F', false, 'Guadalajara aka Estadio Akron'),

-- ── JUNE 21 ──────────────────────────────────────────────────
('Spain',       'Saudi Arabia',        '🇪🇸','🇸🇦', '2026-06-21 16:00:00+00', '2026-06-21 17:45:00+00', 'Group H', false, 'Atlanta aka Mercedes-Benz Stadium'),
('Belgium',     'Iran',                '🇧🇪','🇮🇷', '2026-06-21 19:00:00+00', '2026-06-21 20:45:00+00', 'Group G', false, 'Los Angeles aka SoFi Stadium'),
('Uruguay',     'Cape Verde',          '🇺🇾','🇨🇻', '2026-06-21 22:00:00+00', '2026-06-21 23:45:00+00', 'Group H', false, 'Miami aka Hard Rock Stadium'),
('New Zealand', 'Egypt',               '🇳🇿','🇪🇬', '2026-06-22 01:00:00+00', '2026-06-22 02:45:00+00', 'Group G', false, 'Vancouver aka BC Place'),

-- ── JUNE 22 ──────────────────────────────────────────────────
('Argentina',   'Austria',             '🇦🇷','🇦🇹', '2026-06-22 17:00:00+00', '2026-06-22 18:45:00+00', 'Group J', false, 'Dallas aka AT&T Stadium'),
('France',      'Iraq',                '🇫🇷','🇮🇶', '2026-06-22 21:00:00+00', '2026-06-22 22:45:00+00', 'Group I', false, 'Philadelphia aka Lincoln Financial Field'),
('Norway',      'Senegal',             '🇳🇴','🇸🇳', '2026-06-23 00:00:00+00', '2026-06-23 01:45:00+00', 'Group I', false, 'New York aka MetLife Stadium'),
('Jordan',      'Algeria',             '🇯🇴','🇩🇿', '2026-06-23 03:00:00+00', '2026-06-23 04:45:00+00', 'Group J', false, 'San Francisco Bay Area aka Levi''s Stadium'),

-- ── JUNE 23 ──────────────────────────────────────────────────
('Portugal',    'Uzbekistan',          '🇵🇹','🇺🇿', '2026-06-23 17:00:00+00', '2026-06-23 18:45:00+00', 'Group K', false, 'Houston aka NRG Stadium'),
('England',     'Ghana',               '🏴󠁧󠁢󠁥󠁮󠁧󠁿','🇬🇭', '2026-06-23 20:00:00+00', '2026-06-23 21:45:00+00', 'Group L', false, 'Boston aka Gillette Stadium'),
('Panama',      'Croatia',             '🇵🇦','🇭🇷', '2026-06-23 23:00:00+00', '2026-06-24 00:45:00+00', 'Group L', false, 'Toronto aka BMO Field'),
('Colombia',    'Congo DR',            '🇨🇴','🇨🇩', '2026-06-24 02:00:00+00', '2026-06-24 03:45:00+00', 'Group K', false, 'Guadalajara aka Estadio Akron'),

-- ── JUNE 24 ──────────────────────────────────────────────────
('Switzerland', 'Canada',              '🇨🇭','🇨🇦', '2026-06-24 19:00:00+00', '2026-06-24 20:45:00+00', 'Group B', false, 'Vancouver aka BC Place'),
('Bosnia & Herzegovina','Qatar',       '🇧🇦','🇶🇦', '2026-06-24 19:00:00+00', '2026-06-24 20:45:00+00', 'Group B', false, 'Seattle aka Lumen Field'),
('Scotland',    'Brazil',              '🏴󠁧󠁢󠁳󠁣󠁴󠁿','🇧🇷', '2026-06-24 22:00:00+00', '2026-06-24 23:45:00+00', 'Group C', false, 'Miami aka Hard Rock Stadium'),
('Morocco',     'Haiti',               '🇲🇦','🇭🇹', '2026-06-24 22:00:00+00', '2026-06-24 23:45:00+00', 'Group C', false, 'Atlanta aka Mercedes-Benz Stadium'),
('Czechia',     'Mexico',              '🇨🇿','🇲🇽', '2026-06-25 01:00:00+00', '2026-06-25 02:45:00+00', 'Group A', false, 'Mexico City aka Estadio Azteca'),
('South Africa','South Korea',         '🇿🇦','🇰🇷', '2026-06-25 01:00:00+00', '2026-06-25 02:45:00+00', 'Group A', false, 'Guadalajara aka Estadio Akron'),

-- ── JUNE 25 ──────────────────────────────────────────────────
('Ecuador',     'Germany',             '🇪🇨','🇩🇪', '2026-06-25 20:00:00+00', '2026-06-25 21:45:00+00', 'Group E', false, 'New York aka MetLife Stadium'),
('Curaçao',     'Ivory Coast',         '🇨🇼','🇨🇮', '2026-06-25 20:00:00+00', '2026-06-25 21:45:00+00', 'Group E', false, 'Philadelphia aka Lincoln Financial Field'),
('Japan',       'Sweden',              '🇯🇵','🇸🇪', '2026-06-25 23:00:00+00', '2026-06-26 00:45:00+00', 'Group F', false, 'Dallas aka AT&T Stadium'),
('Tunisia',     'Netherlands',         '🇹🇳','🇳🇱', '2026-06-25 23:00:00+00', '2026-06-26 00:45:00+00', 'Group F', false, 'Kansas City aka GEHA Field at Arrowhead Stadium'),
('Türkiye',     'USA',                 '🇹🇷','🇺🇸', '2026-06-26 02:00:00+00', '2026-06-26 03:45:00+00', 'Group D', false, 'Los Angeles aka SoFi Stadium'),
('Paraguay',    'Australia',           '🇵🇾','🇦🇺', '2026-06-26 02:00:00+00', '2026-06-26 03:45:00+00', 'Group D', false, 'San Francisco Bay Area aka Levi''s Stadium'),

-- ── JUNE 26 ──────────────────────────────────────────────────
('Norway',      'France',              '🇳🇴','🇫🇷', '2026-06-26 19:00:00+00', '2026-06-26 20:45:00+00', 'Group I', false, 'Boston aka Gillette Stadium'),
('Senegal',     'Iraq',                '🇸🇳','🇮🇶', '2026-06-26 19:00:00+00', '2026-06-26 20:45:00+00', 'Group I', false, 'Toronto aka BMO Field'),
('Cape Verde',  'Saudi Arabia',        '🇨🇻','🇸🇦', '2026-06-27 00:00:00+00', '2026-06-27 01:45:00+00', 'Group H', false, 'Houston aka NRG Stadium'),
('Uruguay',     'Spain',               '🇺🇾','🇪🇸', '2026-06-27 00:00:00+00', '2026-06-27 01:45:00+00', 'Group H', false, 'Guadalajara aka Estadio Akron'),
('Egypt',       'Iran',                '🇪🇬','🇮🇷', '2026-06-27 03:00:00+00', '2026-06-27 04:45:00+00', 'Group G', false, 'Seattle aka Lumen Field'),
('New Zealand', 'Belgium',             '🇳🇿','🇧🇪', '2026-06-27 03:00:00+00', '2026-06-27 04:45:00+00', 'Group G', false, 'Vancouver aka BC Place'),

-- ── JUNE 27 ──────────────────────────────────────────────────
('Panama',      'England',             '🇵🇦','🏴󠁧󠁢󠁥󠁮󠁧󠁿', '2026-06-27 21:00:00+00', '2026-06-27 22:45:00+00', 'Group L', false, 'New York aka MetLife Stadium'),
('Croatia',     'Ghana',               '🇭🇷','🇬🇭', '2026-06-27 21:00:00+00', '2026-06-27 22:45:00+00', 'Group L', false, 'Philadelphia aka Lincoln Financial Field'),
('Colombia',    'Portugal',            '🇨🇴','🇵🇹', '2026-06-27 23:30:00+00', '2026-06-28 01:15:00+00', 'Group K', false, 'Miami aka Hard Rock Stadium'),
('Congo DR',    'Uzbekistan',          '🇨🇩','🇺🇿', '2026-06-27 23:30:00+00', '2026-06-28 01:15:00+00', 'Group K', false, 'Atlanta aka Mercedes-Benz Stadium'),
('Algeria',     'Austria',             '🇩🇿','🇦🇹', '2026-06-28 02:00:00+00', '2026-06-28 03:45:00+00', 'Group J', false, 'Kansas City aka GEHA Field at Arrowhead Stadium'),
('Jordan',      'Argentina',           '🇯🇴','🇦🇷', '2026-06-28 02:00:00+00', '2026-06-28 03:45:00+00', 'Group J', false, 'Dallas aka AT&T Stadium'),

-- ── ROUND OF 32 (June 28 – July 4) ───────────────────────────
-- M73-M88 — teams filled in by admin as group stage completes
('Group A Runner-up', 'Group B Runner-up',     '🏳','🏳', '2026-06-28 19:00:00+00', '2026-06-28 20:45:00+00', 'Round of 32', false, 'Los Angeles aka SoFi Stadium'),
('Group C Winner',    'Group F Runner-up',      '🏳','🏳', '2026-06-29 17:00:00+00', '2026-06-29 18:45:00+00', 'Round of 32', false, 'Houston aka NRG Stadium'),
('Group E Winner',    '3rd Place (A/B/C/D/F)',  '🏳','🏳', '2026-06-29 20:30:00+00', '2026-06-29 22:15:00+00', 'Round of 32', false, 'Boston aka Gillette Stadium'),
('Group F Winner',    'Group C Runner-up',       '🏳','🏳', '2026-06-30 01:00:00+00', '2026-06-30 02:45:00+00', 'Round of 32', false, 'Monterrey aka Estadio BBVA'),
('Group E Runner-up', 'Group I Runner-up',       '🏳','🏳', '2026-06-30 17:00:00+00', '2026-06-30 18:45:00+00', 'Round of 32', false, 'Dallas aka AT&T Stadium'),
('Group I Winner',    '3rd Place (C/D/F/G/H)',   '🏳','🏳', '2026-06-30 21:00:00+00', '2026-06-30 22:45:00+00', 'Round of 32', false, 'New York aka MetLife Stadium'),
('Group A Winner',    '3rd Place (C/E/F/H/I)',   '🏳','🏳', '2026-07-01 01:00:00+00', '2026-07-01 02:45:00+00', 'Round of 32', false, 'Mexico City aka Estadio Azteca'),
('Group L Winner',    '3rd Place (E/H/I/J/K)',   '🏳','🏳', '2026-07-01 16:00:00+00', '2026-07-01 17:45:00+00', 'Round of 32', false, 'Atlanta aka Mercedes-Benz Stadium'),
('Group G Winner',    '3rd Place (A/E/H/I/J)',   '🏳','🏳', '2026-07-01 20:00:00+00', '2026-07-01 21:45:00+00', 'Round of 32', false, 'Seattle aka Lumen Field'),
('Group D Winner',    '3rd Place (B/E/F/I/J)',   '🏳','🏳', '2026-07-02 00:00:00+00', '2026-07-02 01:45:00+00', 'Round of 32', false, 'San Francisco Bay Area aka Levi''s Stadium'),
('Group H Winner',    'Group J Runner-up',        '🏳','🏳', '2026-07-02 19:00:00+00', '2026-07-02 20:45:00+00', 'Round of 32', false, 'Los Angeles aka SoFi Stadium'),
('Group K Runner-up', 'Group L Runner-up',        '🏳','🏳', '2026-07-02 23:00:00+00', '2026-07-03 00:45:00+00', 'Round of 32', false, 'Toronto aka BMO Field'),
('Group B Winner',    '3rd Place (E/F/G/I/J)',    '🏳','🏳', '2026-07-03 03:00:00+00', '2026-07-03 04:45:00+00', 'Round of 32', false, 'Vancouver aka BC Place'),
('Group D Runner-up', 'Group G Runner-up',        '🏳','🏳', '2026-07-03 18:00:00+00', '2026-07-03 19:45:00+00', 'Round of 32', false, 'Dallas aka AT&T Stadium'),
('Group J Winner',    'Group H Runner-up',         '🏳','🏳', '2026-07-03 22:00:00+00', '2026-07-03 23:45:00+00', 'Round of 32', false, 'Miami aka Hard Rock Stadium'),
('Group K Winner',    '3rd Place (D/E/I/J/L)',    '🏳','🏳', '2026-07-04 01:30:00+00', '2026-07-04 03:15:00+00', 'Round of 32', false, 'Kansas City aka GEHA Field at Arrowhead Stadium'),

-- ── ROUND OF 16 (July 4–7) ────────────────────────────────────
-- M89-M96 — references R32 matches M73-M88 by global match number
('Match 73 Winner','Match 75 Winner','🏳','🏳', '2026-07-04 17:00:00+00', '2026-07-04 18:45:00+00', 'Round of 16', false, 'Houston aka NRG Stadium'),
('Match 74 Winner','Match 77 Winner','🏳','🏳', '2026-07-04 21:00:00+00', '2026-07-04 22:45:00+00', 'Round of 16', false, 'Philadelphia aka Lincoln Financial Field'),
('Match 76 Winner','Match 78 Winner','🏳','🏳', '2026-07-05 20:00:00+00', '2026-07-05 21:45:00+00', 'Round of 16', false, 'New York aka MetLife Stadium'),
('Match 79 Winner','Match 80 Winner','🏳','🏳', '2026-07-06 00:00:00+00', '2026-07-06 01:45:00+00', 'Round of 16', false, 'Mexico City aka Estadio Azteca'),
('Match 83 Winner','Match 84 Winner','🏳','🏳', '2026-07-06 19:00:00+00', '2026-07-06 20:45:00+00', 'Round of 16', false, 'Dallas aka AT&T Stadium'),
('Match 81 Winner','Match 82 Winner','🏳','🏳', '2026-07-06 21:00:00+00', '2026-07-06 22:45:00+00', 'Round of 16', false, 'Seattle aka Lumen Field'),
('Match 86 Winner','Match 88 Winner','🏳','🏳', '2026-07-07 16:00:00+00', '2026-07-07 17:45:00+00', 'Round of 16', false, 'Atlanta aka Mercedes-Benz Stadium'),
('Match 85 Winner','Match 87 Winner','🏳','🏳', '2026-07-07 20:00:00+00', '2026-07-07 21:45:00+00', 'Round of 16', false, 'Vancouver aka BC Place'),

-- ── QUARTER FINALS (July 9–12) ────────────────────────────────
-- M97-M100 — references R16 matches M89-M96
('Match 89 Winner','Match 90 Winner','🏳','🏳', '2026-07-09 20:00:00+00', '2026-07-09 21:45:00+00', 'Quarter Final', false, 'Boston aka Gillette Stadium'),
('Match 93 Winner','Match 94 Winner','🏳','🏳', '2026-07-10 19:00:00+00', '2026-07-10 20:45:00+00', 'Quarter Final', false, 'Los Angeles aka SoFi Stadium'),
('Match 91 Winner','Match 92 Winner','🏳','🏳', '2026-07-11 21:00:00+00', '2026-07-11 22:45:00+00', 'Quarter Final', false, 'Miami aka Hard Rock Stadium'),
('Match 95 Winner','Match 96 Winner','🏳','🏳', '2026-07-12 01:00:00+00', '2026-07-12 02:45:00+00', 'Quarter Final', false, 'Kansas City aka GEHA Field at Arrowhead Stadium'),

-- ── SEMI FINALS (July 14–15) ──────────────────────────────────
-- M101-M102 — references QF matches M97-M100
('Match 97 Winner','Match 98 Winner','🏳','🏳', '2026-07-14 19:00:00+00', '2026-07-14 20:45:00+00', 'Semi Final', false, 'Dallas aka AT&T Stadium'),
('Match 99 Winner','Match 100 Winner','🏳','🏳', '2026-07-15 19:00:00+00', '2026-07-15 20:45:00+00', 'Semi Final', false, 'Atlanta aka Mercedes-Benz Stadium'),

-- ── THIRD PLACE & FINAL ───────────────────────────────────────
('Match 101 Loser','Match 102 Loser','🏳','🏳', '2026-07-18 21:00:00+00', '2026-07-18 22:45:00+00', 'Third Place', false, 'Miami aka Hard Rock Stadium'),
('Match 101 Winner','Match 102 Winner','🏳','🏳', '2026-07-19 19:00:00+00', '2026-07-19 20:45:00+00', 'Final', false, 'New York aka MetLife Stadium');

-- =============================================================
-- 6. HELPFUL VIEWS (optional — useful for admin queries)
-- =============================================================

create or replace view leaderboard as
select
  e.name,
  e.phone,
  e.pub_id,
  count(*)                                                      as total_picks,
  count(*) filter (where e.is_correct = true)                   as correct_picks,
  sum(e.raffle_entries) + coalesce(max(wp.raffle_entries), 0)  as raffle_tickets,
  max(e.created_at)                                             as last_entry
from entries e
left join winner_picks wp on wp.phone = e.phone
where e.match_id in (select id from matches where stage != 'Demo Match')
group by e.name, e.phone, e.pub_id
order by raffle_tickets desc, correct_picks desc;

-- =============================================================
-- DONE. Your database is fully set up.
--
-- Tables created:
--   pubs, matches, entries, scorer_picks, winner_picks,
--   check_ins, feedback, analytics_events,
--   team_cache, player_cache
-- Views: player_cache_stats, leaderboard
-- =============================================================
