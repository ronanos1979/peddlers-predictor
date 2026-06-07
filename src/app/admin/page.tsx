'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, type Match } from '@/lib/supabase'
import { getDailyCode } from '@/lib/matchSchedule'
import Flag from '@/components/Flag'

type EntryRow = {
  id: string; name: string; phone: string; email: string | null; pick: string
  is_correct: boolean | null; raffle_entries: number; pub_id: string; created_at: string
  home_score_pred: number | null; away_score_pred: number | null
  matches: { home_team: string; away_team: string; home_flag: string; away_flag: string; stage: string; kickoff_at: string } | null
}
type DayStat = [string, { haverhill: number; nashua: number; total: number }]
type Totals = { total_entries: number; unique_phones: number; emails_collected: number; correct: number; haverhill: number; nashua: number }
type FeedbackRow = { id: string; message: string; email: string | null; page: string | null; created_at: string; read: boolean }
type CheckInRow = { id: string; name: string; phone: string; email: string | null; pub_id: string; shared_to: string | null; created_at: string; match_id: string; matches: { home_team: string; away_team: string; home_flag: string; away_flag: string; kickoff_at: string; stage: string; checkin_winner_name: string | null; checkin_winner_phone: string | null; checkin_draw_at: string | null } | null }
type RaffleEntrant = { name: string; phone: string; pub_id: string; tickets: number }
type RaffleWinner = RaffleEntrant & { place: number }
type TeamStatus = {
  name: string; flag: string; fd_loaded: boolean; coach_name: string | null
  player_count: number; photo_count: number; club_count: number; cached_at: string | null
}

