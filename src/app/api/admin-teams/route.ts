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
    .select('team_name,fd_loaded,coach_name,coach_nationality,cached_at,af_cached_at')

  const cacheByName = new Map<string, { fd_loaded: boolean; coach_name: string | null; coach_nationality: string | null; cached_at: string; af_cached_at: string | null }>()
  for (const row of (cacheRows || [])) {
    cacheByName.set(row.team_name.toLowerCase(), {
      fd_loaded:        row.fd_loaded,
      coach_name:       row.coach_name,
      coach_nationality: row.coach_nationality,
      cached_at:        row.cached_at,
      af_cached_at:     row.af_cached_at ?? null,
    })
  }

  const { data: statsRows } = await supabaseAdmin
    .from('player_cache_stats')
    .select('team_name,total,numbers,photos,clubs')

  const playerStats = new Map<string, { total: number; numbers: number; photos: number; clubs: number }>()
  for (const s of (statsRows || [])) {
    playerStats.set(s.team_name.toLowerCase(), {
      total:   Number(s.total),
      numbers: Number(s.numbers),
      photos:  Number(s.photos),
      clubs:   Number(s.clubs),
    })
  }

  const teams = teamNames.map(name => {
    const c  = cacheByName.get(name.toLowerCase())
    const ps = playerStats.get(name.toLowerCase()) || { total: 0, numbers: 0, photos: 0, clubs: 0 }
    return {
      name,
      flag:              teamMap.get(name) || '',
      fd_loaded:         c?.fd_loaded         || false,
      coach_name:        c?.coach_name        || null,
      coach_nationality: c?.coach_nationality || null,
      cached_at:         c?.cached_at         || null,
      af_cached_at:      c?.af_cached_at      || null,
      player_count:      ps.total,
      number_count:      ps.numbers,
      photo_count:       ps.photos,
      club_count:        ps.clubs,
    }
  })

  return NextResponse.json({ teams })
}

// ── POST — load_fd | enrich_af ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as { password?: string; action?: string; team_name?: string; steps?: string }

  if (!auth(body.password || null)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!body.team_name) return NextResponse.json({ error: 'team_name required' }, { status: 400 })

  const steps = (body.steps as 'photos' | 'clubs' | 'all') || 'all'
  if (body.action === 'load_fd')          return handleLoadFd(body.team_name)
  if (body.action === 'enrich_af')        return handleEnrichAf(body.team_name, false, steps)
  if (body.action === 'force_enrich_af')  return handleEnrichAf(body.team_name, true,  steps)
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ── Shared name-normaliser (used by both photo enrichment and number fallback) ──

