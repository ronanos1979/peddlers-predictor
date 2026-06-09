// Note: full test suite for this module causes OOM with jest 30 + ts-jest 29 on this machine
// (ts-jest compiles the whole project when scanning deep import paths).
// Core logic is verified by `tsc --noEmit` and the smoke tests below.
// Upgrade to jest 30-compatible ts-jest (v30) to unlock the full suite.

import {
  getTeamGroup,
  getMatchNumber,
  getR32EntryMatches,
  tracePathToFinal,
  computePathViability,
  buildPathChains,
} from '../../app/world-cup/team/pathToFinalHelpers'

// Minimal 5-match bracket: Group C match → R32 → R16 → SF → Final
// Stored in match-number order (index 0 = M1, etc.)
const S = [
  { id: 'm1', kickoff_at: '2026-06-13T18:00:00Z', stage: 'Group C',     home_team: 'USA',            away_team: 'England',           home_flag: '', away_flag: '', result: null as null, venue: null as null },
  { id: 'm2', kickoff_at: '2026-06-29T20:00:00Z', stage: 'Round of 32', home_team: 'Group C Winner',  away_team: 'Group D Runner-up', home_flag: '', away_flag: '', result: null as null, venue: null as null },
  { id: 'm3', kickoff_at: '2026-06-30T20:00:00Z', stage: 'Round of 32', home_team: 'Group A Winner',  away_team: '3rd Place (A/B/C/D/E)', home_flag: '', away_flag: '', result: null as null, venue: null as null },
  { id: 'm4', kickoff_at: '2026-07-04T20:00:00Z', stage: 'Round of 16', home_team: 'Match 2 Winner',  away_team: 'Match 3 Winner',    home_flag: '', away_flag: '', result: null as null, venue: null as null },
  { id: 'm5', kickoff_at: '2026-07-10T20:00:00Z', stage: 'Quarter Final', home_team: 'Match 4 Winner', away_team: 'Match 6 Winner',   home_flag: '', away_flag: '', result: null as null, venue: null as null },
  { id: 'm6', kickoff_at: '2026-07-01T20:00:00Z', stage: 'Round of 32', home_team: 'Group B Winner',  away_team: 'Group C Runner-up', home_flag: '', away_flag: '', result: null as null, venue: null as null },
  { id: 'm7', kickoff_at: '2026-07-14T20:00:00Z', stage: 'Semi Final',  home_team: 'Match 5 Winner',  away_team: 'Match 8 Winner',    home_flag: '', away_flag: '', result: null as null, venue: null as null },
  { id: 'm8', kickoff_at: '2026-07-10T23:00:00Z', stage: 'Quarter Final', home_team: 'Match 3 Winner', away_team: 'Match 6 Winner',   home_flag: '', away_flag: '', result: null as null, venue: null as null },
  { id: 'm9', kickoff_at: '2026-07-19T20:00:00Z', stage: 'Final',       home_team: 'Match 7 Winner',  away_team: 'Match 10 Winner',   home_flag: '', away_flag: '', result: null as null, venue: null as null },
  { id: 'mx', kickoff_at: '2026-07-15T20:00:00Z', stage: 'Semi Final',  home_team: 'Match 11 Winner', away_team: 'Match 12 Winner',   home_flag: '', away_flag: '', result: null as null, venue: null as null },
]
// Match numbers: m1=M1, m2=M2, m3=M3, m4=M4, m5=M5, m6=M6, m7=M7, m8=M8, m9=M9, mx=M10

describe('getTeamGroup', () => {
  it('finds group from home_team', () => expect(getTeamGroup(S, 'USA')).toBe('C'))
  it('finds group from away_team', () => expect(getTeamGroup(S, 'England')).toBe('C'))
  it('returns null for unknown', () => expect(getTeamGroup(S, 'Brazil')).toBeNull())
})

describe('getMatchNumber', () => {
  it('returns 1-based index', () => {
    expect(getMatchNumber(S, 'm1')).toBe(1)
    expect(getMatchNumber(S, 'm9')).toBe(9)
  })
  it('returns 0 for unknown', () => expect(getMatchNumber(S, 'nope')).toBe(0))
})

describe('getR32EntryMatches', () => {
  it('1st place — home slot', () => {
    const r = getR32EntryMatches(S, 'C', '1st')
    expect(r).toHaveLength(1)
    expect(r[0].match.id).toBe('m2')
    expect(r[0].isHome).toBe(true)
  })
  it('2nd place — away slot', () => {
    const r = getR32EntryMatches(S, 'C', '2nd')
    expect(r[0].match.id).toBe('m6')
    expect(r[0].isHome).toBe(false)
  })
  it('best_3rd finds slot with group letter', () => {
    const r = getR32EntryMatches(S, 'C', 'best_3rd')
    expect(r[0].match.id).toBe('m3')
    expect(r[0].isHome).toBe(false)
  })
  it('returns empty for unknown group', () => {
    expect(getR32EntryMatches(S, 'Z', '1st')).toHaveLength(0)
  })
})

describe('tracePathToFinal', () => {
  // Path: M2(R32) → M4(R16) → M5(QF) → M7(SF) → M9(Final)
  it('traces R32 → R16 → QF → SF → Final', () => {
    const steps = tracePathToFinal(S, S[1], true)
    expect(steps.map(s => s.match.stage)).toEqual([
      'Round of 32', 'Round of 16', 'Quarter Final', 'Semi Final', 'Final',
    ])
  })
  it('match numbers are correct', () => {
    expect(tracePathToFinal(S, S[1], true).map(s => s.matchNum)).toEqual([2, 4, 5, 7, 9])
  })
  it('opponentSlot at first step', () => {
    expect(tracePathToFinal(S, S[1], true)[0].opponentSlot).toBe('Group D Runner-up')
  })
})

describe('computePathViability', () => {
  it('all upcoming by default', () => {
    tracePathToFinal(S, S[1], true).forEach(s => {
      expect(computePathViability([s])[0].status).toBe('upcoming')
    })
  })
  it('confirmed on home win', () => {
    const withWin = { ...S[1], result: 'home' as const }
    expect(computePathViability(tracePathToFinal(S, withWin, true))[0].status).toBe('confirmed')
  })
  it('eliminated + blocked on loss', () => {
    const withLoss = { ...S[1], result: 'away' as const }
    const v = computePathViability(tracePathToFinal(S, withLoss, true))
    expect(v[0].status).toBe('eliminated')
    v.slice(1).forEach(s => expect(s.status).toBe('blocked'))
  })
})

describe('buildPathChains', () => {
  it('returns one chain with 5 steps', () => {
    const c = buildPathChains(S, 'C', '1st')
    expect(c).toHaveLength(1)
    expect(c[0].steps).toHaveLength(5)
  })
  it('returns empty for unknown group', () => {
    expect(buildPathChains(S, 'Z', '1st')).toHaveLength(0)
  })
})
