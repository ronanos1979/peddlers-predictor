import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getFdFixtures, getFdStandings, FdRateLimitError } from '@/lib/footballData'
import { fetchEspnEvents, scorerNameMatches } from '@/lib/fetchEspnEvents'
import { toEspnDate, toEspnTeamName } from '@/lib/espnEvents'

export { FdRateLimitError }

export type SyncDebugUnmatched = {
  match: string
  dbKickoff: string
  nearestFd: string | null
  nearestFdKickoff: string | null
  diffMin: number | null
}

export type SyncResultsOutput = {
  updated: number
  entries_scored: number
  events_loaded: number
  names_updated: number
  scores_corrected: number
  message?: string
  debug: {
    fdFinishedCount: number
    dbUnresolvedCount: number
    unmatched: SyncDebugUnmatched[]
  }
}

// FD team name → our schedule name
const FD_TO_SCHED: Record<string, string> = {
  'Czech Republic': 'Czechia',
  'Korea Republic': 'South Korea',
  'United States': 'USA',
  'Turkey': 'Türkiye',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cape Verde Islands': 'Cape Verde',
  'Bosnia-Herzegovina': 'Bosnia & Herzegovina',
  'Cabo Verde': 'Cape Verde',
}

type StandingRow = { team: { name: string }; all: { played: number } }

// Resolve "Group X Winner" / "Group X Runner-up" placeholders in the matches table
// to real team names once the group is complete. Also sets home_flag/away_flag from
// existing group stage match records. Returns the number of match rows updated.
// True if a team slot still holds an unresolved placeholder.
// Catches both our DB format ("Group H Runner-up", "3rd Place (A/B/C)") and
// ESPN's format ("Group H 2nd Place", "Third Place Group C/D/F/G/H") so Pass 2
// never overwrites a real placeholder with an ESPN-format placeholder.
function isPlaceholderName(name: string): boolean {
  if (/\b(Winner|Loser|Runner-up|3rd\s*Place|TBD|Match\s*\d+|Semifinal|Quarterfinal)\b/i.test(name)) return true
  // ESPN uses "Group H 2nd Place" / "Group K 1st Place" — catch ordinal+Place combos
  if (/\b\d+(?:st|nd|rd|th)\s+Place\b/i.test(name)) return true
  // ESPN uses "Third Place Group E/H/I/J/K" instead of our "3rd Place (E/H/I/J/K)"
  if (/\bThird\s+Place\b/i.test(name)) return true
  return false
}

