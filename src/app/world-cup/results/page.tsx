'use client'
import { useEffect, useState } from 'react'
import { useLocale } from '@/lib/useLocale'
import { supabase } from '@/lib/supabase'
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

type Fixture = {
  fixture: { id: number; date: string; venue: { name: string; city: string } | null }
  league: { round: string }
  teams: { home: { name: string; logo: string }; away: { name: string; logo: string } }
  goals: { home: number | null; away: number | null } | null
  score: { fulltime: { home: number | null; away: number | null } | null } | null
}

export default function ResultsPage() {
  const { t } = useLocale()
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [stages, setStages] = useState<string[]>([])
  type EventsState = { byId: Map<string, MatchEvent[]>; idByTeams: Map<string, string>; venueById: Map<string, string> }
  const [eventsState, setEventsState] = useState<EventsState>({ byId: new Map(), idByTeams: new Map(), venueById: new Map() })

  // FD team name → normalised schedule name (only differences that survive norm())
  const FD_NORM_ALIASES: Record<string, string> = {
    unitedstates: 'usa',
    turkey: 'turkiye',
    capeverdeislands: 'capeverde',
    czechrepublic: 'czechia',
    korearepublic: 'southkorea',
    cotedivoire: 'ivorycoast',
  }
  const normFd = (s: string) => { const n = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); return FD_NORM_ALIASES[n] ?? n }
  const normSched = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  // FD display name → schedule name for team page links
  const FD_TO_SCHEDULE: Record<string, string> = {
    'United States': 'USA', 'Korea Republic': 'South Korea',
    "Côte d'Ivoire": 'Ivory Coast', 'Turkey': 'Türkiye',
    'Czech Republic': 'Czechia', 'Cape Verde Islands': 'Cape Verde',
  }
  const fdToSched = (name: string) => FD_TO_SCHEDULE[name] ?? name

  useEffect(() => {
    async function load() {
      try {
        const [fdRes, sbEventsRes, sbMatchesRes] = await Promise.all([
          fetch('/api/football?endpoint=fixtures&status=FT'),
          supabase.from('match_events').select('match_id, events'),
          supabase.from('matches').select('id, home_team, away_team, venue'),
        ])

        const data = await fdRes.json()
        const results = (data.response || []) as Fixture[]
        results.sort((a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime())
        setFixtures(results)
        const uniqueStages = Array.from(new Set(results.map(f => f.league.round)))
        setStages(uniqueStages)

        // Build match_id → events map
        const byId = new Map<string, MatchEvent[]>()
        for (const row of sbEventsRes.data || []) {
          byId.set(row.match_id, (row.events as MatchEvent[]) || [])
        }
        // Build normed-team-pair → match_id map (bridges FD names to Supabase UUIDs)
        const idByTeams = new Map<string, string>()
        const venueById = new Map<string, string>()
        for (const m of sbMatchesRes.data || []) {
          const h = normSched(m.home_team)
          const a = normSched(m.away_team)
          idByTeams.set(`${h}|${a}`, m.id)
          idByTeams.set(`${a}|${h}`, m.id)
          if (m.venue) venueById.set(m.id, m.venue as string)
        }
        setEventsState({ byId, idByTeams, venueById })
        setLoading(false)

        // Auto-load ESPN events for any completed matches that have no cached events.
        // Fires in background — results page renders immediately, events appear when ready.
        const ONE_HOUR_MS = 60 * 60 * 1000
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
        const needsAutoLoad = results.some(f => {
          const age = Date.now() - new Date(f.fixture.date).getTime()
          if (age < ONE_HOUR_MS) return false
          const key = `${normFd(f.teams.home.name)}|${normFd(f.teams.away.name)}`
          const matchId = idByTeams.get(key)
          if (matchId === undefined) return false
          const events = byId.get(matchId)
          // No events row at all, or empty row within 24h (premature load — ESPN not ready yet)
          return events === undefined || (events.length === 0 && age < TWENTY_FOUR_HOURS_MS)
        })

        if (needsAutoLoad) {
          fetch('/api/auto-load-events').then(() =>
            supabase.from('match_events').select('match_id, events').then(({ data: fresh }) => {
              if (!fresh) return
              const byId2 = new Map<string, MatchEvent[]>()
              for (const row of fresh) byId2.set(row.match_id, (row.events as MatchEvent[]) || [])
              setEventsState({ byId: byId2, idByTeams, venueById })
            })
          ).catch(() => {})
        }
      } catch {
        setError(t.couldNotLoadResults)
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = stageFilter === 'all' ? fixtures : fixtures.filter(f => f.league.round === stageFilter)

  function fmtDate(iso: string) {
    const d = new Date(iso)
    const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
    return `${date} · ${time} ET`
  }

  function fmtMinute(e: MatchEvent) {
    if (e.time.extra) return `${e.time.elapsed}+${e.time.extra}'`
    return `${e.time.elapsed}'`
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

  // Find events for a fixture by team name → match_id (robust against kickoff time discrepancies)
  function getEvents(fixture: Fixture): MatchEvent[] | null {
    const key = `${normFd(fixture.teams.home.name)}|${normFd(fixture.teams.away.name)}`
    const matchId = eventsState.idByTeams.get(key)
    if (!matchId) return null
    return eventsState.byId.get(matchId) ?? null
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
        const events = getEvents(f)
        const hasEvents = events !== null && events.length > 0
        const matchKey = `${normFd(f.teams.home.name)}|${normFd(f.teams.away.name)}`
        const matchId = eventsState.idByTeams.get(matchKey)
        const venue = matchId ? eventsState.venueById.get(matchId) : undefined
        const normTeam = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
        const isHome = (e: MatchEvent) => e.teamSide === 'home' || (!e.teamSide && normTeam(e.team.name) === normTeam(f.teams.home.name))
        const isAway = (e: MatchEvent) => e.teamSide === 'away' || (!e.teamSide && normTeam(e.team.name) === normTeam(f.teams.away.name))
        const homeEvents = (events || []).filter(isHome)
        const awayEvents = (events || []).filter(isAway)

        return (
          <div key={f.fixture.id} className="card" style={{ padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)' }}>{f.league.round}</span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{fmtDate(f.fixture.date)}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 }}>
              <Link href={`/world-cup/team?name=${encodeURIComponent(fdToSched(f.teams.home.name))}`} style={{ display: 'block', textAlign: 'right', textDecoration: 'none' }}>
                {f.teams.home.logo && <img src={f.teams.home.logo} alt="" style={{ width: 32, height: 32, objectFit: 'contain', marginLeft: 'auto', display: 'block', marginBottom: 4 }} />}
                <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, color: homeWon ? 'var(--green)' : 'var(--text)' }}>{f.teams.home.name}</div>
              </Link>
              <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: 4, color: 'var(--text)', minWidth: 80 }}>
                {home ?? '–'} : {away ?? '–'}
              </div>
              <Link href={`/world-cup/team?name=${encodeURIComponent(fdToSched(f.teams.away.name))}`} style={{ display: 'block', textAlign: 'left', textDecoration: 'none' }}>
                {f.teams.away.logo && <img src={f.teams.away.logo} alt="" style={{ width: 32, height: 32, objectFit: 'contain', display: 'block', marginBottom: 4 }} />}
                <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, color: awayWon ? 'var(--green)' : 'var(--text)' }}>{f.teams.away.name}</div>
              </Link>
            </div>

            {/* Events from Supabase */}
            {hasEvents && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                {/* Goals */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: events!.some(e => e.type === 'Card') ? 8 : 0 }}>
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
                {/* Cards */}
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

            {venue && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-cond)' }}>
                📍 {venue}
              </div>
            )}
          </div>
        )
      })}

      <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 8 }}>← {t.home}</Link>
    </div>
  )
}
