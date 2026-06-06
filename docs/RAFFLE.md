# TV Raffle Guide

How to run the TV giveaway at the end of the tournament.

---

## How the raffle works

Patrons earn raffle tickets through correct predictions — more tickets means more chances to win, but it is still a **random draw**. Being at the top of the leaderboard does not guarantee winning.

### Ticket sources

| Action | Tickets |
|--------|---------|
| Correct result prediction | 1 ticket |
| Correct result + exact score | 3 tickets |
| Golden Boot pick correct (set manually after Final) | +10 tickets |
| World Cup Champion pick correct (auto-scored at Final) | +15 tickets |

### Prize

**One TV — one winner across both pubs.** All entries from Haverhill and Nashua compete in a single combined draw.

---

## When to run it

After the **World Cup Final** on July 19, 2026. Give it a day or two to make sure all results are entered, scored, and the winner_picks bonus has been applied.

**Before running the draw:**
1. Set the Final result in `/admin` — this auto-scores all World Cup Champion picks
2. Manually set the Golden Boot (`is_correct`) for the top scorer in the admin panel or directly in Supabase
3. Verify the leaderboard at `/leaderboard` looks correct

---

## Step 1 — Export the raffle entries

Go to your Supabase dashboard → **SQL Editor** → **New query**.

This query combines match entry tickets with the World Cup Champion bonus across both pubs:

```sql
select
  e.name,
  e.phone,
  e.pub_id,
  sum(e.raffle_entries) + coalesce(wp.raffle_entries, 0) as tickets,
  count(*) filter (where e.is_correct = true) as correct_picks,
  count(*) as total_picks
from entries e
left join winner_picks wp on wp.phone = e.phone
where e.match_id in (select id from matches where stage != 'Demo Match')
group by e.name, e.phone, e.pub_id, wp.raffle_entries
having sum(e.raffle_entries) + coalesce(wp.raffle_entries, 0) > 0
order by tickets desc;
```

Click **Run**, then click the **Download CSV** button to export.

**To check Golden Boot bonus entries separately:**
```sql
select name, phone, pub_id, 10 as golden_boot_bonus
from scorer_picks
where is_correct = true;
```

---

## Step 2 — Build the raffle drum

Open the CSV. Each row is a person. Their `tickets` column tells you how many times their name goes in the draw.

You can do this digitally or physically:

**Digital (recommended):**
Open a new Google Sheet or Excel file. For each person, copy their name down the number of times equal to their ticket count. Example:

| Name |
|------|
| Sean M. |
| Sean M. |
| Sean M. |
| Colleen R. |
| Colleen R. |
| Colleen R. |
| Colleen R. |
| Colleen R. |
| Colleen R. |
| Jake T. |
| Jake T. |
| Jake T. |

Then use this formula in the next column to pick a random winner:
```
=INDEX(A:A, RANDBETWEEN(1, COUNTA(A:A)))
```

Press F9 (or Cmd+= on Mac) to re-roll. Do this live on a screen in the pub for drama.

**Physical:**
Print the names, cut them up, put them in a pint glass. Pull one out.

---

## Step 3 — Run it in the pub

Suggestions for making it an event:

- Run it on a **match night** — existing atmosphere, crowd already there
- Put the **leaderboard on the TV** before the draw so people can see their entry count
- Have the **bartender do the draw** live
- Announce the winner over the PA or just loudly
- Contact the winner by phone if they're not present (you have their number)

---

## Step 4 — Contact a winner who isn't present

If the winner isn't in the pub on draw night:

1. Call the phone number from the entries table
2. Give them 48 hours to claim
3. If no response, re-draw

---

## Full tournament stats query

Run this after the tournament for fun — good to share on social media or display on the night:

```sql
-- Overall tournament stats
select
  count(distinct phone) as unique_players,
  count(*) as total_predictions,
  count(*) filter (where is_correct = true) as correct_predictions,
  round(100.0 * count(*) filter (where is_correct = true) / count(*), 1) as accuracy_pct
from entries;
```

```sql
-- Top 10 predictors across both pubs (including winner pick bonus)
select
  e.name,
  e.pub_id,
  sum(e.raffle_entries) + coalesce(max(wp.raffle_entries), 0) as raffle_tickets,
  count(*) filter (where e.is_correct = true) as correct,
  count(*) as total,
  round(100.0 * count(*) filter (where e.is_correct = true) / count(*), 0) as accuracy_pct
from entries e
left join winner_picks wp on wp.phone = e.phone
group by e.name, e.phone, e.pub_id
order by raffle_tickets desc
limit 10;
```

```sql
-- Most predicted result per match
select
  m.home_team, m.away_team, m.result as actual_result,
  count(*) filter (where e.pick = 'home') as picked_home,
  count(*) filter (where e.pick = 'draw') as picked_draw,
  count(*) filter (where e.pick = 'away') as picked_away
from matches m
join entries e on e.match_id = m.id
where m.result is not null
group by m.id, m.home_team, m.away_team, m.result
order by m.kickoff_at;
```

```sql
-- World Cup Champion pick breakdown
select
  team_name, team_flag,
  count(*) as picks,
  count(*) filter (where pub_id = 'haverhill') as haverhill,
  count(*) filter (where pub_id = 'nashua') as nashua,
  max(is_correct::int)::boolean as was_correct
from winner_picks
group by team_name, team_flag
order by picks desc;
```