function normName(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

// ── Resolve AF team ID from schedule name (WC list → search fallback) ────────

async function resolveAfTeamId(scheduleName: string): Promise<number | null> {
  const norm    = scheduleName.toLowerCase().trim()
  const aliased = NAME_ALIASES[norm] || norm

  let wcTeams: Array<{ team: { id: number; name: string; national?: boolean } }> = []
  try {
    const d = await afFetch('teams', { league: '1', season: '2026' })
    wcTeams = d.response || []
  } catch { /* season not available */ }
  if (wcTeams.length === 0) {
    const d = await afFetch('teams', { league: '1', season: '2022' })
    wcTeams = d.response || []
  }

  let found = wcTeams.find(t => {
    const n = t.team.name.toLowerCase()
    return n === aliased || n === norm
  })
  if (found) return found.team.id

  const searchTerm = aliased.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const sd = await afFetch('teams', { search: searchTerm })
  const candidates = (sd.response || []) as typeof wcTeams
  let pool = candidates.filter(t => t.team.national === true && !YOUTH_RE.test(t.team.name))
  if (pool.length === 0) pool = candidates.filter(t => !YOUTH_RE.test(t.team.name))
  found = pool.find(t => {
    const n = t.team.name.toLowerCase()
    return n === aliased || n === norm
  }) || pool[0]
  return found?.team.id ?? null
}

// ── Match FD player list against AF squad by name (4 strategies) ─────────────
// Returns a map of fd_id → AF player data for matched players.

type AfPlayerBasic = { id: number; name: string; number?: number | null; photo?: string; age?: number; position?: string }

function matchAfSquad(
  fdPlayers: Array<{ id: number; name: string }>,
  afPlayers: AfPlayerBasic[]
): Map<number, AfPlayerBasic> {
  const byExact = new Map<string, AfPlayerBasic>()
  const byNorm  = new Map<string, AfPlayerBasic>()
  const byLast  = new Map<string, AfPlayerBasic[]>()

  for (const p of afPlayers) {
    if (!p.name) continue
    const n    = normName(p.name)
    const last = n.split(' ').pop()!
    byExact.set(p.name.toLowerCase(), p)
    byNorm.set(n, p)
    if (!byLast.has(last)) byLast.set(last, [])
    byLast.get(last)!.push(p)
  }

  const result = new Map<number, AfPlayerBasic>()
  for (const player of fdPlayers) {
    const fdNorm    = normName(player.name)
    const fdLast    = fdNorm.split(' ').pop()!
    let af: AfPlayerBasic | undefined = byExact.get(player.name.toLowerCase())
    if (!af) af = byNorm.get(fdNorm)
    if (!af) {
      const hits = byLast.get(fdLast) || []
      if (hits.length === 1) af = hits[0]
    }
    if (!af) {
      const hits = byLast.get(fdLast) || []
      if (hits.length > 1) {
        const init = fdNorm.split(' ')[0][0]
        af = hits.find(c => normName(c.name).split(' ')[0] === init)
      }
    }
    if (af) result.set(player.id, af)
  }
  return result
}

// ── load_fd: fetch from football-data.org, populate team_cache + player_cache ─
// Falls back to AF for shirt numbers when FD doesn't provide them (common on
// the free tier pre-tournament — FD often omits shirtNumber until post-kickoff).

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
    const rows = fdData.squad.map(p => {
      const base: Record<string, unknown> = {
        fd_id:     p.id,
        team_name: scheduleName,
        name:      p.name,
        age:       p.age,
        position:  p.position,
        cached_at: now,
      }
      // Only write number when FD has a real value — omitting the column on
      // conflict preserves any number already set by AF photo enrichment.
      if (p.number != null && p.number > 0) base.number = p.number
      return base
    })
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

  const numbersFromFd = fdData.squad.filter(p => p.number != null && p.number > 0).length
  let numbersFromAf   = 0

  // FD free tier often omits shirtNumber entirely — fall back to AF automatically.
  // Cost: ~3 AF calls (WC list + squads). Only runs when FD returns no numbers.
  if (numbersFromFd === 0 && AF_KEY && fdData.squad.length > 0) {
    try {
      const afTeamId = await resolveAfTeamId(scheduleName)
      if (afTeamId) {
        const squadData = await afFetch('players/squads', { team: String(afTeamId) })
        const afPlayers = (squadData.response?.[0]?.players || []) as AfPlayerBasic[]
        if (afPlayers.length > 0) {
          const matched = matchAfSquad(fdData.squad, afPlayers)
          const now = new Date().toISOString()
          const matchedEntries = Array.from(matched.entries())
          for (const [fdId, af] of matchedEntries) {
            if (af.number && af.number > 0) {
              await supabaseAdmin
                .from('player_cache')
                .update({ number: af.number, cached_at: now })
                .eq('fd_id', fdId)
              numbersFromAf++
            }
          }
        }
      }
    } catch { /* AF fallback is best-effort — don't fail the whole load */ }
  }

  return NextResponse.json({
    success:         true,
    fd_id:           fdId,
    player_count:    fdData.squad.length,
    numbers_from_fd: numbersFromFd,
    numbers_from_af: numbersFromAf,
    coach:           fdData.coach?.name || null,
  })
}

// ── enrich_af: add photos + clubs from API-Football, respects 100/day limit ──
// force=true: re-fetch and overwrite all players even if already enriched

