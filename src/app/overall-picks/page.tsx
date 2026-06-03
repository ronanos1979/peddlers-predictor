'use client'
import { useEffect, useState } from 'react'
import { supabase, type Match } from '@/lib/supabase'
import Link from 'next/link'

type PickTally = { home: number; draw: number; away: number }
type StatsMap = Record<string, PickTally>
type Filter = 'all' | 'upcoming' | 'completed'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}
function fmtKickoff(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function PickBar({ tally, result, homeTeam, awayTeam }: {
  tally: PickTally | undefined
  result: string | null
  homeTeam: string
  awayTeam: string
}) {
  const total = tally ? tally.home + tally.draw + tally.away : 0
  if (total === 0) {
    return <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>No picks yet</div>
  }

  const hp = Math.round(tally!.home / total * 100)
  const dp = Math.round(tally!.draw / total * 100)
  const ap = 100 - hp - dp

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', gap: 2, marginBottom: 7 }}>
        {hp > 0 && <div style={{ width: `${hp}%`, background: result === 'home' ? 'var(--green)' : 'rgba(0,200,122,0.35)', borderRadius: 4, transition: 'width 0.3s' }} />}
        {dp > 0 && <div style={{ width: `${dp}%`, background: result === 'draw' ? 'var(--gold)' : 'rgba(245,197,24,0.35)', borderRadius: 4, transition: 'width 0.3s' }} />}
        {ap > 0 && <div style={{ width: `${ap}%`, background: result === 'away' ? 'var(--amber)' : 'rgba(255,149,0,0.35)', borderRadius: 4, transition: 'width 0.3s' }} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-cond)', fontSize: 11 }}>
        <span style={{ color: result === 'home' ? 'var(--green)' : 'var(--text-muted)', fontWeight: result === 'home' ? 700 : 400 }}>
          {hp}% {homeTeam}
        </span>
        <span style={{ color: result === 'draw' ? 'var(--gold)' : 'var(--text-muted)', fontWeight: result === 'draw' ? 700 : 400 }}>
          {dp}% Draw
        </span>
        <span style={{ color: result === 'away' ? 'var(--amber)' : 'var(--text-muted)', fontWeight: result === 'away' ? 700 : 400 }}>
          {ap}% {awayTeam}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, color: 'var(--text-muted)', marginTop: 3, textAlign: 'right' }}>
        {total} {total === 1 ? 'pick' : 'picks'}
      </div>
    </div>
  )
}

export default function OverallPicksPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [stats, setStats] = useState<StatsMap>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    async function load() {
      const [{ data: matchData }, { data: entryData }] = await Promise.all([
        supabase.from('matches').select('*').neq('stage', 'Demo Match').order('kickoff_at', { ascending: true }),
        supabase.from('entries').select('match_id, pick'),
      ])

      setMatches(matchData || [])

      const s: StatsMap = {}
      entryData?.forEach(e => {
        if (!s[e.match_id]) s[e.match_id] = { home: 0, draw: 0, away: 0 }
        if (e.pick === 'home') s[e.match_id].home++
        else if (e.pick === 'draw') s[e.match_id].draw++
        else if (e.pick === 'away') s[e.match_id].away++
      })
      setStats(s)
      setLoading(false)
    }
    load()
  }, [])

  const now = new Date()
  const filtered = matches.filter(m => {
    if (filter === 'completed') return !!m.result
    if (filter === 'upcoming') return !m.result
    return true
  })

  // Group by local date
  const days: { label: string; matches: Match[] }[] = []
  for (const m of filtered) {
    const label = fmtDate(m.kickoff_at)
    const existing = days.find(d => d.label === label)
    if (existing) existing.matches.push(m)
    else days.push({ label, matches: [m] })
  }

  const totalPicks = Object.values(stats).reduce((sum, t) => sum + t.home + t.draw + t.away, 0)

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>
          📊 Community
        </div>
        <h1>Overall Picks</h1>
        <p className="muted">How everyone is predicting every World Cup 2026 match.</p>
        {totalPicks > 0 && (
          <div style={{ display: 'inline-block', marginTop: 8, background: 'rgba(0,200,122,0.08)', border: '1px solid rgba(0,200,122,0.2)', borderRadius: 20, padding: '4px 14px', fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
            {totalPicks.toLocaleString()} total picks so far
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['all', 'upcoming', 'completed'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? 'var(--green)' : 'var(--surface)',
              color: filter === f ? '#000' : 'var(--text-muted)',
              border: `1px solid ${filter === f ? 'var(--green)' : 'var(--border)'}`,
              borderRadius: 20,
              padding: '6px 14px',
              fontFamily: 'var(--font-cond)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'capitalize',
              cursor: 'pointer',
            }}
          >
            {f === 'all' ? 'All matches' : f === 'upcoming' ? 'Upcoming' : 'Completed'}
          </button>
        ))}
      </div>

      {loading && (
        <p className="muted" style={{ textAlign: 'center', padding: 40 }}>Loading…</p>
      )}

      {!loading && days.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <p className="muted">No matches to show.</p>
        </div>
      )}

      {!loading && days.map(({ label, matches: dayMatches }) => (
        <div key={label} style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
            {label}
            {new Date(dayMatches[0].kickoff_at).toDateString() === now.toDateString() && (
              <span className="badge badge-live" style={{ marginLeft: 8, fontSize: 9, padding: '2px 8px' }}>TODAY</span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dayMatches.map(m => {
              const tally = stats[m.id]
              const total = tally ? tally.home + tally.draw + tally.away : 0
              const majority = total > 0
                ? (tally!.home >= tally!.draw && tally!.home >= tally!.away ? 'home'
                  : tally!.away >= tally!.draw ? 'away' : 'draw')
                : null
              const majorityCorrect = m.result && majority === m.result

              return (
                <div key={m.id} style={{
                  background: 'var(--surface)',
                  border: `1px solid ${m.result ? 'var(--border)' : 'var(--border)'}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>
                      {m.home_flag} {m.home_team}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 13 }}> vs </span>
                      {m.away_flag} {m.away_team}
                    </div>
                    {m.result ? (
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <span className="badge" style={{
                          background: 'rgba(0,200,122,0.1)',
                          color: 'var(--green)',
                          border: '1px solid rgba(0,200,122,0.3)',
                          fontSize: 10,
                          display: 'block',
                          marginBottom: 2,
                        }}>
                          {m.result === 'home' ? `${m.home_team} won` : m.result === 'away' ? `${m.away_team} won` : 'Draw'}
                        </span>
                        {total > 0 && (
                          <span style={{ fontFamily: 'var(--font-cond)', fontSize: 10, color: majorityCorrect ? 'var(--green)' : 'var(--text-muted)' }}>
                            {majorityCorrect ? '✓ crowd was right' : '✗ crowd was wrong'}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="badge badge-pending" style={{ flexShrink: 0, fontSize: 10 }}>
                        {fmtKickoff(m.kickoff_at)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)' }}>
                    {m.stage}
                  </div>
                  <PickBar tally={tally} result={m.result} homeTeam={m.home_team} awayTeam={m.away_team} />
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', display: 'block', textAlign: 'center', marginTop: 12 }}>
        ← Home
      </Link>
    </div>
  )
}
