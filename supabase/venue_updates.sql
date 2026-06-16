-- =============================================================
-- LIVE DB CORRECTIONS — venues, kickoff times, team order fixes
-- Run in Supabase SQL Editor on the live database.
-- Safe: does NOT truncate or touch patron entries.
-- All times UTC.
-- =============================================================

BEGIN;

-- =============================================================
-- PART 1: Fix group stage kickoff times (wrong in original load)
-- =============================================================

UPDATE matches SET kickoff_at = '2026-06-15 16:00:00+00', entries_close_at = '2026-06-15 17:45:00+00'
  WHERE home_team = 'Spain' AND away_team = 'Cape Verde' AND stage = 'Group H';

UPDATE matches SET kickoff_at = '2026-06-15 19:00:00+00', entries_close_at = '2026-06-15 20:45:00+00'
  WHERE home_team = 'Belgium' AND away_team = 'Egypt' AND stage = 'Group G';

UPDATE matches SET kickoff_at = '2026-06-16 01:00:00+00', entries_close_at = '2026-06-16 02:45:00+00'
  WHERE home_team = 'Iran' AND away_team = 'New Zealand' AND stage = 'Group G';

UPDATE matches SET kickoff_at = '2026-06-19 03:00:00+00', entries_close_at = '2026-06-19 04:45:00+00'
  WHERE home_team = 'Mexico' AND away_team = 'South Korea' AND stage = 'Group A';

UPDATE matches SET kickoff_at = '2026-06-19 22:00:00+00', entries_close_at = '2026-06-19 23:45:00+00'
  WHERE home_team = 'Scotland' AND away_team = 'Morocco' AND stage = 'Group C';

UPDATE matches SET kickoff_at = '2026-06-27 23:30:00+00', entries_close_at = '2026-06-28 01:15:00+00'
  WHERE home_team = 'Colombia' AND away_team = 'Portugal' AND stage = 'Group K';

UPDATE matches SET kickoff_at = '2026-06-27 23:30:00+00', entries_close_at = '2026-06-28 01:15:00+00'
  WHERE home_team = 'Congo DR' AND away_team = 'Uzbekistan' AND stage = 'Group K';

UPDATE matches SET kickoff_at = '2026-06-28 02:00:00+00', entries_close_at = '2026-06-28 03:45:00+00'
  WHERE home_team = 'Algeria' AND away_team = 'Austria' AND stage = 'Group J';

UPDATE matches SET kickoff_at = '2026-06-28 02:00:00+00', entries_close_at = '2026-06-28 03:45:00+00'
  WHERE home_team = 'Jordan' AND away_team = 'Argentina' AND stage = 'Group J';

-- =============================================================
-- PART 2: Fix home/away team order (wrong in original load)
-- =============================================================

-- Sweden was listed as away vs Tunisia; Sweden is home
UPDATE matches SET home_team = 'Sweden', home_flag = '🇸🇪', away_team = 'Tunisia', away_flag = '🇹🇳'
  WHERE stage = 'Group F' AND kickoff_at = '2026-06-15 02:00:00+00';

-- Brazil was listed as home vs Scotland; Scotland is home
UPDATE matches SET home_team = 'Scotland', home_flag = '🏴󠁧󠁢󠁳󠁣󠁴󠁿', away_team = 'Brazil', away_flag = '🇧🇷'
  WHERE stage = 'Group C' AND kickoff_at = '2026-06-24 22:00:00+00' AND home_team = 'Brazil';

-- USA was listed as home vs Türkiye; Türkiye is home
UPDATE matches SET home_team = 'Türkiye', home_flag = '🇹🇷', away_team = 'USA', away_flag = '🇺🇸'
  WHERE stage = 'Group D' AND kickoff_at = '2026-06-26 02:00:00+00' AND home_team = 'USA';

-- =============================================================
-- PART 3: Add venues to all group stage matches
-- =============================================================

UPDATE matches SET venue = 'Estadio Azteca, Mexico City'
  WHERE home_team = 'Mexico' AND away_team = 'South Africa';
