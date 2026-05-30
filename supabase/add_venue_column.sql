-- Migration: add venue column to matches
-- Run this once in Supabase SQL editor (Settings → SQL Editor)
-- Last updated: 2026-05-30

alter table matches add column if not exists venue text default null;

-- ── WC 2026 Group Stage Venues ──────────────────────────────────────────────
-- Populate by matching home_team + away_team + kickoff date.
-- Using kickoff_at::date to be timezone-safe.

-- Group A — Estadio Azteca, Mexico City  /  SoFi Stadium, Inglewood CA
update matches set venue = 'Estadio Azteca, Mexico City'          where home_team='Mexico'      and away_team='South Africa'     and kickoff_at::date='2026-06-11';
update matches set venue = 'SoFi Stadium, Inglewood, CA'          where home_team='South Korea'  and away_team='Czechia'          and kickoff_at::date='2026-06-12';
update matches set venue = 'SoFi Stadium, Inglewood, CA'          where home_team='Czechia'      and away_team='South Africa'     and kickoff_at::date='2026-06-18';
update matches set venue = 'Estadio Azteca, Mexico City'          where home_team='Mexico'       and away_team='South Korea'      and kickoff_at::date='2026-06-19';
update matches set venue = 'Estadio Azteca, Mexico City'          where home_team='Czechia'      and away_team='Mexico'           and kickoff_at::date='2026-06-25';
update matches set venue = 'SoFi Stadium, Inglewood, CA'          where home_team='South Africa' and away_team='South Korea'      and kickoff_at::date='2026-06-25';

-- Group B — AT&T Stadium, Arlington TX  /  BC Place, Vancouver BC
update matches set venue = 'AT&T Stadium, Arlington, TX'          where home_team='Canada'       and away_team='Bosnia-Herzegovina' and kickoff_at::date='2026-06-12';
update matches set venue = 'AT&T Stadium, Arlington, TX'          where home_team='Qatar'        and away_team='Switzerland'      and kickoff_at::date='2026-06-13';
update matches set venue = 'BC Place, Vancouver, BC'              where home_team='Switzerland'  and away_team='Bosnia-Herzegovina' and kickoff_at::date='2026-06-18';
update matches set venue = 'BC Place, Vancouver, BC'              where home_team='Canada'       and away_team='Qatar'            and kickoff_at::date='2026-06-18';
update matches set venue = 'AT&T Stadium, Arlington, TX'          where home_team='Switzerland'  and away_team='Canada'           and kickoff_at::date='2026-06-24';
update matches set venue = 'BC Place, Vancouver, BC'              where home_team='Bosnia-Herzegovina' and away_team='Qatar'      and kickoff_at::date='2026-06-24';

-- Group C — Estadio BBVA, Monterrey  /  Empower Field, Denver CO
update matches set venue = 'Estadio BBVA, Monterrey'              where home_team='Brazil'       and away_team='Morocco'          and kickoff_at::date='2026-06-13';
update matches set venue = 'Empower Field at Mile High, Denver, CO' where home_team='Haiti'      and away_team='Scotland'         and kickoff_at::date='2026-06-14';
update matches set venue = 'Estadio BBVA, Monterrey'              where home_team='Scotland'     and away_team='Morocco'          and kickoff_at::date='2026-06-19';
update matches set venue = 'Empower Field at Mile High, Denver, CO' where home_team='Brazil'     and away_team='Haiti'            and kickoff_at::date='2026-06-20';
update matches set venue = 'Empower Field at Mile High, Denver, CO' where home_team='Morocco'    and away_team='Haiti'            and kickoff_at::date='2026-06-24';
update matches set venue = 'Estadio BBVA, Monterrey'              where home_team='Scotland'     and away_team='Brazil'           and kickoff_at::date='2026-06-24';

-- Group D — MetLife Stadium, East Rutherford NJ  /  Estadio Akron, Guadalajara
update matches set venue = 'MetLife Stadium, East Rutherford, NJ' where home_team='United States' and away_team='Paraguay'        and kickoff_at::date='2026-06-13';
update matches set venue = 'Estadio Akron, Guadalajara'           where home_team='Australia'    and away_team='Turkey'           and kickoff_at::date='2026-06-14';
update matches set venue = 'MetLife Stadium, East Rutherford, NJ' where home_team='United States' and away_team='Australia'       and kickoff_at::date='2026-06-19';
update matches set venue = 'Estadio Akron, Guadalajara'           where home_team='Turkey'       and away_team='Paraguay'         and kickoff_at::date='2026-06-20';
update matches set venue = 'MetLife Stadium, East Rutherford, NJ' where home_team='Turkey'       and away_team='United States'    and kickoff_at::date='2026-06-26';
update matches set venue = 'Estadio Akron, Guadalajara'           where home_team='Paraguay'     and away_team='Australia'        and kickoff_at::date='2026-06-26';

