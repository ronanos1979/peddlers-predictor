/**
 * Integration tests for /api/team route.
 * Mocks both global.fetch (API-Football) and supabaseAdmin (Supabase cache).
 *
 * Key regressions tested:
 *  - ?name=USA returns United States team profile, not France/Israel/U17
 *  - Falls back to searching original name "usa" when alias search fails
 *  - Empty squad → teamInfo still returned (page shows tabs, not local-only fallback)
 *  - Bad cache entry (U17) is rejected and fresh data is fetched
 *  - ?id=X bypasses name resolution
 *  - Algeria works independently of USA
 */

// Set env var before ANY import so the module-level API_KEY constant is correct
process.env.API_FOOTBALL_KEY = 'test-key'

import { NextRequest } from 'next/server'
import { GET } from '../route'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const supabaseMock = { from: jest.fn() }
jest.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: supabaseMock }))

function makeChain(maybeSingleResult: unknown) {
  const c: Record<string, jest.Mock> = {}
  const all = ['select','eq','gt','ilike','maybeSingle','upsert','single','or','order','neq']
  all.forEach(m => { c[m] = jest.fn().mockReturnValue(c) })
  c.maybeSingle = jest.fn().mockResolvedValue(maybeSingleResult)
  c.upsert      = jest.fn().mockResolvedValue({ error: null })
  return c
}

function noCache()  { return makeChain({ data: null, team_name: null }) }
function hitCache(data: unknown, teamName: string) { return makeChain({ data, team_name: teamName }) }

// ── Sample API-Football data ──────────────────────────────────────────────────

const US_TEAM_INFO = {
  team:  { id: 21, name: 'United States', country: 'United States', logo: 'https://x.com/usa.png', founded: 1913, national: true },
  venue: { name: 'Various', city: 'Various', capacity: 0 },
}
const ALGERIA_TEAM_INFO = {
  team:  { id: 7, name: 'Algeria', country: 'Algeria', logo: 'https://x.com/alg.png', founded: 1962, national: true },
  venue: { name: 'Various', city: 'Various', capacity: 0 },
}
const US_SQUAD = [
  { id: 2295, name: 'Christian Pulisic', age: 26, number: 10, position: 'Attacker',  photo: '' },
  { id: 1001, name: 'Tyler Adams',       age: 25, number: 4,  position: 'Midfielder', photo: '' },
]
const ALGERIA_SQUAD = [
  { id: 5001, name: 'Riyad Mahrez', age: 33, number: 26, position: 'Attacker', photo: '' },
]
const COACH = { response: [{ id: 1, name: 'Coach Name', nationality: 'X', photo: '', career: [] }] }
const US_FIXTURE = { response: [{ fixture: { id: 1, date: '2026-06-13T01:00:00Z', status: { short: 'NS' } }, league: { round: 'Group D' }, teams: { home: { id: 21, name: 'United States', logo: '', winner: null }, away: { id: 99, name: 'Paraguay', logo: '', winner: null } }, goals: { home: null, away: null } }] }
const EMPTY = { response: [] }

function searchFor(id: number, name: string, national = true) {
  return { response: [{ team: { id, name, national, country: name } }] }
}
function searchForMany(teams: Array<{ id: number; name: string; national?: boolean }>) {
  return { response: teams.map(t => ({ team: { ...t, national: t.national ?? true } })) }
}

// ── fetch mock helpers ────────────────────────────────────────────────────────

const mockFetch = jest.fn()
global.fetch = mockFetch as typeof global.fetch

function res(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data) } as Response)
}

/** More specific URL matchers to avoid cross-endpoint false matches */
const isWcTeamsList  = (u: string) => u.includes('/teams?') && u.includes('league=1') && !u.includes('id=') && !u.includes('search=')
const isTeamById     = (id: number) => (u: string) => u.includes(`/teams?id=${id}`)
const isSearch       = (...terms: string[]) => (u: string) => u.includes('/teams?search=') && terms.some(t => u.toLowerCase().includes(t))
const isSquad        = (u: string) => u.includes('/players/squads')
const isPlayerStats  = (u: string) => u.includes('/players?') && !u.includes('/squads')
const isCoach        = (u: string) => u.includes('/coachs')
const isFixtures     = (u: string) => u.includes('/fixtures?') && u.includes('team=')

// ── Setup helpers ─────────────────────────────────────────────────────────────

function setupNoCache() {
  supabaseMock.from.mockReturnValue(noCache())
}

function setupBadCache(youthName: string) {
  supabaseMock.from.mockReturnValue(
    hitCache({ teamInfo: { team: { id: 99, name: youthName } }, squad: [], coach: null, fixtures: [] }, youthName)
  )
}

