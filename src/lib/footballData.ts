/**
 * football-data.org API adapter (server-side only).
 * Fetches data from api.football-data.org and adapts responses to the same
 * internal format used by the rest of the app (which was originally built for
 * API-Football). This lets /api/football and /api/team use FD as primary source
 * and API-Football as fallback without changing any frontend code.
 *
 * FD free tier: 10 req/min (no daily cap) — much more generous than API-Football's 100/day.
 * FD competition ID for FIFA World Cup 2026: 2000  (code: WC)
 */

const FD_BASE = 'https://api.football-data.org/v4'
const FD_COMPETITION = '2000'  // FIFA World Cup
const FD_SEASON = '2026'

export class FdRateLimitError extends Error {
  constructor() {
    super('football-data.org rate limit reached (10 req/min)')
    this.name = 'FdRateLimitError'
    Object.setPrototypeOf(this, FdRateLimitError.prototype)
  }
}

// ── Raw FD types ──────────────────────────────────────────────────────────────

interface FdTeam {
  id: number
  name: string
  shortName?: string
  tla?: string
  crest?: string
  area?: { name: string }
  founded?: number
  venue?: string
  coach?: FdCoach
  squad?: FdPlayer[]
}

interface FdPlayer {
  id: number
  name: string
  position?: string | null
  dateOfBirth?: string | null
  nationality?: string
  shirtNumber?: number | null
}

interface FdCoach {
  id?: number | null
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  nationality?: string | null
  dateOfBirth?: string | null
}

interface FdMatch {
  id: number
  utcDate: string
  status: string
  matchday?: number
  stage?: string
  group?: string | null
  homeTeam: { id: number; name: string; shortName?: string; tla?: string; crest?: string }
  awayTeam: { id: number; name: string; shortName?: string; tla?: string; crest?: string }
  score: {
    winner?: string | null
    fullTime?: { home: number | null; away: number | null }
    halfTime?: { home: number | null; away: number | null }
  }
}

interface FdStandingRow {
  position: number
  team: { id: number; name: string; shortName?: string; tla?: string; crest?: string }
  playedGames: number
  won: number
  draw: number
  lost: number
  points: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  group?: string | null
}

// ── Low-level fetch ───────────────────────────────────────────────────────────

