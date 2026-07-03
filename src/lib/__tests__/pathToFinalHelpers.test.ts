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

// ESPN rewrites DB placeholders to different formats before groups settle.
// "Group H Runner-up" → "Group H 2nd Place"
// "3rd Place (C/D/F/G/H)" → "Third Place Group C/D/F/G/H"
// getR32EntryMatches must handle both.
// ESPN corrupts R16/QF/SF/Final "Match N Winner" slots with ordinal labels:
// "Round of 32 N Winner", "Round of 16 N Winner", "Quarterfinal N Winner", "Semifinal N Winner"
describe('tracePathToFinal — ESPN ordinal labels in R16/QF/SF/Final', () => {
  const ordinalMatches = [
    { id: 'g1', kickoff_at: '2026-06-13T18:00:00Z', stage: 'Group A', home_team: 'USA', away_team: 'England', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    // R32: M2 and M3 (ordinals 1 and 2 within R32)
    { id: 'r32a', kickoff_at: '2026-06-28T19:00:00Z', stage: 'Round of 32', home_team: 'Group A Winner', away_team: 'Group B Runner-up', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    { id: 'r32b', kickoff_at: '2026-06-29T17:00:00Z', stage: 'Round of 32', home_team: 'Group C Winner', away_team: 'Group F Runner-up', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    // R16: uses ESPN ordinal format — "Round of 32 1 Winner vs Round of 32 2 Winner"
    // r32a = global match 2, r32b = global match 3 → R32 ordinals 1 and 2
    { id: 'r16',  kickoff_at: '2026-07-04T17:00:00Z', stage: 'Round of 16', home_team: 'Round of 32 1 Winner', away_team: 'Round of 32 2 Winner', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    // QF: "Round of 16 1 Winner vs ..."
    { id: 'qf',   kickoff_at: '2026-07-09T20:00:00Z', stage: 'Quarter Final', home_team: 'Round of 16 1 Winner', away_team: 'Round of 16 2 Winner', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    // SF: "Quarterfinal 1 Winner vs ..."
    { id: 'sf',   kickoff_at: '2026-07-14T20:00:00Z', stage: 'Semi Final', home_team: 'Quarterfinal 1 Winner', away_team: 'Quarterfinal 2 Winner', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    // Final: "Semifinal 1 Winner vs ..."
    { id: 'fi',   kickoff_at: '2026-07-19T20:00:00Z', stage: 'Final', home_team: 'Semifinal 1 Winner', away_team: 'Semifinal 2 Winner', home_flag: '', away_flag: '', result: null as null, venue: null as null },
  ]
  // Match numbers: g1=1, r32a=2, r32b=3, r16=4, qf=5, sf=6, fi=7

  it('traces R32 → R16 → QF → SF → Final via ESPN ordinal labels', () => {
    const steps = tracePathToFinal(ordinalMatches, ordinalMatches[1], true) // r32a, isHome
    expect(steps.map(s => s.match.stage)).toEqual([
      'Round of 32', 'Round of 16', 'Quarter Final', 'Semi Final', 'Final',
    ])
    expect(steps).toHaveLength(5)
  })

  it('correctly sets isHome through ordinal chain', () => {
    const steps = tracePathToFinal(ordinalMatches, ordinalMatches[1], true) // home in r32a
    expect(steps[0].isHome).toBe(true)   // R32: home slot
    expect(steps[1].isHome).toBe(true)   // R16: "Round of 32 1 Winner" is home slot
    expect(steps[2].isHome).toBe(true)   // QF: "Round of 16 1 Winner" is home slot
    expect(steps[3].isHome).toBe(true)   // SF: "Quarterfinal 1 Winner" is home slot
    expect(steps[4].isHome).toBe(true)   // Final: "Semifinal 1 Winner" is home slot
  })
})

describe('getR32EntryMatches — ESPN-format placeholders', () => {
  const espnCorrupted = [
    { id: 'g1', kickoff_at: '2026-06-13T18:00:00Z', stage: 'Group H', home_team: 'Cape Verde', away_team: 'Saudi Arabia', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    { id: 'r1', kickoff_at: '2026-07-02T19:00:00Z', stage: 'Round of 32', home_team: 'Group H Winner', away_team: 'Group J 2nd Place', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    { id: 'r2', kickoff_at: '2026-07-03T22:00:00Z', stage: 'Round of 32', home_team: 'Argentina', away_team: 'Group H 2nd Place', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    { id: 'r3', kickoff_at: '2026-06-30T21:00:00Z', stage: 'Round of 32', home_team: 'Group I Winner', away_team: 'Third Place Group C/D/F/G/H', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    { id: 'r4', kickoff_at: '2026-07-01T16:00:00Z', stage: 'Round of 32', home_team: 'Group L Winner', away_team: 'Third Place Group E/H/I/J/K', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    { id: 'r5', kickoff_at: '2026-07-04T17:00:00Z', stage: 'Round of 16', home_team: 'Match 1 Winner', away_team: 'Match 2 Winner', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    { id: 'r6', kickoff_at: '2026-07-07T20:00:00Z', stage: 'Round of 16', home_team: 'Match 4 Winner', away_team: 'Match 3 Winner', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    { id: 'qf', kickoff_at: '2026-07-12T20:00:00Z', stage: 'Quarter Final', home_team: 'Match 5 Winner', away_team: 'Match 6 Winner', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    { id: 'sf', kickoff_at: '2026-07-15T20:00:00Z', stage: 'Semi Final', home_team: 'Match 7 Winner', away_team: 'Match 8 Winner', home_flag: '', away_flag: '', result: null as null, venue: null as null },
    { id: 'fi', kickoff_at: '2026-07-19T20:00:00Z', stage: 'Final', home_team: 'Match 9 Winner', away_team: 'Match 10 Winner', home_flag: '', away_flag: '', result: null as null, venue: null as null },
  ]

  it('2nd — finds "Group H 2nd Place" (ESPN format)', () => {
    const r = getR32EntryMatches(espnCorrupted, 'H', '2nd', 'Cape Verde')
    expect(r).toHaveLength(1)
    expect(r[0].match.id).toBe('r2')
    expect(r[0].isHome).toBe(false)
  })

  it('best_3rd — finds "Third Place Group C/D/F/G/H" (ESPN format)', () => {
    const r = getR32EntryMatches(espnCorrupted, 'H', 'best_3rd')
    expect(r).toHaveLength(2)
    expect(r.map(e => e.match.id).sort()).toEqual(['r3', 'r4'])
    expect(r.every(e => !e.isHome)).toBe(true)
  })

  it('1st — still finds "Group H Winner" (original format unchanged)', () => {
    const r = getR32EntryMatches(espnCorrupted, 'H', '1st')
    expect(r).toHaveLength(1)
    expect(r[0].match.id).toBe('r1')
    expect(r[0].isHome).toBe(true)
  })
})
