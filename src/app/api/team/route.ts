import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  NAME_ALIASES,
  YOUTH_RE,
  resolveFromWcList,
  resolveFromSearch,
  toLocalScheduleName,
  isBadCacheEntry,
} from '@/lib/teamResolution'
import {
  FdRateLimitError,
  resolveFdTeamId,
  buildFdTeamData,
  type FdTeamData,
} from '@/lib/footballData'

const AF_KEY = process.env.API_FOOTBALL_KEY
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY
const AF_BASE = 'https://v3.football.api-sports.io'
const LEAGUE  = '1'
const SEASON  = '2026'

// Player/team name data changes rarely — 60-day cache reduces API calls.
const CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1000

// ── API-Football (fallback + photo source) ────────────────────────────────────

type SquadPlayer = {
  id: number; name: string; age: number; number: number
  position: string; photo: string; club?: { name: string; logo?: string }
}
type PlayerProfile = {
  player: { id: number }
  statistics?: Array<{ team?: { name?: string; logo?: string } }>
}

class AfRateLimitError extends Error {
  constructor() {
    super('API-Football daily limit reached')
    this.name = 'AfRateLimitError'
    Object.setPrototypeOf(this, AfRateLimitError.prototype)
  }
}

async function afFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${AF_BASE}/${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': AF_KEY! },
    cache: 'no-store',
  })
  const data = await res.json()
  if (data?.errors?.requests) throw new AfRateLimitError()
  return data
}