UPDATE matches SET venue = 'Estadio Akron, Guadalajara'
  WHERE home_team = 'South Korea' AND away_team = 'Czechia';
UPDATE matches SET venue = 'BMO Field, Toronto, ON'
  WHERE home_team = 'Canada' AND away_team = 'Bosnia & Herzegovina';
UPDATE matches SET venue = 'SoFi Stadium, Inglewood, CA'
  WHERE home_team = 'USA' AND away_team = 'Paraguay';
UPDATE matches SET venue = 'Levi''s Stadium, Santa Clara, CA'
  WHERE home_team = 'Qatar' AND away_team = 'Switzerland';
UPDATE matches SET venue = 'MetLife Stadium, East Rutherford, NJ'
  WHERE home_team = 'Brazil' AND away_team = 'Morocco';
UPDATE matches SET venue = 'Gillette Stadium, Foxborough, MA'
  WHERE home_team = 'Haiti' AND away_team = 'Scotland';
UPDATE matches SET venue = 'BC Place, Vancouver, BC'
  WHERE home_team = 'Australia' AND away_team = 'Türkiye';
UPDATE matches SET venue = 'NRG Stadium, Houston, TX'
  WHERE home_team = 'Germany' AND away_team = 'Curaçao';
UPDATE matches SET venue = 'AT&T Stadium, Arlington, TX'
  WHERE home_team = 'Netherlands' AND away_team = 'Japan';
UPDATE matches SET venue = 'Lincoln Financial Field, Philadelphia, PA'
  WHERE home_team = 'Ivory Coast' AND away_team = 'Ecuador';
UPDATE matches SET venue = 'Estadio Akron, Guadalajara'
  WHERE home_team = 'Sweden' AND away_team = 'Tunisia';
UPDATE matches SET venue = 'Mercedes-Benz Stadium, Atlanta, GA'
  WHERE home_team = 'Spain' AND away_team = 'Cape Verde';
UPDATE matches SET venue = 'Lumen Field, Seattle, WA'
  WHERE home_team = 'Belgium' AND away_team = 'Egypt';
UPDATE matches SET venue = 'Hard Rock Stadium, Miami Gardens, FL'
  WHERE home_team = 'Saudi Arabia' AND away_team = 'Uruguay';
UPDATE matches SET venue = 'SoFi Stadium, Inglewood, CA'
  WHERE home_team = 'Iran' AND away_team = 'New Zealand';
UPDATE matches SET venue = 'MetLife Stadium, East Rutherford, NJ'
  WHERE home_team = 'France' AND away_team = 'Senegal';
UPDATE matches SET venue = 'Gillette Stadium, Foxborough, MA'
  WHERE home_team = 'Iraq' AND away_team = 'Norway';
UPDATE matches SET venue = 'GEHA Field at Arrowhead Stadium, Kansas City, MO'
  WHERE home_team = 'Argentina' AND away_team = 'Algeria';
UPDATE matches SET venue = 'Levi''s Stadium, Santa Clara, CA'
  WHERE home_team = 'Austria' AND away_team = 'Jordan';
UPDATE matches SET venue = 'NRG Stadium, Houston, TX'
  WHERE home_team = 'Portugal' AND away_team = 'Congo DR';
UPDATE matches SET venue = 'AT&T Stadium, Arlington, TX'
  WHERE home_team = 'England' AND away_team = 'Croatia';
UPDATE matches SET venue = 'BMO Field, Toronto, ON'
  WHERE home_team = 'Ghana' AND away_team = 'Panama';
UPDATE matches SET venue = 'Estadio Azteca, Mexico City'
  WHERE home_team = 'Uzbekistan' AND away_team = 'Colombia';
UPDATE matches SET venue = 'Mercedes-Benz Stadium, Atlanta, GA'
  WHERE home_team = 'Czechia' AND away_team = 'South Africa';
