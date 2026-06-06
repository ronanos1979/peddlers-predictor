# Design & Architecture

Technical design document for Peddler's Predictor.

---

## Overview

A two-pub World Cup 2026 prediction game. Patrons predict match results on their phones at the bar. Correct picks earn raffle entries toward a TV giveaway at the Final (July 19, 2026). The app also tracks team standings, squad info, a knockout bracket, and a Golden Boot prediction.

---

## System Architecture

```
Patron's phone (mobile browser)
     │
     │  scan QR code at table
     ▼
Next.js 15 App (Vercel — auto-deploy from GitHub main)
     │
     ├── Client pages (React, no SSR)
     │     ├── /                        Entry form + nav
     │     ├── /leaderboard             Live standings
     │     ├── /schedule                All 104 matches
     │     ├── /my-picks                Patron history by phone
     │     ├── /admin                   Admin panel (password protected)
     │     ├── /feedback                Bug report form
     │     ├── /world-cup/groups        All 12 groups compact overview
     │     ├── /world-cup/standings     Group tables
     │     ├── /world-cup/results       Completed matches
     │     ├── /world-cup/bracket       Knockout bracket (R32→Final)
     │     ├── /world-cup/team          Team profile (squad, fixtures)
     │     ├── /world-cup/scorers       Golden Boot race
     │     ├── /world-cup/top-scorer-pick  Golden Boot prediction (+10 bonus)
     │     ├── /world-cup/winner-pick   World Cup Champion prediction (+15 bonus)
     │     └── /world-cup/winner-picks  Community champion vote counts
     │
     └── Server API routes (Node.js, secret key access)
           ├── /api/entries             Validate + save prediction
           ├── /api/matches             Current active match
           ├── /api/admin               Set results, admin actions (auto-scores winner_picks on Final)
           ├── /api/admin-data          Stats, entrants, feedback
           ├── /api/admin-teams         48-team cache status, FD load, AF enrichment
           ├── /api/feedback            Public feedback submission
           ├── /api/my-picks            Patron's picks by phone (entries + scorerPick + winnerPick)
           ├── /api/football            Football data proxy (FD primary, AF fallback, 5min cache)
           ├── /api/team                Team data (60-day Supabase cache, never calls APIs directly)
           └── /api/send-reminder       Match-day email reminders via Resend
                    │
                    ▼
          Supabase (hosted Postgres)          football-data.org v4 + API-Football v3
               │                                    │
               ├── pubs                 GET /standings, /fixtures, /topscorers
               ├── matches              GET /players/squads, /coaches (AF only)
               ├── entries              GET /teams (FD primary)
               ├── scorer_picks
               ├── winner_picks
               ├── check_ins
               ├── feedback
               ├── team_cache
               └── player_cache
```

---

## Database Schema

All tables in `supabase/master.sql`. Run once on a new project.

### pubs
Pub locations with GPS coordinates for geolocation check.

### matches
All 104 WC 2026 matches pre-loaded. `result` and `is_active` updated by admin. `entries_close_at = kickoff_at + 105 minutes`.

### entries
One row per patron prediction. `is_correct` and `raffle_entries` set by the `set_result` admin action.

### scorer_picks
One Golden Boot prediction per phone number. `is_correct` set manually by admin after the tournament. +10 raffle tickets if correct.

### winner_picks
One World Cup Champion prediction per phone number, locked once submitted. `is_correct` and `raffle_entries` auto-set when admin enters the Final result. +15 raffle tickets if correct.

### check_ins
Match attendance check-ins for in-match prize draws. One check-in per patron per match. Records optional `shared_to` (social share tracking).

### team_cache
Caches football-data.org team data (teamInfo, coach, fixtures). Pre-loaded by admin via `/api/admin-teams` — NOT auto-populated by page views. Squad data lives separately in `player_cache`. Clear with `truncate table team_cache; truncate table player_cache;` if stale.

### player_cache
One row per player with incremental photo/club enrichment via API-Football. `photo_enriched` and `club_enriched` flags track progress. Safe to re-load without losing enrichment columns.

### feedback
Patron bug reports and suggestions. Public insert only; read via admin service key. Visible in the admin panel Feedback tab with unread count.

---

## API-Football Integration

### Proxy: `/api/football`
- Keeps the API key server-side
- 5-minute in-memory cache
- League ID `1` (FIFA World Cup), Season `2026`