async function fdFetch(path: string, extraParams?: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY
  if (!apiKey) throw new Error('FOOTBALL_DATA_API_KEY not configured')

  const url = new URL(`${FD_BASE}${path}`)
  if (extraParams) {
    Object.entries(extraParams).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  const res = await fetch(url.toString(), {
    headers: { 'X-Auth-Token': apiKey },
    cache: 'no-store',
  })

  if (res.status === 429) throw new FdRateLimitError()
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '')
    throw new Error(`FD API ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapFdPosition(fdPos: string | null | undefined): string {
  if (!fdPos) return 'Midfielder'
  const p = fdPos.toLowerCase()
  if (p === 'goalkeeper') return 'Goalkeeper'
  if (
    p === 'defence' || p.includes('back') || p === 'defender' ||
    p.includes('centre-back') || p === 'sweeper'
  ) return 'Defender'
  if (
    p === 'offence' || p.includes('forward') || p.includes('winger') ||
    p === 'attacker' || p === 'centre-forward' || p === 'second striker'
  ) return 'Attacker'
  return 'Midfielder'
}

function calcAge(dateOfBirth: string | null | undefined): number {
  if (!dateOfBirth) return 0
  const dob = new Date(dateOfBirth)
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}

function fdStatusToAf(status: string): string {
  switch (status) {
    case 'FINISHED': return 'FT'
    case 'IN_PLAY':  return '1H'
    case 'PAUSED':   return 'HT'
    case 'PENALTY_SHOOTOUT': return 'PEN'
    case 'EXTRA_TIME': return 'ET'
    case 'AWARDED':  return 'AET'
    case 'CANCELLED':  return 'CANC'
    case 'POSTPONED':  return 'PST'
    case 'SUSPENDED':  return 'SUSP'
    default:           return 'NS'
  }
}

function fdGroupLabel(fdGroup: string | null | undefined): string {
  if (!fdGroup) return ''
  // "GROUP_A" → "Group A"
  return fdGroup.replace('GROUP_', 'Group ')
}

// FD-specific name aliases: our schedule name (lowercase) → FD team name (lowercase)
// FD uses hyphens where our schedule uses "&"; uses FIFA official names for several nations.
const FD_ALIASES: Record<string, string> = {
  'usa':                    'united states',
  'türkiye':                'turkey',
  'bosnia & herzegovina':   'bosnia-herzegovina',
  'south korea':            'korea republic',
  'ivory coast':            "côte d'ivoire",
  'czechia':                'czech republic',
  'cape verde':             'cabo verde',
  'congo dr':               'congo dr',
}

// ── WC teams list (cached in module scope, re-fetched if stale) ───────────────

let fdTeamsCache: { teams: FdTeam[]; expires: number } | null = null

async function getFdWcTeams(): Promise<FdTeam[]> {
  if (fdTeamsCache && Date.now() < fdTeamsCache.expires) return fdTeamsCache.teams
  const data = await fdFetch(`/competitions/${FD_COMPETITION}/teams`, { season: FD_SEASON }) as { teams?: FdTeam[] }
  const teams = data?.teams || []
  fdTeamsCache = { teams, expires: Date.now() + 60 * 60 * 1000 }  // 1-hour in-memory cache
  return teams
}

// ── Team name → FD ID resolution ──────────────────────────────────────────────

export async function resolveFdTeamId(name: string): Promise<number | null> {
  const teams = await getFdWcTeams()
  if (teams.length === 0) return null

  const norm    = name.toLowerCase().trim()
  const aliased = FD_ALIASES[norm] || norm

  // 1. Exact name match (aliased, e.g. "usa" → "united states")
  let found = teams.find(t => t.name.toLowerCase() === aliased)
  if (found) return found.id

  // 2. Exact name match (original)
  found = teams.find(t => t.name.toLowerCase() === norm)
  if (found) return found.id

  // 3. TLA match (e.g. "usa" or "ger" as abbreviation)
  found = teams.find(t => t.tla?.toLowerCase() === norm)
  if (found) return found.id

  // 4. Partial match
  found = teams.find(t => {
    const api = t.name.toLowerCase()
    return api.includes(aliased) || aliased.includes(api) ||
           api.includes(norm)    || norm.includes(api)
  })
  if (found) return found.id

  // 5. Token match — splits on any non-alphanumeric separator so "Bosnia & Herzegovina"
  //    matches "Bosnia-Herzegovina" even though "&" !== "-".
  const tokenize = (s: string) => s.split(/[^a-z0-9]+/).filter(w => w.length >= 2)
  const ourToks = tokenize(aliased.length > norm.length ? aliased : norm)
  if (ourToks.length > 0) {
    found = teams.find(t => {
      const apiToks = tokenize(t.name.toLowerCase())
      return ourToks.every(tok => apiToks.includes(tok))
    })
  }
  return found?.id ?? null
}

// ── Team profile ──────────────────────────────────────────────────────────────

export interface FdTeamData {
  teamInfo: {
    team: { id: number; name: string; country: string; logo: string; founded: number | null; national: boolean }
    venue: { name: string; city: string; capacity: number }
  } | null
  squad: Array<{ id: number; name: string; age: number; number: number | null; position: string; photo: string; afId?: number; club?: { name: string; logo?: string } }>
  coach: { id: number; name: string; nationality: string; photo: string; career: unknown[] } | null
  fixtures: Array<{
    fixture: { id: number; date: string; status: { short: string } }
    league: { round: string }
    teams: {
      home: { id: number; name: string; logo: string; winner: boolean | null }
      away: { id: number; name: string; logo: string; winner: boolean | null }
    }
    goals: { home: number | null; away: number | null }
  }>
}

export async function buildFdTeamData(teamId: number): Promise<FdTeamData | null> {
  const [teamRaw, matchesRaw] = await Promise.allSettled([
    fdFetch(`/teams/${teamId}`),
    fdFetch(`/teams/${teamId}/matches`, { competitions: FD_COMPETITION, season: FD_SEASON }),
  ])

  if (teamRaw.status === 'rejected') throw teamRaw.reason

  const team = teamRaw.value as FdTeam & { id?: number }
  if (!team || !team.id) return null

  const teamInfo = {
    team: {
      id:       team.id,
      name:     team.name,
      country:  team.area?.name || team.name,
      logo:     team.crest || '',
      founded:  team.founded ?? null,
      national: true,
    },
    venue: { name: team.venue || '', city: '', capacity: 0 },
  }

  const squad = (team.squad || []).map((p: FdPlayer) => ({
    id:       p.id,
    name:     p.name,
    age:      calcAge(p.dateOfBirth),
    number:   p.shirtNumber ?? null,
    position: mapFdPosition(p.position),
    photo:    '',  // FD free tier doesn't provide player photos
  }))

  let coach = null
  const c = team.coach
  const coachName = c?.name || (c?.firstName && c?.lastName ? `${c.firstName} ${c.lastName}` : null)
  if (coachName) {
    coach = {
      id:          c?.id ?? 0,
      name:        coachName,
      nationality: c?.nationality || '',
      photo:       '',
      career:      [],
    }
  }

  const fdMatches: FdMatch[] =
    matchesRaw.status === 'fulfilled'
      ? ((matchesRaw.value as { matches?: FdMatch[] })?.matches || [])
      : []

  const fixtures = fdMatches
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())
    .map(m => {
      const statusShort = fdStatusToAf(m.status)
      const winner = m.score?.winner
      const done = statusShort === 'FT' || statusShort === 'AET' || statusShort === 'PEN'
      return {
        fixture: { id: m.id, date: m.utcDate, status: { short: statusShort } },
        league:  { round: fdGroupLabel(m.group) || (m.stage || '').replace(/_/g, ' ') },
        teams: {
          home: {
            id:     m.homeTeam.id,
            name:   m.homeTeam.name,
            logo:   m.homeTeam.crest || '',
            winner: done ? winner === 'HOME_TEAM' : null,
          },
          away: {
            id:     m.awayTeam.id,
            name:   m.awayTeam.name,
            logo:   m.awayTeam.crest || '',
            winner: done ? winner === 'AWAY_TEAM' : null,
          },
        },
        goals: {
          home: m.score?.fullTime?.home ?? null,
          away: m.score?.fullTime?.away ?? null,
        },
      }
    })

  return { teamInfo, squad, coach, fixtures }
}

// ── Standings (API-Football format) ───────────────────────────────────────────

export async function getFdStandings(): Promise<unknown> {
  // Two parallel calls: standings table + matchday-1 fixtures for group labels.
  // Matchday 1 has 24 matches (2 per group × 12 groups) so covers all groups.
  const [standingsRaw, matchesRaw] = await Promise.all([
    fdFetch(`/competitions/${FD_COMPETITION}/standings`, { season: FD_SEASON }),
    fdFetch(`/competitions/${FD_COMPETITION}/matches`, { season: FD_SEASON, matchday: '1' }),
  ]) as [
    { standings?: Array<{ type: string; table: FdStandingRow[] }> },
    { matches?: FdMatch[] }
  ]

  // Build team → group map from matchday-1 fixtures
  const teamGroup = new Map<number, string>()
  for (const m of standingsRaw.standings || []) {
    for (const row of m.table || []) {
      if (row.group) teamGroup.set(row.team.id, row.group)
    }
  }
  for (const m of matchesRaw.matches || []) {
    if (m.group) {
      if (m.homeTeam?.id) teamGroup.set(m.homeTeam.id, m.group)
      if (m.awayTeam?.id) teamGroup.set(m.awayTeam.id, m.group)
    }
  }

  // Get TOTAL standings (48-team flat table)
  const totalTable = (standingsRaw.standings || []).find(s => s.type === 'TOTAL')?.table || []
  const statsById = new Map<number, FdStandingRow>()
  for (const row of totalTable) statsById.set(row.team.id, row)

  // Sort groups alphabetically: GROUP_A … GROUP_L (no Set spread — targets ES5)
  const groupNameSet: Record<string, true> = {}
  teamGroup.forEach(g => { groupNameSet[g] = true })
  const groupNames = Object.keys(groupNameSet).sort()

  const standingsArrays = groupNames.map(group => {
    const groupLabel = fdGroupLabel(group)
    // Collect team IDs for this group without using Map iterator spread (ES5 target)
    const teamIds: number[] = []
    teamGroup.forEach((g, id) => { if (g === group) teamIds.push(id) })

    return teamIds
      .map(id => {
        const row = statsById.get(id)
        if (!row) return null
        return {
          rank:      row.position,
          team:      { id: row.team.id, name: row.team.name, logo: row.team.crest || '' },
          points:    row.points,
          goalsDiff: row.goalDifference,
          group:     groupLabel,
          all: {
            played: row.playedGames,
            win:    row.won,
            draw:   row.draw,
            lose:   row.lost,
            goals:  { for: row.goalsFor, against: row.goalsAgainst },
          },
        }
      })
      .filter(Boolean)
      .sort((a, b) => (a!.rank) - (b!.rank))
  })

  return {
    response: [{ league: { standings: standingsArrays } }]
  }
}

// ── Fixtures (API-Football format) ───────────────────────────────────────────

export async function getFdFixtures(opts: { status?: string; team?: string } = {}): Promise<unknown> {
  const params: Record<string, string> = { season: FD_SEASON }
  if (opts.status === 'FT') params.status = 'FINISHED'

  let matches: FdMatch[]
  if (opts.team) {
    const data = await fdFetch(`/teams/${opts.team}/matches`, {
      competitions: FD_COMPETITION,
      season: FD_SEASON,
    }) as { matches?: FdMatch[] }
    matches = data?.matches || []
  } else {
    const data = await fdFetch(`/competitions/${FD_COMPETITION}/matches`, params) as { matches?: FdMatch[] }
    matches = data?.matches || []
  }

  const response = matches.map(m => {
    const statusShort = fdStatusToAf(m.status)
    const done = statusShort === 'FT' || statusShort === 'AET' || statusShort === 'PEN'
    const winner = m.score?.winner
    return {
      fixture: { id: m.id, date: m.utcDate, status: { short: statusShort } },
      league: { round: fdGroupLabel(m.group) || m.stage || '' },
      teams: {
        home: { id: m.homeTeam.id, name: m.homeTeam.name, logo: m.homeTeam.crest || '', winner: done ? winner === 'HOME_TEAM' : null },
        away: { id: m.awayTeam.id, name: m.awayTeam.name, logo: m.awayTeam.crest || '', winner: done ? winner === 'AWAY_TEAM' : null },
      },
      goals: { home: m.score?.fullTime?.home ?? null, away: m.score?.fullTime?.away ?? null },
    }
  })

  return { response }
}

// ── Top scorers (API-Football format) ────────────────────────────────────────

export async function getFdScorers(limit = 10): Promise<unknown> {
  const data = await fdFetch(`/competitions/${FD_COMPETITION}/scorers`, {
    season: FD_SEASON,
    limit: String(limit),
  }) as { scorers?: Array<{
    player: { id: number; name: string; nationality?: string; dateOfBirth?: string }
    team: { id: number; name: string; crest?: string }
    goals: number
    assists?: number
    penalties?: number
  }> }

  const response = (data?.scorers || []).map(s => ({
    player: {
      id:          s.player.id,
      name:        s.player.name,
      nationality: s.player.nationality || '',
      photo:       '',
    },
    statistics: [{
      team:  { id: s.team.id, name: s.team.name, logo: s.team.crest || '' },
      goals: { total: s.goals, assists: s.assists ?? 0, conceded: 0, saves: 0 },
      penalty: { scored: s.penalties ?? 0 },
    }],
  }))

  return { response }
}

// ── WC teams list (API-Football format, for name resolution in /api/football) ─

export async function getFdTeamsList(): Promise<unknown> {
  const teams = await getFdWcTeams()
  const response = teams.map(t => ({
    team: { id: t.id, name: t.name, logo: t.crest || '', national: true },
  }))
  return { response }
}
