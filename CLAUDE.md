# Peddler's Predictor — Project Context for Claude Code

## What this is
A World Cup 2026 prediction game web app for **The Peddler's Daughter** Irish pub, with locations in Haverhill MA and Nashua NH. Patrons scan a QR code at the bar, predict match results, and compete on a live leaderboard for a TV giveaway at the end of the tournament (July 19, 2026).

---

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | Supabase (hosted Postgres) |
| Hosting | Vercel (auto-deploys from GitHub on push to main) |
| Styling | Custom CSS — globals.css, NO Tailwind, NO Bootstrap |
| Fonts | Bebas Neue (display), Barlow Condensed (labels), Barlow (body) — loaded via Google Fonts in globals.css |
| Football data | football-data.org v4 (primary, 10 req/min no daily cap) + API-Football v3 (enrichment) — proxied via /api/football and /api/team |
| Analytics | `@vercel/analytics` + `@vercel/speed-insights` (page views, Web Vitals) + custom `analytics_events` Supabase table via `src/lib/analytics.ts` |
| Testing | Jest + ts-jest (run with `npm test`) |

---

## Environment Variables

All in `.env.local` (never committed to git):

```
NEXT_PUBLIC_SUPABASE_URL=https://eksoaxfzxbhudnfcktjm.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
ADMIN_PASSWORD=...
FOOTBALL_DATA_API_KEY=...        # football-data.org — primary football data source
API_FOOTBALL_KEY=...              # API-Football — player photos + clubs
RESEND_API_KEY=...               # Resend — email reminders (optional)
RESEND_FROM_EMAIL=...            # From address for reminder emails (optional, has default)
NEXT_PUBLIC_DAILY_CODE_PREFIX=...  # Prefix for daily patron codes — NEXT_PUBLIC_ required for client use
```

Same variables must be set in Vercel dashboard (Settings → Environment Variables).

---

## Deployment

- **GitHub repo**: ronanosullivan/peddlers-predictor
- **Live URL**: https://peddlers-predictor.vercel.app
- **Deploy**: `git push origin main` — Vercel auto-deploys in ~60 seconds
- **Admin panel**: https://peddlers-predictor.vercel.app/admin

---

## Database (Supabase)

Project ID: `eksoaxfzxbhudnfcktjm`
Full schema in: `supabase/master.sql` — run this on a fresh project to set everything up.

### Tables

**pubs**
- `id` (text PK): `haverhill` or `nashua`
- `name`, `city`, `lat`, `lng`, `radius_m`, `daily_code`

**matches**
- `id` (uuid), `home_team`, `away_team`, `home_flag`, `away_flag`
- `kickoff_at`, `entries_close_at` (timestamptz, UTC)
- `stage` (Group A–L, Round of 32, Round of 16, Quarter Final, Semi Final, Third Place, Final, Demo Match)
- `result` (home/draw/away or null), `is_active` (boolean)
- `home_score`, `away_score` (integer, null until result set by admin)
- All 104 World Cup 2026 matches pre-loaded. entries_close_at = kickoff + 105 minutes.

