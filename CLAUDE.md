# Peddler's Predictor — Project Context for Claude Code

## What this is
A World Cup 2026 prediction game web app for **The Peddler's Daughter** Irish pub, with locations in Haverhill MA and Nashua NH. Patrons scan a QR code at the bar, predict match results, and compete on a live leaderboard for a TV giveaway at the end of the tournament (July 19, 2026).

---

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | Supabase (hosted Postgres) |
| Hosting | Vercel (auto-deploys from GitHub on push to main) |
| Styling | Custom CSS — globals.css, NO Tailwind, NO Bootstrap |
| Fonts | Bebas Neue (display), Barlow Condensed (labels), Barlow (body) — loaded via Google Fonts in globals.css |
| Football data | API-Football v3 (api-football.com) — proxied via /api/football and /api/team routes |
| Testing | Jest + ts-jest (run with `npm test`) |

---

## Environment Variables

All in `.env.local` (never committed to git):

```
NEXT_PUBLIC_SUPABASE_URL=https://eksoaxfzxbhudnfcktjm.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
ADMIN_PASSWORD=...
API_FOOTBALL_KEY=...
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
- All 104 World Cup 2026 matches pre-loaded. entries_close_at = kickoff + 105 minutes.

**entries**
- `id`, `pub_id`, `match_id`, `name`, `phone`, `email` (nullable)
- `pick` (home/draw/away), `is_correct` (boolean, null until result set)
- `raffle_entries` (0 or 3), `created_at`
- Unique constraint: (phone, match_id) — one entry per person per match

**scorer_picks**
- Golden Boot predictions: `phone`, `name`, `player_name`, `player_team`, `player_id`, `pub_id`
- Unique: one per phone number

**team_cache**
- `team_id` (integer PK), `team_name` (text), `data` (jsonb), `cached_at` (timestamptz)
- Populated by `/api/team` — caches squad, coach, fixtures for 7 days
- Index on `team_name` for name-based lookups
- **Important**: if this table has bad data (wrong team cached), run `truncate table team_cache;` in Supabase SQL editor to force a fresh fetch

**feedback**
- `id` (uuid PK), `message` (text), `email` (text nullable), `page` (text nullable)
- `read` (boolean, default false), `created_at`
- Public insert only; read via admin route (secret key bypasses RLS)
- Visible in admin panel → Feedback tab with unread badge

### Row Level Security
All tables have RLS enabled. Public read + insert on entries and scorer_picks. Public read on pubs and matches. Public insert on feedback. Server-side admin routes use the secret key to bypass RLS.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Home — location selector, countdown, entry form
│   ├── layout.tsx                  # Root layout — header with logo + lang switcher, footer
│   ├── globals.css                 # ALL styles — black theme, custom fonts, animations
│   ├── feedback/page.tsx           # Bug report / feedback form
│   ├── leaderboard/page.tsx        # Live leaderboard
│   ├── schedule/page.tsx           # All 104 matches grouped by date
│   ├── demo/page.tsx               # USA vs Ireland demo match (always open)
│   ├── my-picks/page.tsx           # Patron looks up their picks by phone number
│   ├── rules/page.tsx              # Full rules and instructions
│   ├── locations/page.tsx          # Pub addresses, maps, social links
│   ├── admin/page.tsx              # Admin panel — set results, view entrants, stats, feedback
│   ├── world-cup/
│   │   ├── standings/page.tsx      # Group standings from API-Football
│   │   ├── results/page.tsx        # Completed match results from API-Football
│   │   ├── scorers/page.tsx        # Top scorers / Golden Boot race
│   │   ├── bracket/page.tsx        # Knockout bracket (R32→R16→QF→SF→Final)
│   │   ├── team/page.tsx           # Team profile — squad, manager, fixtures
│   │   └── top-scorer-pick/page.tsx # Patron picks Golden Boot winner
│   └── api/
│       ├── entries/route.ts        # POST — validate and save match prediction
│       ├── matches/route.ts        # GET — active match
│       ├── admin/route.ts          # POST — set result, ping, mark_feedback_read (auth)
│       ├── admin-data/route.ts     # GET — stats, entrants, feedback, CSV export (auth)
│       ├── feedback/route.ts       # POST — public feedback/bug report submission
│       ├── my-picks/route.ts       # GET — patron's picks by phone
│       ├── football/route.ts       # GET — proxy to API-Football with 5min cache
│       └── team/route.ts           # GET — team data with 7-day Supabase cache
├── components/
│   ├── EntryForm.tsx               # Match prediction form — used by home + demo pages
│   ├── LangSwitcher.tsx            # EN/ES toggle buttons in header
│   ├── ShareCard.tsx               # "Love the app?" share card with Web Share API
│   └── SiteFooter.tsx              # Footer — Facebook links, nav links, feedback link
└── lib/
    ├── supabase.ts                 # Browser Supabase client + types (Pub, Match, Entry)
    ├── supabaseAdmin.ts            # Server Supabase client (secret key — server only)
    ├── pubData.ts                  # Pub info constants (address, phone, social links, coords)
    ├── matchSchedule.ts            # getDailyCode(), isMatchLive(), selectActiveMatch()
    ├── geo.ts                      # distanceMetres(), getPosition()
    ├── patron.ts                   # Cookie utils: savePatron(), loadPatron(), clearPatron()
    ├── teamResolution.ts           # Team name→ID resolution logic (tested separately)
    ├── i18n.ts + useLocale.ts      # EN/ES translations + locale cookie hook
```

