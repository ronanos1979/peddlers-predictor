/**
 * Tests for the cache-only /api/team route.
 * The route reads exclusively from Supabase (team_cache + player_cache + matches).
 * No external API calls are made — all data must be pre-loaded by admin.
 */

const mockFrom = jest.fn()

jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}))

import { NextRequest } from 'next/server'
import { GET } from '../route'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEAM_CACHE_ROW = {
  team_name: 'USA',
  data: {
    teamInfo: {
      team:  { id: 841, name: 'United States', country: 'USA', logo: '', founded: null, national: true },
      venue: { name: '', city: '', capacity: 0 },
    },
    coach:    { id: 0, name: 'Gregg Berhalter', nationality: 'USA', photo: '', career: [] },
    fixtures: [],
  },
}

const ALGERIA_CACHE_ROW = {
  team_name: 'Algeria',
  data: {
    teamInfo: {
      team:  { id: 7, name: 'Algeria', country: 'Algeria', logo: '', founded: 1962, national: true },
      venue: { name: '', city: '', capacity: 0 },
    },
    coach:    null,
    fixtures: [],
  },
}

const PLAYERS_ENRICHED = [
  { fd_id: 1001, name: 'Christian Pulisic', age: 26, number: 10, position: 'Attacker',
    photo: 'https://media.api-sports.io/football/players/1001.png',
    photo_enriched: true, club_name: 'AC Milan', club_logo: null, club_enriched: true, af_id: 2295 },
  { fd_id: 1002, name: 'Tyler Adams', age: 25, number: 4, position: 'Midfielder',
    photo: 'https://media.api-sports.io/football/players/1002.png',
    photo_enriched: true, club_name: 'Bournemouth', club_logo: null, club_enriched: true, af_id: 3101 },
]

const PLAYERS_PARTIAL = [
  { fd_id: 1001, name: 'Christian Pulisic', age: 26, number: 10, position: 'Attacker',
    photo: 'https://media.api-sports.io/football/players/1001.png',
    photo_enriched: true, club_name: 'AC Milan', club_logo: null, club_enriched: true, af_id: 2295 },
  { fd_id: 1002, name: 'Tyler Adams', age: 25, number: 4, position: 'Midfielder',
    photo: '', photo_enriched: false, club_name: null, club_logo: null, club_enriched: false, af_id: null },
]

const LOCAL_SCHEDULE = [
  {
    id: 'match-1', home_team: 'USA', away_team: 'Paraguay',
    home_flag: '🇺🇸', away_flag: '🇵🇾',
    kickoff_at: '2026-06-13T01:00:00Z', stage: 'Group D', result: null,
  },
]

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeChain(result: unknown) {
  // Wrap a single-row result into an array for .limit(1) callers
  const asArray = (r: unknown) => {
    const d = (r as { data?: unknown } | null)?.data
    return { data: d != null ? [d] : [], error: null }
  }

  // c is a thenable so `await chain.ilike(...).order(...)` works for
  // queries that terminate at .order() (player_cache, matches).
  const c: Record<string, unknown> & { then: unknown; catch: unknown } = {
    then:  (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
             Promise.resolve(result).then(res, rej),
    catch: (rej: (e: unknown) => unknown) => Promise.resolve(result).catch(rej),
  }

  ;['select','eq','ilike','neq','or','order','gt'].forEach(m => {
    c[m] = jest.fn().mockReturnValue(c)
  })

  // .maybeSingle() — used by ?id= path, returns single row
  c.maybeSingle = jest.fn().mockResolvedValue(result)

  // .limit() — used by ?name= path after .order(), returns array
  c.limit = jest.fn().mockResolvedValue(asArray(result))

  return c
}

function setupMocks({
  teamCache = { data: null,  error: null } as unknown,
  players   = { data: [],   error: null } as unknown,
  matches   = { data: [],   error: null } as unknown,
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'team_cache')   return makeChain(teamCache)
    if (table === 'player_cache') return makeChain(players)
    if (table === 'matches')      return makeChain(matches)
    return makeChain({ data: null, error: null })
  })
}

