'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLocale } from '@/lib/useLocale'
import { supabase, type Match } from '@/lib/supabase'
import Flag from '@/components/Flag'
import Link from 'next/link'
import {
  buildPathChains,
  getTeamGroup,
  type MatchRecord,
  type PathPosition,
} from './pathToFinalHelpers'
import { formatPlaceholder } from '@/app/world-cup/bracket/bracketHelpers'

type TeamInfo = { team: { id: number; name: string; country: string; logo: string; founded: number; national: boolean }; venue: { name: string; city: string; capacity: number } }
type Player = { id: number; name: string; age: number; number: number; position: string; photo: string; club?: { name: string; logo?: string } }
type Coach = { id: number; name: string; nationality: string; photo: string; career: Array<{ team: { name: string }; start: string; end: string | null }> }
type Fixture = {
  fixture: { id: number; date: string; status: { short: string } }
  league: { round: string }
  teams: { home: { id: number; name: string; logo: string; winner: boolean | null }; away: { id: number; name: string; logo: string; winner: boolean | null } }
  goals: { home: number | null; away: number | null }
}
type Standing = {
  team: { id: number | null; name: string; logo: string }
  group?: string
}
type StandingRow = {
  rank: number
  team: { id: number; name: string; logo: string }
  points: number
  goalsDiff: number
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } }
  description: string | null
}
type LocalMatch = Match
type SavedTeam = { id: string; name: string; logo?: string; savedAt: string }
type CachedTeamPayload = {
  teamInfo: TeamInfo | null
  squad: Player[]
  coach: Coach | null
  fixtures: Fixture[]
  savedTeam: SavedTeam | null
  cachedAt: string
}

const POSITION_ORDER = ['Goalkeeper', 'Defender', 'Midfielder', 'Attacker']
const SAVED_TEAM_KEY = 'peddlers_home_team'
const TEAM_CACHE_PREFIX = 'peddlers_team_cache_'

function readSavedTeam(): SavedTeam | null {
  try {
    const raw = window.localStorage.getItem(SAVED_TEAM_KEY)
    return raw ? JSON.parse(raw) as SavedTeam : null
  } catch {
    return null
  }
}

function saveTeam(team: SavedTeam) {
  window.localStorage.setItem(SAVED_TEAM_KEY, JSON.stringify(team))
}

function isPlaceholderTeam(name: string) {
  return /\b(TBD|Winner|Runner-up|3rd Place|R32|QF|SF)\b/i.test(name)
}

function savedTeamHref(team: SavedTeam) {
  return team.id.startsWith('name:')
    ? `/world-cup/team?name=${encodeURIComponent(team.name)}`
    : `/world-cup/team?id=${team.id}`
}

function isImageSrc(value?: string) {
  return !!value && /^https?:\/\//.test(value)
}

function normForStandings(s: string): string {
  const map: Record<string, string> = {
    'czech republic': 'czechia', 'korea republic': 'south korea',
    "côte d'ivoire": 'ivory coast', 'united states': 'usa',
    'turkey': 'türkiye', 'cape verde islands': 'cape verde',
  }
  const lower = s.toLowerCase()
  return (map[lower] ?? lower).replace(/[^a-z0-9]/g, '')
}

