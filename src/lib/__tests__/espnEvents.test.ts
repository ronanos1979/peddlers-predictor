import {
  toEspnDate,
  toEspnTeamName,
  parseEspnMinute,
  mapEspnEventType,
  ESPN_NAME_MAP,
} from '../espnEvents'

// ── toEspnDate ────────────────────────────────────────────────────────────────

describe('toEspnDate', () => {
  it('returns YYYYMMDD in ET for a mid-afternoon UTC kickoff (same calendar day)', () => {
    // 19:00 UTC = 15:00 ET — still June 11 either way
    expect(toEspnDate('2026-06-11T19:00:00Z')).toBe('20260611')
  })

  it('returns the PREVIOUS calendar day for a small-hours UTC kickoff', () => {
    // 02:00 UTC June 12 = 22:00 ET June 11 — ESPN indexes under June 11
    expect(toEspnDate('2026-06-12T02:00:00Z')).toBe('20260611')
  })

  it('handles a noon UTC kickoff (same day in ET)', () => {
    // 17:00 UTC June 15 = 13:00 ET June 15
    expect(toEspnDate('2026-06-15T17:00:00Z')).toBe('20260615')
  })

  it('handles exactly midnight UTC (previous ET day)', () => {
    // 00:00 UTC June 20 = 20:00 ET June 19
    expect(toEspnDate('2026-06-20T00:00:00Z')).toBe('20260619')
  })
})

// ── toEspnTeamName ────────────────────────────────────────────────────────────

describe('toEspnTeamName', () => {
  it('maps USA to United States', () => {
    expect(toEspnTeamName('USA')).toBe('United States')
  })

  it('maps Bosnia & Herzegovina to Bosnia-Herzegovina', () => {
    expect(toEspnTeamName('Bosnia & Herzegovina')).toBe('Bosnia-Herzegovina')
  })

  it('returns the name unchanged for teams that match exactly', () => {
    expect(toEspnTeamName('Mexico')).toBe('Mexico')
    expect(toEspnTeamName('South Korea')).toBe('South Korea')
    expect(toEspnTeamName('Ivory Coast')).toBe('Ivory Coast')
    expect(toEspnTeamName('Türkiye')).toBe('Türkiye')
    expect(toEspnTeamName('Czechia')).toBe('Czechia')
    expect(toEspnTeamName('Congo DR')).toBe('Congo DR')
    expect(toEspnTeamName('Cape Verde')).toBe('Cape Verde')
  })

  it('ESPN_NAME_MAP only has entries for teams that actually differ', () => {
    // Ensure we haven't accidentally added aliases for teams that match
    expect(Object.keys(ESPN_NAME_MAP)).toEqual(['USA', 'Bosnia & Herzegovina'])
  })
})

// ── parseEspnMinute ───────────────────────────────────────────────────────────

describe('parseEspnMinute', () => {
  it('parses a regular minute', () => {
    expect(parseEspnMinute("9'")).toEqual({ elapsed: 9, extra: null })
    expect(parseEspnMinute("67'")).toEqual({ elapsed: 67, extra: null })
    expect(parseEspnMinute("90'")).toEqual({ elapsed: 90, extra: null })
  })

  it('parses first-half added time', () => {
    expect(parseEspnMinute("45'+4'")).toEqual({ elapsed: 45, extra: 4 })
    expect(parseEspnMinute("45'+1'")).toEqual({ elapsed: 45, extra: 1 })
  })

  it('parses second-half added time', () => {
    expect(parseEspnMinute("90'+2'")).toEqual({ elapsed: 90, extra: 2 })
    expect(parseEspnMinute("90'+7'")).toEqual({ elapsed: 90, extra: 7 })
  })

  it('returns zeros for an empty or unrecognised string', () => {
    expect(parseEspnMinute('')).toEqual({ elapsed: 0, extra: null })
    expect(parseEspnMinute('unknown')).toEqual({ elapsed: 0, extra: null })
  })
})

// ── mapEspnEventType ──────────────────────────────────────────────────────────

describe('mapEspnEventType', () => {
  it('maps regular goal types to Normal Goal', () => {
    expect(mapEspnEventType('goal')).toEqual({ type: 'Goal', detail: 'Normal Goal' })
    expect(mapEspnEventType('goal---header')).toEqual({ type: 'Goal', detail: 'Normal Goal' })
    expect(mapEspnEventType('goal---volley')).toEqual({ type: 'Goal', detail: 'Normal Goal' })
    expect(mapEspnEventType('goal---free-kick')).toEqual({ type: 'Goal', detail: 'Normal Goal' })
    expect(mapEspnEventType('goal---chip')).toEqual({ type: 'Goal', detail: 'Normal Goal' })
  })

  it('maps penalty goal', () => {
    expect(mapEspnEventType('goal---penalty')).toEqual({ type: 'Goal', detail: 'Penalty' })
    // penalty---scored appears in commentary plays but not keyEvents — same result
    expect(mapEspnEventType('penalty---scored')).toEqual({ type: 'Goal', detail: 'Penalty' })
  })

  it('maps own goal', () => {
    expect(mapEspnEventType('own-goal')).toEqual({ type: 'Goal', detail: 'Own Goal' })
  })

  it('maps yellow card', () => {
    expect(mapEspnEventType('yellow-card')).toEqual({ type: 'Card', detail: 'Yellow Card' })
  })

  it('maps second yellow (yellow-red card)', () => {
    expect(mapEspnEventType('yellow-red-card')).toEqual({ type: 'Card', detail: 'Yellow Red Card' })
  })

  it('maps straight red card', () => {
    expect(mapEspnEventType('red-card')).toEqual({ type: 'Card', detail: 'Red Card' })
  })

  it('returns null for non-event types (substitution, kickoff, etc.)', () => {
    expect(mapEspnEventType('substitution')).toBeNull()
    expect(mapEspnEventType('kickoff')).toBeNull()
    expect(mapEspnEventType('halftime')).toBeNull()
    expect(mapEspnEventType('start-2nd-half')).toBeNull()
    expect(mapEspnEventType('')).toBeNull()
  })
})