async function buildAfTeamData(teamId: number) {
  const [teamData, squadData, playerData, coachData, fixturesData] = await Promise.all([
    afFetch('teams',          { id: String(teamId) }),
    afFetch('players/squads', { team: String(teamId) }),
    afFetch('players',        { team: String(teamId), league: LEAGUE, season: SEASON }),
    afFetch('coachs',         { team: String(teamId) }),
    afFetch('fixtures',       { team: String(teamId), league: LEAGUE, season: SEASON }),
  ])

  const teamInfo = teamData.response?.[0] || null
  const rawPlayers: SquadPlayer[] = squadData.response?.[0]?.players || []

  const profiles = new Map<number, PlayerProfile>()
  ;((playerData.response || []) as PlayerProfile[]).forEach(p => profiles.set(p.player.id, p))

  const nationalName = (teamInfo as { team?: { name?: string } } | null)?.team?.name
  const squad: SquadPlayer[] = rawPlayers.map(player => {
    const club = profiles.get(player.id)?.statistics?.find(s => s.team?.name)?.team
    if (club?.name && club.name !== nationalName) {
      return { ...player, club: { name: club.name, logo: club.logo } }
    }
    return { ...player }
  })

  const coach = coachData.response?.[0] || null
  const fixtures = [...((fixturesData.response || []) as Array<{ fixture: { date: string } }>)].sort(
    (a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime()
  )
  return { teamInfo, squad, coach, fixtures }
}

async function afResolveNameToId(name: string): Promise<number | null> {
  const norm    = name.toLowerCase().trim()
  const aliased = NAME_ALIASES[norm] || norm

  const wcTeamsData = await afFetch('teams', { league: LEAGUE, season: SEASON })
  const fromList = resolveFromWcList(name, wcTeamsData.response || [])
  if (fromList) return fromList

  if (aliased !== norm) {
    const aliasData = await afFetch('teams', { search: aliased })
    const fromAlias = resolveFromSearch(name, aliasData.response || [])
    if (fromAlias) return fromAlias
  }

  const origData = await afFetch('teams', { search: norm })
  return resolveFromSearch(name, origData.response || [])
}

// ── Photo enrichment ──────────────────────────────────────────────────────────
// FD free tier has no player photos. We supplement with AF's photo URLs using
// two AF calls (name search + squad). Photo URLs are stored in Supabase alongside
// squad data — no external calls on subsequent page loads, just cached URL strings.

type PhotoPlayer = { name: string; photo: string }

async function tryEnrichWithPhotos(squad: PhotoPlayer[], teamName: string): Promise<boolean> {
  if (!AF_KEY || squad.length === 0) return false
  try {
    const norm    = teamName.toLowerCase().trim()
    const aliased = NAME_ALIASES[norm] || norm

    // 1 AF call: find the AF senior national team ID
    const searchData = await afFetch('teams', { search: aliased })
    const candidates = (searchData.response || []) as Array<{ team: { id: number; name: string; national?: boolean } }>
    const seniors = candidates.filter(t => t.team.national === true && !YOUTH_RE.test(t.team.name))
    const afTeam = seniors.find(t => {
      const n = t.team.name.toLowerCase()
      return n === aliased || n === norm
    }) || seniors[0]
    if (!afTeam) return true  // searched but not found — mark attempted

    // 1 AF call: get squad with photo URLs
    const squadData = await afFetch('players/squads', { team: String(afTeam.team.id) })
    const afPhotos = new Map<string, string>()
    ;((squadData.response?.[0]?.players || []) as Array<{ name: string; photo: string }>)
      .forEach(p => { if (p.name && p.photo) afPhotos.set(p.name.toLowerCase(), p.photo) })

    // Match by player name and assign AF photo URL
    squad.forEach(player => {
      if (!player.photo) {
        const photo = afPhotos.get(player.name.toLowerCase())
        if (photo) player.photo = photo
      }
    })
    return true
  } catch (e) {
    return !(e instanceof AfRateLimitError)  // retry next time if rate-limited
  }
}

// ── Supabase cache ────────────────────────────────────────────────────────────

type CachedTeamData = (FdTeamData | Awaited<ReturnType<typeof buildAfTeamData>>) & { photosEnriched?: boolean }

async function storeCache(teamId: number, teamName: string, data: CachedTeamData) {
  await supabaseAdmin.from('team_cache').upsert(
    { team_id: teamId, team_name: teamName, data, cached_at: new Date().toISOString() },
    { onConflict: 'team_id' }
  )
}

function validCacheData(cached: { data: unknown; team_name?: string } | null): unknown | null {
  if (!cached?.data) return null
  const name = (cached as { team_name?: string }).team_name || ''
  if (isBadCacheEntry(name)) return null
  return cached.data
}

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

// On cache reads: if squad exists but has no photos and enrichment hasn't been
// attempted yet, enrich with AF photos and update the cache row.
async function maybeEnrichCachedPhotos(apiData: CachedTeamData, teamId: number, teamName: string): Promise<void> {
  const data = apiData as { squad?: PhotoPlayer[]; photosEnriched?: boolean }
  const squad = data.squad || []
  if (squad.length === 0 || data.photosEnriched) return
  const allEmpty = squad.every(p => !p.photo)
  if (!allEmpty) { data.photosEnriched = true; return }  // already has photos
  const enriched = await tryEnrichWithPhotos(squad, teamName)
  if (enriched) {
    data.photosEnriched = true
    await storeCache(teamId, teamName, apiData).catch(() => {})  // best-effort
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const hasAf = !!AF_KEY
  const hasFd = !!FD_KEY

  if (!hasAf && !hasFd) {
    return NextResponse.json({ error: 'No football API key configured' }, { status: 500 })
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

      // 1. Supabase cache hit
      const { data: cached } = await supabaseAdmin
        .from('team_cache')
        .select('data, team_name')
        .eq('team_id', teamId)
        .gt('cached_at', cutoff)
        .maybeSingle()

      if (validCacheData(cached)) {
        const apiData = cached!.data as CachedTeamData
        const teamName = (apiData as { teamInfo?: { team?: { name?: string } } }).teamInfo?.team?.name || (cached!.team_name as string) || ''
        await maybeEnrichCachedPhotos(apiData, teamId, teamName)
        const localTeamName = toLocalScheduleName(null, teamName)
        const localSchedule = await fetchLocalSchedule(localTeamName)
        return NextResponse.json({ ...apiData, localSchedule, localTeamName })
      }

      // 2. Try FD first (primary)
      if (hasFd) {
        try {
          const fdData = await buildFdTeamData(teamId)
          if (fdData?.teamInfo) {
            const enriched = await tryEnrichWithPhotos(fdData.squad, fdData.teamInfo.team.name)
            const cacheData: CachedTeamData = Object.assign(fdData, { photosEnriched: enriched })
            await storeCache(teamId, fdData.teamInfo.team.name, cacheData)
            const localTeamName = toLocalScheduleName(null, fdData.teamInfo.team.name)
            const localSchedule = await fetchLocalSchedule(localTeamName)
            return NextResponse.json({ ...cacheData, localSchedule, localTeamName })
          }
        } catch (e) {
          if (e instanceof FdRateLimitError) console.warn('FD rate limited for id lookup, trying AF')
          else console.error('FD team fetch error (id):', e)
        }
      }

      // 3. AF fallback (already has photos from players/squads)
      if (hasAf) {
        const afData = await buildAfTeamData(teamId)
        const ti = (afData as { teamInfo: { team: { name: string } } | null }).teamInfo
        const cacheData: CachedTeamData = Object.assign(afData, { photosEnriched: true })
        if (ti) await storeCache(teamId, ti.team.name, cacheData)
        const localTeamName = toLocalScheduleName(null, ti?.team?.name || '')
        const localSchedule = await fetchLocalSchedule(localTeamName)
        return NextResponse.json({ ...cacheData, localSchedule, localTeamName })
      }

      return NextResponse.json({ teamInfo: null, squad: [], coach: null, fixtures: [], localSchedule: [], localTeamName: '' })
    }

    // ── Name-based ────────────────────────────────────────────────────────────

    // 1. Supabase cache hit by name
    const { data: cachedByName } = await supabaseAdmin
      .from('team_cache')
      .select('data, team_name')
      .ilike('team_name', name!)
      .gt('cached_at', cutoff)
      .maybeSingle()

    if (validCacheData(cachedByName)) {
      const apiData = cachedByName!.data as CachedTeamData
      const teamName = (apiData as { teamInfo?: { team?: { name?: string } } }).teamInfo?.team?.name || (cachedByName!.team_name as string) || ''
      const teamId   = (apiData as { teamInfo?: { team?: { id?: number } } }).teamInfo?.team?.id || 0
      await maybeEnrichCachedPhotos(apiData, teamId, teamName)
      const localSchedule = await fetchLocalSchedule(name!)
      return NextResponse.json({ ...apiData, localSchedule, localTeamName: name! })
    }

    // 2. Try FD primary: resolve name → FD ID → team profile
    if (hasFd) {
      try {
        const fdId = await resolveFdTeamId(name!)
        if (fdId) {
          // Cache check by resolved FD ID
          const { data: cachedByFdId } = await supabaseAdmin
            .from('team_cache')
            .select('data, team_name')
            .eq('team_id', fdId)
            .gt('cached_at', cutoff)
            .maybeSingle()

          if (validCacheData(cachedByFdId)) {
            const apiData = cachedByFdId!.data as CachedTeamData
            const teamName = (cachedByFdId!.team_name as string) || name!
            await maybeEnrichCachedPhotos(apiData, fdId, teamName)
            const localSchedule = await fetchLocalSchedule(name!)
            return NextResponse.json({ ...apiData, localSchedule, localTeamName: name! })
          }

          const fdData = await buildFdTeamData(fdId)
          if (fdData?.teamInfo) {
            const enriched = await tryEnrichWithPhotos(fdData.squad, fdData.teamInfo.team.name)
            const cacheData: CachedTeamData = Object.assign(fdData, { photosEnriched: enriched })
            await storeCache(fdId, fdData.teamInfo.team.name, cacheData)
            const localSchedule = await fetchLocalSchedule(name!)
            return NextResponse.json({ ...cacheData, localSchedule, localTeamName: name! })
          }
        }
      } catch (e) {
        if (e instanceof FdRateLimitError) console.warn('FD rate limited for name lookup, trying AF')
        else console.error('FD team fetch error (name):', e)
      }
    }

    // 3. AF fallback: resolve name → AF ID → team profile
    if (hasAf) {
      const afId = await afResolveNameToId(name!)
      if (!afId) {
        const localSchedule = await fetchLocalSchedule(name!)
        return NextResponse.json({ teamInfo: null, squad: [], coach: null, fixtures: [], localSchedule, localTeamName: name! })
      }

      const { data: cachedByAfId } = await supabaseAdmin
        .from('team_cache')
        .select('data, team_name')
        .eq('team_id', afId)
        .gt('cached_at', cutoff)
        .maybeSingle()

      if (validCacheData(cachedByAfId)) {
        const apiData = cachedByAfId!.data as CachedTeamData
        await maybeEnrichCachedPhotos(apiData, afId, cachedByAfId!.team_name as string || name!)
        const localSchedule = await fetchLocalSchedule(name!)
        return NextResponse.json({ ...apiData, localSchedule, localTeamName: name! })
      }

      const afData = await buildAfTeamData(afId)
      const ti = (afData as { teamInfo: { team: { name: string } } | null }).teamInfo
      const cacheData: CachedTeamData = Object.assign(afData, { photosEnriched: true })
      if (ti) await storeCache(afId, ti.team.name, cacheData)

      const localSchedule = await fetchLocalSchedule(name!)
      return NextResponse.json({ ...cacheData, localSchedule, localTeamName: name! })
    }

    // Both APIs exhausted
    const localSchedule = await fetchLocalSchedule(name!)
    return NextResponse.json({ teamInfo: null, squad: [], coach: null, fixtures: [], localSchedule, localTeamName: name! })

  } catch (err) {
    const isRateLimit = err instanceof AfRateLimitError || err instanceof FdRateLimitError
    if (isRateLimit) {
      const localSchedule = await fetchLocalSchedule(name || '').catch(() => [])
      return NextResponse.json({
        error: 'rate_limited',
        teamInfo: null, squad: [], coach: null, fixtures: [],
        localSchedule, localTeamName: name || '',
      })
    }
    console.error('Team data error:', err)
    return NextResponse.json({ error: 'Failed to fetch team data' }, { status: 500 })
  }
}
