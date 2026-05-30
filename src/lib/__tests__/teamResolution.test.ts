import {
  NAME_ALIASES,
  REVERSE_ALIASES,
  YOUTH_RE,
  resolveFromWcList,
  resolveFromSearch,
  toLocalScheduleName,
  isBadCacheEntry,
} from '../teamResolution'

// ─── NAME_ALIASES ────────────────────────────────────────────────────────────

describe('NAME_ALIASES', () => {
  it('maps usa → united states', () => {
    expect(NAME_ALIASES['usa']).toBe('united states')
  })
  it('maps south korea → korea republic', () => {
    expect(NAME_ALIASES['south korea']).toBe('korea republic')
  })
  it('maps türkiye → turkey', () => {
    expect(NAME_ALIASES['türkiye']).toBe('turkey')
  })
  it('maps czechia → czech republic', () => {
    expect(NAME_ALIASES['czechia']).toBe('czech republic')
  })
})

// ─── REVERSE_ALIASES ─────────────────────────────────────────────────────────

describe('REVERSE_ALIASES', () => {
  it('maps united states → USA', () => {
    expect(REVERSE_ALIASES['united states']).toBe('USA')
  })
  it('maps korea republic → South Korea', () => {
    expect(REVERSE_ALIASES['korea republic']).toBe('South Korea')
  })
})

// ─── YOUTH_RE ────────────────────────────────────────────────────────────────

describe('YOUTH_RE — blocks youth / variant squads', () => {
  it.each([
    'United States U17',
    'United States U20',
    'United States U23',
    'France Under-21',
    'England Women',
    'Brazil Futsal',
    'Spain Beach',
    'Germany Paralympic',
    'USA Olympic',
  ])('matches "%s"', name => {
    expect(YOUTH_RE.test(name)).toBe(true)
  })

  it.each([
    'United States',
    'France',
    'Brazil',
    'Korea Republic',
    'Ivory Coast',
    'Türkiye',
  ])('does NOT match senior team "%s"', name => {
    expect(YOUTH_RE.test(name)).toBe(false)
  })
})

// ─── resolveFromWcList ────────────────────────────────────────────────────────

const WC_TEAMS = [
  { team: { id: 2,    name: 'France' } },
  { team: { id: 21,   name: 'United States' } },
  { team: { id: 6,    name: 'Brazil' } },
  { team: { id: 9,    name: 'Spain' } },
  { team: { id: 1529, name: 'Republic of Ireland' } },
  { team: { id: 16,   name: 'Mexico' } },
  { team: { id: 50,   name: 'Korea Republic' } },
]

describe('resolveFromWcList', () => {
  it('returns null for empty list', () => {
    expect(resolveFromWcList('USA', [])).toBeNull()
  })

  it('resolves "USA" → United States via NAME_ALIASES', () => {
    expect(resolveFromWcList('USA', WC_TEAMS)).toBe(21)
  })

  it('resolves "usa" (lowercase) → United States', () => {
    expect(resolveFromWcList('usa', WC_TEAMS)).toBe(21)
  })

  it('resolves "France" exactly', () => {
    expect(resolveFromWcList('France', WC_TEAMS)).toBe(2)
  })

  it('resolves "South Korea" via NAME_ALIASES → Korea Republic', () => {
    expect(resolveFromWcList('South Korea', WC_TEAMS)).toBe(50)
  })

  it('resolves "Brazil" exactly', () => {
    expect(resolveFromWcList('Brazil', WC_TEAMS)).toBe(6)
  })

  it('returns null for unknown team', () => {
    expect(resolveFromWcList('Narnia FC', WC_TEAMS)).toBeNull()
  })

  it('does NOT return France (id 2) for "USA"', () => {
    // Regression: France and USA were both mapped to id 2 — France is id 2, USA is not
    const result = resolveFromWcList('USA', WC_TEAMS)
    expect(result).not.toBe(2)
  })
})

// ─── resolveFromSearch ────────────────────────────────────────────────────────

describe('resolveFromSearch', () => {
  const SEARCH_RESULTS_US = [
    { team: { id: 99,  name: 'United States U17', national: true } },
    { team: { id: 100, name: 'United States U20', national: true } },
    { team: { id: 21,  name: 'United States',     national: true } },
    { team: { id: 200, name: 'FC United States',  national: false } },
  ]

  it('returns senior national team, not U17', () => {
    expect(resolveFromSearch('USA', SEARCH_RESULTS_US)).toBe(21)
  })

  it('returns senior national team, not U20', () => {
    const without17 = SEARCH_RESULTS_US.filter(t => !t.team.name.includes('U17'))
    expect(resolveFromSearch('USA', without17)).toBe(21)
  })

  it('never returns a club team (national: false)', () => {
    const result = resolveFromSearch('USA', SEARCH_RESULTS_US)
    expect(result).not.toBe(200)
  })

  it('returns null for empty results', () => {
    expect(resolveFromSearch('USA', [])).toBeNull()
  })

  it('returns null when all results are youth teams', () => {
    const youthOnly = [
      { team: { id: 99,  name: 'United States U17', national: true } },
      { team: { id: 100, name: 'United States U20', national: true } },
    ]
    expect(resolveFromSearch('USA', youthOnly)).toBeNull()
  })

  it('handles France search correctly — returns senior France not a youth team', () => {
    const franceResults = [
      { team: { id: 5,   name: 'France U20',  national: true } },
      { team: { id: 2,   name: 'France',      national: true } },
    ]
    expect(resolveFromSearch('France', franceResults)).toBe(2)
  })

  it('regression: searching "Israel" must not be returned for "USA" search', () => {
    // Simulate the original bug: search("usa") returned Israel
    const wrongResults = [
      { team: { id: 88,  name: 'Israel', national: true } },
    ]
    // No match for "united states" alias → should not return Israel
    expect(resolveFromSearch('USA', wrongResults)).toBeNull()
  })
})

// ─── toLocalScheduleName ─────────────────────────────────────────────────────

describe('toLocalScheduleName', () => {
  it('returns searchName when provided', () => {
    expect(toLocalScheduleName('USA', 'United States')).toBe('USA')
  })

  it('reverse-aliases "United States" → "USA" when no searchName', () => {
    expect(toLocalScheduleName(null, 'United States')).toBe('USA')
  })

  it('reverse-aliases "Korea Republic" → "South Korea"', () => {
    expect(toLocalScheduleName(null, 'Korea Republic')).toBe('South Korea')
  })

  it('returns API name unchanged when no alias exists', () => {
    expect(toLocalScheduleName(null, 'France')).toBe('France')
  })

  it('returns empty string for empty API name with no searchName', () => {
    expect(toLocalScheduleName(null, '')).toBe('')
  })
})

// ─── isBadCacheEntry ─────────────────────────────────────────────────────────

describe('isBadCacheEntry', () => {
  it('flags "United States U17" as bad', () => {
    expect(isBadCacheEntry('United States U17')).toBe(true)
  })

  it('flags "France U20" as bad', () => {
    expect(isBadCacheEntry('France U20')).toBe(true)
  })

  it('does NOT flag "United States" as bad', () => {
    expect(isBadCacheEntry('United States')).toBe(false)
  })

  it('does NOT flag "France" as bad', () => {
    expect(isBadCacheEntry('France')).toBe(false)
  })

  it('does NOT flag "Brazil" as bad', () => {
    expect(isBadCacheEntry('Brazil')).toBe(false)
  })
})
