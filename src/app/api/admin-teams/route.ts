import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveFdTeamId, buildFdTeamData } from '@/lib/footballData'
import { NAME_ALIASES, YOUTH_RE } from '@/lib/teamResolution'

const AF_KEY       = process.env.API_FOOTBALL_KEY
const AF_BASE      = 'https://v3.football.api-sports.io'
const ADMIN_PW     = process.env.ADMIN_PASSWORD

// Matches placeholder team names in knockout rounds
const PLACEHOLDER_RE = /TBD|Winner|Runner|Place|R32 |QF[0-9]|SF[0-9]|Group [A-L] /

function auth(pw: string | null): boolean {
  return !!ADMIN_PW && pw === ADMIN_PW
}

async function afFetch(path: string, params: Record<string, string> = {}) {
  if (!AF_KEY) throw new Error('NO_AF_KEY')
  const url = new URL(`${AF_BASE}/${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': AF_KEY },
    cache: 'no-store',
  })
  const data = await res.json()
  if (data?.errors?.requests) throw new Error('AF_RATE_LIMIT')
  if (data?.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`AF_ERROR: ${JSON.stringify(data.errors)}`)
  }
  return data
}

// ── GET — list all 48 teams with cache status ─────────────────────────────────

export async function GET(req: NextRequest) {
  const pw = req.nextUrl.searchParams.get('password')
  if (!auth(pw)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: matches } = await supabaseAdmin
    .from('matches')
    .select('home_team,home_flag,away_team,away_flag')
    .neq('stage', 'Demo Match')

  const teamMap = new Map<string, string>()
  for (const m of (matches || [])) {
    if (m.home_team && !PLACEHOLDER_RE.test(m.home_team)) teamMap.set(m.home_team, m.home_flag)
    if (m.away_team && !PLACEHOLDER_RE.test(m.away_team)) teamMap.set(m.away_team, m.away_flag)
  }
  const teamNames = Array.from(teamMap.keys()).sort()

  const { data: cacheRows } = await supabaseAdmin
    .from('team_cache')
    .select('team_name,fd_loaded,coach_name,coach_nationality,cached_at')

  const cacheByName = new Map<string, { fd_loaded: boolean; coach_name: string | null; coach_nationality: string | null; cached_at: string }>()
  for (const row of (cacheRows || [])) {
    cacheByName.set(row.team_name.toLowerCase(), {
      fd_loaded:        row.fd_loaded,
      coach_name:       row.coach_name,
      coach_nationality: row.coach_nationality,
      cached_at:        row.cached_at,
    })
  }

  const { data: statsRows } = await supabaseAdmin
    .from('player_cache_stats')
    .select('team_name,total,photos,clubs')

  const playerStats = new Map<string, { total: number; photos: number; clubs: number }>()
  for (const s of (statsRows || [])) {
    playerStats.set(s.team_name.toLowerCase(), {
      total:  Number(s.total),
      photos: Number(s.photos),
      clubs:  Number(s.clubs),
    })
  }

  const teams = teamNames.map(name => {
    const c  = cacheByName.get(name.toLowerCase())
    const ps = playerStats.get(name.toLowerCase()) || { total: 0, photos: 0, clubs: 0 }
    return {
      name,
      flag:              teamMap.get(name) || '',
      fd_loaded:         c?.fd_loaded         || false,
      coach_name:        c?.coach_name        || null,
      coach_nationality: c?.coach_nationality || null,
      cached_at:         c?.cached_at         || null,
      player_count:      ps.total,
      photo_count:       ps.photos,
      club_count:        ps.clubs,
    }
  })

  return NextResponse.json({ teams })
}

// ── POST — load_fd | enrich_af ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as { password?: string; action?: string; team_name?: string }

  if (!auth(body.password || null)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!body.team_name) return NextResponse.json({ error: 'team_name required' }, { status: 400 })

  if (body.action === 'load_fd')    return handleLoadFd(body.team_name)
  if (body.action === 'enrich_af') return handleEnrichAf(body.team_name)
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ── load_fd: fetch from football-data.org, populate team_cache + player_cache ─

async function handleLoadFd(scheduleName: string): Promise<NextResponse> {
  let fdId: number | null
  try {
    fdId = await resolveFdTeamId(scheduleName)
  } catch (e) {
    return NextResponse.json({ error: `FD resolve failed: ${(e as Error).message}` }, { status: 502 })
  }
  if (!fdId) {
    return NextResponse.json({ error: `Cannot resolve "${scheduleName}" to a football-data.org team ID` }, { status: 404 })
  }

  let fdData
  try {
    fdData = await buildFdTeamData(fdId)
  } catch (e) {
    return NextResponse.json({ error: `FD fetch failed: ${(e as Error).message}` }, { status: 502 })
  }
  if (!fdData?.teamInfo) {
    return NextResponse.json({ error: 'FD returned no team data' }, { status: 502 })
  }

  // Upsert team_cache — schedule name as team_name for direct ilike lookups
  // Squad is NOT stored in the data blob — it lives in player_cache
  const { error: teamUpsertError } = await supabaseAdmin.from('team_cache').upsert({
    team_id:           fdId,
    team_name:         scheduleName,
    data:              { teamInfo: fdData.teamInfo, coach: fdData.coach, fixtures: fdData.fixtures },
    fd_loaded:         true,
    coach_name:        fdData.coach?.name        || null,
    coach_nationality: fdData.coach?.nationality || null,
    cached_at:         new Date().toISOString(),
  }, { onConflict: 'team_id' })

  if (teamUpsertError) {
    console.error('team_cache upsert failed:', teamUpsertError)
    return NextResponse.json({ error: `DB write failed (team_cache): ${teamUpsertError.message}` }, { status: 500 })
  }

  // Upsert each player — only structural fields; photo/club columns not in payload
  // so ON CONFLICT DO UPDATE preserves any existing enrichment data
  if (fdData.squad.length > 0) {
    const now = new Date().toISOString()
    const rows = fdData.squad.map(p => ({
      fd_id:     p.id,
      team_name: scheduleName,
      name:      p.name,
      age:       p.age,
      number:    p.number,
      position:  p.position,
      cached_at: now,
    }))
    for (let i = 0; i < rows.length; i += 50) {
      const { error: playerUpsertError } = await supabaseAdmin
        .from('player_cache')
        .upsert(rows.slice(i, i + 50), { onConflict: 'fd_id' })
      if (playerUpsertError) {
        console.error('player_cache upsert failed:', playerUpsertError)
        return NextResponse.json({ error: `DB write failed (player_cache): ${playerUpsertError.message}` }, { status: 500 })
      }
    }
  }

  return NextResponse.json({
    success:      true,
    fd_id:        fdId,
    player_count: fdData.squad.length,
    coach:        fdData.coach?.name || null,
  })
}

// ── enrich_af: add photos + clubs from API-Football, respects 100/day limit ──

async function handleEnrichAf(scheduleName: string): Promise<NextResponse> {
  if (!AF_KEY) return NextResponse.json({ error: 'API_FOOTBALL_KEY not configured' }, { status: 500 })

  const { data: players, error } = await supabaseAdmin
    .from('player_cache')
    .select('fd_id,name,age,number,position,photo,photo_enriched,club_enriched,af_id')
    .ilike('team_name', scheduleName)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!players?.length) {
    return NextResponse.json({ error: 'No players found — load FD data first' }, { status: 404 })
  }

  let photosAdded  = 0
  let afRateLimited = false
  let afTeamFound: string | null = null
  let afPlayersFound = 0
  let photoError: string | null = null

  // ── Step 1: Photo enrichment — 2 AF calls total ────────────────────────────
  const needsPhotos = players.some(p => !p.photo_enriched)
  if (needsPhotos) {
    try {
      const norm    = scheduleName.toLowerCase().trim()
      const aliased = NAME_ALIASES[norm] || norm

      // Try WC 2026 first (most accurate for current tournament squads + photos).
      // Fall back to WC 2022 if 2026 data is unavailable on the current API plan.
      // Team IDs are stable across tournaments so either season works for squad lookups.
      let wcTeams: Array<{ team: { id: number; name: string } }> = []
      try {
        const wcData2026 = await afFetch('teams', { league: '1', season: '2026' })
        wcTeams = (wcData2026.response || []) as Array<{ team: { id: number; name: string } }>
      } catch {
        // season=2026 not available on this API plan
      }
      if (wcTeams.length === 0) {
        const wcData2022 = await afFetch('teams', { league: '1', season: '2022' })
        wcTeams = (wcData2022.response || []) as Array<{ team: { id: number; name: string } }>
      }

      let afTeam = wcTeams.find(t => {
        const n = t.team.name.toLowerCase()
        return n === aliased || n === norm
      })

      // Fall back to name search for teams not found in either WC list
      if (!afTeam) {
        const searchData = await afFetch('teams', { search: aliased })
        const candidates = (searchData.response || []) as Array<{ team: { id: number; name: string; national?: boolean } }>
        let pool = candidates.filter(t => t.team.national === true && !YOUTH_RE.test(t.team.name))
        if (pool.length === 0) pool = candidates.filter(t => !YOUTH_RE.test(t.team.name))
        afTeam = pool.find(t => {
          const n = t.team.name.toLowerCase()
          return n === aliased || n === norm
        }) || pool[0]
      }

      if (!afTeam) {
        photoError = `No AF team found for "${scheduleName}" (tried WC list + search for "${aliased}")`
      } else {
        afTeamFound = afTeam.team.name
        const squadData = await afFetch('players/squads', { team: String(afTeam.team.id) })
        const afPlayers = (squadData.response?.[0]?.players || []) as Array<{
          id: number; name: string; photo: string
          age?: number; number?: number; position?: string
        }>
        afPlayersFound = afPlayers.length

        if (afPlayers.length === 0) {
          photoError = `AF returned 0 players for ${afTeam.team.name} (id ${afTeam.team.id})`
        } else {
          // Build three lookup maps for progressive name matching:
          // FD and AF use different name formats, so exact match alone misses many players.
          type AfPlayer = { id: number; photo: string; name: string; age?: number; number?: number; position?: string }
          const normStr = (s: string) => s.toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
            .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

          const afByExact = new Map<string, AfPlayer>()
          const afByNorm  = new Map<string, AfPlayer>()
          const afByLast  = new Map<string, AfPlayer[]>()

          afPlayers.forEach(p => {
            if (!p.name) return
            const val: AfPlayer = { id: p.id, photo: p.photo || '', name: p.name, age: p.age, number: p.number, position: p.position }
            const norm = normStr(p.name)
            const last = norm.split(' ').pop()!
            afByExact.set(p.name.toLowerCase(), val)
            afByNorm.set(norm, val)
            if (!afByLast.has(last)) afByLast.set(last, [])
            afByLast.get(last)!.push(val)
          })

          const now = new Date().toISOString()
          const upserts = players.map(player => {
            const fdNorm = normStr(player.name)
            const fdLast = fdNorm.split(' ').pop()!
            // 1. Exact lowercase match
            let af: AfPlayer | undefined = afByExact.get(player.name.toLowerCase())
            // 2. Accent/punctuation-normalised match
            if (!af) af = afByNorm.get(fdNorm)
            // 3. Unique last-name match (handles "Timothy" vs "Tim" etc.)
            if (!af) {
              const lastMatches = afByLast.get(fdLast) || []
              if (lastMatches.length === 1) af = lastMatches[0]
            }
            const newPhoto = af?.photo && !player.photo ? af.photo : player.photo || ''
            if (newPhoto && !player.photo) photosAdded++
            return {
              fd_id:          player.fd_id,
              team_name:      scheduleName,
              // AF is more accurate for player details — use AF values when we have a confident match
              name:           af?.name     || player.name,
              age:            af?.age      ?? player.age,
              number:         af?.number   ?? player.number,
              position:       af?.position || player.position,
              photo:          newPhoto,
              photo_enriched: true,
              af_id:          af?.id || player.af_id || null,
              cached_at:      now,
            }
          })
          const { error: upsertErr } = await supabaseAdmin
            .from('player_cache')
            .upsert(upserts, { onConflict: 'fd_id' })
          if (upsertErr) {
            return NextResponse.json({ error: `DB write failed (photos): ${upsertErr.message}` }, { status: 500 })
          }
        }
      }
    } catch (e) {
      if ((e as Error).message === 'AF_RATE_LIMIT') afRateLimited = true
      else {
        const msg = (e as Error).message || String(e)
        return NextResponse.json({ error: `AF photo enrichment failed: ${msg}` }, { status: 502 })
      }
    }
  }

  // ── Step 2: Club enrichment — 1 AF call per player with af_id ─────────────
  let clubsAdded = 0
  if (!afRateLimited) {
    const { data: unenriched } = await supabaseAdmin
      .from('player_cache')
      .select('fd_id,af_id')
      .ilike('team_name', scheduleName)
      .eq('club_enriched', false)
      .not('af_id', 'is', null)

    const natLower = scheduleName.toLowerCase()

    for (const player of (unenriched || [])) {
      if (!player.af_id) continue
      try {
        const data  = await afFetch('players', { id: String(player.af_id), season: '2024' })
        const stats = (data.response?.[0]?.statistics || []) as Array<{ team?: { name: string; logo?: string } }>
        const club  = stats.find(s => s.team?.name && s.team.name.toLowerCase() !== natLower)
        await supabaseAdmin
          .from('player_cache')
          .update({
            club_name:    club?.team?.name  || null,
            club_logo:    club?.team?.logo  || null,
            club_enriched: true,
          })
          .eq('fd_id', player.fd_id)
        if (club?.team?.name) clubsAdded++
      } catch (e) {
        if ((e as Error).message === 'AF_RATE_LIMIT') {
          afRateLimited = true
          break
        }
      }
    }
  }

  // Bump team_cache.cached_at so the admin sees the AF enrichment date
  await supabaseAdmin
    .from('team_cache')
    .update({ cached_at: new Date().toISOString() })
    .ilike('team_name', scheduleName)

  return NextResponse.json({
    success:           true,
    photos_added:      photosAdded,
    clubs_added:       clubsAdded,
    rate_limited:      afRateLimited,
    af_team_found:     afTeamFound,
    af_players_found:  afPlayersFound,
    photo_error:       photoError,
  })
}
