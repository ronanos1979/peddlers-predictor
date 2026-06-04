-- Migration: player_cache table + new columns on team_cache
-- Run this in the Supabase SQL editor on prod (eksoaxfzxbhudnfcktjm)
-- After running, use Admin → Teams tab to load all 48 teams from football-data.org

-- 1. New columns on team_cache
ALTER TABLE team_cache ADD COLUMN IF NOT EXISTS fd_loaded         boolean NOT NULL DEFAULT false;
ALTER TABLE team_cache ADD COLUMN IF NOT EXISTS coach_name        text;
ALTER TABLE team_cache ADD COLUMN IF NOT EXISTS coach_nationality text;

-- 2. player_cache: one row per player, structured, with per-field enrichment tracking
CREATE TABLE IF NOT EXISTS player_cache (
  fd_id          integer      PRIMARY KEY,
  team_name      text         NOT NULL,   -- schedule name, e.g. "USA"
  name           text         NOT NULL,
  age            integer,
  number         integer,
  position       text,
  photo          text         NOT NULL DEFAULT '',
  photo_enriched boolean      NOT NULL DEFAULT false,
  club_name      text,
  club_logo      text,
  club_enriched  boolean      NOT NULL DEFAULT false,
  af_id          integer,
  cached_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_cache_team_name_idx ON player_cache (team_name);

-- 3. RLS: public read only (squad pages read from this); admin writes via service key
ALTER TABLE player_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read player_cache"
  ON player_cache FOR SELECT USING (true);
