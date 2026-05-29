# 🍺 Peddler's Predictor — World Cup 2026

A live match prediction game for **The Peddler's Daughter** pubs in Haverhill, MA and Nashua, NH. Patrons scan a QR code at the bar, predict World Cup match results, and compete on a live leaderboard for a TV giveaway at the end of the tournament.

---

## Live URLs

| Purpose | URL |
|---------|-----|
| Haverhill patron entry | `https://peddlers-predictor.vercel.app/?pub=haverhill` |
| Nashua patron entry | `https://peddlers-predictor.vercel.app/?pub=nashua` |
| Leaderboard (all) | `https://peddlers-predictor.vercel.app/leaderboard` |
| Haverhill leaderboard | `https://peddlers-predictor.vercel.app/leaderboard?pub=haverhill` |
| Nashua leaderboard | `https://peddlers-predictor.vercel.app/leaderboard?pub=nashua` |
| Admin panel | `https://peddlers-predictor.vercel.app/admin` |

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+ (`node --version` to check)
- A Supabase project (see [docs/SETUP.md](docs/SETUP.md))
- Git

### Install and run

```bash
git clone https://github.com/YOUR_USERNAME/peddlers-predictor.git
cd peddlers-predictor
npm install
cp .env.example .env.local
# Edit .env.local with your Supabase keys
npm run dev
```

Open http://localhost:3000

---

## Project Structure

```
peddlers-predictor/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Patron entry form
│   │   ├── layout.tsx            # Root layout with header/logo
│   │   ├── globals.css           # Global styles
│   │   ├── leaderboard/
│   │   │   └── page.tsx          # Live leaderboard
│   │   ├── admin/
│   │   │   └── page.tsx          # Admin panel
│   │   └── api/
│   │       ├── entries/route.ts  # POST: submit prediction
│   │       ├── matches/route.ts  # GET: active match
│   │       └── admin/route.ts    # POST: admin actions
│   └── lib/
│       ├── supabase.ts           # Browser Supabase client + types
│       ├── supabaseAdmin.ts      # Server Supabase client (secret key)
│       └── geo.ts                # Geolocation utilities
├── public/
│   └── logo.avif                 # Pub logo
├── supabase/
│   ├── schema.sql                # Database schema (run once)
│   └── seed_matches.sql          # All 104 World Cup matches
├── docs/
│   ├── SETUP.md                  # Full setup guide
│   ├── DESIGN.md                 # Architecture & design decisions
│   ├── OPERATIONS.md             # Day-to-day operations guide
│   └── RAFFLE.md                 # End of tournament raffle guide
├── .env.example                  # Environment variable template
└── README.md                     # This file
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| [SETUP.md](docs/SETUP.md) | Full deployment guide — Supabase, Vercel, GitHub |
| [DESIGN.md](docs/DESIGN.md) | Architecture, tech stack, design decisions |
| [OPERATIONS.md](docs/OPERATIONS.md) | How to run the app day-to-day during the tournament |
| [RAFFLE.md](docs/RAFFLE.md) | How to run the TV raffle at the end |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 + React | Frontend + API in one project |
| Language | TypeScript | Type safety, catches errors early |
| Database | Supabase (Postgres) | Realtime, free tier, hosted |
| Hosting | Vercel | Free, auto-deploys from GitHub |
| Styling | Custom CSS | Lightweight, no dependencies |

---

## Security

- `.env.local` is in `.gitignore` — keys never go to GitHub
- Secret key is server-side only (API routes), never in the browser
- Row Level Security enabled on all Supabase tables
- Admin panel is password-protected
- Entry code + geolocation dual verification for patron entries
- One entry per phone number per match (duplicate prevention)

---

## Tournament Dates

- **Group stage**: June 11 – June 27, 2026
- **Round of 32**: June 28 – July 4, 2026
- **Round of 16**: July 4 – July 8, 2026
- **Quarter Finals**: July 10 – July 12, 2026
- **Semi Finals**: July 14 – July 15, 2026
- **Final**: July 19, 2026 — MetLife Stadium, NJ
