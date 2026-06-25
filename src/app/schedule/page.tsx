'use client'
import { useEffect, useState, useMemo, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, type Match } from '@/lib/supabase'
import { useLocale } from '@/lib/useLocale'
import Flag from '@/components/Flag'
import Link from 'next/link'

type MatchEvent = {
  time: { elapsed: number; extra: number | null }
  team: { name: string }
  player: { name: string }
  assist: { name: string } | null
  type: string
  detail: string
  teamSide?: 'home' | 'away'
}

type GroupedMatches = Record<string, Match[]>

function fmtMinute(e: MatchEvent) {
  return e.time.extra ? `${e.time.elapsed}+${e.time.extra}'` : `${e.time.elapsed}'`
}

function eventIcon(detail: string) {
  if (detail === 'Own Goal')        return '⚽🔴'
  if (detail === 'Penalty')         return '⚽(P)'
  if (detail === 'Normal Goal')     return '⚽'
  if (detail === 'Yellow Card')     return '🟨'
  if (detail === 'Yellow Red Card') return '🟥'
  if (detail === 'Red Card')        return '🟥'
  return '⚽'
}

function MatchCard({ m, norm, eventsById, t }: {
  m: Match
  norm: string
  eventsById: Map<string, MatchEvent[]>
  t: ReturnType<typeof useLocale>['t']
}) {
  const now = new Date()
  const kickoff = new Date(m.kickoff_at)
  const close   = new Date(m.entries_close_at)
  const isDone  = !!m.result
  const isLive  = !isDone && now >= kickoff && now <= close
  const status  = isDone ? 'done' : isLive ? 'live' : now < kickoff ? 'upcoming' : 'closed'

  const homeWon = m.result === 'home'
  const awayWon = m.result === 'away'
  const hasScore = m.home_score !== null && m.away_score !== null
  const events = eventsById.get(m.id) ?? null
  const hasEvents = isDone && events !== null && events.length > 0
  const homeEvents = (events || []).filter(e => e.teamSide === 'home')
  const awayEvents = (events || []).filter(e => e.teamSide === 'away')

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'long' })
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isLive ? 'var(--green)' : isDone ? 'rgba(255,255,255,0.06)' : 'var(--border)'}`,
      borderRadius: 10,
      padding: '12px 14px',
      marginBottom: 8,
      opacity: isDone ? 0.9 : 1,
    }}>
      {/* Teams + score */}
      {isDone && hasScore ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Link href={`/world-cup/team?name=${encodeURIComponent(m.home_team)}`} style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', minWidth: 0 }}>
            <Flag emoji={m.home_flag} size={18} />
            <span style={{
              fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14,
              color: homeWon ? 'var(--green)' : 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{m.home_team}</span>
            <span style={{ fontSize: 9, color: homeWon ? 'var(--green)' : 'var(--text-dim)', marginLeft: 1 }}>↗</span>
          </Link>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: 3, color: 'var(--text)', textAlign: 'center', minWidth: 70 }}>
            {m.home_score} – {m.away_score}
          </div>
          <Link href={`/world-cup/team?name=${encodeURIComponent(m.away_team)}`} style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', justifyContent: 'flex-end', minWidth: 0 }}>
            <span style={{ fontSize: 9, color: awayWon ? 'var(--green)' : 'var(--text-dim)', marginRight: 1 }}>↗</span>
            <span style={{
              fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14,
              color: awayWon ? 'var(--green)' : 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{m.away_team}</span>
            <Flag emoji={m.away_flag} size={18} />
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 6px' }}>
              <Link href={`/world-cup/team?name=${encodeURIComponent(m.home_team)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px 3px 5px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, color: 'var(--text)', textDecoration: 'none' }}>
                <Flag emoji={m.home_flag} size={18} />{m.home_team}<span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 1 }}>↗</span>
              </Link>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>vs</span>
              <Link href={`/world-cup/team?name=${encodeURIComponent(m.away_team)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px 3px 5px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, color: 'var(--text)', textDecoration: 'none' }}>
                <Flag emoji={m.away_flag} size={18} />{m.away_team}<span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 1 }}>↗</span>
              </Link>
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            {isLive && <span className="badge badge-live">● {t.entriesOpen}</span>}
            {status === 'closed' && <span className="badge badge-closed">{t.closed}</span>}
            {isDone && !hasScore && (
              <span className="badge" style={{ background: 'var(--gray-border)', color: 'var(--text-muted)' }}>
                {m.result === 'home' ? t.teamWon.replace('{team}', m.home_team) :
                 m.result === 'away' ? t.teamWon.replace('{team}', m.away_team) : t.draw}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stage · time */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: isDone && hasScore ? 0 : 3 }}>
        {m.stage} · {fmtTime(m.kickoff_at)}
      </div>

      {/* Venue */}
      {m.venue ? (
        <div style={{
          marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-cond)', fontSize: 12,
          color: norm && m.venue.toLowerCase().includes(norm) ? 'var(--green)' : 'var(--text-muted)',
        }}>
          <span>📍</span><span>{m.venue}</span>
        </div>
      ) : (
        <div style={{ marginTop: 6, fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--border)', letterSpacing: 0.5 }}>
          {t.venueTba}
        </div>
      )}

      {/* Events */}
      {hasEvents && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: events!.some(e => e.type === 'Card') ? 6 : 0 }}>
            <div style={{ textAlign: 'right', paddingRight: 8 }}>
              {homeEvents.filter(e => e.type === 'Goal').map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', lineHeight: 1.8 }}>
                  {eventIcon(e.detail)} {e.player.name} <span style={{ color: 'var(--text-dim)' }}>{fmtMinute(e)}</span>
                </div>
              ))}
            </div>
            <div style={{ paddingLeft: 8 }}>
              {awayEvents.filter(e => e.type === 'Goal').map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', lineHeight: 1.8 }}>
                  {eventIcon(e.detail)} {e.player.name} <span style={{ color: 'var(--text-dim)' }}>{fmtMinute(e)}</span>
                </div>
              ))}
            </div>
          </div>
          {events!.some(e => e.type === 'Card') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <div style={{ textAlign: 'right', paddingRight: 8 }}>
                {homeEvents.filter(e => e.type === 'Card').map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', lineHeight: 1.8 }}>
                    {eventIcon(e.detail)} {e.player.name} <span style={{ color: 'var(--text-dim)' }}>{fmtMinute(e)}</span>
                  </div>
                ))}
              </div>
              <div style={{ paddingLeft: 8 }}>
                {awayEvents.filter(e => e.type === 'Card').map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', lineHeight: 1.8 }}>
                    {eventIcon(e.detail)} {e.player.name} <span style={{ color: 'var(--text-dim)' }}>{fmtMinute(e)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DayGroup({ date, matches, norm, eventsById, isToday, t }: {
  date: string
  matches: Match[]
  norm: string
  eventsById: Map<string, MatchEvent[]>
  isToday: boolean
  t: ReturnType<typeof useLocale>['t']
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 1,
        marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {date}
        {isToday && (
          <span style={{ background: 'var(--green)', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
            {t.today}
          </span>
        )}
      </div>
      {matches.map(m => (
        <MatchCard key={m.id} m={m} norm={norm} eventsById={eventsById} t={t} />
      ))}
    </div>
  )
}

function ScheduleContent() {
  const { t } = useLocale()
  const searchParams = useSearchParams()
  const pubId = searchParams.get('pub') || 'haverhill'
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [eventsById, setEventsById] = useState<Map<string, MatchEvent[]>>(new Map())
  const [pastExpanded, setPastExpanded] = useState(false)
  const upcomingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const [{ data: matchData }, { data: eventsData }] = await Promise.all([
        supabase.from('matches').select('*').neq('stage', 'Demo Match').order('kickoff_at', { ascending: true }),
        supabase.from('match_events').select('match_id, events'),
      ])
      setMatches((matchData as Match[]) || [])
      const map = new Map<string, MatchEvent[]>()
      for (const row of eventsData || []) {
        map.set(row.match_id, (row.events as MatchEvent[]) || [])
      }
      setEventsById(map)
      setLoading(false)
    }
    load()
  }, [])

  // Scroll to upcoming section once data loads (only if no filter active)
  useEffect(() => {
    if (!loading && !filter && upcomingRef.current) {
      // Small delay to let the DOM settle
      setTimeout(() => upcomingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }, [loading, filter])

  const norm = filter.toLowerCase().trim()

  const filtered = useMemo(() => {
    if (!norm) return matches
    return matches.filter(m =>
      m.home_team.toLowerCase().includes(norm) ||
      m.away_team.toLowerCase().includes(norm) ||
      (m.venue || '').toLowerCase().includes(norm) ||
      m.stage.toLowerCase().includes(norm)
    )
  }, [matches, norm])

  const grouped = useMemo(() => {
    const g: GroupedMatches = {}
    filtered.forEach(m => {
      const date = new Date(m.kickoff_at).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      })
      if (!g[date]) g[date] = []
      g[date].push(m)
    })
    return g
  }, [filtered])

  // Split day groups into past (all matches done) vs upcoming/live
  const { pastGroups, activeGroups } = useMemo(() => {
    const past: [string, Match[]][] = []
    const active: [string, Match[]][] = []
    for (const [date, dayMatches] of Object.entries(grouped)) {
      const allDone = dayMatches.every(m => !!m.result)
      if (allDone) past.push([date, dayMatches])
      else active.push([date, dayMatches])
    }
    return { pastGroups: past, activeGroups: active }
  }, [grouped])

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const pastMatchCount = pastGroups.reduce((n, [, ms]) => n + ms.length, 0)

  return (
    <div className="container">
      <div style={{ marginBottom: 16 }}>
        <h1>{t.matchSchedule}</h1>
        <p className="muted">{t.scheduleSub}</p>
      </div>

      {/* Search / filter */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={t.filterPlaceholder}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '11px 40px 11px 40px',
            color: 'var(--text)', fontSize: 15, fontFamily: 'var(--font-body)',
          }}
        />
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
        {filter && (
          <button
            onClick={() => setFilter('')}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >×</button>
        )}
      </div>

      {norm && !loading && (
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: filtered.length ? 'var(--green)' : 'var(--text-muted)', marginBottom: 16 }}>
          {t.matchesFound.replace('{count}', String(filtered.length)).replace('{matches}', filtered.length === 1 ? t.matchSingular : t.matchPlural)}
        </div>
      )}

      {loading && <p className="muted" style={{ textAlign: 'center', padding: 40 }}>{t.loading}</p>}

      {!loading && filtered.length === 0 && norm && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <p className="muted">{t.noMatchesFound.replace('{filter}', filter)}</p>
          <button onClick={() => setFilter('')} className="btn btn-secondary" style={{ marginTop: 12, display: 'inline-block' }}>
            {t.clearFilter}
          </button>
        </div>
      )}

      {/* Past matches — collapsed by default */}
      {!norm && pastGroups.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setPastExpanded(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '12px 16px', cursor: 'pointer', color: 'var(--text-muted)',
              fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
            }}
          >
            <span>⚽ {pastMatchCount} {pastMatchCount === 1 ? t.matchSingular : t.matchPlural} played</span>
            <span style={{ fontSize: 16, color: 'var(--text-dim)', transition: 'transform 0.2s', display: 'inline-block', transform: pastExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
          </button>

          {pastExpanded && (
            <div style={{ marginTop: 12 }}>
              {pastGroups.map(([date, dayMatches]) => (
                <DayGroup
                  key={date} date={date} matches={dayMatches}
                  norm={norm} eventsById={eventsById}
                  isToday={date === todayLabel} t={t}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Current / upcoming matches */}
      {!norm && <div ref={upcomingRef} />}

      {/* When filtering, show all groups together; otherwise show active only */}
      {norm ? (
        Object.entries(grouped).map(([date, dayMatches]) => (
          <DayGroup key={date} date={date} matches={dayMatches} norm={norm} eventsById={eventsById} isToday={date === todayLabel} t={t} />
        ))
      ) : (
        activeGroups.map(([date, dayMatches]) => (
          <DayGroup key={date} date={date} matches={dayMatches} norm={norm} eventsById={eventsById} isToday={date === todayLabel} t={t} />
        ))
      )}

      {!norm && activeGroups.length === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🏆</div>
          <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{t.noMatchesNow}</p>
          <p className="muted" style={{ marginTop: 6 }}>{t.noMatchesSub}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <Link href={`/?pub=${pubId}`} className="btn btn-primary"
          style={{ textDecoration: 'none', textAlign: 'center' }}>
          ← {t.makePrediction}
        </Link>
        <Link href={`/leaderboard?pub=${pubId}`} className="btn btn-secondary"
          style={{ textDecoration: 'none', textAlign: 'center' }}>
          🏆 {t.leaderboard}
        </Link>
      </div>
    </div>
  )
}

export default function SchedulePage() {
  return <Suspense><ScheduleContent /></Suspense>
}
