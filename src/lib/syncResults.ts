import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getFdFixtures, FdRateLimitError } from '@/lib/footballData'
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
  message?: string
  debug: {
    fdFinishedCount: number
    dbUnresolvedCount: number
    unmatched: SyncDebugUnmatched[]
  }
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
      updated: 0, entries_scored: 0, events_loaded: 0,
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
    return {
      updated: 0, entries_scored: 0, events_loaded: 0,
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

  return {
    updated, entries_scored, events_loaded,
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
      updated: 0, entries_scored: 0, events_loaded: 0,
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
    updated, entries_scored, events_loaded: resolvedForEspn.length,
    debug: { fdFinishedCount: fdFinished.length, dbUnresolvedCount: matches.length, unmatched },
  }
}