---

## Key Business Logic

### Daily patron code
Auto-generated — no admin action needed. Format: `peddlers` + day of month.
- June 11 → `peddlers11`
- June 27 → `peddlers27`
- Yesterday's code also accepted (for late-night matches crossing midnight)
- Code validated server-side in `/api/entries/route.ts` via `getDailyCode()`

### Match activation
Fully automatic based on datetime — no admin needed:
- Match activates at `kickoff_at`
- Entries close at `entries_close_at` (kickoff + 105 minutes)
- Home page queries matches within ±110min window, picks the live or next upcoming one
- Demo match (stage = 'Demo Match') is excluded from real match queries

### Scoring
- Correct prediction → `is_correct = true`, `raffle_entries = 3`
- Wrong prediction → `is_correct = false`, `raffle_entries = 0`
- Set via admin panel after each match → `/api/admin` with action `set_result`
- Leaderboard ranks by total `raffle_entries` descending

### Geolocation
- Browser GPS check against pub lat/lng + radius_m (300m)
- Best-effort — if GPS denied or fails, falls back to code-only verification
- Demo page skips geo check entirely

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
- All user-facing strings should use `t.keyName` from i18n.ts

---

## API-Football Integration

### Proxy route: `/api/football`
- Keeps API key server-side
- 5-minute in-memory cache to stay within free tier (100 req/day)
- League ID: `1` (FIFA World Cup), Season: `2026`

### Team data route: `/api/team`
- Dedicated endpoint for full team profiles (squad, coach, fixtures, local schedule)
- **7-day Supabase cache** (`team_cache` table) — reduces API-Football calls dramatically
- Handles both `?id=X` (numeric) and `?name=USA` (display name) lookups
- Name resolution uses `src/lib/teamResolution.ts` (see Testing section)
- Always appends `localSchedule` from Supabase for pre-tournament fixture display
- **If wrong team is cached**: run `truncate table team_cache;` in Supabase to clear

### Name resolution for `?name=X` lookups
Resolution strategy (in order):
1. Check `team_cache` by name (ilike)
2. Fetch WC 2026 teams list (`GET /teams?league=1&season=2026`) — scoped, no club teams
3. Fallback: search by aliased name (`usa` → `united states`), filter to senior national teams only
4. Never return a team with no name overlap (prevents Israel-for-USA bugs)

Known name aliases (Supabase → API-Football):
- `USA` → `United States`
- `South Korea` → `Korea Republic`
- `Ivory Coast` → `Côte d'Ivoire`
- `Türkiye` → `Turkey`
- `Czechia` → `Czech Republic`

**Important**: France's API-Football ID is 2. USA is a different ID. Never hardcode team IDs in client code — use the server-side resolution.

### Pre-tournament behavior
Before June 11, 2026:
- Squad data (`/players/squads`) returns empty — squads not yet submitted. Shows "Squad not yet announced."
- Fixtures (`/fixtures?league=1&season=2026`) may return empty. Falls back to local Supabase schedule.
- WC teams list may be empty. Falls back to name search with national team filter.

### Endpoints used by `/api/football`
| Query param | API-Football endpoint | Returns |
|-------------|----------------------|---------|
| `endpoint=standings` | /standings | Group tables |
| `endpoint=fixtures&status=FT` | /fixtures | Completed matches |
| `endpoint=fixtures&team=ID` | /fixtures | Team's matches |
| `endpoint=players/topscorers` | /players/topscorers | Golden Boot |
| `endpoint=teams&team=ID` | /teams?id=ID | Team info |
| `endpoint=players/squads&team=ID` | /players/squads?team=ID | Squad |
| `endpoint=coaches&team=ID` | /coachs?team=ID | Manager info |

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
- Prize: one TV per pub, raffled after the World Cup Final (July 19, 2026)

---

## QR Codes

Print and laminate for tables:
- Haverhill: `https://peddlers-predictor.vercel.app/?pub=haverhill`
- Nashua: `https://peddlers-predictor.vercel.app/?pub=nashua`

---

## Admin Workflow (day of a match)

1. Nothing needed before kick-off — match activates automatically
2. Patron code is automatic (`peddlers` + day number) — tell bar staff
3. After full time → go to `/admin` → set result → leaderboard updates instantly
4. Admin panel has 4 tabs: Results, Entrants, Stats, Feedback

### Admin panel features
- **Results tab**: today's matches, unscored recent matches, upcoming 3 days, daily code display
- **Entrants tab**: filterable by date, shows name/phone/email/pick/result, CSV export button
- **Stats tab**: total entries, unique players, emails collected, bar chart by day split by pub
- **Feedback tab**: bug reports and feedback from patrons, unread count badge, mark-as-read per item

---

## Testing

```bash
npm test              # run all tests once
npm run test:watch    # watch mode during development
npm run test:coverage # coverage report
```

### Test files
| File | What it covers |
|------|---------------|
| `src/lib/__tests__/teamResolution.test.ts` | Name aliases, youth team filter, WC list resolution, search resolution, cache validation |
| `src/app/api/team/__tests__/resolution.test.ts` | Regression tests for USA/France/Israel bugs |
| `src/app/api/feedback/__tests__/route.test.ts` | Feedback POST validation, Supabase insert |
| `src/app/api/admin/__tests__/auth.test.ts` | Admin password auth, mark_feedback_read |

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
3. Set all environment variables in `.env.local` and Vercel dashboard
4. Push to GitHub — Vercel auto-deploys