-- Group E — Levi's Stadium, Santa Clara CA  /  Arrowhead Stadium, Kansas City MO
update matches set venue = 'Levi''s Stadium, Santa Clara, CA'     where home_team='Germany'      and away_team='Curaçao'          and kickoff_at::date='2026-06-14';
update matches set venue = 'Arrowhead Stadium, Kansas City, MO'   where home_team='Ivory Coast'  and away_team='Ecuador'          and kickoff_at::date='2026-06-14';
update matches set venue = 'Arrowhead Stadium, Kansas City, MO'   where home_team='Germany'      and away_team='Ivory Coast'      and kickoff_at::date='2026-06-20';
update matches set venue = 'Levi''s Stadium, Santa Clara, CA'     where home_team='Ecuador'      and away_team='Curaçao'          and kickoff_at::date='2026-06-21';
update matches set venue = 'Levi''s Stadium, Santa Clara, CA'     where home_team='Ecuador'      and away_team='Germany'          and kickoff_at::date='2026-06-25';
update matches set venue = 'Arrowhead Stadium, Kansas City, MO'   where home_team='Curaçao'      and away_team='Ivory Coast'      and kickoff_at::date='2026-06-25';

-- Group F — Hard Rock Stadium, Miami Gardens FL  /  BMO Field, Toronto ON
update matches set venue = 'Hard Rock Stadium, Miami Gardens, FL' where home_team='Netherlands'  and away_team='Japan'            and kickoff_at::date='2026-06-14';
update matches set venue = 'BMO Field, Toronto, ON'               where home_team='Sweden'       and away_team='Tunisia'          and kickoff_at::date='2026-06-15';
update matches set venue = 'Hard Rock Stadium, Miami Gardens, FL' where home_team='Netherlands'  and away_team='Sweden'           and kickoff_at::date='2026-06-20';
update matches set venue = 'BMO Field, Toronto, ON'               where home_team='Tunisia'      and away_team='Japan'            and kickoff_at::date='2026-06-21';
update matches set venue = 'BMO Field, Toronto, ON'               where home_team='Tunisia'      and away_team='Netherlands'      and kickoff_at::date='2026-06-25';
update matches set venue = 'Hard Rock Stadium, Miami Gardens, FL' where home_team='Japan'        and away_team='Sweden'           and kickoff_at::date='2026-06-25';

-- Group G — Gillette Stadium, Foxborough MA  /  NRG Stadium, Houston TX
update matches set venue = 'Gillette Stadium, Foxborough, MA'     where home_team='Belgium'      and away_team='Egypt'            and kickoff_at::date='2026-06-15';
update matches set venue = 'NRG Stadium, Houston, TX'             where home_team='Iran'         and away_team='New Zealand'      and kickoff_at::date='2026-06-16';
update matches set venue = 'Gillette Stadium, Foxborough, MA'     where home_team='Belgium'      and away_team='Iran'             and kickoff_at::date='2026-06-21';
update matches set venue = 'NRG Stadium, Houston, TX'             where home_team='New Zealand'  and away_team='Egypt'            and kickoff_at::date='2026-06-22';
update matches set venue = 'Gillette Stadium, Foxborough, MA'     where home_team='New Zealand'  and away_team='Belgium'          and kickoff_at::date='2026-06-27';
update matches set venue = 'NRG Stadium, Houston, TX'             where home_team='Egypt'        and away_team='Iran'             and kickoff_at::date='2026-06-27';

-- Group H — Lincoln Financial Field, Philadelphia PA  /  Lumen Field, Seattle WA
update matches set venue = 'Lincoln Financial Field, Philadelphia, PA' where home_team='Spain'   and away_team='Cape Verde Islands' and kickoff_at::date='2026-06-15';
update matches set venue = 'Lumen Field, Seattle, WA'             where home_team='Saudi Arabia' and away_team='Uruguay'          and kickoff_at::date='2026-06-15';
update matches set venue = 'Lincoln Financial Field, Philadelphia, PA' where home_team='Spain'   and away_team='Saudi Arabia'     and kickoff_at::date='2026-06-21';
update matches set venue = 'Lumen Field, Seattle, WA'             where home_team='Uruguay'      and away_team='Cape Verde Islands' and kickoff_at::date='2026-06-21';
update matches set venue = 'Lumen Field, Seattle, WA'             where home_team='Uruguay'      and away_team='Spain'            and kickoff_at::date='2026-06-27';
update matches set venue = 'Lincoln Financial Field, Philadelphia, PA' where home_team='Cape Verde Islands' and away_team='Saudi Arabia' and kickoff_at::date='2026-06-27';

