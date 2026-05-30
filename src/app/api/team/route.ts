import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const API_KEY = process.env.API_FOOTBALL_KEY
const BASE = 'https://v3.football.api-sports.io'
const LEAGUE = '1'
const SEASON = '2026'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

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

  // Enrich squad with club info from player season statistics
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

      if (cached?.data) return NextResponse.json(cached.data)

      const data = await buildTeamData(teamId)
      if (data.teamInfo) {
        await storeCache(teamId, (data.teamInfo as { team: { name: string } }).team.name, data)
      }
      return NextResponse.json(data)
    }

    // Name-based: search cache first
    const { data: cached } = await supabaseAdmin
      .from('team_cache')
      .select('data')
      .ilike('team_name', name!)
      .gt('cached_at', cutoff)
      .maybeSingle()

    if (cached?.data) return NextResponse.json(cached.data)

    // Search API-Football to resolve name → numeric ID
    const searchData = await apiFetch('teams', { search: name! })
    const foundTeam = (searchData.response || [])[0]?.team
    if (!foundTeam) {
      return NextResponse.json({ teamInfo: null, squad: [], coach: null, fixtures: [] })
    }

    const data = await buildTeamData(foundTeam.id)
    if (data.teamInfo) {
      await storeCache(foundTeam.id, (data.teamInfo as { team: { name: string } }).team.name, data)
    }
    return NextResponse.json(data)
  } catch (err) {
    console.error('Team data error:', err)
    return NextResponse.json({ error: 'Failed to fetch team data' }, { status: 500 })
  }
}