UPDATE matches SET venue = 'SoFi Stadium, Inglewood, CA'
  WHERE home_team = 'Switzerland' AND away_team = 'Bosnia & Herzegovina';
UPDATE matches SET venue = 'BC Place, Vancouver, BC'
  WHERE home_team = 'Canada' AND away_team = 'Qatar';
UPDATE matches SET venue = 'Estadio Akron, Guadalajara'
  WHERE home_team = 'Mexico' AND away_team = 'South Korea';
UPDATE matches SET venue = 'Lumen Field, Seattle, WA'
  WHERE home_team = 'USA' AND away_team = 'Australia';
UPDATE matches SET venue = 'Gillette Stadium, Foxborough, MA'
  WHERE home_team = 'Scotland' AND away_team = 'Morocco';
UPDATE matches SET venue = 'Lincoln Financial Field, Philadelphia, PA'
  WHERE home_team = 'Brazil' AND away_team = 'Haiti';
UPDATE matches SET venue = 'Levi''s Stadium, Santa Clara, CA'
  WHERE home_team = 'Türkiye' AND away_team = 'Paraguay';
UPDATE matches SET venue = 'NRG Stadium, Houston, TX'
  WHERE home_team = 'Netherlands' AND away_team = 'Sweden';
UPDATE matches SET venue = 'BMO Field, Toronto, ON'
  WHERE home_team = 'Germany' AND away_team = 'Ivory Coast';
UPDATE matches SET venue = 'GEHA Field at Arrowhead Stadium, Kansas City, MO'
  WHERE home_team = 'Ecuador' AND away_team = 'Curaçao';
UPDATE matches SET venue = 'Estadio Akron, Guadalajara'
  WHERE home_team = 'Tunisia' AND away_team = 'Japan';
UPDATE matches SET venue = 'Mercedes-Benz Stadium, Atlanta, GA'
  WHERE home_team = 'Spain' AND away_team = 'Saudi Arabia';
UPDATE matches SET venue = 'SoFi Stadium, Inglewood, CA'
  WHERE home_team = 'Belgium' AND away_team = 'Iran';
UPDATE matches SET venue = 'Hard Rock Stadium, Miami Gardens, FL'
  WHERE home_team = 'Uruguay' AND away_team = 'Cape Verde';
UPDATE matches SET venue = 'BC Place, Vancouver, BC'
  WHERE home_team = 'New Zealand' AND away_team = 'Egypt';
UPDATE matches SET venue = 'AT&T Stadium, Arlington, TX'
  WHERE home_team = 'Argentina' AND away_team = 'Austria';
UPDATE matches SET venue = 'Lincoln Financial Field, Philadelphia, PA'
  WHERE home_team = 'France' AND away_team = 'Iraq';
UPDATE matches SET venue = 'MetLife Stadium, East Rutherford, NJ'
  WHERE home_team = 'Norway' AND away_team = 'Senegal';
UPDATE matches SET venue = 'Levi''s Stadium, Santa Clara, CA'
  WHERE home_team = 'Jordan' AND away_team = 'Algeria';
UPDATE matches SET venue = 'NRG Stadium, Houston, TX'
  WHERE home_team = 'Portugal' AND away_team = 'Uzbekistan';
UPDATE matches SET venue = 'Gillette Stadium, Foxborough, MA'
  WHERE home_team = 'England' AND away_team = 'Ghana';
UPDATE matches SET venue = 'BMO Field, Toronto, ON'
  WHERE home_team = 'Panama' AND away_team = 'Croatia';
UPDATE matches SET venue = 'Estadio Akron, Guadalajara'
  WHERE home_team = 'Colombia' AND away_team = 'Congo DR';
UPDATE matches SET venue = 'BC Place, Vancouver, BC'
  WHERE home_team = 'Switzerland' AND away_team = 'Canada';
UPDATE matches SET venue = 'Lumen Field, Seattle, WA'
  WHERE home_team = 'Bosnia & Herzegovina' AND away_team = 'Qatar';
