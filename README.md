# 🍺 Peddler's Predictor — World Cup 2026

A live match prediction game for **The Peddler's Daughter** pubs in Haverhill, MA and Nashua, NH. Patrons scan a QR code at the bar, predict World Cup match results, and compete on a live leaderboard for a TV giveaway at the end of the tournament (July 19, 2026).

---

## Live URLs

| Purpose | URL |
|---------|-----|
| Haverhill entry | `https://peddlers-predictor.vercel.app/?pub=haverhill` |
| Nashua entry | `https://peddlers-predictor.vercel.app/?pub=nashua` |
| Admin panel | `https://peddlers-predictor.vercel.app/admin` |
| Leaderboard | `https://peddlers-predictor.vercel.app/leaderboard` |
| Bracket | `https://peddlers-predictor.vercel.app/world-cup/bracket` |
| Standings | `https://peddlers-predictor.vercel.app/world-cup/standings` |
| Feedback | `https://peddlers-predictor.vercel.app/feedback` |

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+ (`node --version` to check)
- A Supabase project (see [docs/SETUP.md](docs/SETUP.md))
- An API-Football v3 key (api-football.com, free tier — 100 req/day)
- Git

### Install and run

```bash
git clone https://github.com/ronanosullivan/peddlers-predictor.git
cd peddlers-predictor
npm install
cp .env.example .env.local
# Fill in .env.local with your keys (see docs/SETUP.md)
npm run dev
```

Open http://localhost:3000

### Run tests

```bash
npm test               # run all 82 tests
npm run test:watch     # watch mode during development
npm run test:coverage  # coverage report
```

**Always run `npm test && npm run build` before pushing.**

---

## Project Structure

```
peddlers-predictor/
├── src/
│   ├── app/
│   │   ├── page.tsx                         # Home — prediction entry, leaderboard, nav
│   │   ├── layout.tsx                       # Root layout — header, footer
│   │   ├── globals.css                      # All styles (dark theme, no Tailwind)
│   │   ├── feedback/page.tsx                # Bug report / feedback form
│   │   ├── leaderboard/page.tsx             # Live leaderboard
│   │   ├── schedule/page.tsx                # All 104 matches
│   │   ├── my-picks/page.tsx                # Patron lookup by phone
│   │   ├── demo/page.tsx                    # Demo prediction (no location check)
│   │   ├── rules/page.tsx                   # Game rules
│   │   ├── locations/page.tsx               # Pub info, maps, socials
│   │   ├── admin/page.tsx                   # Admin panel (results, entrants, stats, feedback)
│   │   ├── world-cup/
│   │   │   ├── standings/page.tsx           # Group standings
│   │   │   ├── results/page.tsx             # Match results
│   │   │   ├── scorers/page.tsx             # Top scorers / Golden Boot race
│   │   │   ├── bracket/page.tsx             # Knockout bracket
│   │   │   ├── team/page.tsx                # Team profile (squad, coach, fixtures)
│   │   │   └── top-scorer-pick/page.tsx     # Golden Boot prediction
│   │   └── api/
│   │       ├── entries/route.ts             # POST: submit match prediction
│   │       ├── matches/route.ts             # GET: current active match
│   │       ├── admin/route.ts               # POST: set results, mark feedback read
│   │       ├── admin-data/route.ts          # GET: stats, entrants, feedback (auth)
│   │       ├── feedback/route.ts            # POST: submit bug report/feedback
│   │       ├── my-picks/route.ts            # GET: patron picks by phone
│   │       ├── football/route.ts            # GET: API-Football proxy (5min cache)
│   │       └── team/route.ts                # GET: team data (7-day Supabase cache)
│   ├── components/
│   │   ├── EntryForm.tsx                    # Match prediction form
│   │   ├── LangSwitcher.tsx                 # EN/ES toggle
│   │   ├── ShareCard.tsx                    # Social share card
│   │   └── SiteFooter.tsx                   # Footer with Facebook + nav links
│   └── lib/
│       ├── supabase.ts                      # Browser Supabase client
│       ├── supabaseAdmin.ts                 # Server Supabase client (secret key)
│       ├── teamResolution.ts                # Team name→ID resolution (tested)
│       ├── goldenBootContenders.ts          # Pre-seeded top 10 Golden Boot picks
│       ├── pubData.ts                       # Pub addresses, phones, social URLs
│       ├── matchSchedule.ts                 # Daily patron code, match activation logic
│       ├── patron.ts                        # Cookie: save/load/clear patron
│       ├── geo.ts                           # GPS distance calculation
│       ├── i18n.ts                          # EN/ES translations
│       └── useLocale.ts                     # Locale hook (reads peddlers_lang cookie)
├── supabase/
│   └── master.sql                           # Complete DB schema — run once on new project
├── docs/
│   ├── SETUP.md                             # Full deployment guide
│   ├── DESIGN.md                            # Architecture and design decisions
│   ├── OPERATIONS.md                        # Day-to-day admin during the tournament
│   └── RAFFLE.md                            # TV raffle guide (July 19, 2026)
├── .env.example                             # Environment variable template
└── jest.config.ts                           # Jest configuration
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | Supabase (hosted Postgres) |
| Hosting | Vercel (auto-deploys from `main`) |
| Styling | Custom CSS — no Tailwind, no Bootstrap |
| Football data | API-Football v3 |
| Testing | Jest + ts-jest |

---

## Tests

82 tests across 6 suites — run with `npm test`.

| Suite | What it covers |
|-------|---------------|
| `teamResolution.test.ts` | Name aliases, youth filter, WC list resolution, Israel/France/U17 regressions |
| `resolution.test.ts` | Regression: USA ≠ France (id 2), USA ≠ Israel, USA ≠ U17 |
| `goldenBootContenders.test.ts` | Contender list — 10 players, required fields, no duplicates, WC nations |
| `feedback/route.test.ts` | POST validation, Supabase insert, truncation |
| `admin/auth.test.ts` | Password auth, mark_feedback_read |
| `my-picks/route.test.ts` | Entries + stats response, scorerPick included/null |

---

## Security

- `.env.local` is in `.gitignore` — keys never go to GitHub
- `SUPABASE_SECRET_KEY` is server-side only (API routes), never in the browser
- Row Level Security enabled on all Supabase tables
- Admin panel is password-protected (`ADMIN_PASSWORD` env var)
- Feedback readable only via service key (no public RLS read policy)
- Entry validation: patron code + optional geolocation
- One entry per phone number per match (unique constraint)

---

## Tournament Dates

| Stage | Dates |
|-------|-------|
| Group stage | June 11 – June 27, 2026 |
| Round of 32 | June 28 – July 4, 2026 |
| Round of 16 | July 4 – July 8, 2026 |
| Quarter Finals | July 10 – July 12, 2026 |
| Semi Finals | July 14 – July 15, 2026 |
| Final | **July 19, 2026** — MetLife Stadium, NJ |

---

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/SETUP.md](docs/SETUP.md) | Full deployment guide — Supabase, Vercel, env vars |
| [docs/DESIGN.md](docs/DESIGN.md) | Architecture, API-Football integration, caching strategy |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | How to run the app day-to-day during the tournament |
| [docs/RAFFLE.md](docs/RAFFLE.md) | How to run the TV raffle on July 19 |
| [CLAUDE.md](CLAUDE.md) | Developer context for AI-assisted coding |