function TeamContent() {
  const { t } = useLocale()
  const searchParams = useSearchParams()
  const teamId = searchParams.get('id') ?? undefined
  const teamName = searchParams.get('name') ?? undefined
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null)
  const [squad, setSquad] = useState<Player[]>([])
  const [coach, setCoach] = useState<Coach | null>(null)
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [localMatches, setLocalMatches] = useState<LocalMatch[]>([])
  const [localScheduleTeamName, setLocalScheduleTeamName] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'squad' | 'fixtures'>('squad')
  const [savedTeam, setSavedTeam] = useState<SavedTeam | null>(null)
  const [teams, setTeams] = useState<Standing[]>([])
  const [fromCache, setFromCache] = useState(false)
  const [rateLimited, setRateLimited] = useState(false)
  const [allSortedMatches, setAllSortedMatches] = useState<MatchRecord[]>([])
  const [pathPosition, setPathPosition] = useState<PathPosition>('1st')
  const [groupStandings, setGroupStandings] = useState<StandingRow[]>([])
  const [standingsOpen, setStandingsOpen] = useState(false)

  useEffect(() => {
    setSavedTeam(readSavedTeam())
  }, [])

  useEffect(() => {
    supabase
      .from('matches')
      .select('id,home_team,away_team,home_flag,away_flag,kickoff_at,stage,result,venue,home_score,away_score')
      .neq('stage', 'Demo Match')
      .order('kickoff_at', { ascending: true })
      .then(({ data }) => { if (data) setAllSortedMatches(data as MatchRecord[]) })
  }, [])

  useEffect(() => {
    const sched = localScheduleTeamName || teamName || ''
    if (!sched || allSortedMatches.length === 0) return
    const group = getTeamGroup(allSortedMatches, sched)
    if (!group) return
    const idx = group.charCodeAt(0) - 65
    fetch('/api/football?endpoint=standings')
      .then(r => r.json())
      .then(data => {
        const raw: StandingRow[][] = data.response?.[0]?.league?.standings ?? []
        setGroupStandings(raw[idx] ?? [])
      })
      .catch(() => {})
  }, [localScheduleTeamName, teamName, allSortedMatches])

  // Auto-set path position to confirmed finish position once all group games are done.
  // groupStandings is sorted by global rank ascending — array index = group position (0=1st, 1=2nd, 2=3rd, 3=4th).
  // Do NOT use myRow.rank (global 1-48); use groupStandings.indexOf(myRow) instead.
  useEffect(() => {
    const sched = localScheduleTeamName || teamName || ''
    if (!sched || groupStandings.length === 0) return
    const groupMatches = localMatches.filter(m => /^Group [A-L]$/i.test(m.stage))
    if (groupMatches.length !== 3 || groupMatches.some(m => !m.result)) return
    const myRow = groupStandings.find(r => normForStandings(r.team.name) === normForStandings(sched))
    if (!myRow) return
    const groupPos = groupStandings.indexOf(myRow) // 0=1st, 1=2nd, 2=3rd, 3=4th
    if (groupPos === 0) setPathPosition('1st')
    else if (groupPos === 1) setPathPosition('2nd')
    else setPathPosition('best_3rd')
  }, [localMatches, groupStandings, localScheduleTeamName, teamName])

  useEffect(() => {
    if (teamId || teamName) return
    async function loadTeams() {
      setLoading(true)
      try {
        const res = await fetch('/api/football?endpoint=standings')
        const data = await res.json()
        const raw = data.response?.[0]?.league?.standings || []
        let allTeams = raw.flatMap((group: Array<{ team: Standing['team']; group?: string }>, groupIndex: number) =>
          group.map(row => ({
            team: row.team,
            group: row.group || `Group ${String.fromCharCode(65 + groupIndex)}`,
          }))
        )
        if (allTeams.length === 0) {
          const teamsRes = await fetch('/api/football?endpoint=teams')
          const teamsData = await teamsRes.json()
          allTeams = ((teamsData.response || []) as Array<{ team: Standing['team'] }>)
            .map(row => ({ team: row.team, group: 'World Cup 2026' }))
            .sort((a, b) => a.team.name.localeCompare(b.team.name))
        }
        if (allTeams.length === 0) {
          const fixturesRes = await fetch('/api/football?endpoint=fixtures')
          const fixturesData = await fixturesRes.json()
          const byId = new Map<number, Standing>()
          ;((fixturesData.response || []) as Fixture[]).forEach(fixture => {
            byId.set(fixture.teams.home.id, {
              team: {
                id: fixture.teams.home.id,
                name: fixture.teams.home.name,
                logo: fixture.teams.home.logo,
              },
              group: 'World Cup 2026',
            })
            byId.set(fixture.teams.away.id, {
              team: {
                id: fixture.teams.away.id,
                name: fixture.teams.away.name,
                logo: fixture.teams.away.logo,
              },
              group: 'World Cup 2026',
            })
          })
          allTeams = Array.from(byId.values()).sort((a, b) => a.team.name.localeCompare(b.team.name))
        }
        if (allTeams.length === 0) {
          const { data: matches } = await supabase
            .from('matches')
            .select('*')
            .neq('stage', 'Demo Match')
            .order('kickoff_at', { ascending: true })
          const byName = new Map<string, Standing>()
          ;((matches || []) as Match[]).forEach(match => {
            if (isPlaceholderTeam(match.home_team) || isPlaceholderTeam(match.away_team)) return
            byName.set(match.home_team, { team: { id: null, name: match.home_team, logo: match.home_flag }, group: t.localSchedule })
            byName.set(match.away_team, { team: { id: null, name: match.away_team, logo: match.away_flag }, group: t.localSchedule })
          })
          allTeams = Array.from(byName.values()).sort((a, b) => a.team.name.localeCompare(b.team.name))
        }
        setTeams(allTeams)
      } catch {
        setTeams([])
      }
      setLoading(false)
    }
    loadTeams()
  }, [teamId, teamName])

  useEffect(() => {
    if (!teamId) return
    async function load() {
      setLoading(true)
      setFromCache(false)
      const cacheKey = `${TEAM_CACHE_PREFIX}${teamId}`
      let hadCache = false
      try {
        const raw = window.localStorage.getItem(cacheKey)
        if (raw) {
          const cached = JSON.parse(raw) as CachedTeamPayload
          setTeamInfo(cached.teamInfo)
          setSquad(cached.squad)
          setCoach(cached.coach)
          setFixtures(cached.fixtures)
          if (cached.savedTeam) setSavedTeam(cached.savedTeam)
          setFromCache(true)
          hadCache = true
        }
      } catch { /* ignore bad local cache */ }

      try {
        const res = await fetch(`/api/team?id=${teamId}`)
        const data = await res.json()
        if (data.error === 'rate_limited') {
          setRateLimited(true)
          setLocalMatches(data.localSchedule || [])
          setLoading(false)
          return
        }
        const nextTeamInfo = data.teamInfo || null
        const players: Player[] = data.squad || []
        players.sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position))
        const nextCoach = data.coach || null
        const allFixtures: Fixture[] = data.fixtures || []
        setTeamInfo(nextTeamInfo)
        setSquad(players)
        setCoach(nextCoach)
        setFixtures(allFixtures)
        setLocalMatches(data.localSchedule || [])
        setLocalScheduleTeamName(data.localTeamName || '')
        if (nextTeamInfo) {
          const nextSavedTeam = {
            id: String(nextTeamInfo.team.id),
            name: nextTeamInfo.team.name,
            logo: nextTeamInfo.team.logo,
            savedAt: new Date().toISOString(),
          }
          saveTeam(nextSavedTeam)
          setSavedTeam(nextSavedTeam)
          window.localStorage.setItem(cacheKey, JSON.stringify({
            teamInfo: nextTeamInfo,
            squad: players,
            coach: nextCoach,
            fixtures: allFixtures,
            savedTeam: nextSavedTeam,
            cachedAt: new Date().toISOString(),
          } satisfies CachedTeamPayload))
          setFromCache(false)
        }
      } catch {
        if (!hadCache) {
          setTeamInfo(null)
        }
      }
      setLoading(false)
    }
    load()
  }, [teamId, teamName])

  useEffect(() => {
    if (!teamName || teamId) return
    const localTeamName = teamName
    async function loadByName() {
      setLoading(true)
      setTeamInfo(null)
      setSquad([])
      setCoach(null)
      setFixtures([])

      // Try API-Football via the team cache route first
      try {
        const res = await fetch(`/api/team?name=${encodeURIComponent(localTeamName)}`)
        const data = await res.json()
        if (data.error === 'rate_limited') {
          setRateLimited(true)
          setLocalMatches(data.localSchedule || [])
          setLocalScheduleTeamName(data.localTeamName || localTeamName)
          setLoading(false)
          return
        }
        if (data.teamInfo) {
          const players: Player[] = data.squad || []
          players.sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position))
          setTeamInfo(data.teamInfo)
          setSquad(players)
          setCoach(data.coach || null)
          setFixtures(data.fixtures || [])
          setLocalMatches(data.localSchedule || [])
          setLocalScheduleTeamName(data.localTeamName || localTeamName)
          const nextSaved = {
            id: String(data.teamInfo.team.id),
            name: data.teamInfo.team.name,
            logo: data.teamInfo.team.logo,
            savedAt: new Date().toISOString(),
          }
          saveTeam(nextSaved)
          setSavedTeam(nextSaved)
          setLoading(false)
          return
        }
      } catch { /* fall through to local schedule fallback */ }

      // Local-only fallback: show matches from Supabase when API can't find the team
      const { data } = await supabase
        .from('matches')
        .select('*')
        .neq('stage', 'Demo Match')
        .order('kickoff_at', { ascending: true })
      const matches = ((data || []) as Match[]).filter(
        m => m.home_team === localTeamName || m.away_team === localTeamName
      )
      setLocalMatches(matches)
      const first = matches[0]
      const flag = first ? (first.home_team === localTeamName ? first.home_flag : first.away_flag) : ''
      const nextSaved = {
        id: `name:${localTeamName}`,
        name: localTeamName,
        logo: flag,
        savedAt: new Date().toISOString(),
      }
      saveTeam(nextSaved)
      setSavedTeam(nextSaved)
      setLoading(false)
    }
    loadByName()
  }, [teamId, teamName])

  if (!teamId && !teamName) {
    return (
      <div className="container">
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>World Cup 2026</div>
          <h1>{t.pickYourTeam}</h1>
          <p className="muted">{t.pickYourTeamSub}</p>
        </div>

        {savedTeam && (
          <Link href={savedTeamHref(savedTeam)} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--text)' }}>
            {isImageSrc(savedTeam.logo)
              ? <img src={savedTeam.logo} alt="" style={{ width: 46, height: 46, objectFit: 'contain', flexShrink: 0 }} />
              : <div style={{ width: 46, fontSize: 34, lineHeight: 1, textAlign: 'center', flexShrink: 0 }}>{savedTeam.logo}</div>
            }
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 2 }}>{t.savedTeam}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: 1 }}>{savedTeam.name}</div>
            </div>
            <div style={{ fontFamily: 'var(--font-cond)', color: 'var(--text-dim)', fontWeight: 700 }}>{t.open}</div>
          </Link>
        )}

        {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>{t.loadingTeams}</div>}

        {!loading && teams.length === 0 && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="muted">{t.teamsUnavailable}</p>
          </div>
        )}

        {!loading && teams.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {teams.map(row => (
              <Link key={`${row.team.id || row.team.name}`} href={row.team.id ? `/world-cup/team?id=${row.team.id}` : `/world-cup/team?name=${encodeURIComponent(row.team.name)}`} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px', background: 'var(--surface)',
                border: `1px solid ${savedTeam?.name === row.team.name ? 'rgba(0,200,122,0.35)' : 'var(--border)'}`,
                borderRadius: 8, textDecoration: 'none', color: 'var(--text)'
              }}>
                {isImageSrc(row.team.logo)
                  ? <img src={row.team.logo} alt="" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
                  : <div style={{ width: 28, fontSize: 22, lineHeight: 1, textAlign: 'center', flexShrink: 0 }}>{row.team.logo}</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 16 }}>{row.team.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{row.group === 'Local schedule' ? t.localSchedule : row.group || 'World Cup 2026'}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: savedTeam?.name === row.team.name ? 'var(--green)' : 'var(--text-dim)' }}>
                  {savedTeam?.name === row.team.name ? t.saved : t.choose}
                </div>
              </Link>
            ))}
          </div>
        )}

        <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 14 }}>← {t.home}</Link>
      </div>
    )
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const schedName = localScheduleTeamName || teamName || ''
  const currentGroup = schedName && allSortedMatches.length > 0 ? getTeamGroup(allSortedMatches, schedName) : null
  const groupGamesPlayed = localMatches.filter(m => /^Group [A-L]$/i.test(m.stage) && m.result !== null).length
  const groupGamesTotal = localMatches.filter(m => /^Group [A-L]$/i.test(m.stage)).length
  const allGroupGamesDone = groupGamesTotal === 3 && groupGamesPlayed === 3
  const myStandingRow = currentGroup && groupStandings.length > 0
    ? groupStandings.find(r => normForStandings(r.team.name) === normForStandings(schedName))
    : null
  // groupStandings is sorted by global rank — use array index for GROUP position (0=1st … 3=4th).
  // myStandingRow.rank is the GLOBAL rank (1-48) and must NOT be used for group position logic.
  const myGroupPos = myStandingRow ? groupStandings.indexOf(myStandingRow) : -1 // 0-based
  const finishPosition = allGroupGamesDone && myGroupPos >= 0 ? (myGroupPos + 1) : null // 1-based (1–4)
  const qualified = finishPosition !== null && finishPosition <= 2
  // Count total group matches played across all 4 teams (each match adds 1 to both teams' played count)
  const groupTotalPlayed = groupStandings.length > 0
    ? Math.round(groupStandings.reduce((s, r) => s + r.all.played, 0) / 2)
    : groupGamesPlayed
  const GROUP_TOTAL_MATCHES = 6 // 4 teams, C(4,2) = 6 round-robin matches
  const posSlot = qualified
    ? (finishPosition === 1 ? `Group ${currentGroup} Winner` : `Group ${currentGroup} Runner-up`)
    : null
  const nextKnockoutMatch = posSlot
    ? (allSortedMatches.find(m => m.home_team === posSlot || m.away_team === posSlot) ?? null)
    : null

  function statusLabel() {
    if (finishPosition === 1) return t.pathAs1st.replace('{group}', currentGroup ?? '')
    if (finishPosition === 2) return t.pathAs2nd.replace('{group}', currentGroup ?? '')
    if (finishPosition === 3) return t.finishedThird.replace('{group}', currentGroup ?? '')
    if (finishPosition === 4) return t.eliminated
    if (currentGroup && groupGamesTotal > 0)
      return t.groupProgress.replace('{group}', currentGroup).replace('{played}', String(groupGamesPlayed))
    return null
  }
  const groupStatusLabel = statusLabel()
  const groupStatusColor = finishPosition === 1 ? 'var(--green)'
    : finishPosition === 2 ? 'var(--green)'
    : finishPosition === 3 ? 'var(--amber)'
    : finishPosition === 4 ? 'var(--red)'
    : 'var(--text-muted)'
  const groupStatusBorder = finishPosition === 1 ? 'var(--green)'
    : finishPosition === 2 ? 'rgba(0,200,122,0.45)'
    : finishPosition === 3 ? 'rgba(245,197,24,0.5)'
    : finishPosition === 4 ? 'rgba(255,59,59,0.35)'
    : 'var(--border)'
  const groupStatusBg = finishPosition === 1 ? 'rgba(0,200,122,0.12)'
    : finishPosition === 2 ? 'rgba(0,200,122,0.08)'
    : finishPosition === 3 ? 'rgba(245,197,24,0.08)'
    : finishPosition === 4 ? 'rgba(255,59,59,0.08)'
    : 'var(--surface)'

  const positionGroups = POSITION_ORDER.reduce((acc, pos) => {
    acc[pos] = squad.filter(p => p.position === pos)
    return acc
  }, {} as Record<string, Player[]>)
  const upcomingFixtures = fixtures.filter(f => new Date(f.fixture.date) >= new Date() && f.fixture.status.short !== 'FT')
  const upcomingLocalMatches = localMatches.filter(m => new Date(m.kickoff_at) >= new Date())
  const numericTeamId = parseInt(teamId || '0')
  const firstLocalMatch = localMatches[0]
  const localFlagEmoji = firstLocalMatch
    ? (firstLocalMatch.home_team === localScheduleTeamName ? firstLocalMatch.home_flag : firstLocalMatch.away_flag)
    : ''

  if (teamName && !teamId && !teamInfo) {
    const flag = savedTeam?.logo || ''
    return (
      <div className="container">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>{t.loading}</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '24px 0 20px' }}>
              <Flag emoji={flag} size={72} />
              <div>
                <h1 style={{ marginBottom: 4 }}>{teamName}</h1>
                <p className="muted">{t.savedOnThisPhone} · {t.localSchedule}</p>
              </div>
            </div>

            {/* Group standings widget (fallback view) */}
            {currentGroup && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: groupStandings.length > 0 ? 8 : 0 }}>
                  {groupStatusLabel && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '4px 12px', borderRadius: 20,
                      background: groupStatusBg, border: `1px solid ${groupStatusBorder}`,
                      fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13,
                      color: groupStatusColor, letterSpacing: 0.3,
                    }}>
                      {groupStatusLabel}
                    </div>
                  )}
                  {groupStandings.length > 0 && (
                    <button onClick={() => setStandingsOpen(o => !o)} style={{
                      marginLeft: 'auto', background: 'none', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
                      fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700,
                      color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase',
                    }}>
                      {t.groupStandings} {standingsOpen ? '▲' : '▼'}
                    </button>
                  )}
                </div>
                {standingsOpen && groupStandings.length > 0 && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ padding: '8px 12px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: 1 }}>
                      Group {currentGroup}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {[t.pos, t.team, t.played, t.won, t.drawn, t.lost, t.gd, t.points].map(h => (
                              <th key={h} style={{ padding: '7px 8px', textAlign: h === t.team ? 'left' : 'center', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {groupStandings.map((row, i) => {
                            const isThis = normForStandings(row.team.name) === normForStandings(schedName)
                            return (
                              <tr key={row.team.id} style={{ borderBottom: i < groupStandings.length - 1 ? '1px solid var(--border)' : 'none', background: isThis ? 'rgba(245,197,24,0.07)' : i < 2 ? 'rgba(0,200,122,0.04)' : 'transparent' }}>
                                <td style={{ padding: '9px 8px', textAlign: 'center', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, color: i < 2 ? 'var(--green)' : 'var(--text-muted)' }}>{i + 1}</td>
                                <td style={{ padding: '9px 8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {row.team.logo && <img src={row.team.logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />}
                                    <Link href={`/world-cup/team?id=${row.team.id}`} style={{ fontFamily: 'var(--font-cond)', fontWeight: isThis ? 800 : 700, fontSize: 12, color: isThis ? 'var(--amber)' : 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                      {row.team.name}
                                    </Link>
                                  </div>
                                </td>
                                {[row.all.played, row.all.win, row.all.draw, row.all.lose, row.goalsDiff].map((v, vi) => (
                                  <td key={vi} style={{ padding: '9px 6px', textAlign: 'center', color: 'var(--text-muted)' }}>{v}</td>
                                ))}
                                <td style={{ padding: '9px 8px', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--green)' }}>{row.points}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--green)', fontFamily: 'var(--font-cond)', fontWeight: 700 }}>
                      ■ {t.qualified}
                    </div>
                  </div>
                )}
                {qualified && nextKnockoutMatch && (
                  <div style={{ padding: '12px 14px', background: 'linear-gradient(135deg, rgba(0,200,122,0.07), rgba(245,197,24,0.04))', border: '1px solid rgba(0,200,122,0.25)', borderRadius: 10 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 5 }}>
                      {t.nextMatch} · {nextKnockoutMatch.stage}
                    </div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                      {nextKnockoutMatch.home_team === posSlot
                        ? `vs ${formatPlaceholder(nextKnockoutMatch.away_team)}`
                        : `vs ${formatPlaceholder(nextKnockoutMatch.home_team)}`}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {fmtDate(nextKnockoutMatch.kickoff_at)}
                      {nextKnockoutMatch.venue && <span style={{ opacity: 0.7 }}> · {nextKnockoutMatch.venue}</span>}
                    </div>
                  </div>
                )}
                {finishPosition === 3 && (
                  <Link href="/world-cup/best-3rd" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: 'rgba(245,197,24,0.07)', border: '1px solid rgba(245,197,24,0.3)', borderRadius: 10, textDecoration: 'none', marginTop: 8 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>🥉</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, color: 'var(--amber)' }}>{t.best3rdNavLabel}</div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{t.best3rdNavDesc}</div>
                    </div>
                    <span style={{ color: 'var(--amber)', fontSize: 14, flexShrink: 0 }}>→</span>
                  </Link>
                )}
              </div>
            )}

            <div className="card" style={{ marginBottom: 14 }}>
              <h2>{t.teamInfo}</h2>
              {rateLimited ? (
                <p className="muted" style={{ color: 'var(--amber)' }}>
                  {t.playerProfilesUnavailable}
                </p>
              ) : (
                <p className="muted">{t.playerInfoUnavailable}</p>
              )}
            </div>

            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8, paddingLeft: 4 }}>
              {t.upcomingMatches}
            </div>
            {upcomingLocalMatches.length === 0 && <p className="muted" style={{ textAlign: 'center', padding: 24 }}>{t.noUpcomingMatches}</p>}
            {upcomingLocalMatches.map(match => {
              const isHome = match.home_team === teamName
              const opponent = isHome ? match.away_team : match.home_team
              const opponentFlag = isHome ? match.away_flag : match.home_flag
              return (
                <div key={match.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 3 }}>
                      {match.stage}
                    </div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14 }}>
                      {isHome ? 'vs' : '@'} <Flag emoji={opponentFlag} size={14} style={{ marginRight: 4 }} />{opponent}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{fmtDate(match.kickoff_at)}</div>
                  </div>
                </div>
              )
            })}
          </>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <Link href="/world-cup/team" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>{t.changeSavedTeam}</Link>
          <Link href="/schedule" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 0 }}>{t.fullSchedule}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>Loading…</div>
      ) : teamInfo ? (
        <>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '24px 0 20px' }}>
            {teamInfo.team.logo
              ? <img src={teamInfo.team.logo} alt="" style={{ width: 72, height: 72, objectFit: 'contain' }} />
              : localFlagEmoji ? <Flag emoji={localFlagEmoji} size={72} /> : null
            }
            <div>
              <h1 style={{ marginBottom: 4 }}>{teamInfo.team.name}</h1>
              <p className="muted">{teamInfo.team.country} · Est. {teamInfo.team.founded}</p>
              <p style={{ fontSize: 11, color: 'var(--green)', marginTop: 2, fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                {t.savedOnThisPhone}{fromCache ? ` · ${t.showingLocalCopy}` : ''}
              </p>
              {teamInfo.venue.name && (
                <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                  📍 {teamInfo.venue.name}, {teamInfo.venue.city}
                </p>
              )}
            </div>
          </div>

          {/* Coach */}
          {coach && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {coach.photo && (
                  <img src={coach.photo} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
                )}
                <div>
                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 3 }}>{t.manager}</div>
                  <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 18 }}>{coach.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{coach.nationality}</div>
                </div>
              </div>
            </div>
          )}

          {/* Group standings widget */}
          {currentGroup && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: groupStandings.length > 0 ? 8 : 0 }}>
                {groupStatusLabel && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '4px 12px', borderRadius: 20,
                    background: groupStatusBg, border: `1px solid ${groupStatusBorder}`,
                    fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13,
                    color: groupStatusColor, letterSpacing: 0.3,
                  }}>
                    {groupStatusLabel}
                  </div>
                )}
                {groupStandings.length > 0 && (
                  <button onClick={() => setStandingsOpen(o => !o)} style={{
                    marginLeft: 'auto', background: 'none', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
                    fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700,
                    color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase',
                  }}>
                    {t.groupStandings} {standingsOpen ? '▲' : '▼'}
                  </button>
                )}
              </div>
              {standingsOpen && groupStandings.length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ padding: '8px 12px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: 1 }}>Group {currentGroup}</span>
                    <span style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: groupTotalPlayed >= GROUP_TOTAL_MATCHES ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
                      {groupTotalPlayed >= GROUP_TOTAL_MATCHES
                        ? t.groupAllComplete.replace('{total}', String(GROUP_TOTAL_MATCHES))
                        : t.groupMatchProgress.replace('{played}', String(groupTotalPlayed)).replace('{total}', String(GROUP_TOTAL_MATCHES))}
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {[t.pos, t.team, t.played, t.won, t.drawn, t.lost, t.gd, t.points].map(h => (
                            <th key={h} style={{ padding: '7px 8px', textAlign: h === t.team ? 'left' : 'center', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groupStandings.map((row, i) => {
                          const isThis = normForStandings(row.team.name) === normForStandings(schedName)
                          return (
                            <tr key={row.team.id} style={{ borderBottom: i < groupStandings.length - 1 ? '1px solid var(--border)' : 'none', background: isThis ? 'rgba(245,197,24,0.07)' : i < 2 ? 'rgba(0,200,122,0.04)' : 'transparent' }}>
                              <td style={{ padding: '9px 8px', textAlign: 'center', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, color: i < 2 ? 'var(--green)' : 'var(--text-muted)' }}>{i + 1}</td>
                              <td style={{ padding: '9px 8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {row.team.logo && <img src={row.team.logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />}
                                  <Link href={`/world-cup/team?id=${row.team.id}`} style={{ fontFamily: 'var(--font-cond)', fontWeight: isThis ? 800 : 700, fontSize: 12, color: isThis ? 'var(--amber)' : 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                    {row.team.name}
                                  </Link>
                                </div>
                              </td>
                              {[row.all.played, row.all.win, row.all.draw, row.all.lose, row.goalsDiff].map((v, vi) => (
                                <td key={vi} style={{ padding: '9px 6px', textAlign: 'center', color: 'var(--text-muted)' }}>{v}</td>
                              ))}
                              <td style={{ padding: '9px 8px', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--green)' }}>{row.points}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--green)', fontFamily: 'var(--font-cond)', fontWeight: 700 }}>
                    ■ {t.qualified}
                  </div>
                </div>
              )}
              {qualified && nextKnockoutMatch && (
                <div style={{ padding: '12px 14px', background: 'linear-gradient(135deg, rgba(0,200,122,0.07), rgba(245,197,24,0.04))', border: '1px solid rgba(0,200,122,0.25)', borderRadius: 10 }}>
                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 5 }}>
                    {t.nextMatch} · {nextKnockoutMatch.stage}
                  </div>
                  <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                    {nextKnockoutMatch.home_team === posSlot
                      ? `vs ${formatPlaceholder(nextKnockoutMatch.away_team)}`
                      : `vs ${formatPlaceholder(nextKnockoutMatch.home_team)}`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {fmtDate(nextKnockoutMatch.kickoff_at)}
                    {nextKnockoutMatch.venue && <span style={{ opacity: 0.7 }}> · {nextKnockoutMatch.venue}</span>}
                  </div>
                </div>
              )}
              {finishPosition === 3 && (
                <Link href="/world-cup/best-3rd" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: 'rgba(245,197,24,0.07)', border: '1px solid rgba(245,197,24,0.3)', borderRadius: 10, textDecoration: 'none', marginTop: 8 }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>🥉</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, color: 'var(--amber)' }}>{t.best3rdNavLabel}</div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{t.best3rdNavDesc}</div>
                  </div>
                  <span style={{ color: 'var(--amber)', fontSize: 14, flexShrink: 0 }}>→</span>
                </Link>
              )}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => setTab('squad')} style={{
              flex: 1, padding: '11px 8px', borderRadius: 10,
              border: `1px solid ${tab === 'squad' ? 'var(--green)' : 'var(--border)'}`,
              background: tab === 'squad' ? 'rgba(0,200,122,0.12)' : 'var(--surface)',
              color: tab === 'squad' ? 'var(--green)' : 'var(--text-muted)',
              fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13,
              letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer'
            }}>
              👤 {t.squad}
            </button>
            <button onClick={() => setTab('fixtures')} style={{
              flex: 1, padding: '11px 8px', borderRadius: 10,
              border: `1px solid ${tab === 'fixtures' ? 'var(--green)' : 'rgba(0,200,122,0.3)'}`,
              background: tab === 'fixtures'
                ? 'rgba(0,200,122,0.15)'
                : 'linear-gradient(135deg, rgba(0,200,122,0.07), rgba(245,197,24,0.05))',
              color: tab === 'fixtures' ? 'var(--green)' : 'var(--green)',
              fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13,
              letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer'
            }}>
              🏆 {t.pathToFinal}
            </button>
          </div>

          {/* Path to Final promo — shown when on Squad tab to surface the feature (hidden if eliminated) */}
          {tab === 'squad' && finishPosition !== 4 && (
            <button onClick={() => setTab('fixtures')} style={{
              width: '100%', marginBottom: 16,
              padding: '13px 16px',
              background: 'linear-gradient(135deg, rgba(0,200,122,0.07), rgba(245,197,24,0.04))',
              border: '1px solid rgba(0,200,122,0.25)',
              borderRadius: 10, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left'
            }}>
              <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>🗺️</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, color: 'var(--green)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {t.pathToFinal}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                  {t.pathToFinalSub}
                </div>
              </div>
              <span style={{ color: 'var(--green)', fontSize: 16, flexShrink: 0 }}>→</span>
            </button>
          )}

          {/* Squad */}
          {tab === 'squad' && (
            <>
              {POSITION_ORDER.map(pos => {
                const players = positionGroups[pos] || []
                if (players.length === 0) return null
                return (
                  <div key={pos} style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8, paddingLeft: 4 }}>
                      {pos}s
                    </div>
                    {players.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6 }}>
                        {p.photo
                          ? <img src={p.photo} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                          : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-muted)' }}>
                              {p.number > 0 ? p.number : '?'}
                            </div>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <span>{p.age ? `Age ${p.age}` : t.ageTba}</span>
                            <span style={{ opacity: 0.4 }}>·</span>
                            {p.club?.logo && (
                              <img src={p.club.logo} alt="" style={{ width: 14, height: 14, objectFit: 'contain', flexShrink: 0 }} />
                            )}
                            <span>{p.club?.name || t.clubTba}</span>
                          </div>
                        </div>
                        {p.number > 0 && (
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-muted)', letterSpacing: 1, minWidth: 28, textAlign: 'right' }}>
                            {p.number}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
              {squad.length === 0 && <p className="muted" style={{ textAlign: 'center', padding: 24 }}>{t.squadNotAnnounced}</p>}
            </>
          )}

          {/* Path to Final */}
          {tab === 'fixtures' && (() => {
            const group = localScheduleTeamName
              ? getTeamGroup(allSortedMatches, localScheduleTeamName)
              : null
            const chains = group ? buildPathChains(allSortedMatches, group, pathPosition) : []
            const statusColor = (s: string) =>
              s === 'confirmed' ? 'var(--green)' :
              s === 'eliminated' ? 'var(--red)' :
              s === 'blocked' ? '#444' : 'var(--border)'
            const statusBg = (s: string) =>
              s === 'confirmed' ? 'rgba(0,200,122,0.12)' :
              s === 'eliminated' ? 'rgba(255,59,59,0.08)' :
              s === 'blocked' ? 'rgba(0,0,0,0.2)' : 'transparent'
            const statusLabel = (s: string) =>
              s === 'confirmed' ? t.pathConfirmedBadge :
              s === 'eliminated' ? t.pathEliminatedBadge :
              s === 'blocked' ? t.pathBlockedBadge : t.pathUpcomingBadge

            const groupStageMatches = localMatches.filter(m => /^Group [A-L]$/i.test(m.stage))

            return (
              <>
                {/* Group stage results */}
                {groupStageMatches.length > 0 && (
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
                      {t.groupStage}
                    </div>
                    {groupStageMatches.map(match => {
                      const isHome = match.home_team === localScheduleTeamName
                      const opponent = isHome ? match.away_team : match.home_team
                      const opponentFlag = isHome ? match.away_flag : match.home_flag
                      const resultMap: Record<string, string> = { home: isHome ? 'W' : 'L', away: isHome ? 'L' : 'W', draw: 'D' }
                      const resultLabel = match.result ? resultMap[match.result] : null
                      const borderColor = resultLabel === 'W' ? 'rgba(0,200,122,0.3)' : resultLabel === 'L' ? 'rgba(255,59,59,0.2)' : 'var(--border)'
                      const resultColor = resultLabel === 'W' ? 'var(--green)' : resultLabel === 'L' ? 'var(--red)' : 'var(--text-muted)'
                      return (
                        <div key={match.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '12px 14px', background: 'var(--surface)',
                          border: `1px solid ${borderColor}`,
                          borderRadius: 8, marginBottom: 6
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3 }}>
                              {match.stage}
                            </div>
                            <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                              {isHome ? 'vs' : '@'} <Flag emoji={opponentFlag} size={14} />{opponent}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtDate(match.kickoff_at)}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            {match.result ? (
                              <>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: 2, color: resultColor }}>
                                  {isHome ? match.home_score : match.away_score} – {isHome ? match.away_score : match.home_score}
                                </div>
                                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: resultColor }}>
                                  {resultLabel}
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Eliminated — hide selector and path chains */}
                {finishPosition === 4 ? (
                  <div style={{ padding: '14px 16px', background: 'rgba(255,59,59,0.07)', border: '1px solid rgba(255,59,59,0.25)', borderRadius: 10, marginBottom: 16 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, color: 'var(--red)', marginBottom: 4 }}>
                      {t.eliminated}
                    </div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {t.eliminatedGroupStage}
                    </div>
                  </div>
                ) : (
                <>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, marginTop: 0 }}>
                  {t.pathToFinalSub}
                </p>

                {/* Position selector */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
                  {(['1st', '2nd', 'best_3rd'] as PathPosition[]).map(pos => {
                    const label =
                      pos === '1st' ? t.pathAs1st.replace('{group}', group || '?') :
                      pos === '2nd' ? t.pathAs2nd.replace('{group}', group || '?') :
                      t.pathAsBest3rd
                    const active = pathPosition === pos
                    // A position is "no longer possible" once all group games are settled
                    const invalid = allGroupGamesDone && finishPosition !== null && (
                      finishPosition === 1 ? pos !== '1st' :
                      finishPosition === 2 ? pos !== '2nd' :
                      finishPosition === 3 ? pos !== 'best_3rd' :
                      true // 4th place: all paths gone
                    )
                    return (
                      <button
                        key={pos}
                        onClick={() => { if (!invalid) setPathPosition(pos) }}
                        style={{
                          padding: '7px 14px', borderRadius: 20,
                          border: `1px solid ${invalid ? 'rgba(255,59,59,0.35)' : active ? 'var(--green)' : 'var(--border)'}`,
                          background: invalid ? 'rgba(255,59,59,0.07)' : active ? 'rgba(0,200,122,0.12)' : 'transparent',
                          color: invalid ? 'var(--red)' : active ? 'var(--green)' : 'var(--text-muted)',
                          fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12,
                          letterSpacing: 0.5, textTransform: 'uppercase',
                          cursor: invalid ? 'default' : 'pointer',
                          textDecoration: invalid ? 'line-through' : 'none',
                          opacity: invalid ? 0.75 : 1,
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>

                {allSortedMatches.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)' }}>
                    Loading…
                  </div>
                ) : !group ? (
                  <div className="card" style={{ textAlign: 'center' }}>
                    <p className="muted" style={{ margin: 0 }}>{t.pathGroupNotDetermined}</p>
                  </div>
                ) : chains.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center' }}>
                    <p className="muted" style={{ margin: 0 }}>{t.pathNoPathFound}</p>
                  </div>
                ) : (
                  chains[0].steps.map((step, i) => {
                    const isLast = i === chains[0].steps.length - 1
                    const isFinal = step.match.stage === 'Final'
                    return (
                      <div key={step.match.id} style={{ position: 'relative', paddingLeft: 32, marginBottom: isLast ? 0 : 0 }}>
                        {/* Vertical connector line */}
                        {!isLast && (
                          <div style={{
                            position: 'absolute', left: 10, top: 32, bottom: -8,
                            width: 2, background: step.status === 'confirmed' ? 'rgba(0,200,122,0.35)'
                              : step.status === 'eliminated' || step.status === 'blocked' ? 'rgba(255,59,59,0.2)'
                              : 'var(--border)'
                          }} />
                        )}
                        {/* Circle node */}
                        <div style={{
                          position: 'absolute', left: 4, top: 18,
                          width: 14, height: 14, borderRadius: '50%',
                          background: statusColor(step.status),
                          border: `2px solid ${step.status === 'upcoming' ? 'var(--border)' : statusColor(step.status)}`,
                          zIndex: 1
                        }} />

                        <div style={{
                          padding: '12px 14px',
                          background: statusBg(step.status),
                          border: `1px solid ${statusColor(step.status)}`,
                          borderRadius: 10, marginBottom: 10,
                          opacity: step.status === 'blocked' ? 0.5 : 1,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                            <div style={{
                              fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700,
                              letterSpacing: 1.5, textTransform: 'uppercase',
                              color: isFinal ? 'var(--gold)' : 'var(--text-muted)'
                            }}>
                              M{step.matchNum} · {step.match.stage}
                            </div>
                            <div style={{
                              fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700,
                              letterSpacing: 0.5, textTransform: 'uppercase',
                              color: statusColor(step.status), flexShrink: 0
                            }}>
                              {statusLabel(step.status)}
                            </div>
                          </div>

                          <div style={{
                            fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 16,
                            color: step.status === 'blocked' ? 'var(--text-muted)' : 'var(--text)',
                            marginBottom: 5,
                            textDecoration: step.status === 'blocked' ? 'line-through' : 'none'
                          }}>
                            vs {step.opponentSlot}
                          </div>

                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {fmtDate(step.match.kickoff_at)}
                            {step.match.venue && (
                              <span style={{ opacity: 0.7 }}> · {step.match.venue}</span>
                            )}
                          </div>

                          {step.match.result && (
                            <div style={{
                              marginTop: 6,
                              fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: 2,
                              color: step.status === 'confirmed' ? 'var(--green)' : 'var(--red)'
                            }}>
                              {step.match.home_score} – {step.match.away_score}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}

                {pathPosition === 'best_3rd' && group && chains.length > 0 && (
                  <div style={{
                    marginTop: 10, padding: '10px 14px',
                    background: 'rgba(245,197,24,0.06)',
                    border: '1px solid rgba(245,197,24,0.2)',
                    borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5
                  }}>
                    {t.pathBestThirdNote}
                  </div>
                )}

                <Link href="/world-cup/how-to-qualify" style={{
                  display: 'block', marginTop: 14,
                  fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700,
                  color: 'var(--text-muted)', textDecoration: 'none', letterSpacing: 0.3
                }}>
                  {t.pathLinkHowToQualify}
                </Link>
              </>
                )}
              </>
            )
          })()}
        </>
      ) : (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted">Team not found</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <Link href="/world-cup/team" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>{t.changeSavedTeam}</Link>
        <Link href="/world-cup/standings" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 0 }}>← {t.standings}</Link>
      </div>
    </div>
  )
}

export default function TeamPage() {
  return <Suspense><TeamContent /></Suspense>
}