UPDATE matches SET venue = 'Hard Rock Stadium, Miami Gardens, FL'
  WHERE home_team = 'Scotland' AND away_team = 'Brazil';
UPDATE matches SET venue = 'Mercedes-Benz Stadium, Atlanta, GA'
  WHERE home_team = 'Morocco' AND away_team = 'Haiti';
UPDATE matches SET venue = 'Estadio Azteca, Mexico City'
  WHERE home_team = 'Czechia' AND away_team = 'Mexico';
UPDATE matches SET venue = 'Estadio Akron, Guadalajara'
  WHERE home_team = 'South Africa' AND away_team = 'South Korea';
UPDATE matches SET venue = 'MetLife Stadium, East Rutherford, NJ'
  WHERE home_team = 'Ecuador' AND away_team = 'Germany';
UPDATE matches SET venue = 'Lincoln Financial Field, Philadelphia, PA'
  WHERE home_team = 'Curaçao' AND away_team = 'Ivory Coast';
UPDATE matches SET venue = 'AT&T Stadium, Arlington, TX'
  WHERE home_team = 'Japan' AND away_team = 'Sweden';
UPDATE matches SET venue = 'GEHA Field at Arrowhead Stadium, Kansas City, MO'
  WHERE home_team = 'Tunisia' AND away_team = 'Netherlands';
UPDATE matches SET venue = 'SoFi Stadium, Inglewood, CA'
  WHERE home_team = 'Türkiye' AND away_team = 'USA';
UPDATE matches SET venue = 'Levi''s Stadium, Santa Clara, CA'
  WHERE home_team = 'Paraguay' AND away_team = 'Australia';
UPDATE matches SET venue = 'Gillette Stadium, Foxborough, MA'
  WHERE home_team = 'Norway' AND away_team = 'France';
UPDATE matches SET venue = 'BMO Field, Toronto, ON'
  WHERE home_team = 'Senegal' AND away_team = 'Iraq';
UPDATE matches SET venue = 'NRG Stadium, Houston, TX'
  WHERE home_team = 'Cape Verde' AND away_team = 'Saudi Arabia';
UPDATE matches SET venue = 'Estadio Akron, Guadalajara'
  WHERE home_team = 'Uruguay' AND away_team = 'Spain';
UPDATE matches SET venue = 'Lumen Field, Seattle, WA'
  WHERE home_team = 'Egypt' AND away_team = 'Iran';
UPDATE matches SET venue = 'BC Place, Vancouver, BC'
  WHERE home_team = 'New Zealand' AND away_team = 'Belgium';
UPDATE matches SET venue = 'MetLife Stadium, East Rutherford, NJ'
  WHERE home_team = 'Panama' AND away_team = 'England';
UPDATE matches SET venue = 'Lincoln Financial Field, Philadelphia, PA'
  WHERE home_team = 'Croatia' AND away_team = 'Ghana';
UPDATE matches SET venue = 'Hard Rock Stadium, Miami Gardens, FL'
  WHERE home_team = 'Colombia' AND away_team = 'Portugal';
UPDATE matches SET venue = 'Mercedes-Benz Stadium, Atlanta, GA'
  WHERE home_team = 'Congo DR' AND away_team = 'Uzbekistan';
UPDATE matches SET venue = 'GEHA Field at Arrowhead Stadium, Kansas City, MO'
  WHERE home_team = 'Algeria' AND away_team = 'Austria';
UPDATE matches SET venue = 'AT&T Stadium, Arlington, TX'
  WHERE home_team = 'Jordan' AND away_team = 'Argentina';

-- =============================================================
-- PART 4: Replace knockout stage matches (no patron entries yet)
-- Deletes all knockout rows then inserts the correct 32.
-- =============================================================

DELETE FROM matches WHERE stage IN (
  'Round of 32', 'Round of 16', 'Quarter Final', 'Semi Final', 'Third Place', 'Final'
);

INSERT INTO matches (home_team, away_team, home_flag, away_flag, kickoff_at, entries_close_at, stage, is_active, venue) VALUES

