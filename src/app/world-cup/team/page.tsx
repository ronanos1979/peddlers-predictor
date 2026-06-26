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
import { formatPlaceholder, parseGroupLetters } from '@/app/world-cup/bracket/bracketHelpers'

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

function groupRemainingLabel(rows: StandingRow[], t: Record<string, string>): string | null {
  if (rows.length < 4) return null
  const totalPlayed = rows.reduce((s, r) => s + r.all.played, 0) / 2
  const remaining = 6 - totalPlayed
  if (remaining <= 0) return null
  if (remaining === 1) {
    const notDone = rows.filter(r => r.all.played < 3)
    if (notDone.length === 2) return `${notDone[0].team.name} vs ${notDone[1].team.name}`
  }
  return t.groupMatchesLeft.replace('{n}', String(remaining))
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

type ResolvedOpponent = { label: string; confirmed: boolean; schedName: string | null }

function GroupDropdown({ letter, allGroupStandings }: { letter: string; allGroupStandings: StandingRow[][] }) {
  const [open, setOpen] = useState(false)
  const { t } = useLocale()
  const rows = allGroupStandings[letter.charCodeAt(0) - 65] ?? []
  const done = rows.length >= 4 && rows.every(r => r.all.played >= 3)
  const remainingLabel = rows.length > 0 && !done ? groupRemainingLabel(rows, t) : null
  // Always show the button even while data is loading — content shows loading state when empty
  return (
    <div style={{ marginTop: 5 }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
          fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700,
          color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase',
        }}
      >
        See Group {letter}
        {rows.length > 0 && (
          <span style={{ fontFamily: 'var(--font-cond)', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: done ? 'var(--green)' : 'var(--amber)', padding: '1px 4px', borderRadius: 3, border: `1px solid ${done ? 'rgba(0,200,122,0.3)' : 'rgba(245,197,24,0.3)'}`, background: done ? 'rgba(0,200,122,0.08)' : 'rgba(245,197,24,0.08)' }}>
            {done ? t.groupFinalStandings : t.groupInProgress}{remainingLabel && ` · ${remainingLabel}`}
          </span>
        )}
        {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{ marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {rows.length === 0 ? (
            <div style={{ padding: '10px 12px', fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)' }}>Loading…</div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['#', 'Team', 'P', 'W', 'D', 'L', 'Pts'].map((h, hi) => (
                      <th key={hi} style={{ padding: '5px 6px', textAlign: hi <= 1 ? 'left' : 'center', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.team.id} style={{ background: i < 2 ? 'rgba(0,200,122,0.05)' : 'transparent', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '6px', textAlign: 'center', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 11, color: i < 2 ? 'var(--green)' : 'var(--text-muted)' }}>{i + 1}</td>
                      <td style={{ padding: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {row.team.logo && <img src={row.team.logo} alt="" style={{ width: 14, height: 14, objectFit: 'contain', flexShrink: 0 }} />}
                          <Link href={`/world-cup/team?id=${row.team.id}`} style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 11, color: 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            {row.team.name}
                          </Link>
                        </div>
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-muted)' }}>{row.all.played}</td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-muted)' }}>{row.all.win}</td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-muted)' }}>{row.all.draw}</td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-muted)' }}>{row.all.lose}</td>
                      <td style={{ padding: '6px', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--green)' }}>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '4px 8px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--green)', fontFamily: 'var(--font-cond)', fontWeight: 700 }}>■ Qualified (top 2)</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Possible3rdOpponents({
  matches, resolveOpponent, allGroupStandings, t,
}: {
  matches: MatchRecord[]
  resolveOpponent: (slot: string) => ResolvedOpponent
  allGroupStandings: StandingRow[][]
  t: ReturnType<typeof useLocale>['t']
}) {
  if (matches.length === 0) return null
  return (
    <div style={{ marginTop: 8, padding: '12px 14px', background: 'rgba(245,197,24,0.05)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: 10 }}>
      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 8 }}>
        Possible Round of 32 Opponent
      </div>
      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
        The exact opponent depends on which 8 of the 12 third-placed teams qualify. FIFA uses a fixed allocation table.
      </div>
      {matches.map(m => {
        const third3slot   = isPlaceholderTeam(m.home_team) && /3rd Place/i.test(m.home_team) ? m.home_team : m.away_team
        const opponentSlot = third3slot === m.home_team ? m.away_team : m.home_team
        const opp          = resolveOpponent(opponentSlot)
        const letters      = opp.confirmed ? [] : parseGroupLetters(opponentSlot)
        return (
          <div key={m.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, color: opp.confirmed ? 'var(--text)' : 'var(--text-muted)' }}>
              {opp.schedName
                ? <Link href={`/world-cup/team?name=${encodeURIComponent(opp.schedName)}`} style={{ textDecoration: 'none', color: 'inherit' }}>{opp.label}</Link>
                : opp.label
              }
              {opp.confirmed && <span style={{ marginLeft: 5, fontFamily: 'var(--font-cond)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--green)' }}>✓ confirmed</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
              {m.stage} · {new Date(m.kickoff_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {m.venue && <span style={{ opacity: 0.7 }}> · {m.venue}</span>}
            </div>
            {letters.map(l => <GroupDropdown key={l} letter={l} allGroupStandings={allGroupStandings} />)}
          </div>
        )
      })}
    </div>
  )
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
  const [allGroupStandings, setAllGroupStandings] = useState<StandingRow[][]>([])
  const [standingsOpen, setStandingsOpen] = useState(false)
  const [selectedChainIdx, setSelectedChainIdx] = useState(0)
  const [groupStageOpen, setGroupStageOpen] = useState(false)
  const [matchEventsById, setMatchEventsById] = useState<Map<string, Array<{ type: string; detail: string; time: { elapsed: number; extra: number | null }; player: { name: string }; teamSide: 'home' | 'away' | undefined }>>>(new Map())

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

  // Fetch match events for completed group stage matches
  useEffect(() => {
    const completed = localMatches.filter(m => /^Group [A-L]$/i.test(m.stage) && m.result)
    if (completed.length === 0) return
    const ids = completed.map(m => m.id)
    supabase
      .from('match_events')
      .select('match_id, events')
      .in('match_id', ids)
      .then(({ data }) => {
        if (!data) return
        const map = new Map<string, Array<{ type: string; detail: string; time: { elapsed: number; extra: number | null }; player: { name: string }; teamSide: 'home' | 'away' | undefined }>>()
        for (const row of data) map.set(row.match_id, (row.events as never[]) || [])
        setMatchEventsById(map)
      })
  }, [localMatches])

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
        setAllGroupStandings(raw)
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
  const standingsGroupDone = groupStandings.length >= 4 && groupStandings.every(r => r.all.played >= 3)
  const standingsRemainingLabel = standingsGroupDone ? null : groupRemainingLabel(groupStandings, t)
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
  // Placeholder may have been replaced in DB by updateKnockoutNames() — fall back to actual team name
  const nextKnockoutMatchByPlaceholder = posSlot
    ? (allSortedMatches.find(m => m.home_team === posSlot || m.away_team === posSlot) ?? null)
    : null
  const nextKnockoutMatchByName = (!nextKnockoutMatchByPlaceholder && qualified && schedName)
    ? (allSortedMatches.find(m => m.stage === 'Round of 32' && (m.home_team === schedName || m.away_team === schedName)) ?? null)
    : null
  const nextKnockoutMatch = nextKnockoutMatchByPlaceholder ?? nextKnockoutMatchByName
  const nextKnockoutTeamIsHome = nextKnockoutMatch
    ? (nextKnockoutMatchByPlaceholder ? nextKnockoutMatch.home_team === posSlot : nextKnockoutMatch.home_team === schedName)
    : false

  // For 3rd-placed teams: find all R32 matches that could receive this team based on FIFA's
  // fixed allocation table. Each R32 slot stores "3rd Place (A/B/C/D/F)" in the DB — we check
  // if currentGroup appears in that list. The other side of the match is the potential opponent.
  const FD_TO_SCHED_MAP: Record<string, string> = {
    'United States': 'USA', 'Korea Republic': 'South Korea',
    "Côte d'Ivoire": 'Ivory Coast', 'Turkey': 'Türkiye',
    'Czech Republic': 'Czechia', 'Cape Verde Islands': 'Cape Verde',
    'Bosnia-Herzegovina': 'Bosnia & Herzegovina', 'Cabo Verde': 'Cape Verde',
  }
  function resolveOpponent(slot: string): { label: string; confirmed: boolean; schedName: string | null } {
    const winnerM = slot.match(/^Group ([A-L]) Winner$/i)
    if (winnerM) {
      const g = allGroupStandings[winnerM[1].toUpperCase().charCodeAt(0) - 65]
      if (g && g.length >= 4 && g.every(r => r.all.played >= 3)) {
        const name = g[0].team.name
        return { label: FD_TO_SCHED_MAP[name] ?? name, confirmed: true, schedName: FD_TO_SCHED_MAP[name] ?? name }
      }
      return { label: `1st · Group ${winnerM[1].toUpperCase()}`, confirmed: false, schedName: null }
    }
    const runnerM = slot.match(/^Group ([A-L]) Runner-up$/i)
    if (runnerM) {
      const g = allGroupStandings[runnerM[1].toUpperCase().charCodeAt(0) - 65]
      if (g && g.length >= 4 && g.every(r => r.all.played >= 3)) {
        const name = g[1].team.name
        return { label: FD_TO_SCHED_MAP[name] ?? name, confirmed: true, schedName: FD_TO_SCHED_MAP[name] ?? name }
      }
      return { label: `2nd · Group ${runnerM[1].toUpperCase()}`, confirmed: false, schedName: null }
    }
    return { label: formatPlaceholder(slot), confirmed: false, schedName: null }
  }
  const possible3rdMatches: MatchRecord[] = (finishPosition === 3 && currentGroup && allGroupGamesDone)
    ? allSortedMatches.filter(m => m.stage === 'Round of 32' && (() => {
        const checkSlot = (slot: string) => {
          const mm = slot.match(/^3rd Place \(([^)]+)\)/i)
          return mm ? mm[1].split('/').map(s => s.trim()).includes(currentGroup) : false
        }
        return (isPlaceholderTeam(m.home_team) && checkSlot(m.home_team))
            || (isPlaceholderTeam(m.away_team) && checkSlot(m.away_team))
      })())
    : []

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
                    <div style={{ padding: '8px 12px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: 1 }}>Group {currentGroup}</span>
                      {groupStandings.length >= 4 && (
                        <span style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: standingsGroupDone ? 'var(--green)' : 'var(--amber)', padding: '2px 6px', borderRadius: 4, border: `1px solid ${standingsGroupDone ? 'rgba(0,200,122,0.3)' : 'rgba(245,197,24,0.3)'}`, background: standingsGroupDone ? 'rgba(0,200,122,0.08)' : 'rgba(245,197,24,0.08)' }}>
                          {standingsGroupDone ? t.groupFinalStandings : t.groupInProgress}{standingsRemainingLabel && ` · ${standingsRemainingLabel}`}
                        </span>
                      )}
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
                {qualified && nextKnockoutMatch && (() => {
                  const oSlot = nextKnockoutTeamIsHome ? nextKnockoutMatch.away_team : nextKnockoutMatch.home_team
                  const letters = parseGroupLetters(oSlot)
                  return (
                    <div style={{ padding: '12px 14px', background: 'linear-gradient(135deg, rgba(0,200,122,0.07), rgba(245,197,24,0.04))', border: '1px solid rgba(0,200,122,0.25)', borderRadius: 10 }}>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 5 }}>
                        {t.nextMatch} · {nextKnockoutMatch.stage}
                      </div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15, marginBottom: letters.length > 0 ? 2 : 4 }}>
                        vs {isPlaceholderTeam(oSlot) ? formatPlaceholder(oSlot) : oSlot}
                      </div>
                      {letters.map(l => <GroupDropdown key={l} letter={l} allGroupStandings={allGroupStandings} />)}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: letters.length > 0 ? 6 : 0 }}>
                        {fmtDate(nextKnockoutMatch.kickoff_at)}
                        {nextKnockoutMatch.venue && <span style={{ opacity: 0.7 }}> · {nextKnockoutMatch.venue}</span>}
                      </div>
                    </div>
                  )
                })()}
                {finishPosition === 3 && (
                  <>
                    <Link href="/world-cup/best-3rd" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: 'rgba(245,197,24,0.07)', border: '1px solid rgba(245,197,24,0.3)', borderRadius: 10, textDecoration: 'none', marginTop: 8 }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>🥉</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, color: 'var(--amber)' }}>{t.best3rdNavLabel}</div>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{t.best3rdNavDesc}</div>
                      </div>
                      <span style={{ color: 'var(--amber)', fontSize: 14, flexShrink: 0 }}>→</span>
                    </Link>
                    {possible3rdMatches.length > 0 && <Possible3rdOpponents matches={possible3rdMatches} resolveOpponent={resolveOpponent} allGroupStandings={allGroupStandings} t={t} />}
                  </>
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
              {qualified && nextKnockoutMatch && (() => {
                const oSlot = nextKnockoutTeamIsHome ? nextKnockoutMatch.away_team : nextKnockoutMatch.home_team
                const letters = parseGroupLetters(oSlot)
                return (
                  <div style={{ padding: '12px 14px', background: 'linear-gradient(135deg, rgba(0,200,122,0.07), rgba(245,197,24,0.04))', border: '1px solid rgba(0,200,122,0.25)', borderRadius: 10 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 5 }}>
                      {t.nextMatch} · {nextKnockoutMatch.stage}
                    </div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15, marginBottom: letters.length > 0 ? 2 : 4 }}>
                      vs {isPlaceholderTeam(oSlot) ? formatPlaceholder(oSlot) : oSlot}
                    </div>
                    {letters.map(l => <GroupDropdown key={l} letter={l} allGroupStandings={allGroupStandings} />)}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: letters.length > 0 ? 6 : 0 }}>
                      {fmtDate(nextKnockoutMatch.kickoff_at)}
                      {nextKnockoutMatch.venue && <span style={{ opacity: 0.7 }}> · {nextKnockoutMatch.venue}</span>}
                    </div>
                  </div>
                )
              })()}
              {finishPosition === 3 && (
                <>
                  <Link href="/world-cup/best-3rd" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: 'rgba(245,197,24,0.07)', border: '1px solid rgba(245,197,24,0.3)', borderRadius: 10, textDecoration: 'none', marginTop: 8 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>🥉</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, color: 'var(--amber)' }}>{t.best3rdNavLabel}</div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{t.best3rdNavDesc}</div>
                    </div>
                    <span style={{ color: 'var(--amber)', fontSize: 14, flexShrink: 0 }}>→</span>
                  </Link>
                  {possible3rdMatches.length > 0 && <Possible3rdOpponents matches={possible3rdMatches} resolveOpponent={resolveOpponent} allGroupStandings={allGroupStandings} t={t} />}
                </>
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
            const chains = group ? buildPathChains(allSortedMatches, group, pathPosition, localScheduleTeamName || teamName) : []
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
                {groupStageMatches.length > 0 && (() => {
                  const matchRows = groupStageMatches.map(match => {
                    const isHome = match.home_team === localScheduleTeamName
                    const myTeam = localScheduleTeamName
                    const myFlag = isHome ? match.home_flag : match.away_flag
                    const opponent = isHome ? match.away_team : match.home_team
                    const opponentFlag = isHome ? match.away_flag : match.home_flag

                    // Events
                    const events = matchEventsById.get(match.id) ?? []
                    const goals = events.filter(e => e.type === 'Goal' && e.detail !== 'Own Goal')
                    const ownGoals = events.filter(e => e.detail === 'Own Goal')
                    // My goals: goals by my side + own goals by opponent side (credited to me)
                    const allMyGoals = [
                      ...goals.filter(e => e.teamSide === (isHome ? 'home' : 'away')),
                      ...ownGoals.filter(e => e.teamSide === (isHome ? 'away' : 'home')),
                    ].sort((a, b) => a.time.elapsed - b.time.elapsed)
                    const allOppGoals = [
                      ...goals.filter(e => e.teamSide === (isHome ? 'away' : 'home')),
                      ...ownGoals.filter(e => e.teamSide === (isHome ? 'home' : 'away')),
                    ].sort((a, b) => a.time.elapsed - b.time.elapsed)

                    // Score: prefer DB value, fall back to event count when events are loaded
                    const hasDbScore = match.home_score !== null && match.away_score !== null
                    const homeScoreEvt = goals.filter(e => e.teamSide === 'home').length + ownGoals.filter(e => e.teamSide === 'away').length
                    const awayScoreEvt = goals.filter(e => e.teamSide === 'away').length + ownGoals.filter(e => e.teamSide === 'home').length
                    const homeScore = hasDbScore ? match.home_score! : (events.length > 0 ? homeScoreEvt : null)
                    const awayScore = hasDbScore ? match.away_score! : (events.length > 0 ? awayScoreEvt : null)
                    const myScore = isHome ? homeScore : awayScore
                    const oppScore = isHome ? awayScore : homeScore

                    // Derive W/D/L from actual score (events override wrong DB result)
                    const derivedLabel = (myScore !== null && oppScore !== null)
                      ? (myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D')
                      : (match.result ? ({ home: isHome ? 'W' : 'L', away: isHome ? 'L' : 'W', draw: 'D' }[match.result]) : null)
                    const resultColor = derivedLabel === 'W' ? 'var(--green)' : derivedLabel === 'L' ? 'var(--red)' : 'var(--text-muted)'
                    const borderColor = derivedLabel === 'W' ? 'rgba(0,200,122,0.3)' : derivedLabel === 'L' ? 'rgba(255,59,59,0.2)' : 'var(--border)'

                    const fmtGoal = (e: typeof allMyGoals[0]) => {
                      const icon = e.detail === 'Own Goal' ? '⚽🔴' : e.detail === 'Penalty' ? '⚽(P)' : '⚽'
                      const min = `${e.time.elapsed}${e.time.extra ? `+${e.time.extra}` : ''}'`
                      return `${icon} ${e.player.name} ${min}`
                    }

                    return (
                      <div key={match.id} style={{
                        padding: '12px 14px', background: 'var(--surface)',
                        border: `1px solid ${borderColor}`, borderRadius: 8, marginBottom: 6
                      }}>
                        {/* Stage + date */}
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                          {match.stage} · {fmtDate(match.kickoff_at)}
                        </div>
                        {/* Teams + score */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14 }}>
                            <Flag emoji={myFlag} size={15} />{myTeam}
                          </div>
                          <div style={{ textAlign: 'center', flexShrink: 0 }}>
                            {(myScore !== null && oppScore !== null) ? (
                              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: 2, color: resultColor }}>
                                {myScore}–{oppScore}
                              </div>
                            ) : match.result ? (
                              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: resultColor }}>vs</div>
                            ) : (
                              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)' }}>vs</div>
                            )}
                            {derivedLabel && (
                              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: resultColor, textAlign: 'center' }}>
                                {derivedLabel}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, textAlign: 'right' }}>
                            {opponent}<Flag emoji={opponentFlag} size={15} />
                          </div>
                        </div>
                        {/* Goal scorers grouped by team */}
                        {(allMyGoals.length > 0 || allOppGoals.length > 0) && (
                          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {allMyGoals.length > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                <span style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>
                                  <Flag emoji={myFlag} size={11} /> {myTeam}
                                </span>
                                {allMyGoals.map((e, i) => <span key={i} style={{ marginRight: 8 }}>{fmtGoal(e)}</span>)}
                              </div>
                            )}
                            {allOppGoals.length > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                <span style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>
                                  <Flag emoji={opponentFlag} size={11} /> {opponent}
                                </span>
                                {allOppGoals.map((e, i) => <span key={i} style={{ marginRight: 8 }}>{fmtGoal(e)}</span>)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                  if (!allGroupGamesDone) {
                    // Group still in progress — show inline, no toggle
                    return (
                      <div style={{ marginBottom: 22 }}>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
                          {t.groupStage}
                        </div>
                        {matchRows}
                      </div>
                    )
                  }
                  // Group complete — collapsible, default closed
                  const wins = groupStageMatches.filter(m => { const r = m.home_team === localScheduleTeamName ? m.result === 'home' : m.result === 'away'; return r }).length
                  const draws = groupStageMatches.filter(m => m.result === 'draw').length
                  const losses = groupStageMatches.filter(m => m.result && !( m.home_team === localScheduleTeamName ? m.result === 'home' : m.result === 'away') && m.result !== 'draw').length
                  return (
                    <div style={{ marginBottom: 22 }}>
                      <button
                        onClick={() => setGroupStageOpen(o => !o)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: groupStageOpen ? '8px 8px 0 0' : 8,
                          padding: '10px 14px', cursor: 'pointer', marginBottom: 0,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            {t.groupStage}
                          </span>
                          <span style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 0.5 }}>
                            {wins}W · {draws}D · {losses}L
                          </span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)' }}>{groupStageOpen ? '▲' : '▼'}</span>
                      </button>
                      {groupStageOpen && (
                        <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '10px 0 4px', marginBottom: 0 }}>
                          <div style={{ padding: '0 0 6px' }}>{matchRows}</div>
                        </div>
                      )}
                    </div>
                  )
                })()}

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
                  (() => {
                  const safeIdx = Math.min(selectedChainIdx, chains.length - 1)
                  const chain = chains[safeIdx]
                  return (
                  <>
                  {chains.length > 1 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
                      {chains.map((_, chainIdx) => (
                        <button
                          key={chainIdx}
                          onClick={() => setSelectedChainIdx(chainIdx)}
                          style={{
                            padding: '6px 8px', borderRadius: 20,
                            border: `1px solid ${chainIdx === safeIdx ? 'var(--amber)' : 'var(--border)'}`,
                            background: chainIdx === safeIdx ? 'rgba(245,197,24,0.12)' : 'transparent',
                            color: chainIdx === safeIdx ? 'var(--amber)' : 'var(--text-muted)',
                            fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12,
                            letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer',
                          }}
                        >
                          {t.pathOptionOf.replace('{n}', String(chainIdx + 1)).replace('{total}', String(chains.length))}
                        </button>
                      ))}
                    </div>
                  )}
                  {chain.steps.map((step, i) => {
                        const isLast = i === chain.steps.length - 1
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
                                marginBottom: parseGroupLetters(step.opponentSlot).length > 0 ? 2 : 5,
                                textDecoration: step.status === 'blocked' ? 'line-through' : 'none'
                              }}>
                                vs {isPlaceholderTeam(step.opponentSlot) ? formatPlaceholder(step.opponentSlot) : step.opponentSlot}
                              </div>
                              {step.status !== 'blocked' && parseGroupLetters(step.opponentSlot).map(l => (
                                <GroupDropdown key={l} letter={l} allGroupStandings={allGroupStandings} />
                              ))}

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
                      })}
                  </>
                  )
                  })()
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
