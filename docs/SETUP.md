# Setup Guide

Complete guide to deploying The Peddler's Predictor from scratch.

---

## Prerequisites

- [Node.js 18+](https://nodejs.org) — `node --version` to check
- [Git](https://git-scm.com)
- A [GitHub](https://github.com) account
- A [Supabase](https://supabase.com) account (free)
- A [Vercel](https://vercel.com) account (free, sign in with GitHub)

---

## Step 1 — Supabase (Database)

### Create project
1. Go to [supabase.com](https://supabase.com) → **Start for free**
2. Sign in with GitHub
3. Click **New project**
   - Name: `peddlers-daughter`
   - Region: `US East (N. Virginia)`
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
2. Paste the contents of `supabase/schema.sql`
3. Click **Run** — you should see `Success`

### Load all match data
1. Go to **SQL Editor → New query**
2. Paste the contents of `supabase/seed_matches.sql`
3. Click **Run** — this loads all 104 World Cup matches

---

## Step 2 — Local development

### Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/peddlers-predictor.git
cd peddlers-predictor
npm install
```

### Environment variables
```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in your values:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
ADMIN_PASSWORD=choose_something_strong
```

### Run locally
```bash
npm run dev
```

Open [http://localhost:3000/?pub=haverhill](http://localhost:3000/?pub=haverhill)

---

## Step 3 — GitHub

### Push to GitHub
```bash
cd peddlers-predictor
git init
git add .
git commit -m "Initial commit"

# Create a new repo at github.com first, then:
git remote add origin https://github.com/YOUR_USERNAME/peddlers-predictor.git
git branch -M main
git push -u origin main
```

> `.env.local` is in `.gitignore` — your keys will NOT be pushed to GitHub.

---

## Step 4 — Vercel (Hosting)

### Deploy
1. Go to [vercel.com](https://vercel.com) → sign in with GitHub
2. Click **Add New Project**
3. Find `peddlers-predictor` and click **Import**
4. Before deploying, add environment variables (same as `.env.local`):

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your publishable key |
| `SUPABASE_SECRET_KEY` | Your secret key |
| `ADMIN_PASSWORD` | Your chosen admin password |

5. Click **Deploy** — takes ~60 seconds
6. Your app is live at `https://peddlers-predictor.vercel.app`

### Auto-deploy
Every time you push to the `main` branch on GitHub, Vercel automatically redeploys. No manual steps needed.

---

## Step 5 — Generate QR codes

Generate QR codes for these two URLs at [qr.io](https://qr.io) or [qr-code-generator.com](https://www.qr-code-generator.com):

- **Haverhill**: `https://peddlers-predictor.vercel.app/?pub=haverhill`
- **Nashua**: `https://peddlers-predictor.vercel.app/?pub=nashua`

Print them on card stock and laminate — place on tables and at the bar.

---

## Step 6 — Post-setup security

After everything is working, regenerate your Supabase secret key:

1. Supabase dashboard → **Settings → API Keys**
2. Click the menu next to the secret key → **Regenerate**
3. Copy the new key
4. Update it in Vercel: **Project → Settings → Environment Variables**
5. Vercel will auto-redeploy with the new key

---

## Updating pub coordinates

The pub GPS coordinates in the database are approximate. To fine-tune them:

1. Go to [maps.google.com](https://maps.google.com)
2. Right-click on the exact pub location → **What's here?**
3. Copy the lat/lng
4. Go to Supabase → **Table Editor → pubs**
5. Edit the row for each pub and update `lat`, `lng`, and `radius_m`

| Pub | Current lat | Current lng | Radius |
|-----|------------|------------|--------|
| Haverhill, MA | 42.7762 | -71.0773 | 300m |
| Nashua, NH | 42.7654 | -71.4676 | 300m |