-- R32 (M73-M88)
('Group A Runner-up', 'Group B Runner-up',    '🏳','🏳', '2026-06-28 19:00:00+00', '2026-06-28 20:45:00+00', 'Round of 32', false, 'SoFi Stadium, Inglewood, CA'),
('Group C Winner',    'Group F Runner-up',     '🏳','🏳', '2026-06-29 17:00:00+00', '2026-06-29 18:45:00+00', 'Round of 32', false, 'NRG Stadium, Houston, TX'),
('Group E Winner',    '3rd Place (A/B/C/D/F)', '🏳','🏳', '2026-06-29 20:30:00+00', '2026-06-29 22:15:00+00', 'Round of 32', false, 'Gillette Stadium, Foxborough, MA'),
('Group F Winner',    'Group C Runner-up',      '🏳','🏳', '2026-06-30 01:00:00+00', '2026-06-30 02:45:00+00', 'Round of 32', false, 'Estadio BBVA, Monterrey'),
('Group E Runner-up', 'Group I Runner-up',      '🏳','🏳', '2026-06-30 17:00:00+00', '2026-06-30 18:45:00+00', 'Round of 32', false, 'AT&T Stadium, Arlington, TX'),
('Group I Winner',    '3rd Place (C/D/F/G/H)',  '🏳','🏳', '2026-06-30 21:00:00+00', '2026-06-30 22:45:00+00', 'Round of 32', false, 'MetLife Stadium, East Rutherford, NJ'),
('Group A Winner',    '3rd Place (C/E/F/H/I)',  '🏳','🏳', '2026-07-01 01:00:00+00', '2026-07-01 02:45:00+00', 'Round of 32', false, 'Estadio Azteca, Mexico City'),
('Group L Winner',    '3rd Place (E/H/I/J/K)',  '🏳','🏳', '2026-07-01 16:00:00+00', '2026-07-01 17:45:00+00', 'Round of 32', false, 'Mercedes-Benz Stadium, Atlanta, GA'),
('Group G Winner',    '3rd Place (A/E/H/I/J)',  '🏳','🏳', '2026-07-01 20:00:00+00', '2026-07-01 21:45:00+00', 'Round of 32', false, 'Lumen Field, Seattle, WA'),
('Group D Winner',    '3rd Place (B/E/F/I/J)',  '🏳','🏳', '2026-07-02 00:00:00+00', '2026-07-02 01:45:00+00', 'Round of 32', false, 'Levi''s Stadium, Santa Clara, CA'),
('Group H Winner',    'Group J Runner-up',       '🏳','🏳', '2026-07-02 19:00:00+00', '2026-07-02 20:45:00+00', 'Round of 32', false, 'SoFi Stadium, Inglewood, CA'),
('Group K Runner-up', 'Group L Runner-up',       '🏳','🏳', '2026-07-02 23:00:00+00', '2026-07-03 00:45:00+00', 'Round of 32', false, 'BMO Field, Toronto, ON'),
('Group B Winner',    '3rd Place (E/F/G/I/J)',   '🏳','🏳', '2026-07-03 03:00:00+00', '2026-07-03 04:45:00+00', 'Round of 32', false, 'BC Place, Vancouver, BC'),
('Group D Runner-up', 'Group G Runner-up',        '🏳','🏳', '2026-07-03 18:00:00+00', '2026-07-03 19:45:00+00', 'Round of 32', false, 'AT&T Stadium, Arlington, TX'),
('Group J Winner',    'Group H Runner-up',         '🏳','🏳', '2026-07-03 22:00:00+00', '2026-07-03 23:45:00+00', 'Round of 32', false, 'Hard Rock Stadium, Miami Gardens, FL'),
('Group K Winner',    '3rd Place (D/E/I/J/L)',    '🏳','🏳', '2026-07-04 01:30:00+00', '2026-07-04 03:15:00+00', 'Round of 32', false, 'GEHA Field at Arrowhead Stadium, Kansas City, MO'),

