-- 2026 FIFA World Cup - Full Match Schedule
-- All times in ET, converted to UTC for storage (ET = UTC-4 in summer)
-- Run this in Supabase SQL Editor AFTER schema.sql
-- Note: is_active is false for all - use admin panel to activate each match

-- First, clear any existing test matches
delete from matches;

insert into matches (home_team, away_team, home_flag, away_flag, kickoff_at, entries_close_at, stage, is_active) values

-- =====================
-- GROUP STAGE
-- =====================

-- June 11
('Mexico',      'South Africa', '🇲🇽', '🇿🇦', '2026-06-11 19:00:00+00', '2026-06-11 19:00:00+00', 'Group A', false),
('South Korea', 'Czechia',      '🇰🇷', '🇨🇿', '2026-06-12 02:00:00+00', '2026-06-12 02:00:00+00', 'Group A', false),

-- June 12
('Canada',      'Bosnia & Herzegovina', '🇨🇦', '🇧🇦', '2026-06-12 19:00:00+00', '2026-06-12 19:00:00+00', 'Group B', false),
('USA',         'Paraguay',     '🇺🇸', '🇵🇾', '2026-06-13 01:00:00+00', '2026-06-13 01:00:00+00', 'Group D', false),

-- June 13
('Qatar',       'Switzerland',  '🇶🇦', '🇨🇭', '2026-06-13 19:00:00+00', '2026-06-13 19:00:00+00', 'Group B', false),
('Brazil',      'Morocco',      '🇧🇷', '🇲🇦', '2026-06-13 22:00:00+00', '2026-06-13 22:00:00+00', 'Group C', false),
('Haiti',       'Scotland',     '🇭🇹', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '2026-06-14 01:00:00+00', '2026-06-14 01:00:00+00', 'Group C', false),
('Australia',   'Türkiye',      '🇦🇺', '🇹🇷', '2026-06-14 04:00:00+00', '2026-06-14 04:00:00+00', 'Group D', false),

-- June 14
('Germany',     'Curaçao',      '🇩🇪', '🇨🇼', '2026-06-14 17:00:00+00', '2026-06-14 17:00:00+00', 'Group E', false),
('Netherlands', 'Japan',        '🇳🇱', '🇯🇵', '2026-06-14 20:00:00+00', '2026-06-14 20:00:00+00', 'Group F', false),
('Ivory Coast', 'Ecuador',      '🇨🇮', '🇪🇨', '2026-06-14 23:00:00+00', '2026-06-14 23:00:00+00', 'Group E', false),
('Tunisia',     'Sweden',       '🇹🇳', '🇸🇪', '2026-06-15 02:00:00+00', '2026-06-15 02:00:00+00', 'Group F', false),

-- June 15
('Spain',       'Cape Verde',   '🇪🇸', '🇨🇻', '2026-06-15 16:00:00+00', '2026-06-15 16:00:00+00', 'Group H', false),
('Belgium',     'Egypt',        '🇧🇪', '🇪🇬', '2026-06-15 19:00:00+00', '2026-06-15 19:00:00+00', 'Group G', false),
('Saudi Arabia','Uruguay',      '🇸🇦', '🇺🇾', '2026-06-15 22:00:00+00', '2026-06-15 22:00:00+00', 'Group H', false),
('Iran',        'New Zealand',  '🇮🇷', '🇳🇿', '2026-06-16 01:00:00+00', '2026-06-16 01:00:00+00', 'Group G', false),

-- June 16
('France',      'Senegal',      '🇫🇷', '🇸🇳', '2026-06-16 19:00:00+00', '2026-06-16 19:00:00+00', 'Group I', false),
('Iraq',        'Norway',       '🇮🇶', '🇳🇴', '2026-06-16 22:00:00+00', '2026-06-16 22:00:00+00', 'Group I', false),
('Argentina',   'Algeria',      '🇦🇷', '🇩🇿', '2026-06-17 01:00:00+00', '2026-06-17 01:00:00+00', 'Group J', false),
('Austria',     'Jordan',       '🇦🇹', '🇯🇴', '2026-06-17 04:00:00+00', '2026-06-17 04:00:00+00', 'Group J', false),

