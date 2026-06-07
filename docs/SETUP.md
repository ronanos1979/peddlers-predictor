# Setup Guide

Complete guide to deploying Peddler's Predictor from scratch on a new Supabase + Vercel project.

---

## Prerequisites

- [Node.js 18+](https://nodejs.org) — `node --version` to check
- [Git](https://git-scm.com)
- A [GitHub](https://github.com) account
- A [Supabase](https://supabase.com) account (free tier is fine)
- A [Vercel](https://vercel.com) account (free, sign in with GitHub)
- An [API-Football v3](https://www.api-football.com) key (free tier — 100 req/day)

---

## Step 1 — Supabase (Database)

### Create project
1. Go to [supabase.com](https://supabase.com) → **Start for free**
2. Sign in with GitHub
3. Click **New project**
   - Name: `peddlers-predictor`
   - Region: `US East (N. Virginia)` — closest to Haverhill/Nashua
   - Save your database password somewhere safe
4. Wait ~2 minutes for the project to spin up

### Get your API keys
1. Go to **Settings → API Keys**
2. Copy:
   - **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
   - **Publishable key**: `sb_publishable_...`
   - **Secret key**: `sb_secret_...` (click the eye icon to reveal)

### Run the schema
1. Go to **SQL Editor → New query**
2. Paste the entire contents of `supabase/master.sql`
3. Click **Run** — you should see `Success`

This creates all tables (pubs, matches, entries, scorer_picks, winner_picks, check_ins, feedback, analytics_events, team_cache, player_cache), views (player_cache_stats, leaderboard), enables RLS with all policies, seeds pub data, and loads all 104 World Cup 2026 matches.

---

## Step 2 — Environment Variables

Copy the example file and fill it in:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
ADMIN_PASSWORD=choose-a-strong-password
FOOTBALL_DATA_API_KEY=your-football-data-key   # primary source, 10 req/min, no daily cap
API_FOOTBALL_KEY=your-api-football-key          # player photos + clubs, 100 req/day
NEXT_PUBLIC_DAILY_CODE_PREFIX=peddlers          # prefix for daily patron access codes
RESEND_API_KEY=your-resend-key                  # optional — for match-day email reminders
RESEND_FROM_EMAIL=noreply@yourdomain.com        # optional — from address for reminders
```

**Never commit `.env.local` — it is already in `.gitignore`.**

---

## Step 3 — Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

To run tests:
```bash
npm test
```

To verify production build:
```bash
npm run build
```

---

## Step 4 — Vercel (Hosting)

### Connect repository
1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repository
3. Framework preset: **Next.js** (auto-detected)
4. Click **Deploy**

### Set environment variables in Vercel
1. Go to your Vercel project → **Settings → Environment Variables**
2. Add each variable from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `ADMIN_PASSWORD`
   - `FOOTBALL_DATA_API_KEY`
   - `API_FOOTBALL_KEY`
   - `NEXT_PUBLIC_DAILY_CODE_PREFIX`
   - `RESEND_API_KEY` (optional)
   - `RESEND_FROM_EMAIL` (optional)
3. Redeploy for the variables to take effect

### Auto-deploy
Every push to `main` automatically deploys in ~60 seconds. Check status at your Vercel dashboard.

---

## Step 5 — Verify

1. Visit `https://your-app.vercel.app/?pub=haverhill`
   - You should see the home page with a countdown to June 11
   - Select Haverhill location and try the demo prediction

2. Visit `https://your-app.vercel.app/admin`
   - Log in with your `ADMIN_PASSWORD`
   - You should see 7 tabs: Results, Entrants, Stats, Feedback, Raffle, Teams, Analytics

3. Visit `https://your-app.vercel.app/world-cup/standings`
   - Pre-tournament: "Standings not available yet"
   - During tournament: live group tables from API-Football

---

## QR Codes for Table Cards

Print and laminate cards for each pub table:

| Pub | QR URL |
|-----|--------|
| Haverhill | `https://peddlers-predictor.vercel.app/?pub=haverhill` |
| Nashua | `https://peddlers-predictor.vercel.app/?pub=nashua` |

Copy: **"Free to play. Win a TV. Scan to predict every match."**

---

## Deploying to a Second Supabase Project

If you need a fresh database (e.g. staging environment):

1. Create a new Supabase project
2. Run `supabase/master.sql` in the SQL Editor
3. Update `.env.local` with the new project's URL and keys
4. Set the new keys in Vercel under a separate deployment

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Team page shows wrong team / U17 | Run `truncate table team_cache;` in Supabase SQL Editor |
| API-Football returns empty data | Pre-tournament is expected — local schedule fallback shown |
| Admin login fails | Check `ADMIN_PASSWORD` env var in Vercel matches what you type |
| Entries not saving | Check Supabase RLS policies — run master.sql again if unsure |
| Build fails on Vercel | Run `npm run build` locally first to catch TypeScript errors |
