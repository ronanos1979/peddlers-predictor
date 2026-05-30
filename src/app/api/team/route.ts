import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const API_KEY = process.env.API_FOOTBALL_KEY
const BASE = 'https://v3.football.api-sports.io'
const LEAGUE = '1'
const SEASON = '2026'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Map from common/local names (Supabase schedule) → API-Football official names
const NAME_ALIASES: Record<string, string> = {
  'usa':         'united states',
  'south korea': 'korea republic',
  'ivory coast': "côte d'ivoire",
  'türkiye':     'turkey',
  'czechia':     'czech republic',
}

// Reverse: API-Football official name → local Supabase schedule name
const REVERSE_ALIASES: Record<string, string> = {
  'united states': 'USA',
  'korea republic': 'South Korea',
  "côte d'ivoire": 'Ivory Coast',
  'turkey':        'Türkiye',
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

// Fetch local Supabase schedule for the team — always fresh, not cached, so results stay current.
async function fetchLocalSchedule(localTeamName: string) {
  const { data } = await supabaseAdmin
    .from('matches')
    .select('id,home_team,away_team,home_flag,away_flag,kickoff_at,stage,result')
    .neq('stage', 'Demo Match')
    .or(`home_team.eq.${localTeamName},away_team.eq.${localTeamName}`)
    .order('kickoff_at', { ascending: true })
  return data || []
}

// Resolve name → API-Football team ID using the WC 2026 teams list (not global search).
async function resolveNameToId(name: string): Promise<number | null> {
  const norm = name.toLowerCase().trim()
  const aliased = NAME_ALIASES[norm] || norm

  const wcTeamsData = await apiFetch('teams', { league: LEAGUE, season: SEASON })
  const wcTeams: Array<{ team: { id: number; name: string } }> = wcTeamsData.response || []

  const exactAlias = wcTeams.find(t => t.team.name.toLowerCase() === aliased)
  if (exactAlias) return exactAlias.team.id

  const exactOrig = wcTeams.find(t => t.team.name.toLowerCase() === norm)
  if (exactOrig) return exactOrig.team.id

  const partial = wcTeams.find(t => {
    const api = t.team.name.toLowerCase()
    return api.includes(norm) || norm.includes(api)
  })
  return partial?.team.id ?? null
}

// Determine the local Supabase schedule name from the API team name.
function toLocalName(searchName: string | null, teamInfo: unknown): string {
  if (searchName) return searchName
  const apiName = (teamInfo as { team?: { name?: string } } | null)?.team?.name || ''
  return REVERSE_ALIASES[apiName.toLowerCase()] || apiName
}

export async function GET(req: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'API_FOOTBALL_KEY not configured' }, { status: 500 })
  }

  const id = req.nextUrl.searchParams.get('id')
  const name = req.nextUrl.searchParams.get('name')

  if (!id && !name) {
    return NextResponse.json({ error: 'id or name required' }, { status: 400 })
  }

  const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString()

  try {
    if (id) {
      const teamId = parseInt(id)
      const { data: cached } = await supabaseAdmin
        .from('team_cache')
        .select('data')
        .eq('team_id', teamId)
        .gt('cached_at', cutoff)
        .maybeSingle()

      const apiData = cached?.data ?? await (async () => {
        const fresh = await buildTeamData(teamId)
        if (fresh.teamInfo) {
          await storeCache(teamId, (fresh.teamInfo as { team: { name: string } }).team.name, fresh)
        }
        return fresh
      })()

      const localTeamName = toLocalName(null, (apiData as { teamInfo: unknown }).teamInfo)
      const localSchedule = await fetchLocalSchedule(localTeamName)
      return NextResponse.json({ ...apiData, localSchedule, localTeamName })
    }

    // Name-based lookup — check cache by name first
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

    // Resolve name → ID via WC 2026 teams list
    const resolvedId = await resolveNameToId(name!)
    if (!resolvedId) {
      const localSchedule = await fetchLocalSchedule(name!)
      return NextResponse.json({ teamInfo: null, squad: [], coach: null, fixtures: [], localSchedule, localTeamName: name! })
    }

    // Check cache by resolved numeric ID
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

    const data = await buildTeamData(resolvedId)
    if (data.teamInfo) {
      await storeCache(resolvedId, (data.teamInfo as { team: { name: string } }).team.name, data)
    }
    const localSchedule = await fetchLocalSchedule(name!)
    return NextResponse.json({ ...data, localSchedule, localTeamName: name! })
  } catch (err) {
    console.error('Team data error:', err)
    return NextResponse.json({ error: 'Failed to fetch team data' }, { status: 500 })
  }
}
