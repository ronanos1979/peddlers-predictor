// Regression tests for the team name → ID resolution bugs we've hit:
// 1. "USA" returned France (id 2) — wrong hardcoded mapping
// 2. "USA" returned Israel — global search returned wrong team
// 3. "USA" returned United States U17 — youth filter not applied

import {
  resolveFromWcList,
  resolveFromSearch,
  isBadCacheEntry,
  NAME_ALIASES,
} from '@/lib/teamResolution'

describe('Regression: USA team resolution', () => {
  it('alias "usa" maps to "united states" (not empty)', () => {
    expect(NAME_ALIASES['usa']).toBe('united states')
  })

  it('resolveFromWcList("USA") with correct WC teams returns USA id, not France id 2', () => {
    const teams = [
      { team: { id: 2,  name: 'France' } },
      { team: { id: 21, name: 'United States' } },
    ]
    const result = resolveFromWcList('USA', teams)
    expect(result).toBe(21)
    expect(result).not.toBe(2)
  })

  it('resolveFromSearch("USA") excludes Israel (no "united states" match)', () => {
    // Simulate the original bug: global search("usa") returned Israel
    const israelResults = [{ team: { id: 88, name: 'Israel', national: true } }]
    // "usa" aliases to "united states" — no exact match in these results
    expect(resolveFromSearch('USA', israelResults)).toBeNull()
  })

  it('resolveFromSearch("USA") excludes U17 and picks senior team', () => {
    const mixedResults = [
      { team: { id: 99, name: 'United States U17', national: true } },
      { team: { id: 21, name: 'United States',     national: true } },
    ]
    expect(resolveFromSearch('USA', mixedResults)).toBe(21)
  })

  it('resolveFromSearch("USA") returns null when ONLY youth teams match', () => {
    const youthOnly = [
      { team: { id: 99,  name: 'United States U17', national: true } },
      { team: { id: 100, name: 'United States U20', national: true } },
    ]
    expect(resolveFromSearch('USA', youthOnly)).toBeNull()
  })

  it('isBadCacheEntry detects a cached U17 entry', () => {
    expect(isBadCacheEntry('United States U17')).toBe(true)
  })

  it('isBadCacheEntry does not flag the senior team', () => {
    expect(isBadCacheEntry('United States')).toBe(false)
  })
})

describe('Regression: France must not be returned for non-France searches', () => {
  const wcTeams = [
    { team: { id: 2,  name: 'France' } },
    { team: { id: 21, name: 'United States' } },
    { team: { id: 6,  name: 'Brazil' } },
  ]

  it('USA search returns United States, not France', () => {
    expect(resolveFromWcList('USA', wcTeams)).toBe(21)
  })

  it('Brazil search returns Brazil, not France', () => {
    expect(resolveFromWcList('Brazil', wcTeams)).toBe(6)
  })

  it('France search correctly returns France', () => {
    expect(resolveFromWcList('France', wcTeams)).toBe(2)
  })
})