export default function AdminPage() {
  const [password, setPassword] = useState(() =>
    typeof window !== 'undefined' ? sessionStorage.getItem('admin_pw') || '' : ''
  )
  const [authed, setAuthed] = useState(() =>
    typeof window !== 'undefined' ? sessionStorage.getItem('admin_authed') === '1' : false
  )
  const [authError, setAuthError] = useState('')
  const [tab, setTab] = useState<'results' | 'entrants' | 'stats' | 'feedback' | 'raffle' | 'teams' | 'analytics'>('results')
  const [todaysMatches, setTodaysMatches] = useState<Match[]>([])
  const [recentMatches, setRecentMatches] = useState<Match[]>([])
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([])
  const [results, setResults] = useState<Record<string, 'home' | 'draw' | 'away'>>({})
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>({})
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
  const [teams, setTeams] = useState<TeamStatus[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [teamAction, setTeamAction] = useState<string | null>(null)
  const [loadAllFdRunning, setLoadAllFdRunning] = useState(false)
  const [loadAllFdProgress, setLoadAllFdProgress] = useState('')
  const [syncing, setSyncing] = useState(false)
  type AnalyticsEvent = { event: string; properties: Record<string, unknown>; created_at: string }
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[] | null>(null)
  const [analyticsDays, setAnalyticsDays] = useState(7)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<{ updated: number; entries_scored: number; message?: string } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [checkins, setCheckins] = useState<CheckInRow[]>([])
  const [checkinMinDraw, setCheckinMinDraw] = useState<number>(() =>
    typeof window !== 'undefined' ? parseInt(localStorage.getItem('checkin_min_draw') || '10', 10) : 10
  )
  const [drawingMatchId, setDrawingMatchId] = useState<string | null>(null)
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
      sessionStorage.setItem('admin_pw', password)
      sessionStorage.setItem('admin_authed', '1')
    } else setAuthError('Wrong password')
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

  const loadCheckins = useCallback(async () => {
    const res = await fetch(`/api/admin-data?password=${encodeURIComponent(password)}&action=checkins`)
    const data = await res.json()
    setCheckins(data.checkins || [])
  }, [password])

  const loadTeams = useCallback(async () => {
    setTeamsLoading(true)
    const res  = await fetch(`/api/admin-teams?password=${encodeURIComponent(password)}`)
    const data = await res.json()
    setTeams(data.teams || [])
    setTeamsLoading(false)
  }, [password])

  const loadAnalytics = useCallback(async (days: number) => {
    setAnalyticsLoading(true)
    const res = await fetch(`/api/analytics?days=${days}`, { headers: { 'x-admin-password': password } })
    const data = await res.json()
    setAnalyticsEvents(data.events || [])
    setAnalyticsLoading(false)
  }, [password])

  useEffect(() => {
    if (!authed) return
    loadMatches()
    loadStats()
    loadEntrants()
    loadFeedback()
    loadCheckins()
  }, [authed, loadMatches, loadStats, loadEntrants, loadFeedback, loadCheckins])

  useEffect(() => {
    if (authed && tab === 'raffle' && !rafflePoolLoaded) loadRafflePool()
    if (authed && tab === 'analytics' && analyticsEvents === null) loadAnalytics(analyticsDays)
  }, [authed, tab]) // eslint-disable-line

  useEffect(() => {
    if (authed && tab === 'teams') loadTeams()
  }, [authed, tab, loadTeams])

  async function setResult(match: Match) {
    const result = results[match.id]
    if (!result) return
    const matchScores = scores[match.id]
    const homeScore = matchScores?.home !== '' && matchScores?.home != null ? parseInt(matchScores.home, 10) : null
    const awayScore = matchScores?.away !== '' && matchScores?.away != null ? parseInt(matchScores.away, 10) : null
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password, action: 'set_result',
        payload: {
          match_id: match.id, result,
          home_score: homeScore != null && !isNaN(homeScore) ? homeScore : null,
          away_score: awayScore != null && !isNaN(awayScore) ? awayScore : null,
          auto_draw_min: checkinMinDraw,
        }
      })
    })
    const data = await res.json()
    if (data.success) {
      let msg = `✅ Result set! ${data.updated} entries updated.`
      if (data.checkin_draw) {
        msg += `\n🏆 Attendance draw winner: ${data.checkin_draw.winner_name} (${data.checkin_draw.winner_phone})`
      }
      flash(msg, 'success')
      loadMatches(); loadStats(); loadEntrants(); loadCheckins()
    } else flash(data.error, 'error')
  }

  async function drawCheckinWinner(matchId: string) {
    setDrawingMatchId(matchId)
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action: 'draw_checkin_winner', payload: { match_id: matchId } })
    })
    const data = await res.json()
    setDrawingMatchId(null)
    if (data.success) {
      flash(`🏆 Winner: ${data.winner_name} — ${data.winner_phone}${data.emailed ? ' (emailed!)' : ''}`, 'success')
      loadCheckins(); loadMatches()
    } else flash(data.error || 'Draw failed', 'error')
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

  async function loadTeamFd(teamName: string) {
    setTeamAction(teamName + ':fd')
    try {
      const res  = await fetch('/api/admin-teams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'load_fd', team_name: teamName }),
      })
      const data = await res.json()
      if (data.success) {
        setTeams(prev => prev.map(t => t.name === teamName
          ? { ...t, fd_loaded: true, player_count: data.player_count, coach_name: data.coach }
          : t))
        flash(`✅ ${teamName}: ${data.player_count} players loaded from FD`, 'success')
      } else {
        flash(`❌ ${teamName}: ${data.error}`, 'error')
      }
    } catch { flash(`❌ ${teamName}: network error`, 'error') }
    setTeamAction(null)
  }

  async function loadTeamAf(teamName: string) {
    setTeamAction(teamName + ':af')
    try {
      const res  = await fetch('/api/admin-teams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'enrich_af', team_name: teamName }),
      })
      const data = await res.json()
      if (data.success) {
        if (!data.rate_limited) {
          loadTeams()
        } else {
          setTeams(prev => prev.map(t => t.name === teamName ? {
            ...t,
            photo_count: t.photo_count + (data.photos_added || 0),
            club_count:  t.club_count  + (data.clubs_added  || 0),
          } : t))
        }
        if (data.rate_limited) {
          flash(`⚠️ ${teamName}: rate limited — ${data.photos_added} photos, ${data.clubs_added} clubs saved`, 'error')
        } else if (data.photo_error) {
          flash(`⚠️ ${teamName}: ${data.photo_error}`, 'error')
        } else {
          flash(`✅ ${teamName}: ${data.photos_added} photos, ${data.clubs_added} clubs loaded`, 'success')
        }
      } else {
        flash(`❌ ${teamName}: ${data.error}`, 'error')
      }
    } catch { flash(`❌ ${teamName}: network error`, 'error') }
    setTeamAction(null)
  }

  async function loadAllFd() {
    const unloaded = teams.filter(t => !t.fd_loaded)
    if (!unloaded.length) return
    setLoadAllFdRunning(true)
    for (let i = 0; i < unloaded.length; i++) {
      setLoadAllFdProgress(`${i + 1}/${unloaded.length}`)
      const team = unloaded[i]
      try {
        const res  = await fetch('/api/admin-teams', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, action: 'load_fd', team_name: team.name }),
        })
        const data = await res.json()
        if (data.success) {
          setTeams(prev => prev.map(t => t.name === team.name
            ? { ...t, fd_loaded: true, player_count: data.player_count, coach_name: data.coach }
            : t))
        }
      } catch { /* continue on network error */ }
      if (i < unloaded.length - 1) await new Promise(r => setTimeout(r, 7000))
    }
    setLoadAllFdRunning(false)
    setLoadAllFdProgress('')
  }

  function flash(text: string, type: 'success' | 'error') {
    setMsg(text); setMsgType(type)
  }

  async function syncResults() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'sync_results', payload: {} })
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error || 'Sync failed', 'error'); setSyncing(false); return }
      setSyncResult(data)
      if (data.updated > 0) { loadMatches(); loadStats(); loadEntrants() }
    } catch {
      flash('Network error during sync', 'error')
    }
    setSyncing(false)
  }

  async function markFeedbackRead(id: string) {
    await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action: 'mark_feedback_read', payload: { id } })
    })
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, read: true } : f))
  }

  async function deleteEntry(id: string) {
    setConfirmDeleteId(null)
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action: 'delete_entry', payload: { entry_id: id } })
    })
    const data = await res.json()
    if (data.success) {
      setEntrants(prev => prev.filter(e => e.id !== id))
      flash('Entry deleted', 'success')
    } else {
      flash(`Delete failed: ${data.error}`, 'error')
    }
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
    const matchScores = scores[m.id] || { home: '', away: '' }
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
              {m.home_score != null && m.away_score != null && (
                <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
                  ({m.home_score}–{m.away_score})
                </span>
              )}
            </div>
          )}
        </div>
        {!hasResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
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
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Score (optional):</span>
              <input
                type="number" min="0" max="20" value={matchScores.home}
                onChange={e => setScores(prev => ({ ...prev, [m.id]: { ...matchScores, home: e.target.value } }))}
                placeholder="0" style={{ width: 44, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--gray-border)', background: 'var(--white)', color: 'var(--text)', fontSize: 13, textAlign: 'center' }}
              />
              <span style={{ color: 'var(--text-muted)' }}>–</span>
              <input
                type="number" min="0" max="20" value={matchScores.away}
                onChange={e => setScores(prev => ({ ...prev, [m.id]: { ...matchScores, away: e.target.value } }))}
                placeholder="0" style={{ width: 44, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--gray-border)', background: 'var(--white)', color: 'var(--text)', fontSize: 13, textAlign: 'center' }}
              />
            </div>
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
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '12px 16px 12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          background: msgType === 'success' ? '#003d25' : '#3d0000',
          color: msgType === 'success' ? 'var(--green)' : 'var(--red)',
          maxWidth: 'calc(100vw - 48px)', display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg}</span>
          <button onClick={() => setMsg('')} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1,
            color: 'inherit', opacity: 0.7, padding: '0 2px', flexShrink: 0,
          }}>✕</button>
        </div>
      )}

      {/* Tabs */}
      {(() => {
        const unread = feedback.filter(f => !f.read).length
        return (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {(['results', 'entrants', 'stats', 'feedback', 'raffle', 'teams', 'analytics'] as const).map(t => (
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
          {/* Check-In Attendance Draw */}
          {(() => {
            // Group check-ins by match
            const byMatch = new Map<string, CheckInRow[]>()
            for (const c of checkins) {
              if (!byMatch.has(c.match_id)) byMatch.set(c.match_id, [])
              byMatch.get(c.match_id)!.push(c)
            }
            if (byMatch.size === 0) return null
            return (
              <div className="card" style={{ marginBottom: 16, border: '1px solid rgba(255,59,59,0.3)', background: 'linear-gradient(135deg, #1a0000, #0f0000)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--red)', marginBottom: 4 }}>
                      🍺 Attendance Check-Ins
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {checkins.length} total · {byMatch.size} match{byMatch.size !== 1 ? 'es' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      Auto-draw if ≥
                    </label>
                    <input
                      type="number" min="0" max="999" value={checkinMinDraw}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10)
                        if (!isNaN(v) && v >= 0) {
                          setCheckinMinDraw(v)
                          localStorage.setItem('checkin_min_draw', String(v))
                        }
                      }}
                      style={{ width: 56, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, textAlign: 'center' }}
                    />
                    <span style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)' }}>check-ins</span>
                  </div>
                </div>
                {Array.from(byMatch.entries()).map(([matchId, rows]) => {
                  const m = rows[0].matches
                  const alreadyDrawn = m?.checkin_winner_name
                  return (
                    <div key={matchId} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {m?.home_flag} {m?.home_team} vs {m?.away_flag} {m?.away_team}
                          </div>
                          <div className="muted" style={{ fontSize: 12 }}>{m?.stage} · {rows.length} checked in</div>
                        </div>
                        {alreadyDrawn ? (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 2 }}>🏆 Winner Drawn</div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{m.checkin_winner_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.checkin_winner_phone}</div>
                            <button
                              onClick={() => drawCheckinWinner(matchId)}
                              disabled={drawingMatchId === matchId}
                              style={{ marginTop: 4, fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                              Re-draw
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-primary"
                            style={{ width: 'auto', padding: '7px 14px', fontSize: 13, background: 'var(--red)', borderColor: 'transparent' }}
                            onClick={() => drawCheckinWinner(matchId)}
                            disabled={drawingMatchId === matchId}
                          >
                            {drawingMatchId === matchId ? 'Drawing…' : `🎲 Draw Winner (${rows.length})`}
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {rows.slice(0, 10).map(c => (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{c.name}</span>
                            <span>·</span>
                            <span>{c.phone}</span>
                            {c.email && <><span>·</span><span style={{ color: 'var(--green)' }}>✉</span></>}
                            {c.shared_to && <span style={{ color: 'var(--amber)', fontSize: 11 }}>shared via {c.shared_to}</span>}
                          </div>
                        ))}
                        {rows.length > 10 && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>+ {rows.length - 10} more</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

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

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Sync results from API</div>
                <div className="muted" style={{ fontSize: 12 }}>Fetches all finished WC matches and scores entries automatically</div>
              </div>
              <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 16px', flexShrink: 0 }}
                disabled={syncing} onClick={syncResults}>
                {syncing ? 'Syncing…' : '⟳ Sync'}
              </button>
            </div>
            {syncResult && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize: 13,
                background: syncResult.updated > 0 ? 'rgba(0,200,122,0.1)' : 'rgba(119,119,112,0.1)',
                color: syncResult.updated > 0 ? 'var(--green)' : 'var(--text-muted)',
                border: `1px solid ${syncResult.updated > 0 ? 'rgba(0,200,122,0.3)' : 'var(--border)'}` }}>
                {syncResult.message || `✅ ${syncResult.updated} match${syncResult.updated !== 1 ? 'es' : ''} updated · ${syncResult.entries_scored} entries scored`}
              </div>
            )}
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
            : entrants.map((e) => (
              <div key={e.id} style={{
                background: 'var(--white)', border: '1px solid var(--gray-border)',
                borderRadius: 10, padding: '12px 14px', marginBottom: 8
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</span>
                    <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                      {e.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtFull(e.created_at)}</span>
                    {confirmDeleteId === e.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => deleteEntry(e.id)}
                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--red)', background: 'rgba(255,59,59,0.12)', color: 'var(--red)', cursor: 'pointer', fontWeight: 700 }}>
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--gray-border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(e.id)}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--gray-border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                        title="Delete entry">
                        🗑
                      </button>
                    )}
                  </div>
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
                    {e.home_score_pred != null && e.away_score_pred != null && (
                      <span style={{ marginLeft: 6, color: 'var(--gold)', fontWeight: 700 }}>
                        ({e.home_score_pred}–{e.away_score_pred})
                      </span>
                    )}
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
              Correct result = <strong style={{ color: 'var(--gold)' }}>1 ticket</strong>. Correct result + exact score = <strong style={{ color: 'var(--gold)' }}>3 tickets</strong>. Wrong = 0 tickets. The draw is weighted — more tickets = better odds. Draw 1st, 2nd, and 3rd place winners.
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

      {/* TEAMS TAB */}
      {tab === 'teams' && (
        <>
          {teamsLoading ? (
            <p className="muted" style={{ textAlign: 'center', padding: 32 }}>Loading teams…</p>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>
                      {teams.filter(t => t.fd_loaded).length}/{teams.length} teams loaded from FD
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {teams.reduce((s, t) => s + t.player_count, 0)} players ·{' '}
                      {teams.reduce((s, t) => s + t.photo_count, 0)} photos ·{' '}
                      {teams.reduce((s, t) => s + t.club_count, 0)} clubs
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      FD: 10 req/min — ~2 calls per team. Load all takes ~10 min.
                      AF: 100 req/day — ~28 calls per team. "Load photos & clubs" loads player photos AND club names in one go.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {loadAllFdRunning && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {loadAllFdProgress}…
                      </span>
                    )}
                    <button className="btn btn-secondary"
                      style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }}
                      onClick={loadTeams} disabled={teamsLoading}>
                      Refresh
                    </button>
                    <button className="btn btn-primary"
                      style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }}
                      disabled={loadAllFdRunning || !!teamAction || teams.every(t => t.fd_loaded)}
                      onClick={loadAllFd}>
                      {loadAllFdRunning
                        ? `Loading ${loadAllFdProgress}…`
                        : `Load all from FD (${teams.filter(t => !t.fd_loaded).length} left)`}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {teams.map(team => {
                  const isFdLoading = teamAction === team.name + ':fd'
                  const isAfLoading = teamAction === team.name + ':af'
                  const isAnyBusy  = !!teamAction || loadAllFdRunning
                  const fullyDone  = team.player_count > 0
                    && team.photo_count === team.player_count
                    && team.club_count  === team.player_count
                  return (
                    <div key={team.name} style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '8px 12px',
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    }}>
                      <a href={`/world-cup/team?name=${encodeURIComponent(team.name)}`}
                        target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit', flexShrink: 0 }}>
                        <Flag emoji={team.flag} size={22} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{team.name}</div>
                          {team.coach_name && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{team.coach_name}</div>
                          )}
                        </div>
                      </a>
                      <div style={{ flex: 1 }} />
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ textAlign: 'center', minWidth: 60 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: team.player_count > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                            {team.player_count > 0 ? team.player_count : '—'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>players</div>
                        </div>
                        <div style={{ textAlign: 'center', minWidth: 52 }}>
                          <div style={{ fontSize: 13, fontWeight: 700,
                            color: team.player_count === 0 ? 'var(--text-muted)' :
                              team.photo_count === team.player_count ? 'var(--green)' : 'var(--amber)' }}>
                            {team.player_count > 0 ? `${team.photo_count}/${team.player_count}` : '—'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>photos</div>
                        </div>
                        <div style={{ textAlign: 'center', minWidth: 52 }}>
                          <div style={{ fontSize: 13, fontWeight: 700,
                            color: team.player_count === 0 ? 'var(--text-muted)' :
                              team.club_count === team.player_count ? 'var(--green)' : 'var(--text-muted)' }}>
                            {team.player_count > 0 ? `${team.club_count}/${team.player_count}` : '—'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>clubs</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button className="btn btn-secondary"
                          style={{ width: 'auto', padding: '4px 9px', fontSize: 11 }}
                          disabled={isAnyBusy}
                          onClick={() => loadTeamFd(team.name)}>
                          {isFdLoading ? '…' : 'Load players'}
                        </button>
                        <button className="btn btn-secondary"
                          style={{ width: 'auto', padding: '4px 9px', fontSize: 11 }}
                          disabled={isAnyBusy || !team.fd_loaded || team.player_count === 0 || fullyDone}
                          onClick={() => loadTeamAf(team.name)}>
                          {isAfLoading ? '…' : 'Load photos & clubs'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'analytics' && (() => {
        const events = analyticsEvents || []

        function count(name: string, pubFilter?: string) {
          return events.filter(e => e.event === name && (!pubFilter || e.properties?.pub_id === pubFilter)).length
        }

        const pubs = ['haverhill', 'nashua'] as const
        const sections = [
          {
            title: 'Geo Funnel',
            subtitle: 'How patrons gain access at the pub',
            rows: [
              { label: '✅ Verified at pub', key: 'geo_verified' },
              { label: '📍 Too far away', key: 'geo_too_far' },
              { label: '🚫 Location blocked', key: 'geo_blocked' },
              { label: '🔑 Chose code path', key: 'chose_code_path' },
              { label: '✅ Code accepted', key: 'code_verified' },
              { label: '❌ Wrong code entered', key: 'code_failed' },
            ],
          },
          {
            title: 'Engagement',
            subtitle: 'App usage — leaderboard & picks checks are usually out-of-pub',
            rows: [
              { label: '🔄 Returning patron visits', key: 'patron_returning' },
              { label: '🏆 Leaderboard views', key: 'leaderboard_viewed' },
              { label: '🎯 My picks views', key: 'my_picks_viewed' },
            ],
          },
          {
            title: 'Conversions',
            subtitle: 'Prediction funnel',
            rows: [
              { label: '✅ Predictions submitted', key: 'prediction_submitted' },
              { label: '⬅️ Form abandoned', key: 'form_abandoned' },
            ],
          },
        ]

        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Analytics</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                {[7, 30, 90].map(d => (
                  <button key={d}
                    onClick={() => { setAnalyticsDays(d); loadAnalytics(d) }}
                    style={{ padding: '5px 12px', borderRadius: 16, border: '1px solid var(--gray-border)', fontSize: 12, fontWeight: analyticsDays === d ? 700 : 400, background: analyticsDays === d ? 'var(--green)' : 'transparent', color: analyticsDays === d ? '#fff' : 'var(--text)', cursor: 'pointer' }}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {analyticsLoading && <p className="muted">Loading…</p>}

            {!analyticsLoading && events.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 14 }}>No events recorded yet. Events start appearing once patrons use the app after the latest deploy.</div>
              </div>
            )}

            {!analyticsLoading && events.length > 0 && sections.map(section => (
              <div key={section.title} className="card" style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 2 }}>{section.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>{section.subtitle}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '6px 12px', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Event</div>
                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right' }}>Total</div>
                  {pubs.map(p => (
                    <div key={p} style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right' }}>{p === 'haverhill' ? 'HVH' : 'NSH'}</div>
                  ))}
                  {section.rows.map(row => {
                    const total = count(row.key)
                    return [
                      <div key={`${row.key}-label`} style={{ fontFamily: 'var(--font-cond)', fontSize: 14 }}>{row.label}</div>,
                      <div key={`${row.key}-total`} style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: total > 0 ? 'var(--text)' : 'var(--text-muted)', textAlign: 'right', letterSpacing: 1 }}>{total}</div>,
                      ...pubs.map(p => (
                        <div key={`${row.key}-${p}`} style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)', textAlign: 'right' }}>{count(row.key, p)}</div>
                      )),
                    ]
                  })}
                </div>
              </div>
            ))}

            {!analyticsLoading && events.length > 0 && (() => {
              const submissions = events.filter(e => e.event === 'prediction_submitted')
              const returning = submissions.filter(e => e.properties?.returning === true).length
              const newPatrons = submissions.filter(e => e.properties?.returning === false).length
              const withScore = submissions.filter(e => e.properties?.score_predicted === true).length
              const withEmail = submissions.filter(e => e.properties?.gave_email === true).length
              const picks = { home: 0, draw: 0, away: 0 } as Record<string, number>
              submissions.forEach(e => { const p = e.properties?.pick as string; if (p in picks) picks[p]++ })
              return (
                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 14 }}>Prediction Detail</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { label: 'New patrons', value: newPatrons },
                      { label: 'Returning patrons', value: returning },
                      { label: 'Added score guess', value: withScore },
                      { label: 'Gave email', value: withEmail },
                      { label: 'Picked home win', value: picks.home },
                      { label: 'Picked draw', value: picks.draw },
                      { label: 'Picked away win', value: picks.away },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: 1 }}>{value}</div>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </>
        )
      })()}
    </div>
  )
}
