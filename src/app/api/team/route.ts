import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  NAME_ALIASES,
  resolveFromWcList,
  resolveFromSearch,
  toLocalScheduleName,
  isBadCacheEntry,
} from '@/lib/teamResolution'

const API_KEY = process.env.API_FOOTBALL_KEY
const BASE    = 'https://v3.football.api-sports.io'
const LEAGUE  = '1'
const SEASON  = '2026'
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
    apiFetch('teams',          { id: String(teamId) }),
    apiFetch('players/squads', { team: String(teamId) }),
    apiFetch('players',        { team: String(teamId), league: LEAGUE, season: SEASON }),
    apiFetch('coachs',         { team: String(teamId) }),
    apiFetch('fixtures',       { team: String(teamId), league: LEAGUE, season: SEASON }),
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

  const coach    = coachData.response?.[0] || null
  const fixtures = [...((fixturesData.response || []) as Array<{ fixture: { date: string } }>)].sort(
    (a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime()
  )
  return { teamInfo, squad, coach, fixtures }
}

async function storeCache(
  teamId: number,
  teamName: string,
  data: Awaited<ReturnType<typeof buildTeamData>>
) {
  await supabaseAdmin.from('team_cache').upsert(
    { team_id: teamId, team_name: teamName, data, cached_at: new Date().toISOString() },
    { onConflict: 'team_id' }
  )
}

// Fetch local Supabase schedule — always fresh so results stay current.
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

// Resolve a display name to a numeric API-Football team ID.
async function resolveNameToId(name: string): Promise<number | null> {
  const norm    = name.toLowerCase().trim()
  const aliased = NAME_ALIASES[norm] || norm

  // 1. WC 2026 teams list (most reliable when available — scoped to tournament)
  const wcTeamsData = await apiFetch('teams', { league: LEAGUE, season: SEASON })
  const fromList = resolveFromWcList(name, wcTeamsData.response || [])
  if (fromList) return fromList

  // 2. Search with aliased name (e.g. "united states" for "USA").
  //    This catches cases where the API official name matches the alias.
  if (aliased !== norm) {
    const aliasData = await apiFetch('teams', { search: aliased })
    const fromAlias = resolveFromSearch(name, aliasData.response || [])
    if (fromAlias) return fromAlias
  }

  // 3. Search with the original display name (e.g. "USA").
  //    Catches cases where API-Football stores the abbreviation rather than the full name.
  //    This is the fix for USA: API-Football may register the team as "USA" not "United States".
  const origData = await apiFetch('teams', { search: norm })
  return resolveFromSearch(name, origData.response || [])
}

// Read a cache row and return null if the entry looks wrong (youth team cached by mistake).
function validCacheData(cached: { data: unknown; team_name?: string } | null): unknown | null {
  if (!cached?.data) return null
  const name = (cached as { team_name?: string }).team_name || ''
  if (isBadCacheEntry(name)) return null
  return cached.data
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
        .select('data, team_name')
        .eq('team_id', teamId)
        .gt('cached_at', cutoff)
        .maybeSingle()

      let apiData
      const validData = validCacheData(cached)
      if (validData) {
        apiData = validData
      } else {
        apiData = await buildTeamData(teamId)
        const ti = (apiData as { teamInfo: { team: { name: string } } | null }).teamInfo
        if (ti) await storeCache(teamId, ti.team.name, apiData as Awaited<ReturnType<typeof buildTeamData>>)
      }

      const localTeamName = toLocalScheduleName(null, (apiData as { teamInfo?: { team?: { name?: string } } }).teamInfo?.team?.name || '')
      const localSchedule = await fetchLocalSchedule(localTeamName)
      return NextResponse.json({ ...apiData, localSchedule, localTeamName })
    }

    // ── Name-based ────────────────────────────────────────────────────────────

    // 1. Cache hit by name (validate it's not a stale bad entry)
    const { data: cachedByName } = await supabaseAdmin
      .from('team_cache')
      .select('data, team_name')
      .ilike('team_name', name!)
      .gt('cached_at', cutoff)
      .maybeSingle()

    if (validCacheData(cachedByName)) {
      const localSchedule = await fetchLocalSchedule(name!)
      return NextResponse.json({ ...cachedByName!.data, localSchedule, localTeamName: name! })
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

    // 3. Cache hit by resolved ID (handles alias mismatches, validates entry)
    const { data: cachedById } = await supabaseAdmin
      .from('team_cache')
      .select('data, team_name')
      .eq('team_id', resolvedId)
      .gt('cached_at', cutoff)
      .maybeSingle()

    if (validCacheData(cachedById)) {
      const localSchedule = await fetchLocalSchedule(name!)
      return NextResponse.json({ ...cachedById!.data, localSchedule, localTeamName: name! })
    }

    // 4. Fresh fetch and cache
    const data = await buildTeamData(resolvedId)
    const ti   = (data as { teamInfo: { team: { name: string } } | null }).teamInfo
    if (ti) await storeCache(resolvedId, ti.team.name, data)

    const localSchedule = await fetchLocalSchedule(name!)
    return NextResponse.json({ ...data, localSchedule, localTeamName: name! })

  } catch (err) {
    console.error('Team data error:', err)
    return NextResponse.json({ error: 'Failed to fetch team data' }, { status: 500 })
  }
}
