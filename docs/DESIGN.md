# Design & Architecture

Technical design document for The Peddler's Predictor.

---

## Overview

A two-pub World Cup prediction game. Patrons enter predictions on their phones, results are scored automatically, and a leaderboard drives engagement throughout the tournament. A TV is raffled at the end using accumulated correct-prediction entries.

---

## System Architecture

```
Patron's phone
     │
     │  scan QR code
     ▼
Next.js app (Vercel)
     │
     ├── /                    Entry form (client-side React)
     ├── /leaderboard         Live leaderboard (client-side React)
     ├── /admin               Admin panel (client-side React)
     │
     └── /api/entries         Validate + save entry (server-side)
     └── /api/admin           Set results, manage matches (server-side)
     └── /api/matches         Get active match (server-side)
          │
          ▼
     Supabase (Postgres)
          │
          ├── pubs             Pub locations, codes
          ├── matches          All 104 World Cup matches
          └── entries          All patron predictions
```

---

## Technology Choices

### Next.js 14 (App Router)

**Why not plain React?**
Plain React is frontend-only. We need a server-side component to:
- Keep the Supabase secret key out of the browser
- Validate the pub entry code server-side (so it can't be bypassed)
- Prevent duplicate entries securely

Next.js gives us React for the UI plus API routes for the server logic, all in one project with one deployment.

**Why not Express/Node backend?**
Would require a separate deployment and more configuration. Next.js on Vercel handles both in one push.

### Supabase (Postgres)

**Why Supabase over raw Postgres?**
- Hosted and managed — no server to maintain
- Auto-generated REST API — the browser can query it directly for reads
- Realtime subscriptions — leaderboard can update live without polling
- Free tier handles this volume easily (50k rows, 2GB)
- Row Level Security built in

**Why Postgres over a NoSQL database?**
- Relational data is a natural fit (entries belong to matches, matches belong to stages)
- SQL aggregations are straightforward for leaderboard scoring
- Supabase is Postgres — full SQL support

### Vercel

- Free tier is sufficient
- Zero-config Next.js deployment
- Auto-deploys on every GitHub push
- Edge network — fast globally, especially important for mobile users

### TypeScript

- Catches type errors at build time
- The `Match`, `Pub`, and `Entry` types are shared across frontend and API
- No runtime surprises from malformed API responses

---

## Database Schema

### pubs
| Column | Type | Purpose |
|--------|------|---------|
| id | text (PK) | `haverhill` or `nashua` |
| name | text | Display name |
| city | text | City + state |
| lat | float | GPS latitude |
| lng | float | GPS longitude |
| radius_m | integer | Geofence radius in metres |
| daily_code | text | Today's entry code (changed per match day) |

### matches
| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| home_team | text | Home team name |
| away_team | text | Away team name |
| home_flag | text | Flag emoji |
| away_flag | text | Flag emoji |
| kickoff_at | timestamptz | Kick-off time (UTC) |
| entries_close_at | timestamptz | When entries stop being accepted |
| stage | text | Group A / Round of 32 / Final etc. |
| result | text | `home`, `draw`, or `away` — null until set |
| is_active | boolean | Only one match is active at a time |

### entries
| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| pub_id | text (FK) | Which pub |
| match_id | uuid (FK) | Which match |
| name | text | Patron's display name |
| phone | text | For raffle contact |
| pick | text | `home`, `draw`, or `away` |
| is_correct | boolean | Set when result is confirmed, null until then |
| raffle_entries | integer | 3 if correct, 0 if wrong |
| created_at | timestamptz | Entry timestamp |

**Unique constraint**: `(phone, match_id)` — one entry per phone per match.

---

## Entry Validation Flow

```
Patron submits form
        │
        ▼
API route: POST /api/entries
        │
        ├── All fields present?          → 400 if missing
        ├── Valid pick (home/draw/away)?  → 400 if invalid
        ├── Pub exists?                  → 400 if not found
        ├── Entry code correct?          → 400 if wrong
        ├── Match is active?             → 400 if not found
        ├── Entries still open?          → 400 if past close time
        ├── Duplicate phone+match?       → 400 if exists
        │
        ▼
        INSERT into entries
        │
        ▼
        200 OK → patron sees success screen
```

---

## Geolocation Strategy

Browser geolocation (`navigator.geolocation`) is used as the primary check but is treated as best-effort:

- If granted and within `radius_m` of the pub → verified
- If granted but too far away → blocked with distance shown
- If denied or unavailable (thick walls, GPS issues) → falls back to code-only verification

This is intentional. GPS in buildings is unreliable. The daily entry code is the real gate — geolocation is a secondary deterrent against remote entries.

---

## Scoring System

- **3 raffle entries** for each correct prediction
- **0 raffle entries** for wrong predictions
- Leaderboard ranks by total raffle entries (= correct predictions × 3)
- Tiebreak: number of correct predictions

This means every correct pick counts equally regardless of when in the tournament it was made.

---

## Two-Pub Design

Both pubs share one app and one database. They're differentiated by:

- **URL parameter**: `?pub=haverhill` or `?pub=nashua`
- **QR codes**: each pub gets its own QR pointing to its URL
- **Geofence**: separate GPS coordinates and radius per pub
- **Daily code**: separate code per pub, changed independently
- **Leaderboard filter**: patrons can view all-locations or their pub only

Match data is shared — both pubs predict the same matches.

---

## Security Considerations

| Risk | Mitigation |
|------|-----------|
| Remote entry | Geolocation + daily entry code |
| Code sharing | Code changes each match day |
| Duplicate entries | Unique constraint on phone + match |
| Admin access | Password-protected admin route |
| Key exposure | Secret key server-side only, `.env.local` gitignored |
| Database abuse | Row Level Security on all tables |

---

## Future Improvements

- **SMS confirmation**: send a text after entry to verify phone number ownership
- **Score prediction**: bonus entries for predicting exact scoreline
- **Push notifications**: remind patrons before next match
- **Realtime leaderboard**: use Supabase realtime subscriptions instead of 30s polling
- **Staff app**: separate simpler admin view for bar staff to check codes
- **Analytics**: Supabase dashboard shows entry counts, popular picks by match