export async function updateKnockoutNames(): Promise<number> {
  const standingsData = await getFdStandings() as { response?: Array<{ league?: { standings?: StandingRow[][] } }> }
  const groups: StandingRow[][] = standingsData.response?.[0]?.league?.standings ?? []

  // Pass 1 — standings-based: "Group X Winner/Runner-up" → real team name
  const resolution = new Map<string, string>()
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    if (group.length >= 4 && group.every(r => r.all.played >= 3)) {
      const letter = String.fromCharCode(65 + i)
      resolution.set(`Group ${letter} Winner`, FD_TO_SCHED[group[0].team.name] ?? group[0].team.name)
      resolution.set(`Group ${letter} Runner-up`, FD_TO_SCHED[group[1].team.name] ?? group[1].team.name)
    }
  }

  // Build team name → flag emoji map from all existing DB matches
  const { data: flagRows } = await supabaseAdmin
    .from('matches').select('home_team, home_flag, away_team, away_flag')
    .not('home_flag', 'is', null).neq('home_flag', '')
  const flagMap = new Map<string, string>()
  for (const m of flagRows || []) {
    if (m.home_team && m.home_flag) flagMap.set(m.home_team, m.home_flag)
    if (m.away_team && m.away_flag) flagMap.set(m.away_team, m.away_flag)
  }

  const { data: knockoutMatches } = await supabaseAdmin
    .from('matches').select('id, home_team, away_team, kickoff_at')
    .not('stage', 'ilike', 'Group %').neq('stage', 'Demo Match')

  let updated = 0

  // Apply standings-based resolution (Group Winner/Runner-up)
  for (const m of knockoutMatches || []) {
    const homeResolved = resolution.get(m.home_team)
    const awayResolved = resolution.get(m.away_team)
    if (!homeResolved && !awayResolved) continue
    const updates: Record<string, string> = {}
    if (homeResolved) { updates.home_team = homeResolved; const f = flagMap.get(homeResolved); if (f) updates.home_flag = f }
    if (awayResolved) { updates.away_team = awayResolved; const f = flagMap.get(awayResolved); if (f) updates.away_flag = f }
    await supabaseAdmin.from('matches').update(updates).eq('id', m.id)
    updated++
  }

  // Pass 1.5 — result-based: resolve "Semifinal N Winner/Loser", "Quarterfinal N Winner/Loser",
  // "Round of 16 N Winner/Loser", "Round of 32 N Winner/Loser", "Match N Winner/Loser" from
  // already-played DB matches. This handles 3rd place (Semifinal Losers) and Final (Semifinal Winners)
  // without needing to call ESPN.
  {
    // Build full match-number index (match 1 = first non-demo kickoff, 101/102 = SFs, etc.)
    const { data: allNonDemo } = await supabaseAdmin
      .from('matches')
      .select('id, home_team, away_team, result')
      .neq('stage', 'Demo Match')
      .order('kickoff_at', { ascending: true })
    const byNum: Record<number, { home_team: string; away_team: string; result: string | null }> = {}
    ;(allNonDemo || []).forEach((m, i) => { byNum[i + 1] = m })

    // Reload knockout matches in case Pass 1 just wrote new team names
    const { data: freshKO } = await supabaseAdmin
      .from('matches').select('id, home_team, away_team')
      .not('stage', 'ilike', 'Group %').neq('stage', 'Demo Match')

    const slotPatterns: Array<[RegExp, number]> = [
      [/^Match (\d+) (Winner|Loser)$/i, 0],
      [/^Semifinal (\d+) (Winner|Loser)$/i, 100],
      [/^Quarterfinal (\d+) (Winner|Loser)$/i, 96],
      [/^Round of 16 (\d+) (Winner|Loser)$/i, 88],
      [/^Round of 32 (\d+) (Winner|Loser)$/i, 72],
    ]

    const slotRes = new Map<string, string>()
    for (const m of freshKO || []) {
      for (const slot of [m.home_team, m.away_team]) {
        if (!isPlaceholderName(slot)) continue
        let matchNum: number | null = null
        let wantsLoser = false
        for (const [re, offset] of slotPatterns) {
          const mm = slot.match(re)
          if (mm) { matchNum = offset + parseInt(mm[1], 10); wantsLoser = mm[2].toLowerCase() === 'loser'; break }
        }
        if (matchNum === null) continue
        const src = byNum[matchNum]
        if (!src?.result) continue
        const winner = src.result === 'home' ? src.home_team : src.result === 'away' ? src.away_team : null
        const loser  = src.result === 'home' ? src.away_team : src.result === 'away' ? src.home_team : null
        const resolved = wantsLoser ? loser : winner
        if (resolved && !isPlaceholderName(resolved)) slotRes.set(slot, resolved)
      }
    }

    for (const m of freshKO || []) {
      const homeR = slotRes.get(m.home_team)
      const awayR = slotRes.get(m.away_team)
      if (!homeR && !awayR) continue
      const upd: Record<string, string> = {}
      if (homeR) { upd.home_team = homeR; const f = flagMap.get(homeR); if (f) upd.home_flag = f }
      if (awayR) { upd.away_team = awayR; const f = flagMap.get(awayR); if (f) upd.away_flag = f }
      await supabaseAdmin.from('matches').update(upd).eq('id', m.id)
      updated++
    }
  }

  // Pass 2 — ESPN scoreboard: fill any remaining placeholders ("3rd Place (…)",
  // "Match N Winner", etc.) once FIFA confirms the matchup. ESPN reliably carries
  // upcoming scheduled fixtures for WC 2026 with real team names.
  // Reload knockout matches in case Pass 1 just updated some slots.
  const { data: remainingMatches } = await supabaseAdmin
    .from('matches').select('id, home_team, away_team, kickoff_at')
    .not('stage', 'ilike', 'Group %').neq('stage', 'Demo Match')

  const stillHasPlaceholder = (remainingMatches || []).filter(
    m => isPlaceholderName(m.home_team) || isPlaceholderName(m.away_team)
  )

  if (stillHasPlaceholder.length > 0) {
    const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim()

    type EspnComp = { homeAway: string; team: { displayName: string } }
    type EspnScoreboardEvent = { id: string; date?: string; competitions: Array<{ date?: string; competitors: EspnComp[] }> }

    // Group by ESPN date to make one scoreboard fetch per day
    const byEspnDate = new Map<string, typeof stillHasPlaceholder>()
    for (const m of stillHasPlaceholder) {
      const date = toEspnDate(m.kickoff_at)
      if (!byEspnDate.has(date)) byEspnDate.set(date, [])
      byEspnDate.get(date)!.push(m)
    }

    for (const [date, dateMatches] of Array.from(byEspnDate)) {
      const sbRes = await fetch(`${ESPN_BASE}/scoreboard?dates=${date}`)
      if (!sbRes.ok) continue
      const sbData = await sbRes.json()
      const espnEvents: EspnScoreboardEvent[] = sbData.events || []

      for (const m of dateMatches) {
        const dbMs = new Date(m.kickoff_at).getTime()
        const knownTeam = !isPlaceholderName(m.home_team) ? m.home_team
          : !isPlaceholderName(m.away_team) ? m.away_team
          : null
        const normKnown = knownTeam ? norm(toEspnTeamName(knownTeam)) : null

        // Find ESPN event by known team name; fall back to kickoff time match
        const espnEvent = espnEvents.find(e => {
          const comps = e.competitions?.[0]?.competitors || []
          if (normKnown) {
            return comps.some(c => {
              const n = norm(c.team.displayName)
              return n === normKnown || n.includes(normKnown) || normKnown.includes(n)
            })
          }
          const evDate = e.competitions?.[0]?.date || e.date
          return !!evDate && Math.abs(new Date(evDate).getTime() - dbMs) <= 5 * 60 * 1000
        })
        if (!espnEvent) continue

        const comps = espnEvent.competitions[0].competitors
        const espnHomeComp = comps.find(c => c.homeAway === 'home')
        const espnAwayComp = comps.find(c => c.homeAway === 'away')
        if (!espnHomeComp || !espnAwayComp) continue

        const schedHome = FD_TO_SCHED[espnHomeComp.team.displayName] ?? espnHomeComp.team.displayName
        const schedAway = FD_TO_SCHED[espnAwayComp.team.displayName] ?? espnAwayComp.team.displayName

        const updates: Record<string, string> = {}
        // Only write a real team name — skip if ESPN is still showing its own placeholder
        if (isPlaceholderName(m.home_team) && !isPlaceholderName(schedHome)) { updates.home_team = schedHome; const f = flagMap.get(schedHome); if (f) updates.home_flag = f }
        if (isPlaceholderName(m.away_team) && !isPlaceholderName(schedAway)) { updates.away_team = schedAway; const f = flagMap.get(schedAway); if (f) updates.away_flag = f }
        if (Object.keys(updates).length > 0) {
          await supabaseAdmin.from('matches').update(updates).eq('id', m.id)
          updated++
        }
      }
    }
  }

  return updated
}

