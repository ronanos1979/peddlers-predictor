# Operations Guide

How to run The Peddler's Predictor day-to-day during the World Cup tournament.

---

## Admin Panel

Go to: `https://peddlers-predictor.vercel.app/admin`

Log in with your admin password. This is your control centre for everything.

---

## Before Each Match Day

### 1. Choose today's entry code

Pick a short memorable code for each pub — something staff can tell patrons easily. Suggestions:

- `PEDDLER1`, `PEDDLER2` ... `PEDDLER9`
- `WORLDCUP1`, `WORLDCUP2` ...
- Day-based: `JUNE11`, `JUNE12` etc.

### 2. Update the codes in admin

1. Go to `/admin` → **Daily pub codes** section
2. Type the new code next to each pub
3. Click **Save** for each one
4. Tell bar staff the new code — they tell patrons when asked

> Change codes at minimum once per match day. For busy days with multiple matches, you can keep the same code all day.

### 3. Activate the match

1. Go to `/admin` → **Upcoming matches** section *(coming soon — for now use "Create match")*
2. Find today's match and click **Set live**
3. The entry form on patrons' phones will immediately show the match

### 4. Set entries close time

Entries should close at kick-off. The `entries_close_at` time is set when the match is created from the seed data — it matches the kick-off time. You can adjust this in the Supabase table editor if needed.

---

## During the Match

- The leaderboard at `/leaderboard` updates automatically every 30 seconds
- Put the leaderboard on a TV screen using a tablet or laptop: open `https://peddlers-predictor.vercel.app/leaderboard` in full-screen mode (F11 on most browsers)
- Patrons can check the leaderboard on their own phones too

---

## After the Match

### Set the result

1. Go to `/admin`
2. Find the **Current match** section
3. Select the result: **Home win / Draw / Away win**
4. Click **Confirm result & update leaderboard**

This automatically:
- Marks every entry as correct or wrong
- Awards 3 raffle entries to correct picks
- Updates the leaderboard instantly
- Closes the match

### Activate the next match

If there's another match today, immediately activate the next one. Otherwise wait until the next match day.

---

## Match Schedule Quick Reference

All times are **ET (Eastern Time)**.

| Date | Matches | ET Times |
|------|---------|----------|
| Jun 11 | Mexico vs South Africa, South Korea vs Czechia | 3pm, 10pm |
| Jun 12 | Canada vs Bosnia, USA vs Paraguay | 3pm, 9pm |
| Jun 13 | Qatar vs Switzerland, Brazil vs Morocco, Haiti vs Scotland, Australia vs Türkiye | 3pm, 6pm, 9pm, 12am |
| Jun 14 | Germany vs Curaçao, Netherlands vs Japan, Ivory Coast vs Ecuador, Tunisia vs Sweden | 1pm, 4pm, 7pm, 10pm |
| Jun 15 | Spain vs Cape Verde, Belgium vs Egypt, Saudi Arabia vs Uruguay, Iran vs New Zealand | 12pm, 3pm, 6pm, 9pm |
| Jun 16 | France vs Senegal, Iraq vs Norway, Argentina vs Algeria, Austria vs Jordan | 3pm, 6pm, 9pm, 12am |
| Jun 17 | Portugal vs Congo DR, England vs Croatia, Ghana vs Panama, Uzbekistan vs Colombia | 1pm, 4pm, 7pm, 10pm |

> Full schedule in `supabase/seed_matches.sql` — all 104 matches are pre-loaded.

---

## Busy Match Days (Multiple Matches)

On days with 4 matches, you have two options:

**Option A — Run all matches** (most engagement)
- Activate each match about 30 minutes before kick-off
- Set the result immediately after full time
- Activate the next match

**Option B — Pick the best match of the day** (simpler)
- Choose the most interesting match for your crowd
- Only activate that one

For the group stage, we recommend Option B on days with 4 matches and both options are equally valid for days with 2.

---

## Troubleshooting

### "No active match" showing on patron phones
- Go to `/admin` and activate a match

### Patron says their code isn't working
- Check the code in `/admin` → Daily pub codes
- Codes are case-insensitive — `peddler1` and `PEDDLER1` both work
- If the code is correct, check that entries haven't closed for that match

### Leaderboard not updating
- Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
- The leaderboard polls every 30 seconds — it may just need a moment

### Patron already entered but wants to change their pick
- Not possible by design — picks are locked on submission
- This prevents people from changing after kick-off

### Someone entered from outside the pub
- The entry code is the main gate — if they have the code, they were likely told it by someone inside
- Consider changing the code more frequently if this is a concern

---

## Checking Entries in Supabase

You can see all entries directly in the database:

1. Go to [supabase.com](https://supabase.com) → your project
2. Click **Table Editor** → **entries**
3. You can see every entry, which pub it came from, and whether it was correct

Useful SQL queries to run in SQL Editor:

```sql
-- Today's entries
select name, pub_id, pick, created_at
from entries
where created_at > now() - interval '24 hours'
order by created_at desc;

-- Entries for a specific match
select name, phone, pub_id, pick, is_correct
from entries
where match_id = 'PASTE-MATCH-UUID-HERE'
order by created_at;

-- Most active patrons
select name, count(*) as total_entries, sum(raffle_entries) as raffle_tickets
from entries
group by name, phone
order by total_entries desc
limit 20;
```