-- June 17
('Portugal',    'Congo DR',     '🇵🇹', '🇨🇩', '2026-06-17 17:00:00+00', '2026-06-17 17:00:00+00', 'Group K', false),
('England',     'Croatia',      '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇭🇷', '2026-06-17 20:00:00+00', '2026-06-17 20:00:00+00', 'Group L', false),
('Ghana',       'Panama',       '🇬🇭', '🇵🇦', '2026-06-17 23:00:00+00', '2026-06-17 23:00:00+00', 'Group L', false),
('Uzbekistan',  'Colombia',     '🇺🇿', '🇨🇴', '2026-06-18 02:00:00+00', '2026-06-18 02:00:00+00', 'Group K', false),

-- June 18
('Czechia',     'South Africa', '🇨🇿', '🇿🇦', '2026-06-18 16:00:00+00', '2026-06-18 16:00:00+00', 'Group A', false),
('Switzerland', 'Bosnia & Herzegovina', '🇨🇭', '🇧🇦', '2026-06-18 19:00:00+00', '2026-06-18 19:00:00+00', 'Group B', false),
('Canada',      'Qatar',        '🇨🇦', '🇶🇦', '2026-06-18 22:00:00+00', '2026-06-18 22:00:00+00', 'Group B', false),
('Mexico',      'South Korea',  '🇲🇽', '🇰🇷', '2026-06-19 01:00:00+00', '2026-06-19 01:00:00+00', 'Group A', false),

-- June 19
('USA',         'Australia',    '🇺🇸', '🇦🇺', '2026-06-19 19:00:00+00', '2026-06-19 19:00:00+00', 'Group D', false),
('Scotland',    'Morocco',      '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🇲🇦', '2026-06-19 19:00:00+00', '2026-06-19 19:00:00+00', 'Group C', false),
('Brazil',      'Haiti',        '🇧🇷', '🇭🇹', '2026-06-20 01:00:00+00', '2026-06-20 01:00:00+00', 'Group C', false),
('Türkiye',     'Paraguay',     '🇹🇷', '🇵🇾', '2026-06-20 04:00:00+00', '2026-06-20 04:00:00+00', 'Group D', false),

-- June 20
('Netherlands', 'Sweden',       '🇳🇱', '🇸🇪', '2026-06-20 17:00:00+00', '2026-06-20 17:00:00+00', 'Group F', false),
('Germany',     'Ivory Coast',  '🇩🇪', '🇨🇮', '2026-06-20 20:00:00+00', '2026-06-20 20:00:00+00', 'Group E', false),
('Ecuador',     'Curaçao',      '🇪🇨', '🇨🇼', '2026-06-21 00:00:00+00', '2026-06-21 00:00:00+00', 'Group E', false),
('Tunisia',     'Japan',        '🇹🇳', '🇯🇵', '2026-06-21 04:00:00+00', '2026-06-21 04:00:00+00', 'Group F', false),

-- June 21
('Spain',       'Saudi Arabia', '🇪🇸', '🇸🇦', '2026-06-21 16:00:00+00', '2026-06-21 16:00:00+00', 'Group H', false),
('Belgium',     'Iran',         '🇧🇪', '🇮🇷', '2026-06-21 19:00:00+00', '2026-06-21 19:00:00+00', 'Group G', false),
('Uruguay',     'Cape Verde',   '🇺🇾', '🇨🇻', '2026-06-21 22:00:00+00', '2026-06-21 22:00:00+00', 'Group H', false),
('New Zealand', 'Egypt',        '🇳🇿', '🇪🇬', '2026-06-22 01:00:00+00', '2026-06-22 01:00:00+00', 'Group G', false),