type FdFixture = {
  fixture: { date: string; status: { short: string } }
  teams: { home: { name: string; winner: boolean | null }; away: { name: string; winner: boolean | null } }
  goals: { home: number | null; away: number | null }
}

type DbMatch = {
  id: string
  kickoff_at: string
  home_team: string
  away_team: string
  hat_trick_scored?: boolean | null
  hat_trick_scorer?: string | null
}

// FD uses different names for some teams than our schedule
const FD_NAME_ALIASES: Record<string, string> = {
  'Czech Republic': 'Czechia',
  'Korea Republic': 'South Korea',
  'United States': 'USA',
  'Turkey': 'Türkiye',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cape Verde Islands': 'Cape Verde',
}
function normFdName(name: string): string {
  const resolved = FD_NAME_ALIASES[name] ?? name
  return resolved.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

type PairedResult = { result: 'home' | 'draw' | 'away'; homeScore: number | null; awayScore: number | null; penaltiesScored: boolean }

// Pair a DB match to an FD fixture using kickoff time + team name disambiguation.
// Returns null if no FD match found within ±5 min.
function pairWithFd(match: DbMatch, fdFinished: FdFixture[]): PairedResult | null {
  const matchMs = new Date(match.kickoff_at).getTime()
  const candidates = fdFinished.filter(f => Math.abs(new Date(f.fixture.date).getTime() - matchMs) <= 5 * 60 * 1000)

  if (candidates.length === 0) return null

  let fdMatch: FdFixture | undefined
  let homeAwayFlipped = false

  if (candidates.length === 1) {
    fdMatch = candidates[0]
  } else {
    // Multiple FD matches at the same kickoff (simultaneous group-stage games).
    // Use team names to pick the right one.
    const nh = normFdName(match.home_team)
    const na = normFdName(match.away_team)
    fdMatch = candidates.find(f => normFdName(f.teams.home.name) === nh && normFdName(f.teams.away.name) === na)
    if (!fdMatch) {
      const flipped = candidates.find(f => normFdName(f.teams.home.name) === na && normFdName(f.teams.away.name) === nh)
      if (flipped) { fdMatch = flipped; homeAwayFlipped = true }
    }
    if (!fdMatch) fdMatch = candidates[0]
  }

  // Detect home/away flip (FD may list teams in opposite order to our DB)
  if (!homeAwayFlipped) {
    const nh = normFdName(match.home_team)
    const fdHome = normFdName(fdMatch.teams.home.name)
    const fdAway = normFdName(fdMatch.teams.away.name)
    if (fdHome !== nh && fdAway === nh) homeAwayFlipped = true
  }

  const result: 'home' | 'draw' | 'away' = homeAwayFlipped
    ? (fdMatch.teams.home.winner === true ? 'away' : fdMatch.teams.away.winner === true ? 'home' : 'draw')
    : (fdMatch.teams.home.winner === true ? 'home' : fdMatch.teams.away.winner === true ? 'away' : 'draw')
  const homeScore = homeAwayFlipped ? (fdMatch.goals.away ?? null) : (fdMatch.goals.home ?? null)
  const awayScore = homeAwayFlipped ? (fdMatch.goals.home ?? null) : (fdMatch.goals.away ?? null)
  const penaltiesScored = fdMatch.fixture.status.short === 'PEN'

  return { result, homeScore, awayScore, penaltiesScored }
}

export type MatchEventForTally = { type: string; detail: string; teamSide?: string }

// Tally goals per side from stored match_events. teamSide already reflects which side
// a goal counts for — ESPN credits own goals to the *benefiting* team, not the scorer's
// own side, so no home/away flip is needed here (flipping again double-inverts them).
// Events with no teamSide (penalty-shootout kicks — ESPN doesn't tie them to either
// competitor's team id) are excluded so a shootout doesn't inflate the match score.
export function tallyGoalsFromEvents(events: MatchEventForTally[]): { homeGoals: number; awayGoals: number } {
  const goals = events.filter(e => e.type === 'Goal' && (e.teamSide === 'home' || e.teamSide === 'away'))
  return {
    homeGoals: goals.filter(e => e.teamSide === 'home').length,
    awayGoals: goals.filter(e => e.teamSide === 'away').length,
  }
}

// Cross-check all recently-resolved matches against their loaded ESPN events.
// Fixes any match where FD returned a wrong/stale score (e.g. 0-0 when events show 3-2).
// Returns the number of matches corrected.
async function reconcileFromEvents(): Promise<number> {
  const KNOCKOUT_STAGES = ['Round of 32', 'Round of 16', 'Quarter Final', 'Semi Final', 'Third Place', 'Final']
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentMatches } = await supabaseAdmin
    .from('matches')
    .select('id, kickoff_at, home_team, away_team, result, home_score, away_score, hat_trick_scored, hat_trick_scorer, stage, penalties_scored')
    .not('result', 'is', null)
    .gte('kickoff_at', since)
    .neq('stage', 'Demo Match')

  if (!recentMatches || recentMatches.length === 0) return 0

  const { data: eventRows } = await supabaseAdmin
    .from('match_events')
    .select('match_id, events')
    .in('match_id', recentMatches.map(m => m.id))

  if (!eventRows || eventRows.length === 0) return 0

  let corrected = 0

  for (const row of eventRows) {
    const match = recentMatches.find(m => m.id === row.match_id)
    if (!match) continue
    const events = (row.events as MatchEventForTally[]) || []
    if (events.length === 0) continue

    const { homeGoals, awayGoals } = tallyGoalsFromEvents(events)

    // Only act when at least one goal was attributed — avoids false 0-0 positives
    if (homeGoals === 0 && awayGoals === 0) continue

    const evtResult: 'home' | 'draw' | 'away' = homeGoals > awayGoals ? 'home' : awayGoals > homeGoals ? 'away' : 'draw'
    if (evtResult === match.result && match.home_score === homeGoals && match.away_score === awayGoals) continue

    // Don't overwrite a knockout match's home/away result with 'draw' — the ESPN goal count
    // reflects 90+ET score (tied), but the FD result reflects the penalty shootout winner.
    const matchStage = (match as typeof match & { stage?: string }).stage ?? ''
    if (evtResult === 'draw' && (match.result === 'home' || match.result === 'away') && KNOCKOUT_STAGES.includes(matchStage)) continue

    const existingPenaltiesScored = (match as typeof match & { penalties_scored?: boolean | null }).penalties_scored ?? false
    await applyAndScore(match as DbMatch, { result: evtResult, homeScore: homeGoals, awayScore: awayGoals, penaltiesScored: existingPenaltiesScored })
    corrected++
  }
  return corrected
}

