import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const API_KEY = process.env.API_FOOTBALL_KEY
const BASE = 'https://v3.football.api-sports.io'
const LEAGUE = '1'
const SEASON = '2026'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Common/local names (Supabase schedule) → API-Football official names
const NAME_ALIASES: Record<string, string> = {
  'usa':         'united states',
  'south korea': 'korea republic',
  'ivory coast': "côte d'ivoire",
  'türkiye':     'turkey',
  'czechia':     'czech republic',
}

// API-Football official name → local Supabase schedule name
const REVERSE_ALIASES: Record<string, string> = {
  'united states':  'USA',
  'korea republic': 'South Korea',
  "côte d'ivoire":  'Ivory Coast',
  'turkey':         'Türkiye',
  'czech republic': 'Czechia',
}

type SquadPlayer = {
  id: number; name: string; age: number; number: number
  position: string; photo: string; club?: { name: string; logo?: string }
}
type PlayerProfile = {
  player: { id: number }
  statistics?: Array<{ team?: { name?: string; logo?: string } }>
}

async function apiFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}/${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': API_KEY! },
    cache: 'no-store',
  })
  return res.json()
}

async function buildTeamData(teamId: number) {
  const [teamData, squadData, playerData, coachData, fixturesData] = await Promise.all([
    apiFetch('teams', { id: String(teamId) }),
    apiFetch('players/squads', { team: String(teamId) }),
    apiFetch('players', { team: String(teamId), league: LEAGUE, season: SEASON }),
    apiFetch('coachs', { team: String(teamId) }),
    apiFetch('fixtures', { team: String(teamId), league: LEAGUE, season: SEASON }),
  ])

  const teamInfo = teamData.response?.[0] || null
  const squad: SquadPlayer[] = [...(squadData.response?.[0]?.players || [])]

  const profiles = new Map<number, PlayerProfile>()
  ;((playerData.response || []) as PlayerProfile[]).forEach(p => profiles.set(p.player.id, p))
  squad.forEach(player => {
    const club = profiles.get(player.id)?.statistics?.find(s => s.team?.name)?.team
    if (club?.name && club.name !== (teamInfo as { team?: { name?: string } } | null)?.team?.name) {
      player.club = { name: club.name, logo: club.logo }
    }
  })

  const coach = coachData.response?.[0] || null
  const fixtures = [...((fixturesData.response || []) as Array<{ fixture: { date: string } }>)].sort(
    (a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime()
  )

  return { teamInfo, squad, coach, fixtures }
}

async function storeCache(teamId: number, teamName: string, data: ReturnType<typeof buildTeamData> extends Promise<infer T> ? T : never) {
  await supabaseAdmin.from('team_cache').upsert(
    { team_id: teamId, team_name: teamName, data, cached_at: new Date().toISOString() },
    { onConflict: 'team_id' }
  )
}

// Always-fresh local schedule from Supabase — not cached so results stay current.
async function fetchLocalSchedule(localTeamName: string) {
  if (!localTeamName) return []
  const { data } = await supabaseAdmin
    .from('matches')
    .select('id,home_team,away_team,home_flag,away_flag,kickoff_at,stage,result')
    .neq('stage', 'Demo Match')
    .or(`home_team.eq.${localTeamName},away_team.eq.${localTeamName}`)
    .order('kickoff_at', { ascending: true })
  return data || []
}

// Resolve a display name to its API-Football numeric team ID.
// Strategy:
//   1. Try the WC 2026 teams list (scoped, reliable — available once tournament is set up)
//   2. Fall back to a name search filtered to national teams only (safer than generic search)
async function resolveNameToId(name: string): Promise<number | null> {
  const norm = name.toLowerCase().trim()
  const aliased = NAME_ALIASES[norm] || norm

  // 1. WC 2026 teams list
  const wcTeamsData = await apiFetch('teams', { league: LEAGUE, season: SEASON })
  const wcTeams: Array<{ team: { id: number; name: string } }> = wcTeamsData.response || []

  if (wcTeams.length > 0) {
    const byAlias   = wcTeams.find(t => t.team.name.toLowerCase() === aliased)
    const byOrig    = wcTeams.find(t => t.team.name.toLowerCase() === norm)
    const byPartial = wcTeams.find(t => {
      const api = t.team.name.toLowerCase()
      return api.includes(norm) || norm.includes(api)
    })
    const found = byAlias || byOrig || byPartial
    if (found) return found.team.id
  }

  // 2. Fallback: search by aliased name (e.g. "united states" not "usa") and prefer
  //    national teams to avoid club-team false positives.
  const searchTerm = aliased !== norm ? aliased : norm
  const searchData = await apiFetch('teams', { search: searchTerm })
  const results: Array<{ team: { id: number; name: string; national?: boolean } }> =
    searchData.response || []

  const nationals = results.filter(t => t.team.national === true)
  const pool = nationals.length > 0 ? nationals : results

  const exact = pool.find(
    t => t.team.name.toLowerCase() === aliased || t.team.name.toLowerCase() === norm
  )
  return exact?.team.id ?? pool[0]?.team.id ?? null
}

// Return the Supabase schedule name given the API name (or original search string).
function toLocalName(searchName: string | null, teamInfo: unknown): string {
  if (searchName) return searchName
  const apiName = (teamInfo as { team?: { name?: string } } | null)?.team?.name || ''
  return REVERSE_ALIASES[apiName.toLowerCase()] || apiName
}

export async function GET(req: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'API_FOOTBALL_KEY not configured' }, { status: 500 })
  }

  const id   = req.nextUrl.searchParams.get('id')
  const name = req.nextUrl.searchParams.get('name')

  if (!id && !name) {
    return NextResponse.json({ error: 'id or name required' }, { status: 400 })
  }

  const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString()

  try {
    // ── ID-based ──────────────────────────────────────────────────────────────
    if (id) {
      const teamId = parseInt(id)

      const { data: cached } = await supabaseAdmin
        .from('team_cache')
        .select('data')
        .eq('team_id', teamId)
        .gt('cached_at', cutoff)
        .maybeSingle()

      let apiData
      if (cached?.data) {
        apiData = cached.data
      } else {
        apiData = await buildTeamData(teamId)
        if ((apiData as { teamInfo: unknown }).teamInfo) {
          await storeCache(
            teamId,
            ((apiData as { teamInfo: { team: { name: string } } }).teamInfo).team.name,
            apiData as Parameters<typeof storeCache>[2]
          )
        }
      }

      const localTeamName = toLocalName(null, (apiData as { teamInfo: unknown }).teamInfo)
      const localSchedule = await fetchLocalSchedule(localTeamName)
      return NextResponse.json({ ...apiData, localSchedule, localTeamName })
    }

    // ── Name-based ────────────────────────────────────────────────────────────

    // 1. Cache hit by name
    const { data: cachedByName } = await supabaseAdmin
      .from('team_cache')
      .select('data')
      .ilike('team_name', name!)
      .gt('cached_at', cutoff)
      .maybeSingle()

    if (cachedByName?.data) {
      const localSchedule = await fetchLocalSchedule(name!)
      return NextResponse.json({ ...cachedByName.data, localSchedule, localTeamName: name! })
    }

    // 2. Resolve name → numeric ID
    const resolvedId = await resolveNameToId(name!)
    if (!resolvedId) {
      const localSchedule = await fetchLocalSchedule(name!)
      return NextResponse.json({
        teamInfo: null, squad: [], coach: null, fixtures: [],
        localSchedule, localTeamName: name!,
      })
    }

    // 3. Cache hit by resolved numeric ID (handles alias mismatches)
    const { data: cachedById } = await supabaseAdmin
      .from('team_cache')
      .select('data')
      .eq('team_id', resolvedId)
      .gt('cached_at', cutoff)
      .maybeSingle()

    if (cachedById?.data) {
      const localSchedule = await fetchLocalSchedule(name!)
      return NextResponse.json({ ...cachedById.data, localSchedule, localTeamName: name! })
    }

    // 4. Fresh fetch, then cache
    const data = await buildTeamData(resolvedId)
    if (data.teamInfo) {
      await storeCache(
        resolvedId,
        (data.teamInfo as { team: { name: string } }).team.name,
        data
      )
    }
    const localSchedule = await fetchLocalSchedule(name!)
    return NextResponse.json({ ...data, localSchedule, localTeamName: name! })

  } catch (err) {
    console.error('Team data error:', err)
    return NextResponse.json({ error: 'Failed to fetch team data' }, { status: 500 })
  }
}
