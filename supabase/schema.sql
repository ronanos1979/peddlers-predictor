-- Run this in Supabase SQL Editor → New query

-- Pubs table
create table pubs (
  id text primary key,
  name text not null,
  city text not null,
  lat double precision not null,
  lng double precision not null,
  radius_m integer not null default 300,
  daily_code text not null default 'PEDDLER1'
);

-- Matches table
create table matches (
  id uuid primary key default gen_random_uuid(),
  home_team text not null,
  away_team text not null,
  home_flag text not null default '',
  away_flag text not null default '',
  kickoff_at timestamptz not null,
  entries_close_at timestamptz not null,
  stage text not null default 'Group Stage',
  result text check (result in ('home','draw','away')) default null,
  is_active boolean not null default false
);

-- Entries table
create table entries (
  id uuid primary key default gen_random_uuid(),
  pub_id text references pubs(id),
  match_id uuid references matches(id),
  name text not null,
  phone text not null,
  pick text not null check (pick in ('home','draw','away')),
  is_correct boolean default null,
  raffle_entries integer not null default 0,
  created_at timestamptz not null default now(),
  unique(phone, match_id)
);

-- Insert the two pubs
insert into pubs (id, name, city, lat, lng, radius_m, daily_code) values
  ('haverhill', 'The Peddler''s Daughter', 'Haverhill, MA', 42.7762, -71.0773, 300, 'PEDDLER1'),
  ('nashua',    'The Peddler''s Daughter', 'Nashua, NH',    42.7654, -71.4676, 300, 'PEDDLER1');

-- Enable Row Level Security
alter table pubs enable row level security;
alter table matches enable row level security;
alter table entries enable row level security;

-- Public read on pubs and matches
create policy "Public read pubs" on pubs for select using (true);
create policy "Public read matches" on matches for select using (true);

-- Public read and insert on entries
create policy "Public read entries" on entries for select using (true);
create policy "Public insert entries" on entries for insert with check (true);

-- Allow server to update entries (for scoring)
create policy "Public update entries" on entries for update using (true);
