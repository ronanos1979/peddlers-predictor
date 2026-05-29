'use client'
import { useEffect, useState } from 'react'
import { supabase, type Match } from '@/lib/supabase'
import Link from 'next/link'

type GroupedMatches = Record<string, Match[]>

export default function SchedulePage({ searchParams }: { searchParams: { pub?: string } }) {
  const pubId = searchParams.pub || 'haverhill'
  const [grouped, setGrouped] = useState<GroupedMatches>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('matches')
        .select('*')
        .neq('stage', 'Demo Match')
        .order('kickoff_at', { ascending: true })

      if (data) {
        const groups: GroupedMatches = {}
        data.forEach((m: Match) => {
          const date = new Date(m.kickoff_at).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric'
          })
          if (!groups[date]) groups[date] = []
          groups[date].push(m)
        })
        setGrouped(groups)
      }
      setLoading(false)
    }
    load()
  }, [])

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    })
  }

  function getStatus(m: Match) {
    const now = new Date()
    const kickoff = new Date(m.kickoff_at)
    const close = new Date(m.entries_close_at)
    if (m.result) return 'done'
    if (now >= kickoff && now <= close) return 'live'
    if (now < kickoff) return 'upcoming'
    return 'closed'
  }

  const statusBadge = (m: Match) => {
    const s = getStatus(m)
    if (s === 'live') return <span className="badge badge-live">● Entries open</span>
    if (s === 'done') return <span className="badge" style={{ background: 'var(--gray-border)', color: 'var(--text-muted)' }}>
      {m.result === 'home' ? `${m.home_team} won` :
       m.result === 'away' ? `${m.away_team} won` : 'Draw'}
    </span>
    if (s === 'closed') return <span className="badge badge-closed">Closed</span>
    return null
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <h1>Match schedule</h1>
        <p className="muted">All 104 matches · Times in your local timezone</p>
      </div>

      {loading && <p className="muted" style={{ textAlign: 'center', padding: 40 }}>Loading…</p>}

      {Object.entries(grouped).map(([date, matches]) => {
        const isToday = date === new Date().toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric'
        })
        return (
          <div key={date} style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 1,
              marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8
            }}>
              {date}
              {isToday && (
                <span style={{
                  background: 'var(--green)', color: '#fff',
                  fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700
                }}>TODAY</span>
              )}
            </div>

            {matches.map(m => (
              <div key={m.id} style={{
                background: 'var(--white)',
                border: `1px solid ${getStatus(m) === 'live' ? 'var(--green)' : 'var(--gray-border)'}`,
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>
                    {m.home_flag} {m.home_team} &nbsp;vs&nbsp; {m.away_flag} {m.away_team}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {m.stage} · {fmtTime(m.kickoff_at)}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {statusBadge(m)}
                </div>
              </div>
            ))}
          </div>
        )
      })}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <Link href={`/?pub=${pubId}`} className="btn btn-primary"
          style={{ textDecoration: 'none', textAlign: 'center' }}>
          ← Make a prediction
        </Link>
        <Link href={`/leaderboard?pub=${pubId}`} className="btn btn-secondary"
          style={{ textDecoration: 'none', textAlign: 'center' }}>
          🏆 Leaderboard
        </Link>
      </div>
    </div>
  )
}