-- R16 (M89-M96)
('Match 73 Winner','Match 75 Winner','🏳','🏳', '2026-07-04 17:00:00+00', '2026-07-04 18:45:00+00', 'Round of 16', false, 'NRG Stadium, Houston, TX'),
('Match 74 Winner','Match 77 Winner','🏳','🏳', '2026-07-04 21:00:00+00', '2026-07-04 22:45:00+00', 'Round of 16', false, 'Lincoln Financial Field, Philadelphia, PA'),
('Match 76 Winner','Match 78 Winner','🏳','🏳', '2026-07-05 20:00:00+00', '2026-07-05 21:45:00+00', 'Round of 16', false, 'MetLife Stadium, East Rutherford, NJ'),
('Match 79 Winner','Match 80 Winner','🏳','🏳', '2026-07-06 00:00:00+00', '2026-07-06 01:45:00+00', 'Round of 16', false, 'Estadio Azteca, Mexico City'),
('Match 83 Winner','Match 84 Winner','🏳','🏳', '2026-07-06 19:00:00+00', '2026-07-06 20:45:00+00', 'Round of 16', false, 'AT&T Stadium, Arlington, TX'),
('Match 81 Winner','Match 82 Winner','🏳','🏳', '2026-07-06 21:00:00+00', '2026-07-06 22:45:00+00', 'Round of 16', false, 'Lumen Field, Seattle, WA'),
('Match 86 Winner','Match 88 Winner','🏳','🏳', '2026-07-07 16:00:00+00', '2026-07-07 17:45:00+00', 'Round of 16', false, 'Mercedes-Benz Stadium, Atlanta, GA'),
('Match 85 Winner','Match 87 Winner','🏳','🏳', '2026-07-07 20:00:00+00', '2026-07-07 21:45:00+00', 'Round of 16', false, 'BC Place, Vancouver, BC'),

-- QF (M97-M100)
('Match 89 Winner','Match 90 Winner','🏳','🏳', '2026-07-09 20:00:00+00', '2026-07-09 21:45:00+00', 'Quarter Final', false, 'Gillette Stadium, Foxborough, MA'),
('Match 93 Winner','Match 94 Winner','🏳','🏳', '2026-07-10 19:00:00+00', '2026-07-10 20:45:00+00', 'Quarter Final', false, 'SoFi Stadium, Inglewood, CA'),
('Match 91 Winner','Match 92 Winner','🏳','🏳', '2026-07-11 21:00:00+00', '2026-07-11 22:45:00+00', 'Quarter Final', false, 'Hard Rock Stadium, Miami Gardens, FL'),
('Match 95 Winner','Match 96 Winner','🏳','🏳', '2026-07-12 01:00:00+00', '2026-07-12 02:45:00+00', 'Quarter Final', false, 'GEHA Field at Arrowhead Stadium, Kansas City, MO'),

-- SF (M101-M102)
('Match 97 Winner', 'Match 98 Winner', '🏳','🏳', '2026-07-14 19:00:00+00', '2026-07-14 20:45:00+00', 'Semi Final', false, 'AT&T Stadium, Arlington, TX'),
('Match 99 Winner', 'Match 100 Winner','🏳','🏳', '2026-07-15 19:00:00+00', '2026-07-15 20:45:00+00', 'Semi Final', false, 'Mercedes-Benz Stadium, Atlanta, GA'),

-- Third Place (M103) and Final (M104)
('Match 101 Loser', 'Match 102 Loser',  '🏳','🏳', '2026-07-18 21:00:00+00', '2026-07-18 22:45:00+00', 'Third Place', false, 'Hard Rock Stadium, Miami Gardens, FL'),
('Match 101 Winner','Match 102 Winner', '🏳','🏳', '2026-07-19 19:00:00+00', '2026-07-19 20:45:00+00', 'Final',       false, 'MetLife Stadium, East Rutherford, NJ');

COMMIT;