-- Group I — SoFi Stadium, Inglewood CA  /  Levi's Stadium, Santa Clara CA
update matches set venue = 'SoFi Stadium, Inglewood, CA'          where home_team='France'       and away_team='Senegal'          and kickoff_at::date='2026-06-16';
update matches set venue = 'Levi''s Stadium, Santa Clara, CA'     where home_team='Iraq'         and away_team='Norway'           and kickoff_at::date='2026-06-16';
update matches set venue = 'SoFi Stadium, Inglewood, CA'          where home_team='France'       and away_team='Iraq'             and kickoff_at::date='2026-06-22';
update matches set venue = 'Levi''s Stadium, Santa Clara, CA'     where home_team='Norway'       and away_team='Senegal'          and kickoff_at::date='2026-06-23';
update matches set venue = 'SoFi Stadium, Inglewood, CA'          where home_team='Norway'       and away_team='France'           and kickoff_at::date='2026-06-26';
update matches set venue = 'Levi''s Stadium, Santa Clara, CA'     where home_team='Senegal'      and away_team='Iraq'             and kickoff_at::date='2026-06-26';

-- Group J — Estadio Azteca, Mexico City  /  Arrowhead Stadium, Kansas City MO
update matches set venue = 'Estadio Azteca, Mexico City'          where home_team='Argentina'    and away_team='Algeria'          and kickoff_at::date='2026-06-17';
update matches set venue = 'Arrowhead Stadium, Kansas City, MO'   where home_team='Austria'      and away_team='Jordan'           and kickoff_at::date='2026-06-17';
update matches set venue = 'Estadio Azteca, Mexico City'          where home_team='Argentina'    and away_team='Austria'          and kickoff_at::date='2026-06-22';
update matches set venue = 'Arrowhead Stadium, Kansas City, MO'   where home_team='Jordan'       and away_team='Algeria'          and kickoff_at::date='2026-06-23';
update matches set venue = 'Arrowhead Stadium, Kansas City, MO'   where home_team='Jordan'       and away_team='Argentina'        and kickoff_at::date='2026-06-28';
update matches set venue = 'Estadio Azteca, Mexico City'          where home_team='Algeria'      and away_team='Austria'          and kickoff_at::date='2026-06-28';

-- Group K — NRG Stadium, Houston TX  /  Empower Field, Denver CO
update matches set venue = 'NRG Stadium, Houston, TX'             where home_team='Portugal'     and away_team='Congo DR'         and kickoff_at::date='2026-06-17';
update matches set venue = 'Empower Field at Mile High, Denver, CO' where home_team='Uzbekistan' and away_team='Colombia'         and kickoff_at::date='2026-06-18';
update matches set venue = 'NRG Stadium, Houston, TX'             where home_team='Portugal'     and away_team='Uzbekistan'       and kickoff_at::date='2026-06-23';
update matches set venue = 'Empower Field at Mile High, Denver, CO' where home_team='Colombia'   and away_team='Congo DR'         and kickoff_at::date='2026-06-24';
update matches set venue = 'Empower Field at Mile High, Denver, CO' where home_team='Colombia'   and away_team='Portugal'         and kickoff_at::date='2026-06-27';
update matches set venue = 'NRG Stadium, Houston, TX'             where home_team='Congo DR'     and away_team='Uzbekistan'       and kickoff_at::date='2026-06-27';

-- Group L — AT&T Stadium, Arlington TX  /  BMO Field, Toronto ON
update matches set venue = 'AT&T Stadium, Arlington, TX'          where home_team='England'      and away_team='Croatia'          and kickoff_at::date='2026-06-17';
update matches set venue = 'BMO Field, Toronto, ON'               where home_team='Ghana'        and away_team='Panama'           and kickoff_at::date='2026-06-17';
update matches set venue = 'AT&T Stadium, Arlington, TX'          where home_team='England'      and away_team='Ghana'            and kickoff_at::date='2026-06-23';
update matches set venue = 'BMO Field, Toronto, ON'               where home_team='Panama'       and away_team='Croatia'          and kickoff_at::date='2026-06-23';
update matches set venue = 'BMO Field, Toronto, ON'               where home_team='Panama'       and away_team='England'          and kickoff_at::date='2026-06-27';
update matches set venue = 'AT&T Stadium, Arlington, TX'          where home_team='Croatia'      and away_team='Ghana'            and kickoff_at::date='2026-06-27';

-- ── Knockout Rounds ──────────────────────────────────────────────────────────
-- Teams are TBD for knockout rounds — match by date only.
-- Round of 32 (June 28 – July 4)
-- Round of 16 (July 4 – July 8)
-- Quarter Finals (July 10 – July 12)
-- Semi Finals (July 14 – July 15)
-- Third Place (July 18)
-- Final (July 19) → MetLife Stadium

-- The final is confirmed at MetLife Stadium, East Rutherford, NJ
update matches set venue = 'MetLife Stadium, East Rutherford, NJ'
  where stage = 'Final';
