# Peddler's Predictor — World Cup App

A pub prediction game for The Peddler's Daughter (Haverhill, MA + Nashua, NH).
Patrons scan a QR code, predict match results, and compete on a live leaderboard
for a TV giveaway at the end of the tournament.

## How it works

1. Patron scans QR code at the pub
2. Enters name, phone, today's pub code (given by bartender), and picks a result
3. Geolocation verifies they're inside the pub
4. Correct predictions earn 3 raffle entries toward the TV prize
5. Leaderboard updates live — can be displayed on a TV in the pub

---

## Stack

- **Frontend + API**: Next.js 14 (hosted on Vercel, free)
- **Database**: Supabase (hosted Postgres, free tier)
- **QR codes**: Any free QR generator pointing to your Vercel URL

---

## Local development setup

### 1. Prerequisites

- Node.js 18+ installed (`node --version` to check)
- A Supabase project created at supabase.com
- Git installed

### 2. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/peddlers-predictor.git
cd peddlers-predictor
npm install
```

### 3. Environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
ADMIN_PASSWORD=choose_a_strong_password
```

### 4. Set up the database

Go to your Supabase dashboard → SQL Editor → New query.
Paste and run the contents of `supabase/schema.sql`.

### 5. Run locally

```bash
npm run dev
```

Open http://localhost:3000

---

## Pages

| URL | Purpose |
|-----|---------|
| `/?pub=haverhill` | Patron entry form — Haverhill pub |
| `/?pub=nashua` | Patron entry form — Nashua pub |
| `/leaderboard?pub=haverhill` | Leaderboard (filter by pub or all) |
| `/admin` | Admin panel — set results, change codes, create matches |

---

## QR codes to print

Generate QR codes for these two URLs (replace with your Vercel domain):

- **Haverhill**: `https://your-app.vercel.app/?pub=haverhill`
- **Nashua**: `https://your-app.vercel.app/?pub=nashua`

Use https://qr.io or https://www.qr-code-generator.com (free).

---

## Daily workflow

### Before each match
1. Go to `/admin`
2. Click **Create match** — fill in teams, kick-off time, close time
3. Update the **daily pub code** for each pub (e.g. `ANCHOR7`)
4. Tell bar staff the code — they tell patrons

### After each match
1. Go to `/admin`
2. Select the result (home win / draw / away win)
3. Click **Confirm result** — leaderboard updates automatically

### End of tournament (TV raffle)
Run this query in Supabase SQL Editor to get all raffle entries:
```sql
select name, phone, sum(raffle_entries) as total_entries
from entries
group by name, phone
order by total_entries desc;
```
Each entry = one raffle ticket. Pick a winner!

---

## Deployment (Vercel)

1. Push this repo to GitHub
2. Go to vercel.com → New Project → import from GitHub
3. Add environment variables (same as .env.local) in the Vercel dashboard
4. Deploy — Vercel gives you a free URL like `peddlers-predictor.vercel.app`

---

## Security notes

- `.env.local` is in `.gitignore` — your keys never go to GitHub
- The secret key is only used server-side in API routes
- Row Level Security is enabled on all Supabase tables
- Admin panel is password-protected
- **After initial setup, regenerate your Supabase secret key** in the Supabase dashboard

---

## Pub coordinates (update if needed)

| Pub | Lat | Lng | Radius |
|-----|-----|-----|--------|
| Haverhill, MA | 42.7762 | -71.0773 | 300m |
| Nashua, NH | 42.7654 | -71.4676 | 300m |

To update: go to Supabase dashboard → Table Editor → pubs table.
