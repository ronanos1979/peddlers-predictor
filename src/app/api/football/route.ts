import { NextRequest, NextResponse } from 'next/server'
import {
  FdRateLimitError,
  getFdStandings,
  getFdFixtures,
  getFdScorers,
  getFdTeamsList,
} from '@/lib/footballData'

const AF_KEY  = process.env.API_FOOTBALL_KEY
const FD_KEY  = process.env.FOOTBALL_DATA_API_KEY
const AF_BASE = 'https://v3.football.api-sports.io'
const LEAGUE  = '1'
const SEASON  = '2026'

// 5-minute in-memory cache (shared across both sources — caches the adapted response)
const cache = new Map<string, { data: unknown; expires: number }>()
const CACHE_TTL = 5 * 60 * 1000

function getCached(key: string) {
  const hit = cache.get(key)
  return hit && Date.now() < hit.expires ? hit.data : null
}
function setCached(key: string, data: unknown) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL })
}

// ── API-Football (fallback) ───────────────────────────────────────────────────

async function afFetch(endpoint: string, params: Record<string, string> = {}) {
  if (!AF_KEY) throw new Error('API_FOOTBALL_KEY not configured')
  const url = new URL(`${AF_BASE}/${endpoint}`)
  url.searchParams.set('league', LEAGUE)
  url.searchParams.set('season', SEASON)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { headers: { 'x-apisports-key': AF_KEY } })
  const data = await res.json()
  if (data?.errors?.requests) throw new Error('API-Football rate limit reached')
  return data
}

// Returns true when an API-Football-style response has usable content
function afHasData(data: unknown): boolean {
  const d = data as { response?: unknown[] } | null
  return Array.isArray(d?.response) && d!.response!.length > 0
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const endpoint = req.nextUrl.searchParams.get('endpoint') || ''
  const team     = req.nextUrl.searchParams.get('team') || ''
  const status   = req.nextUrl.searchParams.get('status') || ''
  const round    = req.nextUrl.searchParams.get('round') || ''

  const cacheKey = `${endpoint}:${team}:${status}:${round}`
  const cached = getCached(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    switch (endpoint) {

      case 'standings': {
        // FD primary
        if (FD_KEY) {
          try {
            const data = await getFdStandings()
            if (afHasData(data)) { setCached(cacheKey, data); return NextResponse.json(data) }
          } catch (e) { if (!(e instanceof FdRateLimitError)) console.error('FD standings error:', e) }
        }
        // AF fallback
        if (AF_KEY) {
          const data = await afFetch('standings')
          setCached(cacheKey, data)
          return NextResponse.json(data)
        }
        return NextResponse.json({ response: [] })
      }

      case 'fixtures': {
        const opts = { status: status || undefined, team: team || undefined }
        // FD primary
        if (FD_KEY) {
          try {
            const data = await getFdFixtures(opts)
            if (afHasData(data)) { setCached(cacheKey, data); return NextResponse.json(data) }
          } catch (e) { if (!(e instanceof FdRateLimitError)) console.error('FD fixtures error:', e) }
        }
        // AF fallback
        if (AF_KEY) {
          const params: Record<string, string> = {}
          if (team)   params.team   = team
          if (round)  params.round  = round
          if (status) params.status = status
          const data = await afFetch('fixtures', params)
          setCached(cacheKey, data)
          return NextResponse.json(data)
        }
        return NextResponse.json({ response: [] })
      }

      case 'players/topscorers': {
        // FD primary
        if (FD_KEY) {
          try {
            const data = await getFdScorers()
            if (afHasData(data)) { setCached(cacheKey, data); return NextResponse.json(data) }
          } catch (e) { if (!(e instanceof FdRateLimitError)) console.error('FD scorers error:', e) }
        }
        // AF fallback
        if (AF_KEY) {
          const data = await afFetch('players/topscorers')
          setCached(cacheKey, data)
          return NextResponse.json(data)
        }
        return NextResponse.json({ response: [] })
      }

      case 'teams': {
        if (team) {
          // Single-team lookup — AF only (FD free tier doesn't expose this)
          if (AF_KEY) {
            const res = await fetch(`${AF_BASE}/teams?id=${team}`, { headers: { 'x-apisports-key': AF_KEY } })
            const data = await res.json()
            setCached(cacheKey, data)
            return NextResponse.json(data)
          }
          return NextResponse.json({ response: [] })
        }
        // Full WC team list — FD only.
        // AF IDs are incompatible with the FD IDs stored in team_cache, so we never
        // fall back to AF here. If FD returns empty the team picker falls through to
        // the Supabase matches fallback, which uses schedule names that always match.
        if (FD_KEY) {
          try {
            const data = await getFdTeamsList()
            if (afHasData(data)) { setCached(cacheKey, data); return NextResponse.json(data) }
          } catch (e) { if (!(e instanceof FdRateLimitError)) console.error('FD teams error:', e) }
        }
        return NextResponse.json({ response: [] })
      }

      // These endpoints are AF-only (no FD equivalent needed)
      case 'fixtures/rounds': {
        if (!AF_KEY) return NextResponse.json({ response: [] })
        const data = await afFetch('fixtures/rounds')
        setCached(cacheKey, data)
        return NextResponse.json(data)
      }

      case 'players/squads': {
        if (!AF_KEY) return NextResponse.json({ response: [] })
        const res = await fetch(`${AF_BASE}/players/squads?team=${team}`, { headers: { 'x-apisports-key': AF_KEY } })
        const data = await res.json()
        return NextResponse.json(data)
      }

      case 'players': {
        if (!AF_KEY) return NextResponse.json({ response: [] })
        const params: Record<string, string> = {}
        if (team) params.team = team
        const data = await afFetch('players', params)
        setCached(cacheKey, data)
        return NextResponse.json(data)
      }

      case 'coaches': {
        if (!AF_KEY) return NextResponse.json({ response: [] })
        const res = await fetch(`${AF_BASE}/coachs?team=${team}`, { headers: { 'x-apisports-key': AF_KEY } })
        const data = await res.json()
        return NextResponse.json(data)
      }

      default:
        return NextResponse.json({ error: 'Unknown endpoint' }, { status: 400 })
    }
  } catch (err) {
    console.error('Football API error:', err)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}
