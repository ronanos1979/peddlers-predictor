import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.API_FOOTBALL_KEY
const BASE = 'https://v3.football.api-sports.io'
const LEAGUE = '1'    // FIFA World Cup
const SEASON = '2026'

// Simple in-memory cache
const cache = new Map<string, { data: unknown; expires: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function fetchFootball(endpoint: string, params: Record<string, string> = {}) {
  const cacheKey = endpoint + JSON.stringify(params)
  const cached = cache.get(cacheKey)
  if (cached && Date.now() < cached.expires) return cached.data

  const url = new URL(`${BASE}/${endpoint}`)
  url.searchParams.set('league', LEAGUE)
  url.searchParams.set('season', SEASON)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': API_KEY || '' }
  })
  const data = await res.json()
  cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL })
  return data
}

export async function GET(req: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'API_FOOTBALL_KEY not configured' }, { status: 500 })
  }

  const endpoint = req.nextUrl.searchParams.get('endpoint') || ''
  const team = req.nextUrl.searchParams.get('team') || ''
  const round = req.nextUrl.searchParams.get('round') || ''
  const status = req.nextUrl.searchParams.get('status') || ''

  try {
    const params: Record<string, string> = {}
    if (team) params.team = team
    if (round) params.round = round
    if (status) params.status = status

    switch (endpoint) {
      case 'standings':
        return NextResponse.json(await fetchFootball('standings', params))

      case 'fixtures':
        return NextResponse.json(await fetchFootball('fixtures', params))

      case 'fixtures/rounds':
        return NextResponse.json(await fetchFootball('fixtures/rounds', params))

      case 'players/topscorers':
        return NextResponse.json(await fetchFootball('players/topscorers', params))

      case 'teams': {
        // team info
        const res = await fetch(`${BASE}/teams?id=${team}`, {
          headers: { 'x-apisports-key': API_KEY }
        })
        const data = await res.json()
        return NextResponse.json(data)
      }

      case 'players/squads': {
        const res = await fetch(`${BASE}/players/squads?team=${team}`, {
          headers: { 'x-apisports-key': API_KEY }
        })
        const data = await res.json()
        return NextResponse.json(data)
      }

      case 'coaches': {
        const res = await fetch(`${BASE}/coachs?team=${team}`, {
          headers: { 'x-apisports-key': API_KEY }
        })
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