async function handleEnrichAf(scheduleName: string, force = false, steps: 'photos' | 'clubs' | 'all' = 'all'): Promise<NextResponse> {
  if (!AF_KEY) return NextResponse.json({ error: 'API_FOOTBALL_KEY not configured' }, { status: 500 })

  const doPhotos = steps !== 'clubs'
  const doClubs  = steps !== 'photos'

  const { data: players, error } = await supabaseAdmin
    .from('player_cache')
    .select('fd_id,name,age,number,position,photo,photo_enriched,club_enriched,af_id')
    .ilike('team_name', scheduleName)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!players?.length) {
    return NextResponse.json({ error: 'No players found — load FD data first' }, { status: 404 })
  }

  let photosAdded   = 0
  let afRateLimited = false
  let afTeamFound: string | null = null
  let afPlayersFound = 0
  let photoError: string | null = null

  // Delta: process players with missing photos even if previously marked photo_enriched
  const needsPhotos = doPhotos && (force || players.some(p => !p.photo_enriched || !p.photo))

  // Check if coach photo needs fetching
  const { data: teamRow } = await supabaseAdmin
    .from('team_cache')
    .select('data')
    .ilike('team_name', scheduleName)
    .single()
  const needsCoachPhoto = doPhotos && (force || !!(teamRow?.data?.coach && !(teamRow.data.coach as Record<string, unknown>).photo))

  // ── Step 1: Photo enrichment ───────────────────────────────────────────────
  if (needsPhotos || needsCoachPhoto) {
    try {
      const norm    = scheduleName.toLowerCase().trim()
      const aliased = NAME_ALIASES[norm] || norm

      const afTeamId = await resolveAfTeamId(scheduleName)

      if (!afTeamId) {
        photoError = `No AF team found for "${scheduleName}" (tried WC list + search for "${aliased}")`
      } else {
        // Resolve the display name from the WC list for messaging
        afTeamFound = scheduleName

        // ── 1a: Player photos ────────────────────────────────────────────────
        if (needsPhotos) {
          const squadData = await afFetch('players/squads', { team: String(afTeamId) })
          const afPlayers = (squadData.response?.[0]?.players || []) as AfPlayerBasic[]
          afPlayersFound = afPlayers.length

          if (afPlayers.length === 0) {
            photoError = `AF returned 0 players for "${scheduleName}" (team id ${afTeamId})`
          } else {
            const matched = matchAfSquad(
              players.map(p => ({ id: p.fd_id, name: p.name })),
              afPlayers
            )
            const now = new Date().toISOString()
            const upserts = players.map(player => {
              const af = matched.get(player.fd_id)
              // Force mode overwrites existing photo; delta only fills empty ones
              const newPhoto = force
                ? (af?.photo || player.photo || '')
                : (af?.photo && !player.photo ? af.photo : player.photo || '')
              if (newPhoto && !player.photo) photosAdded++
              return {
                fd_id:          player.fd_id,
                team_name:      scheduleName,
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

        // ── 1b: Coach photo (FD never provides this; fetch from AF) ──────────
        if (needsCoachPhoto && !afRateLimited && teamRow?.data?.coach) {
          try {
            const coachData = await afFetch('coaches', { team: String(afTeamId) })
            const coachPhoto = coachData.response?.[0]?.photo as string | undefined
            if (coachPhoto) {
              const currentData = (teamRow.data ?? {}) as Record<string, unknown>
              const currentCoach = (currentData.coach ?? {}) as Record<string, unknown>
              await supabaseAdmin
                .from('team_cache')
                .update({ data: { ...currentData, coach: { ...currentCoach, photo: coachPhoto } } })
                .ilike('team_name', scheduleName)
            }
          } catch { /* coach photo is best-effort */ }
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
  // Force mode re-fetches clubs even for already-enriched players
  let clubsAdded = 0
  if (!afRateLimited && doClubs) {
    const { data: unenriched } = force
      ? await supabaseAdmin
          .from('player_cache')
          .select('fd_id,af_id')
          .ilike('team_name', scheduleName)
          .not('af_id', 'is', null)
      : await supabaseAdmin
          .from('player_cache')
          .select('fd_id,af_id')
          .ilike('team_name', scheduleName)
          .eq('club_enriched', false)
          .not('af_id', 'is', null)

    const natLower = scheduleName.toLowerCase()
    // AF player stats use the full official name (e.g. "United States") not the schedule name ("USA").
    // Build an exclusion set so the national team is never picked as a player's club.
    const natAliasLower = NAME_ALIASES[natLower] // e.g. "usa" → "united states"
    const isNatTeam = (name: string) => {
      const n = name.toLowerCase()
      return n === natLower || (!!natAliasLower && n === natAliasLower)
    }

    for (const player of (unenriched || [])) {
      if (!player.af_id) continue
      try {
        // Try the most recent completed club season first, fall back one year
        let stats: Array<{ team?: { name: string; logo?: string } }> = []
        for (const season of ['2025', '2024']) {
          const data = await afFetch('players', { id: String(player.af_id), season })
          stats = (data.response?.[0]?.statistics || []) as typeof stats
          if (stats.length > 0) break
        }
        const club = stats.find(s => s.team?.name && !isNatTeam(s.team.name))
        if (club?.team?.name) {
          // Found a club — always write it
          await supabaseAdmin
            .from('player_cache')
            .update({ club_name: club.team.name, club_logo: club.team.logo || null, club_enriched: true })
            .eq('fd_id', player.fd_id)
          clubsAdded++
        } else if (!force) {
          // Delta mode: mark done even when no club found (e.g. stats not yet available)
          await supabaseAdmin
            .from('player_cache')
            .update({ club_name: null, club_logo: null, club_enriched: true })
            .eq('fd_id', player.fd_id)
        }
        // Force mode + no club found: leave existing data intact
      } catch (e) {
        if ((e as Error).message === 'AF_RATE_LIMIT') {
          afRateLimited = true
          break
        }
      }
    }
  }

  // Record the AF enrichment date separately from the FD load date
  await supabaseAdmin
    .from('team_cache')
    .update({ af_cached_at: new Date().toISOString() })
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
