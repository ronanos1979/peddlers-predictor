import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getFdFixtures, getFdStandings, FdRateLimitError } from '@/lib/footballData'
import { fetchEspnEvents, scorerNameMatches } from '@/lib/fetchEspnEvents'

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
// True if a team slot still holds an unresolved placeholder
function isPlaceholderName(name: string): boolean {
  return /\b(Winner|Runner-up|3rd\s*Place|TBD|Match\s*\d+)\b/i.test(name)
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

  // Pass 2 — FD scheduled fixtures: fill any remaining placeholders ("3rd Place (…)",
  // "Match N Winner", etc.) once FD confirms the matchups.
  // Reload the knockout matches in case Pass 1 just updated some slots.
  const { data: remainingMatches } = await supabaseAdmin
    .from('matches').select('id, home_team, away_team, kickoff_at')
    .not('stage', 'ilike', 'Group %').neq('stage', 'Demo Match')

  const stillHasPlaceholder = (remainingMatches || []).filter(
    m => isPlaceholderName(m.home_team) || isPlaceholderName(m.away_team)
  )
  if (stillHasPlaceholder.length > 0) {
    type FdFixtureItem = { fixture: { date: string }; teams: { home: { name: string }; away: { name: string } } }
    const allFdData = await getFdFixtures() as { response?: FdFixtureItem[] }
    const allFdFixtures = allFdData.response ?? []

    // Index FD fixtures by kickoff ms, keeping only those with real team names on both sides
    const isRealName = (n: string) => !!n && n.length > 1 && !/^tbd$/i.test(n.trim())
    const fdByTime: Array<{ ms: number; home: string; away: string }> = []
    for (const f of allFdFixtures) {
      const home = f.teams.home.name
      const away = f.teams.away.name
      if (isRealName(home) && isRealName(away)) {
        fdByTime.push({ ms: new Date(f.fixture.date).getTime(), home, away })
      }
    }

    for (const m of stillHasPlaceholder) {
      const dbMs = new Date(m.kickoff_at).getTime()
      const fd = fdByTime.find(f => Math.abs(f.ms - dbMs) <= 5 * 60 * 1000)
      if (!fd) continue

      // Convert FD names to schedule names
      const fdHome = FD_TO_SCHED[fd.home] ?? fd.home
      const fdAway = FD_TO_SCHED[fd.away] ?? fd.away

      // Determine which FD team fills which placeholder slot.
      // If one slot is already a real name, cross-check using normFdName to find the right order.
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
      const homePlaceholder = isPlaceholderName(m.home_team)
      const awayPlaceholder = isPlaceholderName(m.away_team)

      let resolvedHome: string | null = null
      let resolvedAway: string | null = null

      if (homePlaceholder && awayPlaceholder) {
        // Both unknown — trust FD's home/away ordering
        resolvedHome = fdHome
        resolvedAway = fdAway
      } else if (homePlaceholder) {
        // away_team is already real; figure out which FD team is which
        resolvedHome = norm(fdAway) === norm(m.away_team) ? fdHome : fdAway
      } else {
        // home_team is already real; same logic
        resolvedAway = norm(fdHome) === norm(m.home_team) ? fdAway : fdHome
      }

      const updates: Record<string, string> = {}
      if (resolvedHome) { updates.home_team = resolvedHome; const f = flagMap.get(resolvedHome); if (f) updates.home_flag = f }
      if (resolvedAway) { updates.away_team = resolvedAway; const f = flagMap.get(resolvedAway); if (f) updates.away_flag = f }
      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from('matches').update(updates).eq('id', m.id)
        updated++
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

type PairedResult = { result: 'home' | 'draw' | 'away'; homeScore: number | null; awayScore: number | null }

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

  return { result, homeScore, awayScore }
}

// Apply result + score to match row and re-score all its entries. Returns entries scored count.
async function applyAndScore(match: DbMatch, paired: PairedResult): Promise<number> {
  const { result, homeScore, awayScore } = paired

  await supabaseAdmin.from('matches').update({ result, home_score: homeScore, away_score: awayScore }).eq('id', match.id)

  const hatTrickScored = match.hat_trick_scored ?? null
  const hatTrickScorer = match.hat_trick_scorer ?? null

  const { data: entries } = await supabaseAdmin
    .from('entries')
    .select('id, pick, home_score_pred, away_score_pred, hat_trick_pred, hat_trick_scorer_pred')
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
      await supabaseAdmin.from('entries').update({ is_correct, raffle_entries }).eq('id', entry.id)
      scored++
    }
  }
  return scored
}

// Throws FdRateLimitError if rate-limited; callers should handle it.
export async function syncResults(): Promise<SyncResultsOutput> {
  const data = await getFdFixtures({ status: 'FT' }) as { response?: FdFixture[] }
  const fdFinished = (data.response || []).filter(f => f.fixture.status.short === 'FT')

  if (fdFinished.length === 0) {
    return {
      updated: 0, entries_scored: 0, events_loaded: 0, names_updated: 0,
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
    const names_updated = await updateKnockoutNames().catch(() => 0)
    return {
      updated: 0, entries_scored: 0, events_loaded: 0, names_updated,
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

  const names_updated = await updateKnockoutNames().catch(() => 0)

  return {
    updated, entries_scored, events_loaded, names_updated,
    debug: { fdFinishedCount: fdFinished.length, dbUnresolvedCount: unresolved.length, unmatched },
  }
}

// Re-sync already-resolved matches by ID — corrects wrong results/scores and re-scores all entries.
// Throws FdRateLimitError if rate-limited.
export async function resyncMatchIds(matchIds: string[]): Promise<SyncResultsOutput> {
  const data = await getFdFixtures({ status: 'FT' }) as { response?: FdFixture[] }
  const fdFinished = (data.response || []).filter(f => f.fixture.status.short === 'FT')

  const { data: matches } = await supabaseAdmin
    .from('matches')
    .select('id, kickoff_at, home_team, away_team, hat_trick_scored, hat_trick_scorer')
    .in('id', matchIds)
    .neq('stage', 'Demo Match')

  if (!matches || matches.length === 0) {
    return {
      updated: 0, entries_scored: 0, events_loaded: 0, names_updated: 0,
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
    updated, entries_scored, events_loaded: resolvedForEspn.length, names_updated: 0,
    debug: { fdFinishedCount: fdFinished.length, dbUnresolvedCount: matches.length, unmatched },
  }
}
