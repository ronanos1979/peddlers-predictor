# Local Windows 11 Setup

These instructions run the app locally on Windows 11, use a local Supabase database, and still make external calls to the football APIs.

## Prerequisites

- Windows 11 with PowerShell
- Git
- Node.js 20 LTS or newer
- Docker Desktop with WSL 2 enabled and Docker running
- An API-Football key from `api-football.com`
- Optional: a football-data.org API key. When `FOOTBALL_DATA_API_KEY` is set, the app uses football-data.org first for supported endpoints and falls back to API-Football.

Supabase local development is run through the Supabase CLI, which uses Docker containers. Current Supabase CLI docs: https://supabase.com/docs/guides/local-development/cli/getting-started

## First-Time Setup

Open PowerShell.

```powershell
git clone https://github.com/ronanosullivan/peddlers-predictor.git
cd peddlers-predictor
npm install
```

Start Docker Desktop before running Supabase.

If `supabase\config.toml` does not exist yet, initialize the local Supabase config:

```powershell
npx supabase init
```

Start the local Supabase stack:

```powershell
npx supabase start
```

The first start can take several minutes because Docker images are downloaded. When it finishes, copy these values from the terminal output:

- `Project URL`
- `Publishable` key
- `Secret` key
- `Studio` URL

Create the local environment file:

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local` so it uses the local Supabase stack and real external football API keys:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from npx supabase start>
SUPABASE_SECRET_KEY=<secret key from npx supabase start>
ADMIN_PASSWORD=<local admin password>

FOOTBALL_DATA_API_KEY=<football-data.org key — primary source, 10 req/min, no daily cap>
API_FOOTBALL_KEY=<api-football.com key — fallback + player photos, 100 req/day>
NEXT_PUBLIC_DAILY_CODE_PREFIX=peddlers   # prefix for daily patron access codes (default: peddlers)

# Optional — for match-day email reminders via Resend
RESEND_API_KEY=<Resend API key>
RESEND_FROM_EMAIL=<from address for reminder emails>
```

Do not use hosted Supabase values in `.env.local` if you want the app to use the local database.

## Create the Local Database Schema

Open Supabase Studio from the `Studio` URL printed by `npx supabase start`. It is usually:

```text
http://127.0.0.1:54323
```

In Studio:

1. Open `SQL Editor`.
2. Open `supabase\master.sql` from this repo.
3. Paste the full SQL into the SQL editor.
4. Run it once.

This creates all local tables (pubs, matches, entries, scorer_picks, winner_picks, check_ins, feedback, analytics_events, team_cache, player_cache), views (player_cache_stats, leaderboard), RLS policies, pub seed data, demo match, and all 104 World Cup match records.

## Run the App

Keep Docker Desktop and local Supabase running, then start Next.js:

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful local URLs:

```text
http://localhost:3000/?pub=haverhill
http://localhost:3000/?pub=nashua
http://localhost:3000/admin
http://localhost:3000/leaderboard
http://localhost:3000/world-cup/standings
```

The app database reads and writes go to local Supabase. Football data endpoints still call the external APIs configured in `.env.local`.

## Stop and Restart

Stop the Next.js dev server with `Ctrl+C`.

Stop Supabase without deleting local data:

```powershell
npx supabase stop
```

Start Supabase again later:

```powershell
npx supabase start
```

Then restart the app:

```powershell
npm run dev
```

## Update the Local Code

From the repo folder:

```powershell
git pull
npm install
```

If dependencies changed, restart the Next.js dev server:

```powershell
npm run dev
```

If Supabase SQL changed and you want to refresh your local database, open Studio and run `supabase\master.sql` again.

Important: `supabase\master.sql` deletes non-demo rows from `matches` before re-inserting the match schedule. Back up any local match edits first if you need to keep them.

## Reset the Local Supabase Database

Use this when you want a clean local database.

```powershell
npx supabase stop --no-backup
npx supabase start
```

Then run `supabase\master.sql` again in Supabase Studio.

## Verify

Run tests:

```powershell
npm test
```

Build locally:

```powershell
npm run build
```

Use both before pushing changes.