// Apply result + score to match row and re-score all its entries. Returns entries scored count.
async function applyAndScore(match: DbMatch, paired: PairedResult): Promise<number> {
  const { result, homeScore, awayScore, penaltiesScored } = paired

  await supabaseAdmin.from('matches').update({
    result,
    home_score: homeScore,
    away_score: awayScore,
    penalties_scored: penaltiesScored || null,
  }).eq('id', match.id)

  const hatTrickScored = match.hat_trick_scored ?? null
  const hatTrickScorer = match.hat_trick_scorer ?? null

  const { data: entries } = await supabaseAdmin
    .from('entries')
    .select('id, pick, home_score_pred, away_score_pred, hat_trick_pred, hat_trick_scorer_pred, penalties_pred')
    .eq('match_id', match.id)

  let scored = 0
  if (entries) {
    for (const entry of entries) {
      const is_correct = entry.pick === result
      let raffle_entries = 0
      if (is_correct) {
        const scoreCorrect = homeScore != null && awayScore != null &&
          entry.home_score_pred === homeScore && entry.away_score_pred === awayScore
        raffle_entries = scoreCorrect ? 3 : 1
      }
      const htScorer = (entry as typeof entry & { hat_trick_scorer_pred?: string | null }).hat_trick_scorer_pred
      if (entry.hat_trick_pred === true && hatTrickScored === true && hatTrickScorer && htScorer && scorerNameMatches(htScorer, hatTrickScorer)) {
        raffle_entries += 7
      }
      const penPred = (entry as typeof entry & { penalties_pred?: boolean | null }).penalties_pred
      if (penPred === true && penaltiesScored === true) {
        raffle_entries += 2
      }
      await supabaseAdmin.from('entries').update({ is_correct, raffle_entries }).eq('id', entry.id)
      scored++
    }
  }
  return scored
}