-- June 22
('Argentina',   'Austria',      '🇦🇷', '🇦🇹', '2026-06-22 17:00:00+00', '2026-06-22 17:00:00+00', 'Group J', false),
('France',      'Iraq',         '🇫🇷', '🇮🇶', '2026-06-22 21:00:00+00', '2026-06-22 21:00:00+00', 'Group I', false),
('Norway',      'Senegal',      '🇳🇴', '🇸🇳', '2026-06-23 00:00:00+00', '2026-06-23 00:00:00+00', 'Group I', false),
('Jordan',      'Algeria',      '🇯🇴', '🇩🇿', '2026-06-23 03:00:00+00', '2026-06-23 03:00:00+00', 'Group J', false),

-- June 23
('Portugal',    'Uzbekistan',   '🇵🇹', '🇺🇿', '2026-06-23 17:00:00+00', '2026-06-23 17:00:00+00', 'Group K', false),
('England',     'Ghana',        '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇬🇭', '2026-06-23 20:00:00+00', '2026-06-23 20:00:00+00', 'Group L', false),
('Panama',      'Croatia',      '🇵🇦', '🇭🇷', '2026-06-23 23:00:00+00', '2026-06-23 23:00:00+00', 'Group L', false),
('Colombia',    'Congo DR',     '🇨🇴', '🇨🇩', '2026-06-24 02:00:00+00', '2026-06-24 02:00:00+00', 'Group K', false),

-- June 24
('Switzerland', 'Canada',       '🇨🇭', '🇨🇦', '2026-06-24 19:00:00+00', '2026-06-24 19:00:00+00', 'Group B', false),
('Bosnia & Herzegovina', 'Qatar', '🇧🇦', '🇶🇦', '2026-06-24 19:00:00+00', '2026-06-24 19:00:00+00', 'Group B', false),
('Brazil',      'Scotland',     '🇧🇷', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '2026-06-24 22:00:00+00', '2026-06-24 22:00:00+00', 'Group C', false),
('Morocco',     'Haiti',        '🇲🇦', '🇭🇹', '2026-06-24 22:00:00+00', '2026-06-24 22:00:00+00', 'Group C', false),
('Mexico',      'Czechia',      '🇲🇽', '🇨🇿', '2026-06-25 01:00:00+00', '2026-06-25 01:00:00+00', 'Group A', false),
('South Korea', 'South Africa', '🇰🇷', '🇿🇦', '2026-06-25 01:00:00+00', '2026-06-25 01:00:00+00', 'Group A', false),

-- June 25
('Ecuador',     'Germany',      '🇪🇨', '🇩🇪', '2026-06-25 20:00:00+00', '2026-06-25 20:00:00+00', 'Group E', false),
('Curaçao',     'Ivory Coast',  '🇨🇼', '🇨🇮', '2026-06-25 20:00:00+00', '2026-06-25 20:00:00+00', 'Group E', false),
('Tunisia',     'Netherlands',  '🇹🇳', '🇳🇱', '2026-06-25 23:00:00+00', '2026-06-25 23:00:00+00', 'Group F', false),
('Japan',       'Sweden',       '🇯🇵', '🇸🇪', '2026-06-25 23:00:00+00', '2026-06-25 23:00:00+00', 'Group F', false),
('USA',         'Türkiye',      '🇺🇸', '🇹🇷', '2026-06-26 02:00:00+00', '2026-06-26 02:00:00+00', 'Group D', false),
('Paraguay',    'Australia',    '🇵🇾', '🇦🇺', '2026-06-26 02:00:00+00', '2026-06-26 02:00:00+00', 'Group D', false),

-- June 26
('Norway',      'France',       '🇳🇴', '🇫🇷', '2026-06-26 19:00:00+00', '2026-06-26 19:00:00+00', 'Group I', false),
('Senegal',     'Iraq',         '🇸🇳', '🇮🇶', '2026-06-26 19:00:00+00', '2026-06-26 19:00:00+00', 'Group I', false),
('Uruguay',     'Spain',        '🇺🇾', '🇪🇸', '2026-06-27 00:00:00+00', '2026-06-27 00:00:00+00', 'Group H', false),
('Cape Verde',  'Saudi Arabia', '🇨🇻', '🇸🇦', '2026-06-27 00:00:00+00', '2026-06-27 00:00:00+00', 'Group H', false),
('New Zealand', 'Belgium',      '🇳🇿', '🇧🇪', '2026-06-27 03:00:00+00', '2026-06-27 03:00:00+00', 'Group G', false),
('Egypt',       'Iran',         '🇪🇬', '🇮🇷', '2026-06-27 03:00:00+00', '2026-06-27 03:00:00+00', 'Group G', false),