### Team data: `/api/team`
Handles both `?id=X` (numeric) and `?name=USA` (display name) lookups.

**Name resolution strategy** (in `src/lib/teamResolution.ts`):
1. Check `team_cache` by name (exact, case-insensitive)
2. Fetch WC 2026 teams list (`/teams?league=1&season=2026`) — scoped, no club teams
3. Fallback: search by aliased name (e.g. `usa` → `united states`), filter to **senior national teams only** (excludes U17/U20/Women etc.)
4. Require name overlap before returning any result — prevents unrelated teams being returned

**Name aliases** (Supabase display name → API-Football official):
- `USA` → `United States`
- `South Korea` → `Korea Republic`
- `Ivory Coast` → `Côte d'Ivoire`
- `Türkiye` → `Turkey`
- `Czechia` → `Czech Republic`

**Cache validation**: cached entries with youth team names (e.g. `United States U17`) are rejected and re-fetched.

### Pre-tournament behavior
- Squad data empty until ~June 1 — shows "Squad not yet announced"
- Fixture schedule may be empty — falls back to local Supabase match data
- WC teams list may be empty — falls back to name search

---

## Key Business Logic

### Daily patron code
Format: `peddlers` + day-of-month (e.g. `peddlers11` on June 11). Auto-generated, no admin needed. Yesterday's code also accepted for late-night matches.

### Match activation
Automatic based on `kickoff_at`. Entries close at `entries_close_at` (kickoff + 105 min). No admin action needed to open/close predictions.

### Scoring
- Correct result only → `is_correct = true`, `raffle_entries = 1`
- Correct result + exact score → `is_correct = true`, `raffle_entries = 3`
- Wrong pick → `is_correct = false`, `raffle_entries = 0`
- Set via admin panel after full time (manual or auto-sync from football-data.org)
- Leaderboard ranks by `sum(raffle_entries)` descending, including winner pick bonus

### Golden Boot bonus
+10 extra raffle entries if the patron's Golden Boot prediction is correct. Set manually by admin after the Final.

### Tournament Winner bonus
+15 extra raffle entries if the patron's World Cup Champion pick is correct. Auto-scored when admin enters the Final result — no separate action needed.

### Geolocation
Browser GPS checked against pub coordinates (300m radius). Best-effort — falls back to code-only if GPS denied.

### Cookie persistence
`peddlers_patron` cookie (90 days): name + phone. Pre-fills form, shows "Welcome back" message. `peddlers_lang` cookie (1 year): EN/ES preference.

---

## Testing

Tests live in `__tests__/` subdirectories next to the code they test.

```bash
npm test              # 157 tests across 9 suites
npm run test:coverage # coverage report
```

Suites:
- `matchSchedule.test.ts` — rolling window, isMatchLive, getDailyCode, isValidOverrideCode
- `teamResolution.test.ts` — pure unit tests for name resolution logic
- `resolution.test.ts` — regression tests (USA≠France, USA≠Israel, USA≠U17)
- `goldenBootContenders.test.ts` — Golden Boot list validation
- `entries/route.test.ts` — entry submission, duplicate detection, geo/code checks
- `feedback/route.test.ts` — API route with mocked Supabase
- `admin/auth.test.ts` — authentication
- `my-picks/route.test.ts` — picks + scorerPick + winnerPick response
- `team/route.test.ts` — team data route integration

---

## CSS Design System

All in `globals.css`. No Tailwind, no external component library.

```css
--green: #00C87A    /* primary — football/game actions */
--amber: #FF9500    /* pub brand — Peddler's Daughter name */
--gold:  #F5C518    /* Golden Boot / prize */
--red:   #FF3B3B    /* errors, eliminated */
--bg:    #0a0a0a    /* near-black background */
```

Color identity: **green = football**, **amber = the pub brand**. Do not switch green to orange — green is the pitch color and correct for this context.

Fonts: Bebas Neue (display/headings), Barlow Condensed (labels/nav), Barlow (body) — loaded via Google Fonts in layout.tsx.

---

## Deployment

Push to `main` → Vercel auto-deploys in ~60 seconds. No staging environment currently — test locally with `npm run build` before pushing.

**Pre-push checklist:**
1. `npm test` — all 157 tests pass
2. `npm run build` — no TypeScript errors
3. `git push origin main`