function makeReq(params: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost/api/team?${new URLSearchParams(params)}`)
}

beforeEach(() => jest.resetAllMocks())

// ─────────────────────────────────────────────────────────────────────────────
// NAME-BASED LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

describe('?name= — name-based cache lookup', () => {
  test('returns teamInfo and coach from team_cache.data', async () => {
    setupMocks({ teamCache: { data: TEAM_CACHE_ROW, error: null } })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.teamInfo).not.toBeNull()
    expect(body.teamInfo.team.id).toBe(841)
    expect(body.teamInfo.team.name).toBe('United States')
    expect(body.coach.name).toBe('Gregg Berhalter')
  })

  test('returns squad from player_cache', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      players:   { data: PLAYERS_ENRICHED, error: null },
    })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.squad).toHaveLength(2)
    expect(body.squad[0].name).toBe('Christian Pulisic')
    expect(body.squad[0].id).toBe(1001)
    expect(body.squad[0].position).toBe('Attacker')
  })

  test('attaches photo and club from player_cache', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      players:   { data: PLAYERS_ENRICHED, error: null },
    })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.squad[0].photo).toMatch(/^https?:\/\//)
    expect(body.squad[0].club?.name).toBe('AC Milan')
  })

  test('attaches localSchedule from matches table', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      matches:   { data: LOCAL_SCHEDULE, error: null },
    })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.localSchedule).toHaveLength(1)
    expect(body.localSchedule[0].home_team).toBe('USA')
  })

  test('localTeamName matches the request name when cache hit', async () => {
    setupMocks({ teamCache: { data: TEAM_CACHE_ROW, error: null } })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.localTeamName).toBe('USA')
  })

  test('returns null teamInfo and empty squad when not cached', async () => {
    setupMocks()  // all return null/empty
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.teamInfo).toBeNull()
    expect(body.squad).toEqual([])
    expect(body.coach).toBeNull()
    expect(body.fixtures).toEqual([])
  })

  test('still returns localSchedule even when team not cached', async () => {
    setupMocks({ matches: { data: LOCAL_SCHEDULE, error: null } })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.localSchedule).toHaveLength(1)
  })

  test('Algeria team data loads correctly', async () => {
    setupMocks({
      teamCache: { data: ALGERIA_CACHE_ROW, error: null },
      players: {
        data: [
          { fd_id: 5001, name: 'Riyad Mahrez', age: 33, number: 26, position: 'Attacker',
            photo: 'https://x.com/mahrez.png', photo_enriched: true,
            club_name: 'Al-Ahli', club_logo: null, club_enriched: true, af_id: 5001 },
        ],
        error: null,
      },
    })
    const body = await GET(makeReq({ name: 'Algeria' })).then(r => r.json())
    expect(body.teamInfo?.team.id).toBe(7)
    expect(body.squad[0].name).toBe('Riyad Mahrez')
    expect(body.squad[0].club?.name).toBe('Al-Ahli')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ID-BASED LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

describe('?id= — ID-based cache lookup', () => {
  test('returns team data by numeric FD team ID', async () => {
    setupMocks({ teamCache: { data: TEAM_CACHE_ROW, error: null } })
    const body = await GET(makeReq({ id: '841' })).then(r => r.json())
    expect(body.teamInfo).not.toBeNull()
    expect(body.teamInfo.team.id).toBe(841)
  })

  test('uses team_name from cache for player and schedule lookups', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      players:   { data: PLAYERS_ENRICHED, error: null },
      matches:   { data: LOCAL_SCHEDULE, error: null },
    })
    const body = await GET(makeReq({ id: '841' })).then(r => r.json())
    expect(body.squad).toHaveLength(2)
    expect(body.localSchedule).toHaveLength(1)
    expect(body.localTeamName).toBe('USA')
  })

  test('returns empty data when ID not in cache', async () => {
    setupMocks()
    const body = await GET(makeReq({ id: '999' })).then(r => r.json())
    expect(body.teamInfo).toBeNull()
    expect(body.squad).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ENRICHMENT FLAGS
// ─────────────────────────────────────────────────────────────────────────────

describe('photosEnriched / clubsEnriched flags', () => {
  test('photosEnriched is true when all players have photo_enriched=true', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      players:   { data: PLAYERS_ENRICHED, error: null },
    })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.photosEnriched).toBe(true)
  })

  test('clubsEnriched is true when all players have club_enriched=true', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      players:   { data: PLAYERS_ENRICHED, error: null },
    })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.clubsEnriched).toBe(true)
  })

  test('photosEnriched is false when any player has photo_enriched=false', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      players:   { data: PLAYERS_PARTIAL, error: null },
    })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.photosEnriched).toBe(false)
  })

  test('clubsEnriched is false when any player has club_enriched=false', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      players:   { data: PLAYERS_PARTIAL, error: null },
    })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.clubsEnriched).toBe(false)
  })

  test('both flags are false when squad is empty', async () => {
    setupMocks({ teamCache: { data: TEAM_CACHE_ROW, error: null } })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.photosEnriched).toBe(false)
    expect(body.clubsEnriched).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER DATA MAPPING
// ─────────────────────────────────────────────────────────────────────────────

describe('Player data mapping from player_cache', () => {
  test('maps fd_id → id, preserves name/age/number/position', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      players:   { data: PLAYERS_ENRICHED, error: null },
    })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    const player = body.squad[0]
    expect(player.id).toBe(1001)
    expect(player.name).toBe('Christian Pulisic')
    expect(player.age).toBe(26)
    expect(player.number).toBe(10)
    expect(player.position).toBe('Attacker')
  })

  test('club is undefined when club_name is null', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      players:   { data: PLAYERS_PARTIAL, error: null },
    })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    const adams = body.squad.find((p: { name: string }) => p.name === 'Tyler Adams')
    expect(adams.club).toBeUndefined()
  })

  test('af_id maps to afId in response', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      players:   { data: PLAYERS_ENRICHED, error: null },
    })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.squad[0].afId).toBe(2295)
  })

  test('null af_id becomes undefined in response', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      players:   { data: PLAYERS_PARTIAL, error: null },
    })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    const adams = body.squad.find((p: { name: string }) => p.name === 'Tyler Adams')
    expect(adams.afId).toBeUndefined()
  })

  test('defaults age/number/position when null in cache', async () => {
    setupMocks({
      teamCache: { data: TEAM_CACHE_ROW, error: null },
      players: {
        data: [{ fd_id: 9999, name: 'Unknown', age: null, number: null, position: null,
          photo: '', photo_enriched: false, club_name: null, club_logo: null, club_enriched: false, af_id: null }],
        error: null,
      },
    })
    const body = await GET(makeReq({ name: 'USA' })).then(r => r.json())
    expect(body.squad[0].age).toBe(0)
    expect(body.squad[0].number).toBe(0)
    expect(body.squad[0].position).toBe('Midfielder')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// INPUT VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

describe('Input validation', () => {
  test('returns 400 when neither id nor name provided', async () => {
    const res = await GET(new NextRequest('http://localhost/api/team'))
    expect(res.status).toBe(400)
  })

  test('returns 200 with empty data for unknown team name', async () => {
    setupMocks()
    const res = await GET(makeReq({ name: 'Narnia' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.teamInfo).toBeNull()
    expect(body.squad).toEqual([])
  })
})