-- June 27
('Panama',      'England',      '🇵🇦', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '2026-06-27 21:00:00+00', '2026-06-27 21:00:00+00', 'Group L', false),
('Croatia',     'Ghana',        '🇭🇷', '🇬🇭', '2026-06-27 21:00:00+00', '2026-06-27 21:00:00+00', 'Group L', false),
('Colombia',    'Portugal',     '🇨🇴', '🇵🇹', '2026-06-28 00:00:00+00', '2026-06-28 00:00:00+00', 'Group K', false),
('Congo DR',    'Uzbekistan',   '🇨🇩', '🇺🇿', '2026-06-28 00:00:00+00', '2026-06-28 00:00:00+00', 'Group K', false),
('Argentina',   'Jordan',       '🇦🇷', '🇯🇴', '2026-06-28 03:00:00+00', '2026-06-28 03:00:00+00', 'Group J', false),
('Algeria',     'Austria',      '🇩🇿', '🇦🇹', '2026-06-28 03:00:00+00', '2026-06-28 03:00:00+00', 'Group J', false),

-- =====================
-- ROUND OF 32 (TBD teams - using placeholders)
-- =====================
('Group A Winner',   'Group B Runner-up',   '🏳', '🏳', '2026-06-28 19:00:00+00', '2026-06-28 19:00:00+00', 'Round of 32', false),
('Group C Winner',   'Group D Runner-up',   '🏳', '🏳', '2026-06-28 23:00:00+00', '2026-06-28 23:00:00+00', 'Round of 32', false),
('Group A Runner-up','Group B Runner-up',   '🏳', '🏳', '2026-06-28 19:00:00+00', '2026-06-28 19:00:00+00', 'Round of 32', false),
('Group E Winner',   '3rd Place (A/B/C/D/F)','🏳', '🏳', '2026-06-29 20:30:00+00', '2026-06-29 20:30:00+00', 'Round of 32', false),
('Group F Winner',   'Group C Runner-up',   '🏳', '🏳', '2026-06-30 01:00:00+00', '2026-06-30 01:00:00+00', 'Round of 32', false),
('Group I Winner',   '3rd Place (C/D/F/G/H)','🏳', '🏳', '2026-06-30 21:00:00+00', '2026-06-30 21:00:00+00', 'Round of 32', false),
('Group E Runner-up','Group I Runner-up',   '🏳', '🏳', '2026-06-30 17:00:00+00', '2026-06-30 17:00:00+00', 'Round of 32', false),
('Group A Winner',   '3rd Place (C/E/F/H/I)','🏳', '🏳', '2026-07-01 01:00:00+00', '2026-07-01 01:00:00+00', 'Round of 32', false),
('Group L Winner',   '3rd Place (E/H/I/J/K)','🏳', '🏳', '2026-07-01 16:00:00+00', '2026-07-01 16:00:00+00', 'Round of 32', false),
('Group G Winner',   '3rd Place (A/E/H/I/J)','🏳', '🏳', '2026-07-01 20:00:00+00', '2026-07-01 20:00:00+00', 'Round of 32', false),
('Group D Winner',   '3rd Place (B/E/F/I/J)','🏳', '🏳', '2026-07-02 00:00:00+00', '2026-07-02 00:00:00+00', 'Round of 32', false),
('Group H Winner',   'Group J Runner-up',   '🏳', '🏳', '2026-07-02 19:00:00+00', '2026-07-02 19:00:00+00', 'Round of 32', false),
('Group K Runner-up','Group L Runner-up',   '🏳', '🏳', '2026-07-02 23:00:00+00', '2026-07-02 23:00:00+00', 'Round of 32', false),
('Group B Winner',   '3rd Place (E/F/G/I/J)','🏳', '🏳', '2026-07-03 03:00:00+00', '2026-07-03 03:00:00+00', 'Round of 32', false),
('Group D Runner-up','Group G Runner-up',   '🏳', '🏳', '2026-07-03 18:00:00+00', '2026-07-03 18:00:00+00', 'Round of 32', false),
('Group J Winner',   'Group H Runner-up',   '🏳', '🏳', '2026-07-03 22:00:00+00', '2026-07-03 22:00:00+00', 'Round of 32', false),
('Group K Winner',   '3rd Place (D/E/I/J/L)','🏳', '🏳', '2026-07-04 01:30:00+00', '2026-07-04 01:30:00+00', 'Round of 32', false),

