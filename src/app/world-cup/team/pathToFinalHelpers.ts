// Minimal match shape needed for path computation — no Supabase import (keeps this testable in Jest)
export interface MatchRecord {
  id: string
  home_team: string
  away_team: string
  home_flag: string
  away_flag: string
  kickoff_at: string
  stage: string
  result: 'home' | 'draw' | 'away' | null
  venue: string | null
}

export type PathPosition = '1st' | '2nd' | 'best_3rd'
export type ViabilityStatus = 'upcoming' | 'confirmed' | 'eliminated' | 'blocked'

export interface PathStep {
  match: MatchRecord
  matchNum: number
  isHome: boolean
  status: ViabilityStatus
  opponentSlot: string
}

// Sorted group of entry match + full step chain
export interface PathChain {
  entryIsHome: boolean
  steps: PathStep[]
}

// Get the group letter (A–L) for a team from their group stage matches
export function getTeamGroup(matches: MatchRecord[], teamName: string): string | null {
  for (const m of matches) {
    const inMatch = m.home_team === teamName || m.away_team === teamName
    const isGroupStage = /^Group [A-L]$/i.test(m.stage)
    if (inMatch && isGroupStage) {
      return m.stage.slice(-1).toUpperCase()
    }
  }
  return null
}

// 1-based global match number in the sorted array (M1 = index 0)
export function getMatchNumber(sortedMatches: MatchRecord[], matchId: string): number {
  const idx = sortedMatches.findIndex(m => m.id === matchId)
  return idx === -1 ? 0 : idx + 1
}

// Find R32 entry matches for a given group + finish position.
// Returns {match, isHome} — isHome = true means the team occupies the home slot.
export function getR32EntryMatches(
  sortedMatches: MatchRecord[],
  group: string,
  position: PathPosition,
): Array<{ match: MatchRecord; isHome: boolean }> {
  const g = group.toUpperCase()
  const r32 = sortedMatches.filter(m => m.stage === 'Round of 32')

  if (position === '1st') {
    const ph = `Group ${g} Winner`
    return r32
      .filter(m => m.home_team === ph || m.away_team === ph)
      .map(m => ({ match: m, isHome: m.home_team === ph }))
  }

  if (position === '2nd') {
    const ph = `Group ${g} Runner-up`
    return r32
      .filter(m => m.home_team === ph || m.away_team === ph)
      .map(m => ({ match: m, isHome: m.home_team === ph }))
  }

  // best_3rd — find all R32 matches whose "3rd Place (…)" slot includes this group letter
  return r32
    .filter(m => {
      for (const slot of [m.home_team, m.away_team]) {
        const hit = slot.match(/3rd Place \(([^)]+)\)/i)
        if (hit && hit[1].split('/').map(s => s.trim().toUpperCase()).includes(g)) return true
      }
      return false
    })
    .map(m => {
      const homeHit = m.home_team.match(/3rd Place \(([^)]+)\)/i)
      const isHome =
        homeHit !== null &&
        homeHit[1].split('/').map(s => s.trim().toUpperCase()).includes(g)
      return { match: m, isHome }
    })
}

// Trace R32 → R16 → QF → SF → Final following "Match N Winner" cross-references.
// Returns PathSteps in order (viability set to 'upcoming' — apply computePathViability separately).
export function tracePathToFinal(
  sortedMatches: MatchRecord[],
  r32Match: MatchRecord,
  r32IsHome: boolean,
): PathStep[] {
  const steps: PathStep[] = []
  let cur = r32Match
  let isHome = r32IsHome

  while (true) {
    const matchNum = getMatchNumber(sortedMatches, cur.id)
    const opponentSlot = isHome ? cur.away_team : cur.home_team
    steps.push({ match: cur, matchNum, isHome, status: 'upcoming', opponentSlot })
    if (cur.stage === 'Final') break
    const label = `Match ${matchNum} Winner`
    const next = sortedMatches.find(m => m.home_team === label || m.away_team === label)
    if (!next) break
    isHome = next.home_team === label
    cur = next
  }

  return steps
}

// Apply result-based viability to a path. Once eliminated, all remaining steps are 'blocked'.
export function computePathViability(steps: PathStep[]): PathStep[] {
  let eliminated = false
  return steps.map(step => {
    if (eliminated) return { ...step, status: 'blocked' as ViabilityStatus }
    if (!step.match.result) return { ...step, status: 'upcoming' as ViabilityStatus }
    const won =
      (step.isHome && step.match.result === 'home') ||
      (!step.isHome && step.match.result === 'away')
    if (won) return { ...step, status: 'confirmed' as ViabilityStatus }
    eliminated = true
    return { ...step, status: 'eliminated' as ViabilityStatus }
  })
}

// Build complete path chains for all entry points of a given position
export function buildPathChains(
  sortedMatches: MatchRecord[],
  group: string,
  position: PathPosition,
): PathChain[] {
  const entries = getR32EntryMatches(sortedMatches, group, position)
  return entries.map(({ match, isHome }) => {
    const rawSteps = tracePathToFinal(sortedMatches, match, isHome)
    return { entryIsHome: isHome, steps: computePathViability(rawSteps) }
  })
}
