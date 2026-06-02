'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, type Match } from '@/lib/supabase'
import { getDailyCode } from '@/lib/matchSchedule'

type EntryRow = {
  name: string; phone: string; email: string | null; pick: string
  is_correct: boolean | null; raffle_entries: number; pub_id: string; created_at: string
  matches: { home_team: string; away_team: string; home_flag: string; away_flag: string; stage: string; kickoff_at: string } | null
}
type DayStat = [string, { haverhill: number; nashua: number; total: number }]
type Totals = { total_entries: number; unique_phones: number; emails_collected: number; correct: number; haverhill: number; nashua: number }
type FeedbackRow = { id: string; message: string; email: string | null; page: string | null; created_at: string; read: boolean }
type RaffleEntrant = { name: string; phone: string; pub_id: string; tickets: number }
type RaffleWinner = RaffleEntrant & { place: number }

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState('')
  const [tab, setTab] = useState<'results' | 'entrants' | 'stats' | 'feedback' | 'raffle'>('results')
  const [todaysMatches, setTodaysMatches] = useState<Match[]>([])
  const [recentMatches, setRecentMatches] = useState<Match[]>([])
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([])
  const [results, setResults] = useState<Record<string, 'home' | 'draw' | 'away'>>({})
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')
  const [stats, setStats] = useState<DayStat[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [entrants, setEntrants] = useState<EntryRow[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [loadingEntrants, setLoadingEntrants] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackRow[]>([])
  const [selectedReminderIds, setSelectedReminderIds] = useState<Set<string>>(new Set())
  const [reminderSending, setReminderSending] = useState(false)
  const [reminderResult, setReminderResult] = useState<{ sent: number; total: number; errors?: string[] } | null>(null)
  const [rafflePool, setRafflePool] = useState<RaffleEntrant[]>([])
  const [rafflePoolLoaded, setRafflePoolLoaded] = useState(false)
  const [raffleFilter, setRaffleFilter] = useState<'all' | 'haverhill' | 'nashua'>('all')
  const [winners, setWinners] = useState<RaffleWinner[] | null>(null)
  const [drawPhase, setDrawPhase] = useState<'idle' | 'rolling' | 'done'>('idle')
  const [rollingName, setRollingName] = useState('')
  const dailyCode = getDailyCode()

  async function login() {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action: 'ping', payload: {} })
    })
    if (res.ok) { setAuthed(true); setAuthError('') }
    else setAuthError('Wrong password')
  }

  const loadMatches = useCallback(async () => {
    const now = new Date()
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const threeDaysAhead = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

    const { data: today } = await supabase.from('matches').select('*')
      .gte('kickoff_at', todayStart.toISOString())
      .lte('kickoff_at', todayEnd.toISOString())
      .neq('stage', 'Demo Match').order('kickoff_at')
    setTodaysMatches(today || [])

    const { data: recent } = await supabase.from('matches').select('*')
      .gte('kickoff_at', threeDaysAgo.toISOString())
      .lt('kickoff_at', todayStart.toISOString())
      .is('result', null).neq('stage', 'Demo Match')
      .order('kickoff_at', { ascending: false })
    setRecentMatches(recent || [])

    const { data: upcoming } = await supabase.from('matches').select('*')
      .gt('kickoff_at', todayEnd.toISOString())
      .lte('kickoff_at', threeDaysAhead.toISOString())
      .neq('stage', 'Demo Match').order('kickoff_at')
    setUpcomingMatches(upcoming || [])
  }, [])

  const loadStats = useCallback(async () => {
    const res = await fetch(`/api/admin-data?password=${encodeURIComponent(password)}&action=stats`)
    const data = await res.json()
    if (data.stats) { setStats(data.stats); setTotals(data.totals) }
  }, [password])

  const loadEntrants = useCallback(async (date?: string) => {
    setLoadingEntrants(true)
    const url = `/api/admin-data?password=${encodeURIComponent(password)}&action=entrants${date ? `&date=${date}` : ''}`
    const res = await fetch(url)
    const data = await res.json()
    setEntrants(data.entries || [])
    setLoadingEntrants(false)
  }, [password])

  const loadFeedback = useCallback(async () => {
    const res = await fetch(`/api/admin-data?password=${encodeURIComponent(password)}&action=feedback`)
    const data = await res.json()
    setFeedback(data.feedback || [])
  }, [password])

  useEffect(() => {
    if (!authed) return
    loadMatches()
    loadStats()
    loadEntrants()
    loadFeedback()
  }, [authed, loadMatches, loadStats, loadEntrants, loadFeedback])

  useEffect(() => {
    if (authed && tab === 'raffle' && !rafflePoolLoaded) loadRafflePool()
  }, [authed, tab]) // eslint-disable-line

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
      loadMatches(); loadStats(); loadEntrants()
    } else flash(data.error, 'error')
  }

  async function sendReminder() {
    setReminderSending(true)
    setReminderResult(null)
    try {
      const res = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, match_ids: Array.from(selectedReminderIds) }),
      })
      const data = await res.json()
      setReminderResult(data)
    } catch {
      setReminderResult({ sent: 0, total: 0, errors: ['Network error — check your connection'] })
    }
    setReminderSending(false)
  }

  function toggleReminderId(id: string) {
    setSelectedReminderIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function loadRafflePool() {
    setRafflePoolLoaded(false)
    const res = await fetch(`/api/admin-data?password=${encodeURIComponent(password)}&action=entrants`)
    const data = await res.json()
    const rows: EntryRow[] = data.entries || []
    // Aggregate by phone: sum tickets, keep latest name + pub
    const byPhone = new Map<string, RaffleEntrant>()
    for (const e of rows) {
      if (!byPhone.has(e.phone)) {
        byPhone.set(e.phone, { name: e.name, phone: e.phone, pub_id: e.pub_id, tickets: 0 })
      }
      byPhone.get(e.phone)!.tickets += e.raffle_entries
    }
    const pool = Array.from(byPhone.values())
      .filter(p => p.tickets > 0)
      .sort((a, b) => b.tickets - a.tickets)
    setRafflePool(pool)
    setRafflePoolLoaded(true)
  }

  function weightedDraw(pool: RaffleEntrant[], count: number): RaffleWinner[] {
    // Build flat ticket array — each person gets one entry per raffle ticket
    const tickets: string[] = []
    const byPhone = new Map<string, RaffleEntrant>()
    for (const p of pool) {
      byPhone.set(p.phone, p)
      for (let i = 0; i < p.tickets; i++) tickets.push(p.phone)
    }
    const drawn: RaffleWinner[] = []
    const used = new Set<string>()
    let remaining = [...tickets]
    for (let place = 1; place <= count; place++) {
      const eligible = remaining.filter(ph => !used.has(ph))
      if (eligible.length === 0) break
      const winner = eligible[Math.floor(Math.random() * eligible.length)]
      used.add(winner)
      remaining = remaining.filter(ph => ph !== winner)
      drawn.push({ ...byPhone.get(winner)!, place })
    }
    return drawn
  }

  async function runDraw() {
    const filtered = raffleFilter === 'all'
      ? rafflePool
      : rafflePool.filter(p => p.pub_id === raffleFilter)
    if (filtered.length === 0) return
    setDrawPhase('rolling')
    setWinners(null)
    const names = filtered.map(p => p.name)
    let i = 0
    const iv = setInterval(() => { setRollingName(names[i++ % names.length]); }, 80)
    await new Promise<void>(resolve => setTimeout(resolve, 2200))
    clearInterval(iv)
    setWinners(weightedDraw(filtered, 3))
    setDrawPhase('done')
  }

  function flash(text: string, type: 'success' | 'error') {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 5000)
  }

  async function markFeedbackRead(id: string) {
    await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action: 'mark_feedback_read', payload: { id } })
    })
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, read: true } : f))
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }
  function fmtFull(iso: string) {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  function MatchResultRow({ m }: { m: Match }) {
    const hasResult = !!m.result
    const isOpen = new Date(m.entries_close_at) > new Date()
    return (
      <div className="admin-row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {m.home_flag} {m.home_team} vs {m.away_flag} {m.away_team}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {m.stage} · {fmt(m.kickoff_at)}
            {isOpen && <span style={{ color: 'var(--green)', marginLeft: 6 }}>● Open</span>}
          </div>
          {hasResult && (
            <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 2 }}>
              ✓ {m.result === 'home' ? `${m.home_team} win` : m.result === 'away' ? `${m.away_team} win` : 'Draw'}
            </div>
          )}
        </div>
        {!hasResult && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select value={results[m.id] || ''}
              onChange={e => setResults(prev => ({ ...prev, [m.id]: e.target.value as 'home' | 'draw' | 'away' }))}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--gray-border)', background: 'var(--white)', color: 'var(--text)', fontSize: 13 }}>
              <option value="">Result…</option>
              <option value="home">{m.home_flag} {m.home_team} win</option>
              <option value="draw">Draw</option>
              <option value="away">{m.away_flag} {m.away_team} win</option>
            </select>
            <button className="btn btn-primary" style={{ width: 'auto', padding: '7px 14px', fontSize: 13 }}
              disabled={!results[m.id]} onClick={() => setResult(m)}>
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
            <input type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              placeholder="Enter admin password" />
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
      <p className="muted" style={{ marginBottom: 16 }}>The Peddler&apos;s Daughter — World Cup 2026</p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14,
          background: msgType === 'success' ? 'var(--green-light)' : 'var(--red-light)',
          color: msgType === 'success' ? 'var(--green-dark)' : 'var(--red)' }}>{msg}</div>
      )}

      {/* Tabs */}
      {(() => {
        const unread = feedback.filter(f => !f.read).length
        return (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {(['results', 'entrants', 'stats', 'feedback', 'raffle'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid var(--gray-border)',
                  background: tab === t ? 'var(--green)' : 'transparent',
                  color: tab === t ? '#fff' : 'var(--text)', fontWeight: tab === t ? 600 : 400,
                  cursor: 'pointer', fontSize: 13, textTransform: 'capitalize',
                  display: 'flex', alignItems: 'center', gap: 6 }}>
                {t}
                {t === 'feedback' && unread > 0 && (
                  <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 6px', lineHeight: 1.4 }}>
                    {unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        )
      })()}

      {/* RESULTS TAB */}
      {tab === 'results' && (
        <>
          <div className="card" style={{ background: 'var(--amber-light)', border: '1px solid var(--amber)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 3,
                background: 'var(--green-light)', color: 'var(--green-dark)',
                padding: '8px 16px', borderRadius: 8, border: '2px solid var(--green)' }}>
                {dailyCode}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>Today&apos;s patron code</p>
                <p className="muted" style={{ fontSize: 12 }}>Changes automatically at midnight</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Today&apos;s matches</h2>
            {todaysMatches.length === 0
              ? <p className="muted">No matches today.</p>
              : todaysMatches.map(m => <MatchResultRow key={m.id} m={m} />)}
          </div>

          {recentMatches.length > 0 && (
            <div className="card">
              <h2>Recent — result not set</h2>
              {recentMatches.map(m => <MatchResultRow key={m.id} m={m} />)}
            </div>
          )}

          {upcomingMatches.length > 0 && (
            <div className="card">
              <h2>Coming up</h2>
              {upcomingMatches.map(m => (
                <div key={m.id} className="admin-row">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {m.home_flag} {m.home_team} vs {m.away_flag} {m.away_team}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>{fmtDate(m.kickoff_at)} · {fmt(m.kickoff_at)} · {m.stage}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h2>Quick links</h2>
            {[
              ['Haverhill entry', '/?pub=haverhill'],
              ['Nashua entry', '/?pub=nashua'],
              ['Leaderboard', '/leaderboard'],
              ['Schedule', '/schedule'],
            ].map(([label, href]) => (
              <div key={href} className="admin-row">
                <span style={{ fontSize: 14 }}>{label}</span>
                <a href={href} target="_blank" style={{ color: 'var(--green)', fontSize: 13 }}>Open ↗</a>
              </div>
            ))}
          </div>

          {(() => {
            const now = new Date()
            const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
            const candidates = [
              ...todaysMatches.filter(m => new Date(m.kickoff_at) > now),
              ...upcomingMatches.filter(m => new Date(m.kickoff_at) <= in48h),
            ]
            return (
              <div className="card">
                <h2 style={{ marginBottom: 4 }}>Email Reminder</h2>
                <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                  Send a match alert to email subscribers ({totals?.emails_collected ?? '—'} collected).
                  Select which matches to include.
                </p>
                {candidates.length === 0 ? (
                  <p className="muted" style={{ fontSize: 13 }}>No upcoming matches in the next 48 hours.</p>
                ) : (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      {candidates.map(m => (
                        <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                          <input type="checkbox"
                            checked={selectedReminderIds.has(m.id)}
                            onChange={() => toggleReminderId(m.id)}
                            style={{ width: 16, height: 16, accentColor: 'var(--green)', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                              {m.home_flag} {m.home_team} vs {m.away_flag} {m.away_team}
                            </div>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {fmtDate(m.kickoff_at)} · {fmt(m.kickoff_at)} · {m.stage}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <button className="btn btn-primary"
                      style={{ width: 'auto', padding: '10px 20px', fontSize: 14 }}
                      disabled={selectedReminderIds.size === 0 || reminderSending}
                      onClick={sendReminder}>
                      {reminderSending
                        ? 'Sending…'
                        : `Send to ${totals?.emails_collected ?? 0} subscribers`}
                    </button>
                    {reminderResult && (
                      <div style={{ marginTop: 10, fontSize: 13,
                        color: reminderResult.errors?.length ? 'var(--amber)' : 'var(--green)' }}>
                        {reminderResult.errors?.length
                          ? `⚠️ Sent ${reminderResult.sent}/${reminderResult.total}. Errors: ${reminderResult.errors.join(', ')}`
                          : `✅ Sent to ${reminderResult.sent} of ${reminderResult.total} subscribers`}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })()}

          <div className="card">
            <h2 style={{ marginBottom: 4 }}>QR Codes</h2>
            <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>Screenshot and share on Instagram Stories or print for tables.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { city: 'Haverhill', pub: 'haverhill' },
                { city: 'Nashua', pub: 'nashua' },
              ].map(({ city, pub }) => {
                const url = `https://peddlers-predictor.vercel.app/?pub=${pub}`
                const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(url)}`
                return (
                  <div key={pub} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{city}</div>
                    <img src={qrSrc} alt={`QR code for ${city}`} width={160} height={160}
                      style={{ borderRadius: 8, display: 'block', margin: '0 auto' }} />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, wordBreak: 'break-all' }}>
                      peddlers-predictor.vercel.app/?pub={pub}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ENTRANTS TAB */}
      {tab === 'entrants' && (
        <>
          <div className="card">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={selectedDate}
                onChange={e => { setSelectedDate(e.target.value); loadEntrants(e.target.value) }}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--gray-border)', background: 'var(--white)', color: 'var(--text)', fontSize: 14 }}
              />
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
                onClick={() => { setSelectedDate(''); loadEntrants() }}>
                Show all
              </button>
              <a href={`/api/admin-data?password=${encodeURIComponent(password)}&action=export-csv`}
                className="btn btn-primary"
                style={{ width: 'auto', padding: '8px 14px', fontSize: 13, textDecoration: 'none', display: 'inline-block' }}>
                ↓ Export CSV
              </a>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              {entrants.length} entries shown
            </p>
          </div>

          {loadingEntrants
            ? <p className="muted" style={{ textAlign: 'center', padding: 32 }}>Loading…</p>
            : entrants.map((e, i) => (
              <div key={i} style={{
                background: 'var(--white)', border: '1px solid var(--gray-border)',
                borderRadius: 10, padding: '12px 14px', marginBottom: 8
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</span>
                    <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                      {e.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtFull(e.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  📞 {e.phone}
                  {e.email && <span style={{ marginLeft: 12 }}>✉️ {e.email}</span>}
                </div>
                {e.matches && (
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {e.matches.home_flag} {e.matches.home_team} vs {e.matches.away_flag} {e.matches.away_team}
                    {' · '}
                    <strong>
                      {e.pick === 'home' ? `${e.matches.home_team} win` :
                       e.pick === 'away' ? `${e.matches.away_team} win` : 'Draw'}
                    </strong>
                    {' · '}
                    {e.is_correct === true && <span style={{ color: 'var(--green)' }}>✓ Correct</span>}
                    {e.is_correct === false && <span style={{ color: 'var(--red)' }}>✗ Wrong</span>}
                    {e.is_correct === null && <span style={{ color: 'var(--amber)' }}>⏳ Pending</span>}
                  </div>
                )}
              </div>
            ))
          }
        </>
      )}

      {/* STATS TAB */}
      {tab === 'stats' && totals && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Total entries', value: totals.total_entries },
              { label: 'Unique players', value: totals.unique_phones },
              { label: 'Emails collected', value: totals.emails_collected },
              { label: 'Correct picks', value: totals.correct },
              { label: 'Haverhill entries', value: totals.haverhill },
              { label: 'Nashua entries', value: totals.nashua },
            ].map(({ label, value }) => (
              <div key={label} className="card" style={{ textAlign: 'center', padding: '14px 8px', marginBottom: 0 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 12 }}>Entries by day</h2>
            {stats.length === 0
              ? <p className="muted">No entries yet.</p>
              : stats.map(([date, counts]) => (
                <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 70, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{date}</div>
                  <div style={{ flex: 1, background: 'var(--gray-bg)', borderRadius: 6, overflow: 'hidden', height: 22 }}>
                    <div style={{
                      height: '100%', display: 'flex',
                      width: `${Math.min(100, (counts.total / Math.max(...stats.map(([, c]) => c.total))) * 100)}%`
                    }}>
                      <div style={{ flex: counts.haverhill, background: 'var(--green)', opacity: 0.8 }} />
                      <div style={{ flex: counts.nashua, background: 'var(--amber)', opacity: 0.8 }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, width: 24, textAlign: 'right', flexShrink: 0 }}>
                    {counts.total}
                  </div>
                </div>
              ))
            }
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--green)', borderRadius: 2, marginRight: 4 }} />Haverhill</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--amber)', borderRadius: 2, marginRight: 4 }} />Nashua</span>
            </div>
          </div>
        </>
      )}

      {/* FEEDBACK TAB */}
      {tab === 'feedback' && (
        <>
          {feedback.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
              <p className="muted">No feedback submitted yet.</p>
            </div>
          )}
          {feedback.map(f => (
            <div key={f.id} className="card" style={{
              marginBottom: 12, opacity: f.read ? 0.55 : 1,
              borderColor: f.read ? 'var(--gray-border)' : 'var(--amber)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontWeight: 700 }}>
                  {new Date(f.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {f.email && <span style={{ marginLeft: 8, color: 'var(--green)' }}>· {f.email}</span>}
                </div>
                {!f.read && (
                  <button onClick={() => markFeedbackRead(f.id)}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, border: '1px solid var(--gray-border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>
                    Mark read
                  </button>
                )}
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{f.message}</p>
              {f.page && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', wordBreak: 'break-all' }}>
                  Page: {f.page}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* RAFFLE TAB */}
      {tab === 'raffle' && (
        <>
          <div className="card" style={{ background: 'linear-gradient(135deg, #1a1200, #111)', borderColor: 'rgba(245,197,24,0.3)', marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 6 }}>
              How it works
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
              Each correct prediction earns <strong style={{ color: 'var(--gold)' }}>3 raffle tickets</strong>. The draw is weighted — more correct picks = more tickets = better odds. Wrong picks earn 0 tickets. Draw 1st, 2nd, and 3rd place winners.
            </p>
          </div>

          {/* Pub filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['all', 'haverhill', 'nashua'] as const).map(f => (
              <button key={f} onClick={() => { setRaffleFilter(f); setWinners(null); setDrawPhase('idle') }}
                style={{ padding: '7px 16px', borderRadius: 20, cursor: 'pointer',
                  border: `1px solid ${raffleFilter === f ? 'var(--gold)' : 'var(--border)'}`,
                  background: raffleFilter === f ? 'rgba(245,197,24,0.12)' : 'transparent',
                  color: raffleFilter === f ? 'var(--gold)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12,
                  letterSpacing: 0.5, textTransform: 'capitalize' }}>
                {f === 'all' ? 'All pubs' : f === 'haverhill' ? 'Haverhill' : 'Nashua'}
              </button>
            ))}
          </div>

          {!rafflePoolLoaded ? (
            <p className="muted" style={{ textAlign: 'center', padding: 32 }}>Loading raffle pool…</p>
          ) : (() => {
            const filtered = raffleFilter === 'all'
              ? rafflePool
              : rafflePool.filter(p => p.pub_id === raffleFilter)
            const totalTickets = filtered.reduce((s, p) => s + p.tickets, 0)

            return (
              <>
                {/* Pool stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                  {[
                    { label: 'Eligible players', value: filtered.length },
                    { label: 'Total tickets', value: totalTickets },
                  ].map(({ label, value }) => (
                    <div key={label} className="card" style={{ textAlign: 'center', padding: '14px 8px', marginBottom: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', letterSpacing: 1 }}>{value}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {filtered.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
                    <p className="muted">No eligible entrants yet. Correct predictions needed.</p>
                  </div>
                ) : (
                  <>
                    {/* Rolling animation */}
                    {drawPhase === 'rolling' && (
                      <div className="card" style={{ textAlign: 'center', padding: '32px 20px', background: 'linear-gradient(135deg, #0d1f16, #111)', borderColor: 'rgba(0,200,122,0.3)', marginBottom: 16 }}>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 12 }}>
                          🎲 Drawing…
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: 2, color: 'var(--text)', minHeight: 40, transition: 'none' }}>
                          {rollingName}
                        </div>
                      </div>
                    )}

                    {/* Winners */}
                    {drawPhase === 'done' && winners && (
                      <div style={{ marginBottom: 16 }}>
                        {winners.map((w) => {
                          const medals = ['🥇', '🥈', '🥉']
                          const placeLabels = ['1st Place', '2nd Place', '3rd Place']
                          const colors = ['var(--gold)', '#aaaaaa', '#cd7f32']
                          return (
                            <div key={w.place} className="card pop-in" style={{
                              marginBottom: 10,
                              borderColor: w.place === 1 ? 'var(--gold)' : w.place === 2 ? '#555' : '#4a3010',
                              background: w.place === 1 ? 'linear-gradient(135deg, #1a1200, #111)' : 'var(--surface)',
                              animationDelay: `${(w.place - 1) * 0.15}s`,
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ fontSize: 36, flexShrink: 0 }}>{medals[w.place - 1]}</div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: colors[w.place - 1], marginBottom: 3 }}>
                                    {placeLabels[w.place - 1]}
                                  </div>
                                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: 1, marginBottom: 2 }}>{w.name}</div>
                                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)' }}>
                                    📞 {w.phone} · {w.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: colors[w.place - 1], letterSpacing: 1 }}>{w.tickets}</div>
                                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)' }}>tickets</div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Draw / Re-draw button */}
                    {drawPhase !== 'rolling' && (
                      <button
                        className={`btn ${drawPhase === 'done' ? 'btn-secondary' : 'btn-gold'}`}
                        style={{ marginTop: drawPhase === 'done' ? 0 : 0 }}
                        onClick={runDraw}>
                        {drawPhase === 'done' ? '🔄 Re-draw' : `🎲 Draw Winners — ${filtered.length} players, ${totalTickets} tickets`}
                      </button>
                    )}

                    {/* Top entrants preview */}
                    {drawPhase === 'idle' && filtered.length > 0 && (
                      <div className="card" style={{ marginTop: 16 }}>
                        <h2 style={{ marginBottom: 8, fontSize: 14 }}>Top entrants by tickets</h2>
                        {filtered.slice(0, 10).map((p, i) => (
                          <div key={p.phone} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < Math.min(9, filtered.length - 1) ? '1px solid var(--border)' : 'none' }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-dim)', width: 24, flexShrink: 0 }}>{i + 1}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{p.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'}</div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--gold)', letterSpacing: 1 }}>{p.tickets}</div>
                          </div>
                        ))}
                        {filtered.length > 10 && (
                          <p className="muted" style={{ fontSize: 12, marginTop: 8, textAlign: 'center' }}>+ {filtered.length - 10} more players</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )
          })()}
        </>
      )}
    </div>
  )
}