**entries**
- `id`, `pub_id`, `match_id`, `name`, `phone`, `email` (nullable)
- `pick` (home/draw/away), `is_correct` (boolean, null until result set)
- `raffle_entries` (0, 1, or 3), `created_at`
- `home_score_pred`, `away_score_pred` (integer, nullable — patron's optional score guess)
- Unique constraint: (phone, match_id) — one entry per person per match

**scorer_picks**
- Golden Boot predictions: `phone`, `name`, `player_name`, `player_team`, `player_id`, `pub_id`
- `is_correct` (boolean, null until set manually by admin after the Final)
- Unique: one per phone number

**winner_picks**
- Tournament champion predictions: `phone`, `name`, `team_name`, `team_flag`, `pub_id`
- `is_correct` (boolean, null until auto-set when Final result is entered by admin)
- `raffle_entries` (integer, 0 until Final result — auto-set to 15 for correct pick, 0 for wrong)
- Unique: one per phone number — pick is locked once submitted, cannot be changed
- Visible to patron on `/my-picks` page, included in leaderboard raffle ticket total

**check_ins**
- Match attendance check-ins for in-match prize draws: `pub_id`, `match_id`, `name`, `phone`, `email` (nullable)
- `shared_to` (text nullable): tracks if patron shared to social — `'native'`, `'x'`, `'facebook'`, `'copy'`, or null
- Unique: (phone, match_id) — one check-in per person per match
- Public insert only (RLS)

**team_cache**
- `team_id` (integer PK — FD team ID), `team_name` (text — schedule name e.g. "USA"), `data` (jsonb — teamInfo, coach, fixtures only, NOT squad), `cached_at` (timestamptz)
- `fd_loaded` (boolean), `coach_name` (text), `coach_nationality` (text) — denormalized for admin display
- Populated by admin via `/api/admin-teams` (`load_fd` action) — NOT auto-populated by page views
- `team_name` stores the schedule name (e.g. "USA") to match `matches` table; enables direct ilike lookups
- **If data is stale**: `truncate table team_cache; truncate table player_cache;` then reload via admin → Teams tab

**player_cache**
- `fd_id` (integer PK — FD player ID), `team_name` (text — schedule name), `name`, `age`, `number`, `position`
- `photo` (text, default ''), `photo_enriched` (boolean) — populated by AF `players/squads` in `enrich_af`
- `club_name`, `club_logo`, `club_enriched` (boolean) — populated by AF `players?id=X&season=2024`
- `af_id` (integer) — AF player ID, set during photo enrichment, used for club lookups
- Upsert with `onConflict: 'fd_id'` preserves enrichment columns not in payload (safe re-load)

**feedback**
- `id` (uuid PK), `message` (text), `email` (text nullable), `page` (text nullable)
- `read` (boolean, default false), `created_at`
- Public insert only; read via admin route (secret key bypasses RLS)
- Visible in admin panel → Feedback tab with unread badge

**analytics_events**
- `id` (uuid PK), `event` (text), `properties` (jsonb, default `{}`), `created_at`
- Written by `/api/analytics` POST (public insert, rate-limited at 60/min per IP)
- Read by `/api/analytics` GET (requires `x-admin-password` header — service key not needed)
- Visible in admin panel → Analytics tab with 7d/30d/90d time range selector
- Events tracked: `geo_verified`, `geo_too_far`, `geo_blocked`, `chose_code_path`, `code_verified`, `code_failed`, `patron_returning`, `leaderboard_viewed`, `my_picks_viewed`, `prediction_submitted`, `form_abandoned`
- All `track()` calls also forwarded to Vercel Analytics (no-ops on free plan, activates on Pro)

### Views

**player_cache_stats** (aggregate view — avoids PostgREST 1000-row default limit)
```sql
create or replace view player_cache_stats as
select
  team_name,
  count(*) as total,
  count(*) filter (where photo is not null and photo != '') as photos,
  count(*) filter (where club_enriched) as clubs
from player_cache
group by team_name;
```
Used by `/api/admin-teams` GET to show player/photo/club counts per team. Must exist in production DB.

### Row Level Security
All tables have RLS enabled. Public read + insert on entries and scorer_picks. Public read on pubs and matches. Public insert on feedback and analytics_events. Server-side admin routes use the secret key to bypass RLS.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Home — GPS pub auto-detect, two-column hero, match predictions
│   ├── layout.tsx                  # Root layout — header with logo, pub switcher, WC logo, lang switcher, footer
│   ├── globals.css                 # ALL styles — black theme, custom fonts, animations
│   ├── feedback/page.tsx           # Bug report / feedback form
│   ├── leaderboard/page.tsx        # Live leaderboard
│   ├── schedule/page.tsx           # All 104 matches grouped by date
│   ├── demo/page.tsx               # USA vs Ireland demo match (always open)
│   ├── my-picks/page.tsx           # Patron looks up their picks by phone number
│   ├── overall-picks/page.tsx      # Community picks — all 104 matches with pick bars and results
│   ├── rules/page.tsx              # Full rules and instructions
│   ├── locations/page.tsx          # Pub addresses, maps, social links
│   ├── admin/page.tsx              # Admin panel — set results, view entrants, stats, feedback
│   ├── world-cup/
│   │   ├── page.tsx                # World Cup hub — nav grid to all WC sub-pages
│   │   ├── groups/page.tsx         # All 12 groups compact overview (2-column grid)
│   │   ├── standings/page.tsx      # Full group standings table
│   │   ├── results/page.tsx        # Completed match results
│   │   ├── scorers/page.tsx        # Top scorers / Golden Boot race
│   │   ├── bracket/page.tsx        # Knockout bracket (R32→R16→QF→SF→Final) — includes inline group standings widget
│   │   ├── bracket/bracketHelpers.ts # Pure functions: isPlaceholder, parseGroupLetters, formatPlaceholder, parseMatchNumber
│   │   ├── team/page.tsx           # Team profile — squad, manager, fixtures
│   │   ├── top-scorer-pick/page.tsx # Patron picks Golden Boot winner (+10 bonus tickets)
│   │   ├── winner-pick/page.tsx    # Patron picks World Cup Champion (+15 bonus tickets, locked once submitted)
│   │   └── winner-picks/page.tsx  # Community champion picks — team vote counts, progress bars, pub breakdown
│   └── api/
│       ├── entries/route.ts        # POST — validate and save match prediction
│       ├── matches/route.ts        # GET — active match
│       ├── demo-match/route.ts     # GET — fetch/create the demo match (always-open window)
│       ├── admin/route.ts          # POST — set_result, sync_results, ping, mark_feedback_read (auth)
│       ├── admin-data/route.ts     # GET — stats, entrants, feedback, CSV export (auth)
│       ├── admin-teams/route.ts    # GET — 48-team cache status; POST — load_fd, enrich_af (auth)
│       ├── analytics/route.ts      # POST — log analytics event (public, rate-limited); GET — admin read (password header)
│       ├── feedback/route.ts       # POST — public feedback/bug report submission
│       ├── my-picks/route.ts       # GET — patron's picks by phone
│       ├── football/route.ts       # GET — football data proxy (FD primary, AF fallback, 5min cache)
│       ├── team/route.ts           # GET — team data with 60-day Supabase cache
│       └── send-reminder/route.ts  # POST — email reminder to all patrons via Resend (admin auth)
├── components/
│   ├── EntryForm.tsx               # Match prediction form — geo check, access-code override, score steppers
│   ├── Flag.tsx                    # Renders flag emoji via flagcdn.com PNG (fixes Windows text fallback)
│   ├── HeaderLocation.tsx          # Pub switcher in sticky header — both pubs shown, active highlighted, clickable
│   ├── LangSwitcher.tsx            # EN/ES toggle buttons in header
│   ├── ShareCard.tsx               # "Love the app?" share card with Web Share API
│   └── SiteFooter.tsx              # Footer — Facebook links, nav links, feedback link
└── lib/
    ├── supabase.ts                 # Browser Supabase client + types (Pub, Match, Entry)
    ├── supabaseAdmin.ts            # Server Supabase client (secret key — server only)
    ├── footballData.ts             # football-data.org adapter — standings, fixtures, scorers, team profiles
    ├── goldenBootContenders.ts     # Pre-seeded top-10 Golden Boot picks (shown pre-tournament)
    ├── rateLimit.ts                # In-memory rate limiter (checkRateLimit, getIp)
    ├── pubData.ts                  # Pub info constants (address, phone, social links, coords)
    ├── matchSchedule.ts            # getDailyCode(), isValidOverrideCode(), isMatchLive(), selectActiveMatch(), getPredictableWindowEnd()
    ├── geo.ts                      # distanceMetres(), getPosition()
    ├── patron.ts                   # Cookie utils: savePatron(), loadPatron(), clearPatron(), savePubPref(), loadPubPref()
    ├── teamResolution.ts           # Team name→ID resolution logic (tested separately)
    ├── analytics.ts                # trackEvent() — fires both Vercel Analytics track() and POST /api/analytics
    ├── i18n.ts + useLocale.ts      # EN/ES translations + locale cookie hook
```

---

## Key Business Logic

### Daily patron code
Auto-generated — no admin action needed. Format: `{prefix}` + day of month (UTC).
- Prefix is set by `NEXT_PUBLIC_DAILY_CODE_PREFIX` env var (lowercase, defaults to `peddlers`)
- June 11 → `peddlers11`, June 27 → `peddlers27`
- Yesterday's code also accepted (for late-night matches crossing midnight)
- Code validated server-side in `/api/entries/route.ts` via `getDailyCode()`
- Code validated client-side via `isValidOverrideCode()` when patron's GPS is unavailable

### Match activation and prediction window
Fully automatic based on datetime — no admin needed:
- **Entries close at `kickoff_at`** — predictions lock the moment the match starts
- `entries_close_at` (kickoff + 105 min) is stored in DB but only used for display/legacy purposes
- Home page shows all matches in the predictable window grouped by day
- Before June 15 UTC: all matches kicking off before June 15 00:00 UTC are shown (group stage days 1–4)
- From June 15 onwards: rolling 3-day window — today through today+2 (UTC)
- `getPredictableWindowEnd(now)` in `src/lib/matchSchedule.ts` computes the upper bound
- Already-picked matches stay visible at 55% opacity with a "✓ Picked" badge
- Demo match (stage = 'Demo Match') is excluded from real match queries

### Scoring
- Correct result only → `is_correct = true`, `raffle_entries = 1`
- Correct result + exact score → `is_correct = true`, `raffle_entries = 3`
- Wrong prediction → `is_correct = false`, `raffle_entries = 0`
- Score prediction (`home_score_pred` / `away_score_pred`) is optional — patron enters via +/− steppers in the form
- Set via admin panel after each match — either manually via `set_result` action or automatically via `sync_results` (fetches from football-data.org)
- Leaderboard ranks by total `raffle_entries` descending (match entries + winner pick bonus combined)
- **Golden Boot bonus**: 10 extra raffle entries if patron's Golden Boot pick is correct — set manually by admin after the Final
- **Tournament Winner bonus**: 15 extra raffle entries if patron's World Cup Champion pick is correct — auto-scored when admin sets the Final result (see admin `set_result` action)

### Geolocation
- Browser GPS check against pub lat/lng + radius_m (20m — must essentially be at the pub)
- If GPS is denied or unavailable: form shows a large prominent access code card — patron must enter today's code to proceed
  - Validated client-side via `isValidOverrideCode()` in `src/lib/matchSchedule.ts` (case-insensitive, accepts today's or yesterday's code)
  - On success: `geoStatus` advances to `'ok'` and the form unlocks
  - The code prefix is controlled by `NEXT_PUBLIC_DAILY_CODE_PREFIX` env var — must be set in `.env.local` and Vercel
- `geoStatus` type: `'checking' | 'ok' | 'fail' | 'geo_blocked'` — submit is only enabled when status is `'ok'`
- Demo page skips geo check entirely

### Pub selection
- On first visit (no `?pub=` param, no saved preference): GPS auto-detects nearest pub using `distanceMetres()` from `geo.ts`
- Detected pub saved to cookie via `savePubPref()` in `patron.ts`, restored on next visit
- Header shows both pubs as clickable buttons (`HeaderLocation.tsx`) — active pub is green, inactive is grayed out; clicking switches pub across all pages
- Manual selector also available in page content if user wants to change

### Cookie persistence
- After first entry, patron's name + phone saved to `peddlers_patron` cookie (90 days)
- On return: "Welcome back, Sean! 👋" greeting + raffle ticket count shown
- Pre-fills name and phone fields
- "Not you?" button clears cookie

### Language (i18n)
- EN and ES supported
- Stored in `peddlers_lang` cookie (1 year)
- `useLocale()` hook returns `{ locale, setLocale, t }` where `t` is the translations object
- LangSwitcher component in header on every page
- **Every user-facing string must use `t.keyName` from i18n.ts — no exceptions**
- This is a standing requirement: any UI change, new page, new component, new button, label, heading, error message, or placeholder must have translation keys added to BOTH `en` and `es` in `src/lib/i18n.ts` before shipping
- Add new keys to the bottom of each section, with a comment grouping them logically
- Never hard-code English (or any language) directly in JSX — always go through `t.`
- **Excluded from i18n**: admin panel (`src/app/admin/`), team/player/country names from APIs, date/time format strings passed to `Intl` functions, stage names that come verbatim from the database

#### i18n checklist for every UI change
1. Identify every new string shown to patrons
2. Add a key to `en` in `i18n.ts`
3. Add the Spanish translation to `es` in `i18n.ts`
4. Use `{t.keyName}` in JSX
5. For dynamic strings: `t.someKey.replace('{placeholder}', value)`

---

## Football Data Integration

### Two-source architecture
The app uses **football-data.org (FD) as primary** and **API-Football (AF) for player enrichment**:
- **FD**: free tier = 10 req/min, no daily cap. WC competition ID: `2000`. Env: `FOOTBALL_DATA_API_KEY`
- **AF**: free tier = 100 req/day (strict). League ID: `1`. Env: `API_FOOTBALL_KEY`. For the WC 2026 squad team lookup, code tries `season=2026` first (correct squads + photos), falls back to `season=2022` if 2026 is unavailable on the current plan.
- Both are optional — the app degrades gracefully if either key is missing
- The `footballData.ts` adapter converts FD responses to AF-format so frontend code doesn't change

### Known FD free-tier data gaps (always use AF for these)
| Field | FD free tier | AF |
|-------|-------------|-----|
| `shirtNumber` | ❌ Null pre-tournament (may be paid) | ✅ `players/squads` reliable |
| Player photos | ❌ Not provided | ✅ `players/squads` |
| Coach photo | ❌ Not provided | ✅ `coaches?team=ID` |
| Player club | ❌ Not provided | ✅ `players?id=X&season=YYYY` |

**Rule**: If FD returns `shirtNumber: null` for all squad members, that means FD doesn't have it yet — NOT that no numbers exist. Auto-fall back to AF `players/squads`. This is implemented in `handleLoadFd` in `src/app/api/admin-teams/route.ts`. Never store `0` as a shirt number; use `null` for unknown.

### Proxy route: `/api/football`
- Keeps both API keys server-side
- 5-minute in-memory cache (shared, caches adapted response regardless of source)
- For `standings`, `fixtures`, `players/topscorers`, `teams` (list) — tries FD first, falls back to AF
- For `players/squads`, `coaches`, `players` — AF only (FD free tier doesn't cover these)

### Team data route: `/api/team` (cache-only)
- Reads squad from `player_cache`, teamInfo/coach/fixtures from `team_cache.data`, local schedule from `matches`
- **Never calls external APIs** — all data pre-loaded by admin via `/api/admin-teams`
- Handles both `?id=X` (FD team ID) and `?name=USA` (schedule name) lookups
- Returns empty squad/coach if team not yet loaded by admin — frontend shows "Squad not yet announced"
- Always appends `localSchedule` from Supabase matches table

### Admin team loading route: `/api/admin-teams`
- **GET** (password required): lists all 48 teams from matches table with `fd_loaded`, player/photo/club counts — player counts come from `player_cache_stats` view to avoid PostgREST 1000-row limit
- **POST `load_fd`** (password required): fetches team from football-data.org, upserts `team_cache` + `player_cache`; preserves existing enrichment data on re-load; returns error if DB write fails
- **POST `enrich_af`** (password required): enriches players with AF photos + clubs; stops on rate limit, saves partial results; safe to retry

### FD → player_cache load flow
1. Admin clicks "Load FD" for a team (or "Load all from FD" — sequential, 7s between calls)
2. `resolveFdTeamId(scheduleName)` resolves e.g. "USA" → FD ID 841 via WC teams list
3. `buildFdTeamData(fdId)` fetches team profile + squad (no photos) from FD (2 calls)
4. `team_cache` upserted: schedule name, teamInfo, coach, fixtures, `fd_loaded=true`
5. `player_cache` upserted per player: fd_id, name, age, number, position — photo/club columns untouched

### AF enrichment flow (after FD load)
1. Admin clicks "Load photos & clubs" for a team (AF 100/day limit: ~3–4 full teams per day on free plan)
2. **Photo enrichment** (2 AF calls):
   - Primary: fetch WC 2022 teams list (`league=1&season=2022`) and match by name — more reliable than search for national teams
   - Fallback: `teams?search={name}` filtered to senior national teams (no youth teams)
   - Three-level progressive name matching against AF squad: (1) exact lowercase, (2) accent/punctuation-normalised, (3) unique last name — handles FD/AF name format differences
   - Updates `photo`, `af_id`, `photo_enriched=true`
3. **Club enrichment** (1 AF call per player with `af_id`): fetches `players?id={af_id}&season=2024` → finds club that is not the national team → updates `club_name`, `club_logo`, `club_enriched=true`
4. Stops on rate limit, saves what was collected — retry tomorrow picks up from where it stopped

### Name resolution (legacy — used by /api/football for standings etc.)
Resolution strategy (in order):
1. Check `team_cache` by name (ilike) — schedule name is stored directly
2. Fetch WC 2026 teams list — scoped, no club teams
3. Fallback: search by aliased name (`usa` → `united states`), filter to senior national teams only
4. Never return a team with no name overlap (prevents Israel-for-USA bugs)

Known name aliases:
- `USA` → `United States`
- `South Korea` → `Korea Republic`
- `Ivory Coast` → `Côte d'Ivoire`
- `Türkiye` → `Turkey`
- `Czechia` → `Czech Republic`

**Important**: France's API-Football ID is 2. USA is a different ID. Never hardcode team IDs in client code — use the server-side resolution.

### Email reminders: `/api/send-reminder`
- Admin-authenticated POST — sends match-day reminder emails to all patrons who gave an email address
- Uses **Resend API** (`RESEND_API_KEY`). From address: `RESEND_FROM_EMAIL` (env) or default
- Deduplicates by lowercase email — one email per address even if patron entered multiple times
- Triggered from the admin panel before a match day

### Pre-tournament behavior
Before June 11, 2026:
- Squad data may return empty — shows "Squad not yet announced."
- Fixtures may return empty — falls back to local Supabase schedule.
- WC teams list may be empty — falls back to name search with national team filter.

### Endpoints used by `/api/football`
| Query param | Primary source | Fallback | Returns |
|-------------|---------------|---------|---------|
| `endpoint=standings` | FD | AF | Group tables |
| `endpoint=fixtures&status=FT` | FD | AF | Completed matches |
| `endpoint=fixtures&team=ID` | FD | AF | Team's matches |
| `endpoint=players/topscorers` | FD | AF | Golden Boot |
| `endpoint=teams` (list) | FD only | — | WC team list (AF IDs incompatible with team_cache) |
| `endpoint=teams&team=ID` | AF only | — | Single team info |
| `endpoint=players/squads&team=ID` | AF only | — | Squad |
| `endpoint=coaches&team=ID` | AF only | — | Manager info |

---

## Pub Information

### Haverhill, MA
- Address: 45 Wingate St., Haverhill, MA 01832
- Phone: (978) 372-9555
- GPS: 42.7762, -71.0773
- Facebook: facebook.com/peddlershaverhill
- Instagram: instagram.com/peddlershaverhill

### Nashua, NH
- Address: 48 Main St., Nashua, NH 03064
- Phone: (603) 821-7535
- GPS: 42.7654, -71.4676
- Facebook: facebook.com/pg/PeddlersNashua
- Instagram: instagram.com/peddlersnashua

### Both pubs
- Website: https://www.thepeddlersdaughter.com/
- Prize: **one TV — one winner across both pubs**, drawn by raffle after the World Cup Final (July 19, 2026). All entries from Haverhill and Nashua compete in one combined draw.

---

## QR Codes

Print and laminate for tables:
- Haverhill: `https://peddlers-predictor.vercel.app/?pub=haverhill`
- Nashua: `https://peddlers-predictor.vercel.app/?pub=nashua`

---

## Admin Workflow (day of a match)

1. Nothing needed before kick-off — match activates automatically
2. Patron code is automatic (`{prefix}` + day number) — tell bar staff
3. After full time → go to `/admin` → click **⟳ Sync** to auto-fetch results, or set manually
4. Admin panel has 7 tabs: Results, Entrants, Stats, Feedback, Raffle, Teams, Analytics

### Name validation
- Patron name requires a full first **and** last name — a single initial is rejected
- Validation: at least 2 whitespace-separated parts, each at least 2 characters
- Applied both client-side (inline error, submit disabled) and server-side (`/api/entries`)
- Placeholder changed from "First name + last initial" to "First name Last name"

### Admin panel features
- **Results tab**: today's matches, unscored recent matches, upcoming 3 days, daily code display
  - **"⟳ Sync results from API"** button — calls `sync_results` action, fetches all finished WC matches from football-data.org, matches them by kickoff timestamp, sets result + score, and scores all entries automatically. Reports how many matches updated and entries scored.
  - Manual fallback: each match row has a result dropdown + optional score inputs (home − away) before confirming
  - **Auto-scores `winner_picks` when stage is 'Final'**: after setting the Final result, the `set_result` action automatically sets `is_correct=true, raffle_entries=15` for the champion pick and `is_correct=false, raffle_entries=0` for all other pending winner_picks
  - Email reminders: select upcoming matches and send match-day emails to all patrons who provided an email
- **Entrants tab**: filterable by date, shows name/phone/email/pick/result, CSV export button
- **Stats tab**: total entries, unique players, emails collected, bar chart by day split by pub
- **Feedback tab**: bug reports and feedback from patrons, unread count badge, mark-as-read per item
- **Raffle tab**: weighted draw — 1 ticket per correct result, 3 tickets if exact score also correct; filterable by pub
- **Teams tab**: 48-team cache status — fd_loaded flag, player/photo/club counts; "Load FD" and "Load photos & clubs" (AF enrichment) buttons per team; "Load all from FD" sequential bulk loader
- **Analytics tab**: patron behaviour dashboard — geo funnel (verified/too_far/blocked/code), engagement (returning visits, leaderboard views, my-picks views), conversions (submissions vs abandoned), prediction detail (new vs returning, score guesses, email rate, pick distribution); time range selector (7d/30d/90d); Haverhill vs Nashua column split

### Admin session persistence
- Password and auth state saved in `sessionStorage` (`admin_pw`, `admin_authed`) — survives page refresh but clears when the tab is closed
- Flash notifications appear as a fixed-position toast at the bottom of the screen with a ✕ dismiss button (no auto-dismiss) — visible regardless of scroll position

---

## Home Page UX

- **Hero**: two-column layout — official FIFA World Cup 2026 logo fills the left third, "World Cup Predictor" title + subtitle + player count fill the right two-thirds
- **WC logo**: displayed in both the hero and the sticky header; sourced from `https://www.fifplay.com/img/public/fifa-world-cup-2026-logo.png`
- **Pub auto-detection**: on first visit (no saved preference, no `?pub=` param), GPS locates the nearest pub using `distanceMetres()` with a 7-second timeout; detected pub saved to cookie
- **Header pub switcher** (`HeaderLocation.tsx`): both pub names shown side by side in the sticky header; active pub is green with `📍` prefix, inactive is grayed out and clickable; works on any page with `?pub=` in the URL
- **DiscoveryStrip**: horizontally scrollable row of 3 cards just below the hero — Leaderboard "Raffle ticket standings", World Cup Hub "Squads, standings, bracket", Golden Boot "+10 bonus tickets"
- **FirstTimeCard**: collapsible "✨ New here? How it works" card shown once (localStorage `peddlers_toured`), 4 numbered steps explaining the game, dismisses with "Got it!"
- **PatronWelcome**: shows returning patron's name, raffle ticket count, and rank at their pub (e.g. "· #3 at Haverhill") — rank computed client-side by grouping all pub entries by phone
- **GoldenBootCallout**: gold card after matches, prompts patron to pick a Golden Boot scorer — disappears once they have a scorer_pick
- **WinnerPickCallout**: green card after matches, prompts patron to pick the World Cup Champion — disappears once they have a winner_pick
- **Match predictions** appear before the callouts and nav grid
- **Access code card** (`EntryForm.tsx`, `geoStatus === 'geo_blocked'`): large prominent card with gold border, key icon, "Ask bar staff for today's code" instruction, full-width verify button — shown when GPS is unavailable

---

## Bracket Page UX (`/world-cup/bracket`)

- Stage tabs: R32 → R16 → QF → SF → 3rd → Final; auto-advances to the first stage with real team names or a result
- **Placeholder labels**: DB stores `"Group A Winner"`, `"Group B Runner-up"`, `"3rd Place (A/B/C/D/F)"` for R32; `"Match 73 Winner"` / `"Match 101 Loser"` for R16 onward. Formatted as `"1st · Group A"`, `"2nd · Group B"`, `"Best 3rd · A / B / C / D / F"`; match-number references kept as-is (fall-through)
- **Inline group standings widget (R32)**: each R32 match card shows a "See groups — Group A · Group B" toggle. Expands a compact P/W/D/L/Pts table per group with top-2 rows highlighted green. Country names link to `/world-cup/team`
- **Drill-down for R16**: each R16 match card shows a `SourceMatchPanel` for each slot — expands to show the relevant R32 match with labels and, if those R32 teams are still placeholders, nested group widgets
- **QF/SF/Final**: no automatic drill-down (placeholders are `"Match N Winner"` with no group reference)
- **Venue display**: shown in match card header when `match.venue` is non-null
- Standings fetched once on page load from `/api/football?endpoint=standings` (5-min server cache). Pre-tournament shows "Standings not available yet"
- Helper functions (`bracketHelpers.ts`): `parseMatchNumber(name)` → number|null (handles `Match N Winner/Loser` and legacy `R32 M73 Winner`); `isPlaceholder(name)` (matches Winner/Loser/Runner-up/3rd Place/TBD/Group/Match/R32/QF/SF); `parseGroupLetters(name)` → string[]; `formatPlaceholder(name)` → readable label

### Match numbering (global, by kickoff_at ascending, excl. Demo Match)
- Matches 1–72: group stage
- Matches 73–88: Round of 32
- Matches 89–96: Round of 16
- Matches 97–100: Quarter Finals
- Matches 101–102: Semi Finals
- Match 103: Third Place
- Match 104: Final

### Schedule data quality (master.sql / venue_updates.sql)
- All 104 matches have `venue` populated (from official FIFA WC 2026 schedule)
- All UTC kickoff times verified against official schedule; corrections applied June 2026
- `supabase/venue_updates.sql` — safe UPDATE script for the live DB (no TRUNCATE); corrects kickoff times, team order, venues for group stage, and replaces knockout matches with correct data

---

## Testing

```bash
npm test              # run all tests once
npm run test:watch    # watch mode during development
npm run test:coverage # coverage report
```

### Test files (177 tests total across 10 suites)
| File | What it covers |
|------|---------------|
| `src/lib/__tests__/matchSchedule.test.ts` | Rolling 4-day window, isMatchLive, getDailyCode prefix/fallback, isValidOverrideCode |
| `src/lib/__tests__/teamResolution.test.ts` | Name aliases, youth team filter, WC list resolution, search resolution, cache validation |
| `src/lib/__tests__/goldenBootContenders.test.ts` | Contender list — 10 players, required fields, no duplicates, WC nations |
| `src/app/api/team/__tests__/resolution.test.ts` | Regression tests for USA/France/Israel bugs |
| `src/app/api/team/__tests__/route.test.ts` | Team route integration tests |
| `src/app/api/entries/__tests__/route.test.ts` | Entry submission validation, duplicate detection, geo/code checks |
| `src/app/api/feedback/__tests__/route.test.ts` | Feedback POST validation, Supabase insert |
| `src/app/api/admin/__tests__/auth.test.ts` | Admin password auth, mark_feedback_read |
| `src/app/api/my-picks/__tests__/route.test.ts` | Entries + stats + scorerPick + winnerPick response; mock dispatches by table name (not call order) |
| `src/app/world-cup/bracket/__tests__/helpers.test.ts` | parseMatchNumber (Match N Winner/Loser, legacy R32 M73), isPlaceholder, parseGroupLetters, formatPlaceholder |

### Run tests before pushing
Always run `npm test` before `git push`. The build (`npm run build`) catches TypeScript errors; tests catch logic regressions.

### Key regression tests
- `resolveFromSearch('USA', israelResults)` → must return `null` (not Israel's ID)
- `resolveFromSearch('USA', mixedResults)` → must return senior team ID (not U17)
- `resolveFromWcList('USA', wcTeams)` → must return United States ID, not France (id 2)
- `isBadCacheEntry('United States U17')` → must return `true`

---

## Tournament Dates

- Group stage: June 11 – June 27, 2026
- Round of 32: June 28 – July 4, 2026
- Round of 16: July 4 – July 8, 2026
- Quarter Finals: July 10 – July 12, 2026
- Semi Finals: July 14 – July 15, 2026
- Third Place: July 18, 2026
- **Final: July 19, 2026** — MetLife Stadium, NJ → TV raffle draw

---

## CSS Design System (globals.css)

All CSS variables:
```css
--green: #00C87A          /* primary action color */
--gold: #F5C518           /* prize/raffle highlights */
--amber: #FF9500          /* pub brand color (Peddler's Daughter name), warnings */
--red: #FF3B3B            /* errors, closed badges */
--bg: #0a0a0a             /* page background (near black) */
--surface: #111111        /* card background */
--surface2: #181818       /* input background */
--border: #2a2a2a         /* subtle borders */
--text: #f0ede8           /* primary text */
--text-muted: #777770     /* secondary text */
--font-display: 'Bebas Neue'        /* headings, scores, big numbers */
--font-cond: 'Barlow Condensed'     /* labels, badges, nav */
--font-body: 'Barlow'               /* body text, inputs */
```

Color identity: **green = football/game**, **amber/orange = Peddler's Daughter pub brand**. Do not change green to orange globally — green is the pitch color and is correct for football UI.

Key classes: `.card`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-gold`,
`.badge`, `.badge-live`, `.badge-closed`, `.badge-pending`,
`.pick-btn`, `.pick-btn.selected`, `.match-hero`, `.countdown-grid`,
`.nav-grid`, `.nav-card`, `.loc-selector`, `.loc-btn`, `.geo-strip`,
`.lb-entry`, `.share-btn`, `.social-link`, `.map-btn`

Animations: `.pop-in`, `.slide-up`, `.slide-up-delay`, `.slide-up-delay-2`

---

## Common Commands

```bash
npm run dev          # run locally at http://localhost:3000
npm run build        # production build (run before pushing to catch TS errors)
npm test             # run test suite (run before pushing to catch logic regressions)
git add . && git commit -m "message" && git push   # deploy to Vercel
```

---

## Files NOT to touch

- `.env.local` — never commit, never log
- `supabase/master.sql` — source of truth for DB schema, update if schema changes
- `public/logo.avif` — pub logo, don't resize or recompress

## Deploying to a new Supabase project

1. Create project at supabase.com
2. Run `supabase/master.sql` in the SQL editor (Settings → SQL Editor)
3. Create the `player_cache_stats` view (SQL in the Views section above)
4. Set all environment variables in `.env.local` and Vercel dashboard
5. Push to GitHub — Vercel auto-deploys
