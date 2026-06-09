-- Venue UPDATE statements for knockout stage matches
-- Run these in Supabase SQL Editor (Settings → SQL Editor)
--
-- Confidence levels:
--   ✅ CONFIRMED  — safe to run immediately
--   ⚠️  PROBABLE   — verify against official FIFA schedule before running
--   ❌ FILL IN    — look up from official FIFA schedule, then replace VENUE_HERE
--
-- Venue format: 'Stadium Name, City, ST'
-- e.g. 'SoFi Stadium, Inglewood, CA'
--      'BC Place, Vancouver, BC'
--      'Estadio Azteca, Mexico City'
-- ─────────────────────────────────────────────────────────────────────────────


-- ✅ FINAL (July 19) ──────────────────────────────────────────────────────────

UPDATE matches
SET venue = 'MetLife Stadium, East Rutherford, NJ'
WHERE stage = 'Final';


-- ⚠️ SEMI-FINALS & THIRD PLACE — verify before running ───────────────────────

UPDATE matches
SET venue = 'AT&T Stadium, Arlington, TX'
WHERE stage = 'Semi Final' AND kickoff_at = '2026-07-14 21:00:00+00';

UPDATE matches
SET venue = 'MetLife Stadium, East Rutherford, NJ'
WHERE stage = 'Semi Final' AND kickoff_at = '2026-07-15 21:00:00+00';

UPDATE matches
SET venue = 'AT&T Stadium, Arlington, TX'
WHERE stage = 'Third Place' AND kickoff_at = '2026-07-18 21:00:00+00';


-- ❌ QUARTER FINALS — fill in from official FIFA schedule ─────────────────────

UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-10 21:00:00+00'; -- QF1
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-11 01:00:00+00'; -- QF2
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-11 21:00:00+00'; -- QF3
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-12 01:00:00+00'; -- QF4


-- ❌ ROUND OF 16 — fill in from official FIFA schedule ────────────────────────

UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-04 17:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-04 21:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-05 21:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-06 01:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-06 21:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-07 01:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-07 21:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-08 01:00:00+00';


-- ❌ ROUND OF 32 — fill in from official FIFA schedule ────────────────────────

UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-06-28 19:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-06-28 23:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-06-29 19:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-06-29 20:30:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-06-30 01:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-06-30 17:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-06-30 21:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-01 01:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-01 16:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-01 20:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-02 00:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-02 19:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-02 23:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-03 03:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-03 18:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-03 22:00:00+00';
UPDATE matches SET venue = 'VENUE_HERE' WHERE kickoff_at = '2026-07-04 01:30:00+00';
