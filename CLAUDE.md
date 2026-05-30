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
| Football data | API-Football v3 (api-football.com) — proxied via /api/football route |

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
- `stage` (Group A–L, Round of 32, Round of 16, Quarter Final, Semi Final, Final, Demo Match)
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

### Row Level Security
All tables have RLS enabled. Public read + insert on entries and scorer_picks. Public read on pubs and matches. Server-side admin routes use the secret key to bypass RLS.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Home — location selector, countdown, entry form
│   ├── layout.tsx                  # Root layout — header with logo + lang switcher, footer
│   ├── globals.css                 # ALL styles — black theme, custom fonts, animations
│   ├── leaderboard/page.tsx        # Live leaderboard
│   ├── schedule/page.tsx           # All 104 matches grouped by date
│   ├── demo/page.tsx               # USA vs Ireland demo match (always open)
│   ├── my-picks/page.tsx           # Patron looks up their picks by phone number
│   ├── rules/page.tsx              # Full rules and instructions
│   ├── locations/page.tsx          # Pub addresses, maps, social links
│   ├── admin/page.tsx              # Admin panel — set results, view entrants, stats
│   ├── world-cup/
│   │   ├── standings/page.tsx      # Group standings from API-Football
│   │   ├── results/page.tsx        # Completed match results from API-Football
│   │   ├── scorers/page.tsx        # Top scorers / Golden Boot race
│   │   ├── team/page.tsx           # Team profile — squad, manager, fixtures
│   │   └── top-scorer-pick/page.tsx # Patron picks Golden Boot winner
│   └── api/
│       ├── entries/route.ts        # POST — validate and save match prediction
│       ├── matches/route.ts        # GET — active match
│       ├── admin/route.ts          # POST — set result, ping (auth check)
│       ├── admin-data/route.ts     # GET — stats, entrants list, CSV export
│       ├── my-picks/route.ts       # GET — patron's picks by phone
│       └── football/route.ts       # GET — proxy to API-Football with 5min cache
├── components/
│   ├── EntryForm.tsx               # Match prediction form — used by home + demo pages
│   └── LangSwitcher.tsx            # EN/ES toggle buttons in header
└── lib/
    ├── supabase.ts                 # Browser Supabase client + types (Pub, Match, Entry)
    ├── supabaseAdmin.ts            # Server Supabase client (secret key — server only)
    ├── pubData.ts                  # Pub info constants (address, phone, social links, coords)
    ├── matchSchedule.ts            # getDailyCode(), isMatchLive(), selectActiveMatch()
    ├── geo.ts                      # distanceMetres(), getPosition()
    ├── patron.ts                   # Cookie utils: savePatron(), loadPatron(), clearPatron()
    └── i18n.ts + useLocale.ts      # EN/ES translations + locale cookie hook
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

### Endpoints used
| Query param | API-Football endpoint | Returns |
|-------------|----------------------|---------|
| `endpoint=standings` | /standings | Group tables |
| `endpoint=fixtures&status=FT` | /fixtures | Completed matches |
| `endpoint=fixtures&team=ID` | /fixtures | Team's matches |
| `endpoint=players/topscorers` | /players/topscorers | Golden Boot |
| `endpoint=teams&team=ID` | /teams?id=ID | Team info |
| `endpoint=players/squads&team=ID` | /players/squads?team=ID | Squad |
| `endpoint=coaches&team=ID` | /coachs?team=ID | Manager info |

### KNOWN BUG — Team page
The team page at `/world-cup/team` uses `?name=USA` in the URL but API-Football
requires a **numeric team ID**, not a name. The page and API route need to be updated
to use `?id=2` (USA's API-Football team ID is 2).

Key API-Football team IDs for reference:
- USA: 2
- Ireland: 1529  
- England: 10
- Brazil: 6
- Argentina: 26
- France: 2
- Germany: 25
- Spain: 9
- Portugal: 27
- Mexico: 16

The fix requires:
1. Update `/api/football/route.ts` to handle the `teams` endpoint with a numeric ID
2. Update `/world-cup/team/page.tsx` to use `?id=X` instead of `?name=X`
3. Update all links that point to the team page to use numeric IDs
4. The standings page links to `/world-cup/team?id=${s.team.id}` — check if this is already correct

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
4. Admin panel has 3 tabs: Results, Entrants, Stats

### Admin panel features
- **Results tab**: today's matches, unscored recent matches, upcoming 3 days, daily code display
- **Entrants tab**: filterable by date, shows name/phone/email/pick/result, CSV export button
- **Stats tab**: total entries, unique players, emails collected, bar chart by day split by pub

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
--amber: #FF9500          /* warnings, coming-up badges */
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
git add . && git commit -m "message" && git push   # deploy to Vercel
```

---

## Files NOT to touch

- `.env.local` — never commit, never log
- `supabase/master.sql` — source of truth for DB schema, update if schema changes
- `public/logo.avif` — pub logo, don't resize or recompress
