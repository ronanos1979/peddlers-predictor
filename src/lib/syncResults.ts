import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getFdFixtures, FdRateLimitError } from '@/lib/footballData'
import { fetchEspnEvents } from '@/lib/fetchEspnEvents'

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
    .select('id, kickoff_at, home_team, away_team, hat_trick_scored')
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
    const matchMs = new Date(match.kickoff_at).getTime()
    const fdMatch = fdFinished.find(f => Math.abs(new Date(f.fixture.date).getTime() - matchMs) <= 5 * 60 * 1000)

    if (!fdMatch) {
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

    const result: 'home' | 'draw' | 'away' =
      fdMatch.teams.home.winner === true ? 'home' :
      fdMatch.teams.away.winner === true ? 'away' : 'draw'
    const homeScore = fdMatch.goals.home ?? null
    const awayScore = fdMatch.goals.away ?? null

    await supabaseAdmin.from('matches').update({ result, home_score: homeScore, away_score: awayScore }).eq('id', match.id)

    const hatTrickScored = (match as typeof match & { hat_trick_scored?: boolean | null }).hat_trick_scored ?? null

    const { data: entries } = await supabaseAdmin
      .from('entries')
      .select('id, pick, home_score_pred, away_score_pred, hat_trick_pred')
      .eq('match_id', match.id)

    if (entries) {
      for (const entry of entries) {
        const is_correct = entry.pick === result
        let raffle_entries = 0
        if (is_correct) {
          const scoreCorrect = homeScore != null && awayScore != null &&
            entry.home_score_pred === homeScore && entry.away_score_pred === awayScore
          raffle_entries = scoreCorrect ? 3 : 1
        }
        if (entry.hat_trick_pred === true && hatTrickScored === true) {
          raffle_entries += 7
        }
        await supabaseAdmin.from('entries').update({ is_correct, raffle_entries }).eq('id', entry.id)
        entries_scored++
      }
    }
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
