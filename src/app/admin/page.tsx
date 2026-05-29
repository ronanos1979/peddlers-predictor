'use client'
import { useState, useEffect } from 'react'
import { supabase, type Match, type Pub } from '@/lib/supabase'

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [match, setMatch] = useState<Match | null>(null)
  const [pubs, setPubs] = useState<Pub[]>([])
  const [result, setResult] = useState<'home' | 'draw' | 'away'>('home')
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')
  const [codes, setCodes] = useState<Record<string, string>>({})
  // New match form
  const [nm, setNm] = useState({ home_team: '', away_team: '', home_flag: '', away_flag: '', kickoff_at: '', entries_close_at: '', stage: 'Group Stage' })

  useEffect(() => {
    if (!authed) return
    supabase.from('matches').select('*').eq('is_active', true).single().then(({ data }) => setMatch(data))
    supabase.from('pubs').select('*').then(({ data }) => {
      if (data) {
        setPubs(data)
        const c: Record<string, string> = {}
        data.forEach((p: Pub) => { c[p.id] = p.daily_code })
        setCodes(c)
      }
    })
  }, [authed])

  async function api(action: string, payload: object) {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action, payload })
    })
    return res.json()
  }

  async function setMatchResult() {
    if (!match) return
    const data = await api('set_result', { match_id: match.id, result })
    if (data.success) { flash(`Result set! ${data.updated} entries updated.`, 'success'); setMatch(null) }
    else flash(data.error, 'error')
  }

  async function updateCode(pub_id: string) {
    const data = await api('update_code', { pub_id, daily_code: codes[pub_id] })
    if (data.success) flash(`Code updated for ${pubs.find(p => p.id === pub_id)?.city}`, 'success')
    else flash(data.error, 'error')
  }

  async function createMatch() {
    const data = await api('create_match', nm)
    if (data.success) { flash('Match created and set active!', 'success'); setMatch(data.match) }
    else flash(data.error, 'error')
  }

  function flash(text: string, type: 'success' | 'error') {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  if (!authed) {
    return (
      <div className="container" style={{ maxWidth: 360 }}>
        <h1 style={{ marginBottom: 20 }}>Admin</h1>
        <div className="card">
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setAuthed(true)} />
          </div>
          <button className="btn btn-primary" onClick={() => setAuthed(true)}>Login</button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: 4 }}>Admin Panel</h1>
      <p className="muted" style={{ marginBottom: 20 }}>The Peddler&apos;s Daughter — World Cup Predictor</p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14, background: msgType === 'success' ? 'var(--green-light)' : 'var(--red-light)', color: msgType === 'success' ? 'var(--green-dark)' : 'var(--red)' }}>
          {msg}
        </div>
      )}

      {/* Current match */}
      <div className="card">
        <h2>Current match</h2>
        {match ? (
          <>
            <p style={{ marginBottom: 12 }}><strong>{match.home_flag} {match.home_team} vs {match.away_flag} {match.away_team}</strong></p>
            <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
              Entries close: {new Date(match.entries_close_at).toLocaleString()}<br />
              Result: {match.result || 'Not set'}
            </p>
            {!match.result && (
              <>
                <div className="field">
                  <label>Set result</label>
                  <select value={result} onChange={e => setResult(e.target.value as 'home' | 'draw' | 'away')}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--gray-border)', background: 'var(--white)', color: 'var(--text)', fontSize: 15 }}>
                    <option value="home">{match.home_flag} {match.home_team} win</option>
                    <option value="draw">Draw</option>
                    <option value="away">{match.away_flag} {match.away_team} win</option>
                  </select>
                </div>
                <button className="btn btn-primary" onClick={setMatchResult}>
                  Confirm result &amp; update leaderboard
                </button>
              </>
            )}
          </>
        ) : (
          <p className="muted">No active match.</p>
        )}
      </div>

      {/* Daily codes */}
      <div className="card">
        <h2>Daily pub codes</h2>
        <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>Change these each match day. Tell staff to give patrons the code.</p>
        {pubs.map(pub => (
          <div key={pub.id} className="admin-row">
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{pub.name}</div>
              <div className="muted">{pub.city}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={codes[pub.id] || ''}
                onChange={e => setCodes(prev => ({ ...prev, [pub.id]: e.target.value.toUpperCase() }))}
                style={{ width: 120, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--gray-border)', background: 'var(--white)', color: 'var(--text)', fontSize: 14, letterSpacing: 2, textAlign: 'center' }}
                maxLength={10}
              />
              <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }} onClick={() => updateCode(pub.id)}>
                Save
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create new match */}
      <div className="card">
        <h2>Create next match</h2>
        <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>This will deactivate the current match and set this one live.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>Home team</label>
            <input value={nm.home_team} onChange={e => setNm(p => ({ ...p, home_team: e.target.value }))} placeholder="Brazil" />
          </div>
          <div className="field">
            <label>Home flag emoji</label>
            <input value={nm.home_flag} onChange={e => setNm(p => ({ ...p, home_flag: e.target.value }))} placeholder="🇧🇷" />
          </div>
          <div className="field">
            <label>Away team</label>
            <input value={nm.away_team} onChange={e => setNm(p => ({ ...p, away_team: e.target.value }))} placeholder="Argentina" />
          </div>
          <div className="field">
            <label>Away flag emoji</label>
            <input value={nm.away_flag} onChange={e => setNm(p => ({ ...p, away_flag: e.target.value }))} placeholder="🇦🇷" />
          </div>
        </div>
        <div className="field">
          <label>Stage</label>
          <input value={nm.stage} onChange={e => setNm(p => ({ ...p, stage: e.target.value }))} placeholder="Group Stage / Quarter Final / etc." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>Kick-off time</label>
            <input type="datetime-local" value={nm.kickoff_at} onChange={e => setNm(p => ({ ...p, kickoff_at: e.target.value }))} />
          </div>
          <div className="field">
            <label>Entries close at</label>
            <input type="datetime-local" value={nm.entries_close_at} onChange={e => setNm(p => ({ ...p, entries_close_at: e.target.value }))} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={createMatch}>
          Create match &amp; go live
        </button>
      </div>

      {/* Links */}
      <div className="card">
        <h2>Quick links</h2>
        <div className="admin-row">
          <span style={{ fontSize: 14 }}>Haverhill patron link</span>
          <a href="/?pub=haverhill" target="_blank" style={{ color: 'var(--green)', fontSize: 13 }}>Open ↗</a>
        </div>
        <div className="admin-row">
          <span style={{ fontSize: 14 }}>Nashua patron link</span>
          <a href="/?pub=nashua" target="_blank" style={{ color: 'var(--green)', fontSize: 13 }}>Open ↗</a>
        </div>
        <div className="admin-row">
          <span style={{ fontSize: 14 }}>Leaderboard (all)</span>
          <a href="/leaderboard" target="_blank" style={{ color: 'var(--green)', fontSize: 13 }}>Open ↗</a>
        </div>
        <div className="admin-row">
          <span style={{ fontSize: 14 }}>Haverhill leaderboard</span>
          <a href="/leaderboard?pub=haverhill" target="_blank" style={{ color: 'var(--green)', fontSize: 13 }}>Open ↗</a>
        </div>
        <div className="admin-row">
          <span style={{ fontSize: 14 }}>Nashua leaderboard</span>
          <a href="/leaderboard?pub=nashua" target="_blank" style={{ color: 'var(--green)', fontSize: 13 }}>Open ↗</a>
        </div>
      </div>
    </div>
  )
}
