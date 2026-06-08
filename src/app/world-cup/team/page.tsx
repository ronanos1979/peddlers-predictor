'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLocale } from '@/lib/useLocale'
import { supabase, type Match } from '@/lib/supabase'
import Flag from '@/components/Flag'
import Link from 'next/link'

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

  useEffect(() => {
    setSavedTeam(readSavedTeam())
  }, [])

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

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['squad', 'fixtures'] as const).map(tab_option => (
              <button key={tab_option} onClick={() => setTab(tab_option)} style={{
                padding: '8px 16px', borderRadius: 20,
                border: `1px solid ${tab === tab_option ? 'var(--green)' : 'var(--border)'}`,
                background: tab === tab_option ? 'rgba(0,200,122,0.12)' : 'transparent',
                color: tab === tab_option ? 'var(--green)' : 'var(--text-muted)',
                fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12,
                letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer'
              }}>
                {tab_option === 'squad' ? t.squad : t.pathToFinal}
              </button>
            ))}
          </div>

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

          {/* Fixtures / path to final */}
          {tab === 'fixtures' && (
            <>
              {/* API-Football fixtures (available once tournament starts) */}
              {upcomingFixtures.map(f => {
                const isHome = f.teams.home.id === numericTeamId
                const opponent = isHome ? f.teams.away : f.teams.home
                const myGoals = isHome ? f.goals.home : f.goals.away
                const theirGoals = isHome ? f.goals.away : f.goals.home
                const done = f.fixture.status.short === 'FT' || f.fixture.status.short === 'AET' || f.fixture.status.short === 'PEN'
                const won = done && myGoals !== null && theirGoals !== null && myGoals > theirGoals
                const drew = done && myGoals !== null && theirGoals !== null && myGoals === theirGoals
                const lost = done && myGoals !== null && theirGoals !== null && myGoals < theirGoals
                return (
                  <div key={f.fixture.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', background: 'var(--surface)',
                    border: `1px solid ${won ? 'rgba(0,200,122,0.3)' : lost ? 'rgba(255,59,59,0.2)' : 'var(--border)'}`,
                    borderRadius: 8, marginBottom: 8
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 3 }}>
                        {f.league.round}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {opponent.logo && <img src={opponent.logo} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />}
                        <span style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14 }}>{isHome ? 'vs' : '@'} {opponent.name}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{fmtDate(f.fixture.date)}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {done ? (
                        <>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: 2, color: won ? 'var(--green)' : lost ? 'var(--red)' : 'var(--text-muted)' }}>
                            {myGoals} – {theirGoals}
                          </div>
                          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: won ? 'var(--green)' : lost ? 'var(--red)' : 'var(--text-dim)' }}>
                            {won ? 'W' : drew ? 'D' : 'L'}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-dim)' }}>TBD</div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Local schedule fallback — shown when API-Football fixtures aren't available yet */}
              {upcomingFixtures.length === 0 && upcomingLocalMatches.map(match => {
                const isHome = match.home_team === localScheduleTeamName
                const opponent = isHome ? match.away_team : match.home_team
                const opponentFlag = isHome ? match.away_flag : match.home_flag
                const resultMap: Record<string, string> = { home: isHome ? 'W' : 'L', away: isHome ? 'L' : 'W', draw: 'D' }
                const resultLabel = match.result ? resultMap[match.result] : null
                return (
                  <div key={match.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', background: 'var(--surface)',
                    border: `1px solid ${resultLabel === 'W' ? 'rgba(0,200,122,0.3)' : resultLabel === 'L' ? 'rgba(255,59,59,0.2)' : 'var(--border)'}`,
                    borderRadius: 8, marginBottom: 8
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
                    {resultLabel && (
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: resultLabel === 'W' ? 'var(--green)' : resultLabel === 'L' ? 'var(--red)' : 'var(--text-muted)' }}>
                        {resultLabel}
                      </div>
                    )}
                  </div>
                )
              })}

              {upcomingFixtures.length === 0 && upcomingLocalMatches.length === 0 && (
                <p className="muted" style={{ textAlign: 'center', padding: 24 }}>{t.noUpcomingMatches}</p>
              )}
            </>
          )}
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
