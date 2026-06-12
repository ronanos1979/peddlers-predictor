'use client'
import { useEffect, useState } from 'react'
import { useLocale } from '@/lib/useLocale'
import Link from 'next/link'

type MatchEvent = {
  time: { elapsed: number; extra: number | null }
  team: { id: number; name: string }
  player: { name: string }
  assist: { name: string } | null
  type: string
  detail: string
}

type Fixture = {
  fixture: { id: number; date: string; venue: { name: string; city: string } | null }
  league: { round: string }
  teams: { home: { name: string; logo: string }; away: { name: string; logo: string } }
  goals: { home: number | null; away: number | null } | null
  score: { fulltime: { home: number | null; away: number | null } | null } | null
  events?: MatchEvent[]
}

export default function ResultsPage() {
  const { t } = useLocale()
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [stages, setStages] = useState<string[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/football?endpoint=fixtures&status=FT')
        const data = await res.json()
        const results = (data.response || []) as Fixture[]
        results.sort((a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime())
        setFixtures(results)
        const uniqueStages = Array.from(new Set(results.map(f => f.league.round)))
        setStages(uniqueStages)
      } catch {
        setError(t.couldNotLoadResults)
      }
      setLoading(false)
    }
    load()
  }, [])

  const filtered = stageFilter === 'all' ? fixtures : fixtures.filter(f => f.league.round === stageFilter)

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  function fmtMinute(e: MatchEvent) {
    if (e.time.extra) return `${e.time.elapsed}+${e.time.extra}'`
    return `${e.time.elapsed}'`
  }

  function eventIcon(detail: string) {
    if (detail === 'Own Goal') return '⚽🔴'
    if (detail === 'Penalty') return '⚽(P)'
    if (detail === 'Normal Goal') return '⚽'
    if (detail === 'Yellow Card') return '🟨'
    if (detail === 'Yellow Red Card') return '🟥'
    if (detail === 'Red Card') return '🟥'
    return '⚽'
  }

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>{t.wc2026}</div>
        <h1>{t.matchResults}</h1>
        <p className="muted">{t.resultsSub}</p>
      </div>

      {stages.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {['all', ...stages].map(s => (
            <button key={s} onClick={() => setStageFilter(s)} style={{
              padding: '6px 12px', borderRadius: 20,
              border: `1px solid ${stageFilter === s ? 'var(--green)' : 'var(--border)'}`,
              background: stageFilter === s ? 'rgba(0,200,122,0.12)' : 'transparent',
              color: stageFilter === s ? 'var(--green)' : 'var(--text-muted)',
              fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12,
              letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer'
            }}>
              {s === 'all' ? t.allStages : s}
            </button>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>{t.loading}</div>}
      {error && <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{error}</div>}

      {!loading && filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>⚽</div>
          <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{t.noResultsYet}</p>
          <p className="muted" style={{ marginTop: 6 }}>{t.noResultsSub}</p>
        </div>
      )}

      {filtered.map(f => {
        const home = f.score?.fulltime?.home ?? f.goals?.home ?? null
        const away = f.score?.fulltime?.away ?? f.goals?.away ?? null
        const homeWon = home !== null && away !== null && home > away
        const awayWon = home !== null && away !== null && away > home
        const isExpanded = expanded.has(f.fixture.id)
        const hasEvents = f.events && f.events.length > 0
        const homeEvents = f.events?.filter(e => e.team.name === f.teams.home.name) || []
        const awayEvents = f.events?.filter(e => e.team.name === f.teams.away.name) || []

        return (
          <div key={f.fixture.id} className="card" style={{ padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)' }}>{f.league.round}</span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{fmtDate(f.fixture.date)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 }}>
              <div style={{ textAlign: 'right' }}>
                {f.teams.home.logo && <img src={f.teams.home.logo} alt="" style={{ width: 32, height: 32, objectFit: 'contain', marginLeft: 'auto', display: 'block', marginBottom: 4 }} />}
                <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, color: homeWon ? 'var(--green)' : 'var(--text)' }}>{f.teams.home.name}</div>
              </div>
              <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: 4, color: 'var(--text)', minWidth: 80 }}>
                {home ?? '–'} : {away ?? '–'}
              </div>
              <div style={{ textAlign: 'left' }}>
                {f.teams.away.logo && <img src={f.teams.away.logo} alt="" style={{ width: 32, height: 32, objectFit: 'contain', display: 'block', marginBottom: 4 }} />}
                <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, color: awayWon ? 'var(--green)' : 'var(--text)' }}>{f.teams.away.name}</div>
              </div>
            </div>

            {/* Goal scorers summary (always visible when available) */}
            {hasEvents && !isExpanded && (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <div style={{ textAlign: 'right', paddingRight: 8 }}>
                  {homeEvents.filter(e => e.type === 'Goal').map((e, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', lineHeight: 1.6 }}>
                      {eventIcon(e.detail)} {e.player.name} {fmtMinute(e)}
                    </div>
                  ))}
                </div>
                <div style={{ paddingLeft: 8 }}>
                  {awayEvents.filter(e => e.type === 'Goal').map((e, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', lineHeight: 1.6 }}>
                      {eventIcon(e.detail)} {e.player.name} {fmtMinute(e)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expanded event timeline */}
            {hasEvents && isExpanded && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                {f.events!.map((e, i) => {
                  const isHome = e.team.name === f.teams.home.name
                  const isGoal = e.type === 'Goal'
                  const isRedCard = e.detail === 'Red Card' || e.detail === 'Yellow Red Card'
                  return (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '1fr 36px 1fr',
                      alignItems: 'center', marginBottom: 6, fontSize: 11,
                      fontFamily: 'var(--font-cond)',
                    }}>
                      {isHome ? (
                        <div style={{ textAlign: 'right', paddingRight: 6, color: isGoal ? 'var(--text)' : isRedCard ? 'var(--red)' : 'var(--text-muted)' }}>
                          {e.player.name}
                          {e.assist?.name && <span style={{ color: 'var(--text-dim)' }}> ({e.assist.name})</span>}
                        </div>
                      ) : <div />}
                      <div style={{ textAlign: 'center', fontSize: 13 }}>{eventIcon(e.detail)}<br /><span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{fmtMinute(e)}</span></div>
                      {!isHome ? (
                        <div style={{ paddingLeft: 6, color: isGoal ? 'var(--text)' : isRedCard ? 'var(--red)' : 'var(--text-muted)' }}>
                          {e.player.name}
                          {e.assist?.name && <span style={{ color: 'var(--text-dim)' }}> ({e.assist.name})</span>}
                        </div>
                      ) : <div />}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Expand toggle */}
            {hasEvents && (
              <button onClick={() => toggleExpand(f.fixture.id)} style={{
                marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700,
                letterSpacing: 0.5, color: 'var(--text-dim)', padding: '2px 0',
                textTransform: 'uppercase',
              }}>
                {isExpanded ? '▲ Hide events' : '▼ All events (cards)'}
              </button>
            )}

            {f.fixture.venue && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-cond)' }}>
                📍 {f.fixture.venue.name}, {f.fixture.venue.city}
              </div>
            )}
          </div>
        )
      })}

      <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 8 }}>← {t.home}</Link>
    </div>
  )
}
