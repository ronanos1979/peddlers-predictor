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
  home_score?: number | null
  away_score?: number | null
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
// schedName: actual team name — used as fallback when the placeholder was already replaced in DB
// by updateKnockoutNames() after the group completed.
export function getR32EntryMatches(
  sortedMatches: MatchRecord[],
  group: string,
  position: PathPosition,
  schedName?: string,
): Array<{ match: MatchRecord; isHome: boolean }> {
  const g = group.toUpperCase()
  const r32 = sortedMatches.filter(m => m.stage === 'Round of 32')

  if (position === '1st') {
    const ph = `Group ${g} Winner`
    const byPlaceholder = r32.filter(m => m.home_team === ph || m.away_team === ph)
    if (byPlaceholder.length > 0) return byPlaceholder.map(m => ({ match: m, isHome: m.home_team === ph }))
    // Placeholder was replaced with real team name after group completed
    if (schedName) return r32.filter(m => m.home_team === schedName || m.away_team === schedName).map(m => ({ match: m, isHome: m.home_team === schedName }))
    return []
  }

  if (position === '2nd') {
    const ph = `Group ${g} Runner-up`
    // ESPN rewrites "Group H Runner-up" → "Group H 2nd Place" in the DB before the group is settled
    const phEspn = `Group ${g} 2nd Place`
    const byPlaceholder = r32.filter(m =>
      m.home_team === ph || m.away_team === ph ||
      m.home_team === phEspn || m.away_team === phEspn
    )
    if (byPlaceholder.length > 0) return byPlaceholder.map(m => ({
      match: m,
      isHome: m.home_team === ph || m.home_team === phEspn,
    }))
    // Placeholder was replaced with real team name after group completed
    if (schedName) return r32.filter(m => m.home_team === schedName || m.away_team === schedName).map(m => ({ match: m, isHome: m.home_team === schedName }))
    return []
  }

  // Helper: check if a slot targets this group in the 3rd-place position
  // Handles both DB format "3rd Place (C/D/F/G/H)" and ESPN format "Third Place Group C/D/F/G/H"
  function slot3rdMatchesGroup(slot: string, grp: string): boolean {
    const dbHit = slot.match(/3rd Place \(([^)]+)\)/i)
    if (dbHit && dbHit[1].split('/').map(s => s.trim().toUpperCase()).includes(grp)) return true
    const espnHit = slot.match(/Third Place Group ([A-L/]+)/i)
    if (espnHit && espnHit[1].split('/').map(s => s.trim().toUpperCase()).includes(grp)) return true
    return false
  }

  // best_3rd — find all R32 matches whose "3rd Place (…)" slot includes this group letter
  return r32
    .filter(m => slot3rdMatchesGroup(m.home_team, g) || slot3rdMatchesGroup(m.away_team, g))
    .map(m => ({ match: m, isHome: slot3rdMatchesGroup(m.home_team, g) }))
}

// ESPN overwrites "Match N Winner" placeholders with stage-ordinal labels:
//   "Round of 32 N Winner", "Round of 16 N Winner", "Quarterfinal N Winner", "Semifinal N Winner"
// N is the 1-based position of the match within its stage (sorted by kickoff_at).
function espnOrdinalLabel(stage: string, ordinalInStage: number): string | null {
  if (stage === 'Round of 32')  return `Round of 32 ${ordinalInStage} Winner`
  if (stage === 'Round of 16')  return `Round of 16 ${ordinalInStage} Winner`
  if (stage === 'Quarter Final') return `Quarterfinal ${ordinalInStage} Winner`
  if (stage === 'Semi Final')   return `Semifinal ${ordinalInStage} Winner`
  return null
}

// Trace R32 → R16 → QF → SF → Final following "Match N Winner" cross-references.
// Falls back to ESPN ordinal labels and (for completed matches) the winner's team name
// to handle database slots that were rewritten by updateKnockoutNames() Pass 2.
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

    // 1. Original DB format: "Match N Winner"
    let next = sortedMatches.find(m => m.home_team === label || m.away_team === label)
    let nextIsHome = next ? next.home_team === label : false

    // 2. ESPN ordinal format: "Round of 32 N Winner", "Quarterfinal N Winner", etc.
    //    N = 1-based position of the current match within its stage.
    if (!next) {
      const stageMatches = sortedMatches.filter(m => m.stage === cur.stage)
      const ordinalInStage = stageMatches.findIndex(m => m.id === cur.id) + 1
      const espn = espnOrdinalLabel(cur.stage, ordinalInStage)
      if (espn) {
        next = sortedMatches.find(m => m.home_team === espn || m.away_team === espn)
        nextIsHome = next ? next.home_team === espn : false
      }
    }

    // 3. Winner's real team name (for already-played matches where the winner was
    //    filled directly into the next round, replacing the placeholder entirely)
    if (!next && cur.result) {
      const winnerName = cur.result === 'home' ? cur.home_team : cur.away_team
      const koStages = new Set(['Round of 16', 'Quarter Final', 'Semi Final', 'Final'])
      next = sortedMatches.find(m =>
        m.kickoff_at > cur.kickoff_at &&
        koStages.has(m.stage) &&
        (m.home_team === winnerName || m.away_team === winnerName)
      )
      nextIsHome = next ? next.home_team === winnerName : false
    }

    if (!next) break
    isHome = nextIsHome
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
  schedName?: string,
): PathChain[] {
  const entries = getR32EntryMatches(sortedMatches, group, position, schedName)
  return entries.map(({ match, isHome }) => {
    const rawSteps = tracePathToFinal(sortedMatches, match, isHome)
    return { entryIsHome: isHome, steps: computePathViability(rawSteps) }
  })
}