-- =====================
-- ROUND OF 16 (TBD)
-- =====================
('R32 Match 73 Winner','R32 Match 75 Winner','🏳', '🏳', '2026-07-04 17:00:00+00', '2026-07-04 17:00:00+00', 'Round of 16', false),
('R32 Match 74 Winner','R32 Match 77 Winner','🏳', '🏳', '2026-07-04 21:00:00+00', '2026-07-04 21:00:00+00', 'Round of 16', false),
('R32 Match 76 Winner','R32 Match 78 Winner','🏳', '🏳', '2026-07-05 21:00:00+00', '2026-07-05 21:00:00+00', 'Round of 16', false),
('R32 Match 79 Winner','R32 Match 80 Winner','🏳', '🏳', '2026-07-06 01:00:00+00', '2026-07-06 01:00:00+00', 'Round of 16', false),
('R32 Match 81 Winner','R32 Match 82 Winner','🏳', '🏳', '2026-07-06 21:00:00+00', '2026-07-06 21:00:00+00', 'Round of 16', false),
('R32 Match 83 Winner','R32 Match 84 Winner','🏳', '🏳', '2026-07-07 01:00:00+00', '2026-07-07 01:00:00+00', 'Round of 16', false),
('R32 Match 85 Winner','R32 Match 86 Winner','🏳', '🏳', '2026-07-07 21:00:00+00', '2026-07-07 21:00:00+00', 'Round of 16', false),
('R32 Match 87 Winner','R32 Match 88 Winner','🏳', '🏳', '2026-07-08 01:00:00+00', '2026-07-08 01:00:00+00', 'Round of 16', false),

-- =====================
-- QUARTER FINALS (TBD)
-- =====================
('QF1 TBD', 'QF1 TBD', '🏳', '🏳', '2026-07-10 21:00:00+00', '2026-07-10 21:00:00+00', 'Quarter Final', false),
('QF2 TBD', 'QF2 TBD', '🏳', '🏳', '2026-07-11 01:00:00+00', '2026-07-11 01:00:00+00', 'Quarter Final', false),
('QF3 TBD', 'QF3 TBD', '🏳', '🏳', '2026-07-11 21:00:00+00', '2026-07-11 21:00:00+00', 'Quarter Final', false),
('QF4 TBD', 'QF4 TBD', '🏳', '🏳', '2026-07-12 01:00:00+00', '2026-07-12 01:00:00+00', 'Quarter Final', false),

-- =====================
-- SEMI FINALS (TBD)
-- =====================
('SF1 TBD', 'SF1 TBD', '🏳', '🏳', '2026-07-14 21:00:00+00', '2026-07-14 21:00:00+00', 'Semi Final', false),
('SF2 TBD', 'SF2 TBD', '🏳', '🏳', '2026-07-15 21:00:00+00', '2026-07-15 21:00:00+00', 'Semi Final', false),

-- =====================
-- THIRD PLACE & FINAL
-- =====================
('3rd Place TBD', '3rd Place TBD', '🏳', '🏳', '2026-07-18 21:00:00+00', '2026-07-18 21:00:00+00', 'Third Place', false),
('Final TBD',     'Final TBD',     '🏳', '🏳', '2026-07-19 19:00:00+00', '2026-07-19 19:00:00+00', 'Final',       false);
