'use client'
import { useEffect, useState } from 'react'
import { useLocale } from '@/lib/useLocale'
import Link from 'next/link'

type TeamInfo = { team: { id: number; name: string; country: string; logo: string; founded: number; national: boolean }; venue: { name: string; city: string; capacity: number } }
type Player = { id: number; name: string; age: number; number: number; position: string; photo: string }
type Coach = { id: number; name: string; nationality: string; photo: string; career: Array<{ team: { name: string }; start: string; end: string | null }> }
type Fixture = {
  fixture: { id: number; date: string; status: { short: string } }
  league: { round: string }
  teams: { home: { id: number; name: string; logo: string; winner: boolean | null }; away: { id: number; name: string; logo: string; winner: boolean | null } }
  goals: { home: number | null; away: number | null }
}

const POSITION_ORDER = ['Goalkeeper', 'Defender', 'Midfielder', 'Attacker']

export default function TeamPage({ searchParams }: { searchParams: { id?: string } }) {
  const { t } = useLocale()
  const teamId = searchParams.id
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null)
  const [squad, setSquad] = useState<Player[]>([])
  const [coach, setCoach] = useState<Coach | null>(null)
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'squad' | 'fixtures'>('squad')

  useEffect(() => {
    if (!teamId) return
    async function load() {
      try {
        const [teamRes, squadRes, coachRes, fixturesRes] = await Promise.all([
          fetch(`/api/football?endpoint=teams&team=${teamId}`),
          fetch(`/api/football?endpoint=players/squads&team=${teamId}`),
          fetch(`/api/football?endpoint=coaches&team=${teamId}`),
          fetch(`/api/football?endpoint=fixtures&team=${teamId}`),
        ])
        const [teamData, squadData, coachData, fixturesData] = await Promise.all([
          teamRes.json(), squadRes.json(), coachRes.json(), fixturesRes.json()
        ])
        setTeamInfo(teamData.response?.[0] || null)
        const players: Player[] = squadData.response?.[0]?.players || []
        players.sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position))
        setSquad(players)
        setCoach(coachData.response?.[0] || null)
        const allFixtures: Fixture[] = fixturesData.response || []
        allFixtures.sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime())
        setFixtures(allFixtures)
      } catch { /* show empty */ }
      setLoading(false)
    }
    load()
  }, [teamId])

  if (!teamId) {
    return (
      <div className="container">
        <h1>Select a Team</h1>
        <p className="muted">Click on a team from the standings or schedule to view their profile.</p>
        <Link href="/world-cup/standings" className="btn btn-primary" style={{ textDecoration: 'none', marginTop: 16 }}>View Standings</Link>
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

  return (
    <div className="container">
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>Loading…</div>
      ) : teamInfo ? (
        <>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '24px 0 20px' }}>
            {teamInfo.team.logo && (
              <img src={teamInfo.team.logo} alt="" style={{ width: 72, height: 72, objectFit: 'contain' }} />
            )}
            <div>
              <h1 style={{ marginBottom: 4 }}>{teamInfo.team.name}</h1>
              <p className="muted">{teamInfo.team.country} · Est. {teamInfo.team.founded}</p>
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
                        {p.photo && <img src={p.photo} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Age {p.age}</div>
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-dim)', letterSpacing: 1 }}>
                          {p.number || '–'}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
              {squad.length === 0 && <p className="muted" style={{ textAlign: 'center', padding: 24 }}>Squad not yet announced</p>}
            </>
          )}

          {/* Fixtures / path to final */}
          {tab === 'fixtures' && (
            <>
              {fixtures.length === 0 && <p className="muted" style={{ textAlign: 'center', padding: 24 }}>No fixtures found</p>}
              {fixtures.map(f => {
                const isHome = f.teams.home.id === parseInt(teamId)
                const opponent = isHome ? f.teams.away : f.teams.home
                const myGoals = isHome ? f.goals.home : f.goals.away
                const theirGoals = isHome ? f.goals.away : f.goals.home
                const done = f.fixture.status.short === 'FT'
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
            </>
          )}
        </>
      ) : (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted">Team not found</p>
        </div>
      )}

      <Link href="/world-cup/standings" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 8 }}>← {t.standings}</Link>
    </div>
  )
}