/** Standard fetch mock for USA — alias "united states" search works */
function setupUsaApiFetch(squadData = US_SQUAD) {
  mockFetch.mockImplementation((url: string) => {
    if (isWcTeamsList(url))                            return res(EMPTY)
    if (isSearch('united+states', 'united%20states')(url)) return res(searchFor(21, 'United States'))
    if (isTeamById(21)(url))                           return res({ response: [US_TEAM_INFO] })
    if (isSquad(url))                                  return res({ response: squadData.length ? [{ players: squadData }] : [] })
    if (isPlayerStats(url))                            return res(EMPTY)
    if (isCoach(url))                                  return res(COACH)
    if (isFixtures(url))                               return res(US_FIXTURE)
    return res(EMPTY)
  })
}

function makeReq(params: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost/api/team?${new URLSearchParams(params)}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.API_FOOTBALL_KEY = 'test-key'
})

// ─────────────────────────────────────────────────────────────────────────────
// USA PROFILE
// ─────────────────────────────────────────────────────────────────────────────

describe('?name=USA — team profile loads correctly', () => {
  test('returns teamInfo when API uses "United States" name', async () => {
    setupNoCache()
    setupUsaApiFetch()

    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.teamInfo).not.toBeNull()
    expect(body.teamInfo.team.name).toBe('United States')
    expect(body.teamInfo.team.id).toBe(21)
  })

  test('returns squad (player profiles) when squad data is available', async () => {
    setupNoCache()
    setupUsaApiFetch(US_SQUAD)

    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.squad).toHaveLength(2)
    expect(body.squad[0].name).toBe('Christian Pulisic')
  })

  test('returns teamInfo even when squad is empty (pre-tournament)', async () => {
    setupNoCache()
    setupUsaApiFetch([])  // empty squad

    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    // teamInfo must still be present so the page shows tabs (not local-only fallback)
    expect(body.teamInfo).not.toBeNull()
    expect(body.teamInfo.team.id).toBe(21)
    expect(body.squad).toHaveLength(0)
  })

  test('falls back to searching "usa" when alias "united states" search returns nothing', async () => {
    setupNoCache()
    mockFetch.mockImplementation((url: string) => {
      if (isWcTeamsList(url))                                return res(EMPTY)
      if (isSearch('united+states', 'united%20states')(url)) return res(EMPTY)          // alias search fails
      if (isSearch('usa')(url))                              return res(searchFor(21, 'USA'))  // original name works
      if (isTeamById(21)(url))                               return res({ response: [US_TEAM_INFO] })
      if (isSquad(url))                                      return res({ response: [{ players: US_SQUAD }] })
      if (isPlayerStats(url))                                return res(EMPTY)
      if (isCoach(url))                                      return res(COACH)
      if (isFixtures(url))                                   return res(US_FIXTURE)
      return res(EMPTY)
    })

    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.teamInfo).not.toBeNull()
    expect(body.teamInfo.team.id).toBe(21)
  })

  test('regression: USA does NOT return France (id 2)', async () => {
    setupNoCache()
    mockFetch.mockImplementation((url: string) => {
      if (isWcTeamsList(url)) return res(EMPTY)
      if (isSearch('united+states', 'united%20states')(url)) {
        // France comes first in results — USA (United States) is second
        return res(searchForMany([
          { id: 2,  name: 'France',         national: true },
          { id: 21, name: 'United States',  national: true },
        ]))
      }
      if (isTeamById(21)(url)) return res({ response: [US_TEAM_INFO] })
      if (isSquad(url))        return res({ response: [{ players: US_SQUAD }] })
      if (isPlayerStats(url))  return res(EMPTY)
      if (isCoach(url))        return res(COACH)
      if (isFixtures(url))     return res(US_FIXTURE)
      return res(EMPTY)
    })

    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.teamInfo?.team.id).not.toBe(2)
    expect(body.teamInfo?.team.id).toBe(21)
  })

  test('regression: USA does NOT return U17 team', async () => {
    setupNoCache()
    mockFetch.mockImplementation((url: string) => {
      if (isWcTeamsList(url)) return res(EMPTY)
      if (isSearch('united+states', 'united%20states')(url)) {
        return res(searchForMany([
          { id: 99, name: 'United States U17', national: true },
          { id: 21, name: 'United States',     national: true },
        ]))
      }
      if (isTeamById(21)(url)) return res({ response: [US_TEAM_INFO] })
      if (isSquad(url))        return res({ response: [{ players: US_SQUAD }] })
      if (isPlayerStats(url))  return res(EMPTY)
      if (isCoach(url))        return res(COACH)
      if (isFixtures(url))     return res(US_FIXTURE)
      return res(EMPTY)
    })

    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.teamInfo?.team.id).not.toBe(99)
    expect(body.teamInfo?.team.id).toBe(21)
  })

  test('regression: USA does NOT return Israel (completely unrelated search result)', async () => {
    setupNoCache()
    mockFetch.mockImplementation((url: string) => {
      if (isWcTeamsList(url)) return res(EMPTY)
      if (isSearch('united+states', 'united%20states')(url)) {
        return res(searchFor(88, 'Israel'))  // original bug: wrong team returned
      }
      if (isSearch('usa')(url)) return res(EMPTY)  // original name also fails
      return res(EMPTY)
    })

    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    // Should return null teamInfo, NOT Israel's data
    expect(body.teamInfo).toBeNull()
    expect(body.teamInfo?.team?.id).not.toBe(88)
  })

  test('uses WC 2026 teams list when available (fastest path, no search call needed)', async () => {
    setupNoCache()
    const wcList = { response: [{ team: { id: 21, name: 'United States' } }] }
    mockFetch.mockImplementation((url: string) => {
      if (isWcTeamsList(url))  return res(wcList)
      if (isTeamById(21)(url)) return res({ response: [US_TEAM_INFO] })
      if (isSquad(url))        return res({ response: [{ players: US_SQUAD }] })
      if (isPlayerStats(url))  return res(EMPTY)
      if (isCoach(url))        return res(COACH)
      if (isFixtures(url))     return res(US_FIXTURE)
      return res(EMPTY)
    })

    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.teamInfo?.team.id).toBe(21)
    // Should NOT have made any search calls
    const searchCalls = mockFetch.mock.calls.filter(([u]) => String(u).includes('search='))
    expect(searchCalls).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ALGERIA PROFILE
// ─────────────────────────────────────────────────────────────────────────────

describe('?name=Algeria — team profile and player profiles load correctly', () => {
  function setupAlgeria(squad = ALGERIA_SQUAD) {
    setupNoCache()
    mockFetch.mockImplementation((url: string) => {
      if (isWcTeamsList(url))         return res(EMPTY)
      if (isSearch('algeria')(url))   return res(searchFor(7, 'Algeria'))
      if (isTeamById(7)(url))         return res({ response: [ALGERIA_TEAM_INFO] })
      if (isSquad(url))               return res({ response: squad.length ? [{ players: squad }] : [] })
      if (isPlayerStats(url))         return res(EMPTY)
      if (isCoach(url))               return res(COACH)
      if (isFixtures(url))            return res(EMPTY)
      return res(EMPTY)
    })
  }

  test('returns Algeria teamInfo', async () => {
    setupAlgeria()
    const body = await GET(makeReq({ name: 'Algeria' })).then(r => r.json())
    expect(body.teamInfo?.team.name).toBe('Algeria')
    expect(body.teamInfo?.team.id).toBe(7)
  })

  test('returns Algeria squad (player profiles)', async () => {
    setupAlgeria()
    const body = await GET(makeReq({ name: 'Algeria' })).then(r => r.json())
    expect(body.squad).toHaveLength(1)
    expect(body.squad[0].name).toBe('Riyad Mahrez')
  })

  test('Algeria does not accidentally use USA alias logic', async () => {
    setupAlgeria()
    await GET(makeReq({ name: 'Algeria' })).then(r => r.json())
    const calls = mockFetch.mock.calls.map(([u]) => String(u))
    expect(calls.some(u => u.includes('united') || u.includes('united+states'))).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ID-BASED LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

describe('?id=21 — numeric ID bypasses name resolution', () => {
  test('returns team data without any search calls', async () => {
    setupNoCache()
    mockFetch.mockImplementation((url: string) => {
      if (isTeamById(21)(url)) return res({ response: [US_TEAM_INFO] })
      if (isSquad(url))        return res({ response: [{ players: US_SQUAD }] })
      if (isPlayerStats(url))  return res(EMPTY)
      if (isCoach(url))        return res(COACH)
      if (isFixtures(url))     return res(US_FIXTURE)
      return res(EMPTY)
    })

    const body = await GET(makeReq({ id: '21' })).then(r => r.json())
    expect(body.teamInfo?.team.id).toBe(21)
    expect(body.squad).toHaveLength(2)
    expect(mockFetch.mock.calls.some(([u]) => String(u).includes('search='))).toBe(false)
  })

  test('serves from Supabase cache on second visit (no API calls)', async () => {
    const cached = { teamInfo: US_TEAM_INFO, squad: US_SQUAD, coach: null, fixtures: [] }
    supabaseMock.from.mockReturnValue(hitCache(cached, 'United States'))

    const body = await GET(makeReq({ id: '21' })).then(r => r.json())
    expect(body.teamInfo?.team.id).toBe(21)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CACHE VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

describe('Cache validation — youth team entries rejected', () => {
  test('rejects cached "United States U17" and re-fetches correct senior team', async () => {
    setupBadCache('United States U17')
    setupUsaApiFetch()

    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.teamInfo?.team.id).toBe(21)
    expect(body.teamInfo?.team.name).toBe('United States')
    expect(body.teamInfo?.team.name).not.toContain('U17')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// INPUT VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

describe('Input validation', () => {
  test('returns 400 when neither id nor name provided', async () => {
    const res2 = await GET(new NextRequest('http://localhost/api/team'))
    expect(res2.status).toBe(400)
  })
})
