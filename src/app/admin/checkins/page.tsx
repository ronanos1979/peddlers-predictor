'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type CheckInRow = {
  id: string; name: string; phone: string; email: string | null
  pub_id: string; shared_to: string | null; created_at: string; match_id: string
  matches: {
    home_team: string; away_team: string; home_flag: string; away_flag: string
    kickoff_at: string; stage: string
    checkin_winner_name: string | null; checkin_winner_phone: string | null
  } | null
}

type Leader = { name: string; pub_id: string; match_count: number }

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

function localDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AdminCheckinsPage() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [checkins, setCheckins] = useState<CheckInRow[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'list' | 'leaders'>('list')
  const [dateFilter, setDateFilter] = useState('')
  const [pubFilter, setPubFilter] = useState<'all' | 'haverhill' | 'nashua'>('all')
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set())

  const loadCheckins = useCallback(async (pw: string) => {
    setLoading(true)
    const res = await fetch(`/api/admin-data?password=${encodeURIComponent(pw)}&action=checkins`)
    const data = await res.json()
    setCheckins(data.checkins || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const pw = sessionStorage.getItem('admin_pw') || ''
    const auth = sessionStorage.getItem('admin_authed') === '1'
    setPassword(pw)
    if (auth && pw) { setAuthed(true); loadCheckins(pw) }
  }, [loadCheckins])

  async function handleLogin() {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action: 'ping', payload: {} }),
    })
    if (res.ok) {
      sessionStorage.setItem('admin_pw', password)
      sessionStorage.setItem('admin_authed', '1')
      setAuthed(true)
      loadCheckins(password)
    } else {
      setAuthError('Wrong password')
    }
  }

  function toggleExpand(matchId: string) {
    setExpandedMatches(prev => {
      const next = new Set(prev)
      if (next.has(matchId)) { next.delete(matchId) } else { next.add(matchId) }
      return next
    })
  }

  if (!authed) {
    return (
      <div className="container" style={{ maxWidth: 420, paddingTop: 60 }}>
        <Link href="/admin" style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>← Admin</Link>
        <h2 style={{ margin: '12px 0 20px' }}>Check-In Attendance</h2>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} autoFocus />
        </div>
        {authError && <p className="error">{authError}</p>}
        <button className="btn btn-primary" onClick={handleLogin} style={{ width: '100%' }}>Sign In</button>
      </div>
    )
  }

  // Apply filters
  const filtered = checkins.filter(c => {
    if (pubFilter !== 'all' && c.pub_id !== pubFilter) return false
    if (dateFilter && localDate(c.created_at) !== dateFilter) return false
    return true
  })

  // Group by match, sorted by kickoff desc
  const byMatch = new Map<string, CheckInRow[]>()
  for (const c of filtered) {
    if (!byMatch.has(c.match_id)) byMatch.set(c.match_id, [])
    byMatch.get(c.match_id)!.push(c)
  }
  const matchEntries = Array.from(byMatch.entries()).sort((a, b) =>
    (b[1][0].matches?.kickoff_at || '').localeCompare(a[1][0].matches?.kickoff_at || '')
  )

  // Attendance leaderboard from filtered data
  const byPhone = new Map<string, { name: string; pub_id: string; phone: string; email: string | null; matches: Set<string> }>()
  for (const c of filtered) {
    if (!byPhone.has(c.phone)) byPhone.set(c.phone, { name: c.name, pub_id: c.pub_id, phone: c.phone, email: c.email, matches: new Set() })
    byPhone.get(c.phone)!.matches.add(c.match_id)
  }
  const leaders: Leader[] = Array.from(byPhone.values())
    .map(e => ({ name: e.name, pub_id: e.pub_id, match_count: e.matches.size }))
    .sort((a, b) => b.match_count - a.match_count)

  const uniquePeople = byPhone.size
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link href="/admin" style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          ← Admin
        </Link>
        <h1 style={{ margin: 0, flex: 1 }}>Check-In Attendance</h1>
        <button
          onClick={() => loadCheckins(password)}
          disabled={loading}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 13, cursor: 'pointer' }}
        >
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-body)' }}
        />
        {dateFilter && (
          <button
            onClick={() => setDateFilter('')}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 12, cursor: 'pointer' }}
          >
            All dates
          </button>
        )}
        {(['all', 'haverhill', 'nashua'] as const).map(p => (
          <button key={p} onClick={() => setPubFilter(p)} style={{
            padding: '6px 14px', borderRadius: 16, border: `1px solid ${pubFilter === p ? 'var(--green)' : 'var(--border)'}`,
            background: pubFilter === p ? 'rgba(0,200,122,0.12)' : 'transparent',
            color: pubFilter === p ? 'var(--green)' : 'var(--text-muted)',
            fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
          }}>
            {p === 'all' ? 'Both pubs' : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Total check-ins', value: filtered.length },
          { label: 'Unique people', value: uniquePeople },
          { label: 'Matches', value: byMatch.size },
        ].map(s => (
          <div key={s.label} className="card" style={{ flex: '1 1 100px', padding: '10px 14px', textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: 1 }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['list', 'leaders'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '7px 16px', borderRadius: 20, border: `1px solid ${view === v ? 'var(--amber)' : 'var(--border)'}`,
            background: view === v ? 'rgba(255,149,0,0.12)' : 'transparent',
            color: view === v ? 'var(--amber)' : 'var(--text-muted)',
            fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}>
            {v === 'list' ? '📋 By Match' : '🏆 Most Attended'}
          </button>
        ))}
      </div>

      {loading && <p className="muted" style={{ textAlign: 'center', padding: 32 }}>Loading…</p>}

      {/* BY MATCH view */}
      {!loading && view === 'list' && (
        matchEntries.length === 0
          ? <div className="card" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)' }}>No check-ins for this filter</div>
          : matchEntries.map(([matchId, rows]) => {
              const m = rows[0].matches
              const expanded = expandedMatches.has(matchId)
              const PREVIEW = 5
              const visible = expanded ? rows : rows.slice(0, PREVIEW)
              return (
                <div key={matchId} className="card" style={{ marginBottom: 12, border: '1px solid rgba(255,59,59,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>
                        {m?.home_flag} {m?.home_team} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs</span> {m?.away_flag} {m?.away_team}
                      </div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {m?.stage} · {m?.kickoff_at ? new Date(m.kickoff_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--red)' }}>{rows.length}</span>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>checked in</div>
                      {m?.checkin_winner_name && (
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--gold)', marginTop: 4 }}>
                          🏆 {m.checkin_winner_name}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {visible.map(c => (
                      <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, fontSize: 12, paddingBottom: 5, borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{c.name}</span>
                          <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{c.phone}</span>
                          {c.email && <span style={{ color: 'var(--green)', marginLeft: 8 }}>✉ {c.email}</span>}
                          {c.shared_to && <span style={{ color: 'var(--amber)', marginLeft: 8, fontFamily: 'var(--font-cond)', fontSize: 11 }}>shared {c.shared_to}</span>}
                          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 11 }}>
                            {c.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'} · {formatTime(c.created_at)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {rows.length > PREVIEW && (
                    <button
                      onClick={() => toggleExpand(matchId)}
                      style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 12, cursor: 'pointer', padding: 0 }}
                    >
                      {expanded ? '▲ Show less' : `▼ Show all ${rows.length}`}
                    </button>
                  )}
                </div>
              )
            })
      )}

      {/* MOST ATTENDED view */}
      {!loading && view === 'leaders' && (
        leaders.length === 0
          ? <div className="card" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)' }}>No check-ins for this filter</div>
          : leaders.map((l, i) => (
              <div key={i} className="lb-entry" style={{ marginBottom: 6 }}>
                <div className="lb-rank" style={{ color: i === 0 ? 'var(--gold)' : i === 1 ? '#b0b8c8' : i === 2 ? '#cd7f32' : 'var(--text-dim)', fontSize: i < 3 ? 22 : 16 }}>
                  {medals[i] || i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15 }}>{l.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {l.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="lb-pts" style={{ color: 'var(--red)' }}>{l.match_count}</div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    match{l.match_count !== 1 ? 'es' : ''}
                  </div>
                </div>
              </div>
            ))
      )}
    </div>
  )
}
