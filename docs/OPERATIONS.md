# Operations Guide

How to run Peddler's Predictor day-to-day during the tournament (June 11 – July 19, 2026).

---

## Before the Tournament (now – June 10)

- [ ] Print and laminate QR code cards for each pub table
- [ ] Tell bar staff the patron code format: `peddlers` + day number (e.g. `peddlers11` on June 11)
- [ ] Test the app at both pub URLs before June 11
- [ ] Optionally display the leaderboard on a pub TV at `/leaderboard`

---

## Match Day Routine

### Before kick-off
Nothing required — the match activates automatically at kick-off time.

The patron code is automatic. Tell bar staff: **`peddlers` + today's date number**.
- June 15 → `peddlers15`
- July 4 → `peddlers4`

### After full time
1. Go to `https://peddlers-predictor.vercel.app/admin`
2. Log in with the admin password
3. Click **⟳ Sync results from API** — this fetches all finished results, scores all entries, and loads ESPN goals/cards in one step
4. The leaderboard updates instantly
5. **For the Final**: setting the result also auto-scores all `winner_picks` — no separate action needed
6. If a match doesn't sync (check the debug panel that appears below the Sync button): fix its kickoff time in Supabase (see Troubleshooting), then sync again

**Manual fallback** (if sync misses a match):
- Find the match under **Results** tab
- Select the result: **Home Win / Draw / Away Win**
- Optionally enter the score (home − away)
- Click **Confirm** — also auto-loads ESPN events

**Scorer events**: goals and cards load automatically on sync/confirm. Use the **⟳ scorers** button on a match row only to refresh stale or failed event data.

### Checking entrants
- **Entrants tab**: filter by date, see who predicted what, CSV export
- **Stats tab**: total entries, unique players, emails collected, bar chart by day

### Feedback / bug reports
- **Feedback tab**: shows patron bug reports with unread count badge
- Click **Mark read** once you've addressed an item

---

## Admin Panel Tabs

| Tab | Purpose |
|-----|---------|
| Results | Set match outcomes after full time; ⟳ Sync (fetches results + auto-loads ESPN events); sync debug panel; email reminders |
| Entrants | View/export patron predictions; filter by date |
| Stats | Entry counts, accuracy, pub breakdown, daily chart |
| Feedback | Bug reports and suggestions from patrons, unread badge |
| Raffle | Weighted draw view — filterable by pub |
| Teams | 48-team cache status; load squads from football-data.org; enrich with API-Football photos/clubs |
| Analytics | Patron behaviour — geo funnel, engagement (leaderboard/picks views), conversions; 7d/30d/90d toggle |

---

## Patron Code

Format: `peddlers` + day of month

| Date | Code |
|------|------|
| June 11 | `peddlers11` |
| June 15 | `peddlers15` |
| June 27 | `peddlers27` |
| July 4 | `peddlers4` |
| July 19 | `peddlers19` |

Yesterday's code is also accepted (for matches past midnight).

---

## API-Football Data

Real-time data (standings, team squads, scorers) comes from API-Football. Free tier is 100 requests/day — the app caches aggressively to stay well within this.

| Data | Cache TTL | Source |
|------|-----------|--------|
| Standings, results, scorers | 5 minutes | In-memory |
| Team squad, coach, fixtures | 7 days | Supabase team_cache |
| Local match schedule | Always fresh | Supabase matches |

**If a team page shows wrong data**: go to Supabase SQL Editor and run:
```sql
truncate table team_cache;
```
The next visit will re-fetch correctly.

---

## Tournament Milestones

| Date | Action |
|------|--------|
| June 11 | Group stage begins — predictions go live |
| June 27 | Group stage ends |
| June 28 | Round of 32 begins — update bracket team names as groups finish |
| July 4 | Round of 16 |
| July 10–12 | Quarter Finals |
| July 14–15 | Semi Finals |
| July 18 | Third Place |
| **July 19** | **Final — run the TV raffle (see RAFFLE.md)** |

### Updating knockout round teams
As groups finish, update placeholder names in Supabase:
```sql
UPDATE matches SET home_team = 'USA', home_flag = '🇺🇸'
WHERE home_team = 'Group D Winner';
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Patron code not working | Check: `peddlers` + today's day number. Yesterday's also works. |
| Match not showing on home page | Check `kickoff_at` is correct in Supabase |
| Result set wrong | Set it again — it re-scores all entries |
| Team page shows wrong player | Run `truncate table team_cache;` in Supabase SQL Editor |
| Feedback not saving | Check `feedback` table exists and has insert policy |
| Sync missed a match | Check the debug panel below the Sync button — it shows the nearest FD match and time difference. If diff > 5 min, the kickoff time in the DB is wrong. Fix with `UPDATE matches SET kickoff_at = '<correct UTC time>', entries_close_at = '<kickoff + 105 min>' WHERE home_team = '...' AND away_team = '...';` in Supabase SQL Editor, then sync again. |
| ESPN scorers not loading | Click **⟳ scorers** on the match row and check the error toast. Common causes: (1) match not in ESPN yet — wait a few minutes and retry; (2) team name not matching ESPN — check `toEspnTeamName()` in `espnEvents.ts`. |
| API-Football data wrong | Real-time data (standings, scorers) is cached 5 min. Team squad/coach is cached 7 days in `team_cache`. Run `truncate table team_cache; truncate table player_cache;` to force a fresh load. |
