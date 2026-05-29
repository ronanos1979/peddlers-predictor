# TV Raffle Guide

How to run the TV giveaway at the end of the tournament.

---

## How the raffle works

Every correct prediction earns a patron **3 raffle entries**. A patron who predicts 10 matches correctly has 30 entries. The more correct picks, the better the odds — but it's still a raffle, so anyone can win.

Each pub (Haverhill and Nashua) has **one TV to give away**. The raffle is run separately per pub.

---

## When to run it

After the **World Cup Final** on July 19, 2026. Give it a day or two after the final to make sure all results are entered and scored.

---

## Step 1 — Export the raffle entries

Go to your Supabase dashboard → **SQL Editor** → **New query**.

**For Haverhill pub:**
```sql
select
  name,
  phone,
  sum(raffle_entries) as tickets,
  count(*) filter (where is_correct = true) as correct_picks,
  count(*) as total_picks
from entries
where pub_id = 'haverhill'
group by name, phone
having sum(raffle_entries) > 0
order by tickets desc;
```

**For Nashua pub:**
```sql
select
  name,
  phone,
  sum(raffle_entries) as tickets,
  count(*) filter (where is_correct = true) as correct_picks,
  count(*) as total_picks
from entries
where pub_id = 'nashua'
group by name, phone
having sum(raffle_entries) > 0
order by tickets desc;
```

Click **Run**, then click the **Download CSV** button to export.

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
-- Top 10 predictors across both pubs
select
  name,
  pub_id,
  sum(raffle_entries) as raffle_tickets,
  count(*) filter (where is_correct = true) as correct,
  count(*) as total,
  round(100.0 * count(*) filter (where is_correct = true) / count(*), 0) as accuracy_pct
from entries
group by name, phone, pub_id
order by correct desc
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