// Throws FdRateLimitError if rate-limited; callers should handle it.
export async function syncResults(): Promise<SyncResultsOutput> {
  const data = await getFdFixtures({ status: 'FT' }) as { response?: FdFixture[] }
  const fdFinished = (data.response || []).filter(f => ['FT', 'AET', 'PEN'].includes(f.fixture.status.short))

  if (fdFinished.length === 0) {
    const scores_corrected = await reconcileFromEvents().catch(() => 0)
    const names_updated = await updateKnockoutNames().catch(() => 0)
    return {
      updated: 0, entries_scored: 0, events_loaded: 0, names_updated, scores_corrected,
      message: 'No finished matches found from API',
      debug: { fdFinishedCount: 0, dbUnresolvedCount: 0, unmatched: [] },
    }
  }

  // Only consider matches that kicked off 2+ hours ago (safely finished) and have no result yet
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const { data: unresolved } = await supabaseAdmin
    .from('matches')
    .select('id, kickoff_at, home_team, away_team, hat_trick_scored, hat_trick_scorer')
    .is('result', null)
    .lt('kickoff_at', twoHoursAgo)
    .neq('stage', 'Demo Match')

  if (!unresolved || unresolved.length === 0) {
    const scores_corrected = await reconcileFromEvents().catch(() => 0)
    const names_updated = await updateKnockoutNames().catch(() => 0)
    return {
      updated: 0, entries_scored: 0, events_loaded: 0, names_updated, scores_corrected,
      message: 'No unresolved finished matches',
      debug: { fdFinishedCount: fdFinished.length, dbUnresolvedCount: 0, unmatched: [] },
    }
  }

  let updated = 0
  let entries_scored = 0
  const unmatched: SyncDebugUnmatched[] = []
  const resolvedForEspn: Array<{ id: string; kickoff_at: string; home_team: string; away_team: string }> = []

  for (const match of unresolved) {
    const paired = pairWithFd(match as DbMatch, fdFinished)

    if (!paired) {
      const matchMs = new Date(match.kickoff_at).getTime()
      let nearestDiff = Infinity
      let nearestFd: FdFixture | null = null
      for (const f of fdFinished) {
        const diff = Math.abs(new Date(f.fixture.date).getTime() - matchMs)
        if (diff < nearestDiff) { nearestDiff = diff; nearestFd = f }
      }
      unmatched.push({
        match: `${match.home_team} vs ${match.away_team}`,
        dbKickoff: match.kickoff_at,
        nearestFd: nearestFd ? `${nearestFd.teams.home.name} vs ${nearestFd.teams.away.name}` : null,
        nearestFdKickoff: nearestFd ? nearestFd.fixture.date : null,
        diffMin: nearestFd ? Math.round(nearestDiff / 60000) : null,
      })
      continue
    }

    entries_scored += await applyAndScore(match as DbMatch, paired)
    updated++
    resolvedForEspn.push(match)
  }

  let events_loaded = 0
  if (resolvedForEspn.length > 0) {
    const espnResults = await Promise.allSettled(
      resolvedForEspn.map(m => fetchEspnEvents(m.id, m.kickoff_at, m.home_team, m.away_team))
    )
    events_loaded = espnResults.filter(r => r.status === 'fulfilled' && r.value !== null).length
  }

  const scores_corrected = await reconcileFromEvents().catch(() => 0)
  const names_updated = await updateKnockoutNames().catch(() => 0)

  return {
    updated, entries_scored, events_loaded, names_updated, scores_corrected,
    debug: { fdFinishedCount: fdFinished.length, dbUnresolvedCount: unresolved.length, unmatched },
  }
}

