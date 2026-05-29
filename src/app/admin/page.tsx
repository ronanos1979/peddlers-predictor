'use client'
import { useState, useEffect } from 'react'
import { supabase, type Match } from '@/lib/supabase'
import { getDailyCode } from '@/lib/matchSchedule'

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState('')
  const [todaysMatches, setTodaysMatches] = useState<Match[]>([])
  const [recentMatches, setRecentMatches] = useState<Match[]>([])
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([])
  const [results, setResults] = useState<Record<string, 'home' | 'draw' | 'away'>>({})
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')
  const dailyCode = getDailyCode()

  async function login() {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action: 'ping', payload: {} })
    })
    if (res.ok) {
      setAuthed(true)
      setAuthError('')
    } else {
      setAuthError('Wrong password')
    }
  }

  useEffect(() => {
    if (!authed) return
    async function load() {
      const now = new Date()
      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(now)
      todayEnd.setHours(23, 59, 59, 999)

      // Today's matches
      const { data: today } = await supabase
        .from('matches')
        .select('*')
        .gte('kickoff_at', todayStart.toISOString())
        .lte('kickoff_at', todayEnd.toISOString())
        .order('kickoff_at')
      setTodaysMatches(today || [])

      // Recent unscored matches (last 3 days)
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      const { data: recent } = await supabase
        .from('matches')
        .select('*')
        .gte('kickoff_at', threeDaysAgo.toISOString())
        .lt('kickoff_at', todayStart.toISOString())
        .is('result', null)
        .order('kickoff_at', { ascending: false })
      setRecentMatches(recent || [])

      // Next 3 days upcoming
      const threeDaysAhead = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
      const { data: upcoming } = await supabase
        .from('matches')
        .select('*')
        .gt('kickoff_at', todayEnd.toISOString())
        .lte('kickoff_at', threeDaysAhead.toISOString())
        .order('kickoff_at')
      setUpcomingMatches(upcoming || [])
    }
    load()
  }, [authed])

  async function setResult(match: Match) {
    const result = results[match.id]
    if (!result) return
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action: 'set_result', payload: { match_id: match.id, result } })
    })
    const data = await res.json()
    if (data.success) {
      flash(`✅ Result set! ${data.updated} entries updated.`, 'success')
      // Mark locally
      setTodaysMatches(prev => prev.map(m => m.id === match.id ? { ...m, result } : m))
      setRecentMatches(prev => prev.filter(m => m.id !== match.id))
    } else {
      flash(data.error, 'error')
    }
  }

  function flash(text: string, type: 'success' | 'error') {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 5000)
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    })
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    })
  }

  function MatchResultRow({ m }: { m: Match }) {
    const isOpen = new Date(m.entries_close_at) > new Date()
    const hasResult = !!m.result
    return (
      <div className="admin-row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {m.home_flag} {m.home_team} vs {m.away_flag} {m.away_team}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {m.stage} · {fmt(m.kickoff_at)}
            {isOpen && <span style={{ color: 'var(--green)', marginLeft: 6 }}>● Entries open</span>}
          </div>
          {hasResult && (
            <div style={{ fontSize: 12, marginTop: 2, color: 'var(--green)' }}>
              Result already set: {m.result === 'home' ? `${m.home_team} win` : m.result === 'away' ? `${m.away_team} win` : 'Draw'}
            </div>
          )}
        </div>
        {!hasResult && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={results[m.id] || ''}
              onChange={e => setResults(prev => ({ ...prev, [m.id]: e.target.value as 'home' | 'draw' | 'away' }))}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--gray-border)', background: 'var(--white)', color: 'var(--text)', fontSize: 13 }}>
              <option value="">Select result…</option>
              <option value="home">{m.home_flag} {m.home_team} win</option>
              <option value="draw">Draw</option>
              <option value="away">{m.away_flag} {m.away_team} win</option>
            </select>
            <button
              className="btn btn-primary"
              style={{ width: 'auto', padding: '7px 14px', fontSize: 13 }}
              disabled={!results[m.id]}
              onClick={() => setResult(m)}>
              Confirm
            </button>
          </div>
        )}
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="container" style={{ maxWidth: 360 }}>
        <h1 style={{ marginBottom: 20 }}>Admin</h1>
        <div className="card">
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              placeholder="Enter admin password"
            />
            {authError && <p className="error">{authError}</p>}
          </div>
          <button className="btn btn-primary" onClick={login}>Login</button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: 4 }}>Admin Panel</h1>
      <p className="muted" style={{ marginBottom: 20 }}>The Peddler&apos;s Daughter — World Cup 2026</p>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14,
          background: msgType === 'success' ? 'var(--green-light)' : 'var(--red-light)',
          color: msgType === 'success' ? 'var(--green-dark)' : 'var(--red)'
        }}>{msg}</div>
      )}

      {/* Daily code — auto-generated, no action needed */}
      <div className="card">
        <h2>Today&apos;s patron code</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
          <div style={{
            fontSize: 28, fontWeight: 700, letterSpacing: 4,
            background: 'var(--green-light)', color: 'var(--green-dark)',
            padding: '12px 24px', borderRadius: 10, border: '2px solid var(--green)'
          }}>
            {dailyCode}
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500 }}>Tell patrons this code when they ask</p>
            <p className="muted" style={{ fontSize: 13 }}>Changes automatically at midnight each day</p>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="card" style={{ background: 'var(--amber-light)', border: '1px solid var(--amber)' }}>
        <h3 style={{ marginBottom: 8 }}>⚙️ Fully automatic</h3>
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>
          Matches activate and close automatically based on kick-off times.<br />
          The patron code changes automatically each day.<br />
          <strong>Your only job: set the result after each match.</strong>
        </p>
      </div>

      {/* Today's matches */}
      <div className="card">
        <h2>Today&apos;s matches</h2>
        {todaysMatches.length === 0
          ? <p className="muted">No matches scheduled today.</p>
          : todaysMatches.map(m => <MatchResultRow key={m.id} m={m} />)
        }
      </div>

      {/* Recent unscored */}
      {recentMatches.length > 0 && (
        <div className="card">
          <h2>Recent — result not set</h2>
          {recentMatches.map(m => <MatchResultRow key={m.id} m={m} />)}
        </div>
      )}

      {/* Upcoming */}
      {upcomingMatches.length > 0 && (
        <div className="card">
          <h2>Coming up</h2>
          {upcomingMatches.map(m => (
            <div key={m.id} className="admin-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {m.home_flag} {m.home_team} vs {m.away_flag} {m.away_team}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {fmtDate(m.kickoff_at)} · {fmt(m.kickoff_at)} · {m.stage}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick links */}
      <div className="card">
        <h2>Quick links</h2>
        {[
          ['Haverhill entry form', '/?pub=haverhill'],
          ['Nashua entry form', '/?pub=nashua'],
          ['Leaderboard — all', '/leaderboard'],
          ['Leaderboard — Haverhill', '/leaderboard?pub=haverhill'],
          ['Leaderboard — Nashua', '/leaderboard?pub=nashua'],
        ].map(([label, href]) => (
          <div key={href} className="admin-row">
            <span style={{ fontSize: 14 }}>{label}</span>
            <a href={href} target="_blank" style={{ color: 'var(--green)', fontSize: 13 }}>Open ↗</a>
          </div>
        ))}
      </div>
    </div>
  )
}