// Re-sync already-resolved matches by ID — corrects wrong results/scores and re-scores all entries.
// Throws FdRateLimitError if rate-limited.
export async function resyncMatchIds(matchIds: string[]): Promise<SyncResultsOutput> {
  const data = await getFdFixtures({ status: 'FT' }) as { response?: FdFixture[] }
  const fdFinished = (data.response || []).filter(f => ['FT', 'AET', 'PEN'].includes(f.fixture.status.short))

  const { data: matches } = await supabaseAdmin
    .from('matches')
    .select('id, kickoff_at, home_team, away_team, hat_trick_scored, hat_trick_scorer')
    .in('id', matchIds)
    .neq('stage', 'Demo Match')

  if (!matches || matches.length === 0) {
    return {
      updated: 0, entries_scored: 0, events_loaded: 0, names_updated: 0, scores_corrected: 0,
      message: 'No matches found for given IDs',
      debug: { fdFinishedCount: fdFinished.length, dbUnresolvedCount: 0, unmatched: [] },
    }
  }

  let updated = 0
  let entries_scored = 0
  const unmatched: SyncDebugUnmatched[] = []
  const resolvedForEspn: Array<{ id: string; kickoff_at: string; home_team: string; away_team: string }> = []

  for (const match of matches) {
    const paired = pairWithFd(match as DbMatch, fdFinished)

    if (!paired) {
      const matchMs = new Date(match.kickoff_at).getTime()
      let nearestDiff = Infinity
      let nearestFd: FdFixture | null = null
      for (const f of fdFinished) {
        const diff = Math.abs(new Date(f.fixture.date).getTime() - matchMs)
        if (diff < nearestDiff) { nearestDiff = diff; nearestFd = f }
      }
      unmatched.push({
        match: `${match.home_team} vs ${match.away_team}`,
        dbKickoff: match.kickoff_at,
        nearestFd: nearestFd ? `${nearestFd.teams.home.name} vs ${nearestFd.teams.away.name}` : null,
        nearestFdKickoff: nearestFd ? nearestFd.fixture.date : null,
        diffMin: nearestFd ? Math.round(nearestDiff / 60000) : null,
      })
      continue
    }

    entries_scored += await applyAndScore(match as DbMatch, paired)
    updated++
    resolvedForEspn.push(match)
  }

  // Re-load ESPN events for all resynced matches
  if (resolvedForEspn.length > 0) {
    await Promise.allSettled(
      resolvedForEspn.map(m => fetchEspnEvents(m.id, m.kickoff_at, m.home_team, m.away_team))
    )
  }

  return {
    updated, entries_scored, events_loaded: resolvedForEspn.length, names_updated: 0, scores_corrected: 0,
    debug: { fdFinishedCount: fdFinished.length, dbUnresolvedCount: matches.length, unmatched },
  }
}
