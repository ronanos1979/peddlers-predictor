'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase, type Match } from '@/lib/supabase'
import { getDailyCode } from '@/lib/matchSchedule'
import Flag from '@/components/Flag'

type EntryRow = {
  id: string; name: string; phone: string; email: string | null; pick: string
  is_correct: boolean | null; raffle_entries: number; pub_id: string; created_at: string
  home_score_pred: number | null; away_score_pred: number | null
  matches: { home_team: string; away_team: string; home_flag: string; away_flag: string; stage: string; kickoff_at: string } | null
}
type ScorerPickRow = { phone: string; player_name: string; player_team: string; is_correct: boolean | null; potential_raffle_entries: number | null; raffle_entries: number | null }
type WinnerPickRow = { phone: string; team_name: string; team_flag: string; is_correct: boolean | null; raffle_entries: number; potential_raffle_entries: number | null }
type PatronSummary = {
  phone: string; name: string; email: string | null; pub_id: string
  total: number; correct: number; pending: number; wrong: number; raffle_entries: number
  golden_boot: ScorerPickRow | null; winner_pick: WinnerPickRow | null
  entries: EntryRow[]
}
type DayStat = [string, { haverhill: number; nashua: number; total: number }]
type Totals = { total_entries: number; unique_phones: number; emails_collected: number; correct: number; haverhill: number; nashua: number }
type FeedbackRow = { id: string; message: string; email: string | null; page: string | null; created_at: string; read: boolean }
type CheckInRow = { id: string; name: string; phone: string; email: string | null; pub_id: string; shared_to: string | null; created_at: string; match_id: string; matches: { home_team: string; away_team: string; home_flag: string; away_flag: string; kickoff_at: string; stage: string; checkin_winner_name: string | null; checkin_winner_phone: string | null; checkin_draw_at: string | null } | null }
type RaffleEntrant = { name: string; phone: string; pub_id: string; tickets: number }
type RaffleWinner = RaffleEntrant & { place: number }
const RAFFLE_PLACE_META: Record<1 | 2 | 3, { label: string; medal: string; color: string; borderColor: string; bg: string }> = {
  1: { label: '1st Place', medal: '🥇', color: 'var(--gold)', borderColor: 'var(--gold)', bg: 'linear-gradient(135deg, #1a1200, #111)' },
  2: { label: '2nd Place', medal: '🥈', color: '#aaaaaa', borderColor: '#555', bg: 'var(--surface)' },
  3: { label: '3rd Place', medal: '🥉', color: '#cd7f32', borderColor: '#4a3010', bg: 'var(--surface)' },
}
type TeamStatus = {
  name: string; flag: string; fd_loaded: boolean; coach_name: string | null
  player_count: number; number_count: number; photo_count: number; club_count: number
  cached_at: string | null; af_cached_at: string | null
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
  const [penaltiesScored, setPenaltiesScored] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')
  const [stats, setStats] = useState<DayStat[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [entrants, setEntrants] = useState<EntryRow[]>([])
  const [scorerPicks, setScorerPicks] = useState<ScorerPickRow[]>([])
  const [winnerPicks, setWinnerPicks] = useState<WinnerPickRow[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [loadingEntrants, setLoadingEntrants] = useState(false)
  const [entrantView, setEntrantView] = useState<'entries' | 'by-person'>('entries')
  const [entrantFilter, setEntrantFilter] = useState<'all' | 'correct' | 'pending' | 'wrong'>('all')
  const [feedback, setFeedback] = useState<FeedbackRow[]>([])
  const [selectedReminderIds, setSelectedReminderIds] = useState<Set<string>>(new Set())
  const [reminderSending, setReminderSending] = useState(false)
  const [reminderResult, setReminderResult] = useState<{ sent: number; total: number; errors?: string[] } | null>(null)
  const [rafflePool, setRafflePool] = useState<RaffleEntrant[]>([])
  const [rafflePoolLoaded, setRafflePoolLoaded] = useState(false)
  const [raffleFilter, setRaffleFilter] = useState<'all' | 'haverhill' | 'nashua'>('all')
  const [drawStep, setDrawStep] = useState<'idle' | 'rolling' | 'pub' | 'waiting-key' | 'done'>('idle')
  const [currentPlace, setCurrentPlace] = useState<3 | 2 | 1 | null>(null)
  const [pendingWinner, setPendingWinner] = useState<RaffleWinner | null>(null)
  const [revealedWinners, setRevealedWinners] = useState<RaffleWinner[]>([])
  const [drawPool, setDrawPool] = useState<RaffleEntrant[]>([])
  const [rollingName, setRollingName] = useState('')
  const [raffleMode, setRaffleMode] = useState<'random' | 'announce'>('random')
  const [announceSelections, setAnnounceSelections] = useState<{ 3: string; 2: string; 1: string }>({ 3: '', 2: '', 1: '' })
  const [manualWinners, setManualWinners] = useState<RaffleWinner[] | null>(null)
  const [isAnnouncing, setIsAnnouncing] = useState(false)
  const [teams, setTeams] = useState<TeamStatus[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [teamAction, setTeamAction] = useState<string | null>(null)
  const [loadAllFdRunning, setLoadAllFdRunning] = useState(false)
  const [loadAllFdProgress, setLoadAllFdProgress] = useState('')
  const [loadAllShirtsRunning, setLoadAllShirtsRunning] = useState(false)
  const [loadAllShirtsProgress, setLoadAllShirtsProgress] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [forceResyncing, setForceResyncing] = useState(false)
  const [forceResyncResult, setForceResyncResult] = useState<{ updated: number; entries_scored: number; message?: string } | null>(null)
  const [rescoring, setRescoring] = useState(false)
  const [rescoreResult, setRescoreResult] = useState<{ entries_scored: number } | null>(null)
  const [refreshingEvents, setRefreshingEvents] = useState(false)
  const [refreshEventsResult, setRefreshEventsResult] = useState<{ updated: number; failed: number; detail: string[] } | null>(null)
  const [reloadingResults, setReloadingResults] = useState(false)
  type AnalyticsEvent = { event: string; properties: Record<string, unknown>; created_at: string }
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[] | null>(null)
  const [analyticsDays, setAnalyticsDays] = useState(7)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  type SyncDebugUnmatched = { match: string; dbKickoff: string; nearestFd: string | null; nearestFdKickoff: string | null; diffMin: number | null }
  const [syncResult, setSyncResult] = useState<{ updated: number; entries_scored: number; events_loaded?: number; names_updated?: number; scores_corrected?: number; message?: string; debug?: { fdFinishedCount: number; dbUnresolvedCount: number; unmatched: SyncDebugUnmatched[] } } | null>(null)
  const [knockoutNamesUpdating, setKnockoutNamesUpdating] = useState(false)
  const [goldenBootPlayerInput, setGoldenBootPlayerInput] = useState('')
  const [goldenBootScoring, setGoldenBootScoring] = useState(false)
  const [goldenBootResult, setGoldenBootResult] = useState<{ scored: number } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [checkins, setCheckins] = useState<CheckInRow[]>([])
  const [checkinEarlierOpen, setCheckinEarlierOpen] = useState(false)
  const [checkinMinDraw, setCheckinMinDraw] = useState<number>(() =>
    typeof window !== 'undefined' ? parseInt(localStorage.getItem('checkin_min_draw') || '10', 10) : 10
  )
  const [drawingMatchId, setDrawingMatchId] = useState<string | null>(null)
  const [ineligiblePhones, setIneligiblePhones] = useState<Set<string>>(new Set())
  const [togglingIneligible, setTogglingIneligible] = useState<string | null>(null)
  const [decommissionEnabled, setDecommissionEnabled] = useState(false)
  const [decommissionMessage, setDecommissionMessage] = useState(
    "Thanks for entering. The winner will be announced on Tuesday July 21 at 8pm in Nashua."
  )
  const [decommissionLoaded, setDecommissionLoaded] = useState(false)
  const [decommissionSaving, setDecommissionSaving] = useState(false)
  const [decommissionConfirming, setDecommissionConfirming] = useState(false)
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
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const threeDaysAhead = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

    const { data: today } = await supabase.from('matches').select('*')
      .gte('kickoff_at', todayStart.toISOString())
      .lte('kickoff_at', todayEnd.toISOString())
      .neq('stage', 'Demo Match').order('kickoff_at')
    setTodaysMatches(today || [])

    const { data: recent } = await supabase.from('matches').select('*')
      .gte('kickoff_at', sevenDaysAgo.toISOString())
      .lt('kickoff_at', todayStart.toISOString())
      .neq('stage', 'Demo Match')
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
    setScorerPicks(data.scorer_picks || [])
    setWinnerPicks(data.winner_picks || [])
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
    if (!authed || decommissionLoaded) return
    fetch(`/api/admin-data?password=${encodeURIComponent(password)}&action=decommission`)
      .then(res => res.json())
      .then(data => {
        setDecommissionEnabled(!!data.enabled)
        if (data.message) setDecommissionMessage(data.message)
        setDecommissionLoaded(true)
      })
  }, [authed, decommissionLoaded, password])

  async function saveDecommission(enabled: boolean) {
    setDecommissionSaving(true)
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action: 'set_decommission', payload: { enabled, message: decommissionMessage } })
    })
    const data = await res.json()
    setDecommissionSaving(false)
    setDecommissionConfirming(false)
    if (data.success) {
      setDecommissionEnabled(enabled)
      flash(enabled ? '🔒 Site is now showing the decommission splash to patrons' : '✅ Site is back to normal', 'success')
    } else {
      flash(`❌ Error: ${data.error}`, 'error')
    }
  }

  useEffect(() => {
    if (authed && tab === 'raffle' && !rafflePoolLoaded) loadRafflePool()
    if (authed && tab === 'analytics' && analyticsEvents === null) loadAnalytics(analyticsDays)
    if (authed && (tab === 'entrants' || tab === 'raffle') && ineligiblePhones.size === 0) loadIneligible()
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
          penalties_scored: penaltiesScored[match.id] ?? null,
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

  async function loadIneligible() {
    const res = await fetch(`/api/admin-data?password=${encodeURIComponent(password)}&action=ineligible`)
    const data = await res.json()
    setIneligiblePhones(new Set((data.ineligible || []).map((r: { phone: string }) => r.phone)))
  }

  async function toggleIneligible(phone: string, name: string) {
    setTogglingIneligible(phone)
    const isCurrentlyIneligible = ineligiblePhones.has(phone)
    const action = isCurrentlyIneligible ? 'mark_eligible' : 'mark_ineligible'
    await fetch('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action, payload: { phone, name } }),
    })
    setIneligiblePhones(prev => {
      const next = new Set(prev)
      if (isCurrentlyIneligible) next.delete(phone)
      else next.add(phone)
      return next
    })
    setRafflePoolLoaded(false) // force raffle pool refresh
    setTogglingIneligible(null)
  }

  async function loadRafflePool() {
    setRafflePoolLoaded(false)
    const [entrantsRes, ineligibleRes] = await Promise.all([
      fetch(`/api/admin-data?password=${encodeURIComponent(password)}&action=entrants`),
      fetch(`/api/admin-data?password=${encodeURIComponent(password)}&action=ineligible`),
    ])
    const data = await entrantsRes.json()
    const ineligibleData = await ineligibleRes.json()
    const blocked = new Set<string>((ineligibleData.ineligible || []).map((r: { phone: string }) => r.phone))
    setIneligiblePhones(blocked)
    const rows: EntryRow[] = data.entries || []
    const winnerPicks: WinnerPickRow[] = data.winner_picks || []
    const scorerPicks: ScorerPickRow[] = data.scorer_picks || []
    // Aggregate by phone: sum match tickets + winner bonus + scorer bonus
    const byPhone = new Map<string, RaffleEntrant>()
    for (const e of rows) {
      if (!byPhone.has(e.phone)) {
        byPhone.set(e.phone, { name: e.name, phone: e.phone, pub_id: e.pub_id, tickets: 0 })
      }
      byPhone.get(e.phone)!.tickets += e.raffle_entries
    }
    for (const wp of winnerPicks) {
      if (byPhone.has(wp.phone) && wp.raffle_entries > 0) {
        byPhone.get(wp.phone)!.tickets += wp.raffle_entries
      }
    }
    for (const sp of scorerPicks) {
      if (byPhone.has(sp.phone) && (sp.raffle_entries ?? 0) > 0) {
        byPhone.get(sp.phone)!.tickets += sp.raffle_entries ?? 0
      }
    }
    const pool = Array.from(byPhone.values())
      .filter(p => p.tickets > 0 && !blocked.has(p.phone))
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

  // Guards against a draw being triggered twice in the same tick (e.g. a held or
  // double-fired keystroke landing before React removes the waiting-key listener).
  const isDrawingRef = useRef(false)

  // Shared reveal choreography for both modes: pub first, then the name a beat later,
  // then either hand off to the next position or finish.
  async function revealWinner(winner: RaffleWinner, alreadyWon: RaffleWinner[]) {
    setPendingWinner(winner)
    setDrawStep('pub') // pub revealed; name still hidden

    await new Promise<void>(resolve => setTimeout(resolve, 1500))

    setRevealedWinners([...alreadyWon, winner])
    setPendingWinner(null)
    setDrawStep(winner.place === 1 ? 'done' : 'waiting-key')
  }

  // Random weighted draw, one place at a time — 3rd, then 2nd, then 1st, gated by a
  // keystroke between each.
  async function drawPlace(place: 3 | 2 | 1, pool: RaffleEntrant[], alreadyWon: RaffleWinner[]) {
    if (isDrawingRef.current) return
    isDrawingRef.current = true
    try {
      setIsAnnouncing(false)
      const wonPhones = new Set(alreadyWon.map(w => w.phone))
      const remainingPool = pool.filter(p => !wonPhones.has(p.phone))
      if (remainingPool.length === 0) {
        setDrawStep('done')
        return
      }
      setCurrentPlace(place)
      setPendingWinner(null)
      setDrawStep('rolling')

      const names = remainingPool.map(p => p.name)
      let i = 0
      const iv = setInterval(() => { setRollingName(names[i++ % names.length]) }, 80)
      await new Promise<void>(resolve => setTimeout(resolve, 2200))
      clearInterval(iv)

      const winner = { ...weightedDraw(remainingPool, 1)[0], place }
      await revealWinner(winner, alreadyWon)
    } finally {
      isDrawingRef.current = false
    }
  }

  // Announces winners already determined outside the app (e.g. a physical bucket draw),
  // using the same pub-then-name choreography as the random draw.
  async function announcePlace(place: 3 | 2 | 1, winners: RaffleWinner[], alreadyWon: RaffleWinner[]) {
    if (isDrawingRef.current) return
    isDrawingRef.current = true
    try {
      setIsAnnouncing(true)
      setCurrentPlace(place)
      setPendingWinner(null)
      setDrawStep('rolling')

      await new Promise<void>(resolve => setTimeout(resolve, 1200))

      const winner = winners.find(w => w.place === place)
      if (!winner) {
        setDrawStep('done')
        return
      }
      await revealWinner(winner, alreadyWon)
    } finally {
      isDrawingRef.current = false
    }
  }

  function startDraw() {
    const filtered = raffleFilter === 'all'
      ? rafflePool
      : rafflePool.filter(p => p.pub_id === raffleFilter)
    if (filtered.length === 0) return
    setManualWinners(null)
    setDrawPool(filtered)
    setRevealedWinners([])
    setPendingWinner(null)
    drawPlace(3, filtered, [])
  }

  function startAnnouncement() {
    const byPhone = new Map(rafflePool.map(p => [p.phone, p]))
    const sel3 = byPhone.get(announceSelections[3])
    const sel2 = byPhone.get(announceSelections[2])
    const sel1 = byPhone.get(announceSelections[1])
    if (!sel3 || !sel2 || !sel1) return
    const phones = new Set([sel3.phone, sel2.phone, sel1.phone])
    if (phones.size !== 3) return // must be three distinct patrons
    const winners: RaffleWinner[] = [
      { ...sel3, place: 3 },
      { ...sel2, place: 2 },
      { ...sel1, place: 1 },
    ]
    setManualWinners(winners)
    setRevealedWinners([])
    setPendingWinner(null)
    announcePlace(3, winners, [])
  }

  function resetDraw() {
    setDrawStep('idle')
    setCurrentPlace(null)
    setPendingWinner(null)
    setRevealedWinners([])
    setManualWinners(null)
  }

  // While waiting between positions, any keystroke advances to the next draw or announcement
  useEffect(() => {
    if (drawStep !== 'waiting-key' || currentPlace == null) return
    const nextPlace = currentPlace === 3 ? 2 : 1
    function handleKey() {
      if (manualWinners) {
        announcePlace(nextPlace, manualWinners, revealedWinners)
      } else {
        drawPlace(nextPlace, drawPool, revealedWinners)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawStep, currentPlace, drawPool, revealedWinners, manualWinners])

  async function loadTeamFd(teamName: string) {
    setTeamAction(teamName + ':fd')
    try {
      const res  = await fetch('/api/admin-teams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'load_fd', team_name: teamName }),
      })
      const data = await res.json()
      if (data.success) {
        flash(`✅ ${teamName}: ${data.player_count} players loaded from FD`, 'success')
        loadTeams()
      } else {
        flash(`❌ ${teamName}: ${data.error}`, 'error')
      }
    } catch { flash(`❌ ${teamName}: network error`, 'error') }
    setTeamAction(null)
  }

  async function loadTeamAf(teamName: string, action: 'enrich_af' | 'force_enrich_af' = 'enrich_af', steps: 'photos' | 'clubs' | 'all' = 'all') {
    const tag = action === 'force_enrich_af'
      ? (steps === 'photos' ? ':force-photos' : steps === 'clubs' ? ':force-clubs' : ':force')
      : (steps === 'photos' ? ':photos' : steps === 'clubs' ? ':clubs' : ':af')
    setTeamAction(teamName + tag)
    try {
      const res  = await fetch('/api/admin-teams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action, team_name: teamName, steps }),
      })
      const data = await res.json()
      if (data.success) {
        if (!data.rate_limited) {
          loadTeams()
        } else {
          setTeams(prev => prev.map(t => t.name === teamName ? {
            ...t,
            photo_count:  t.photo_count + (data.photos_added || 0),
            club_count:   t.club_count  + (data.clubs_added  || 0),
            af_cached_at: new Date().toISOString(),
          } : t))
        }
        if (data.rate_limited) {
          const saved = [
            data.numbers_added > 0 ? `${data.numbers_added} shirt numbers` : '',
            data.photos_added  > 0 ? `${data.photos_added} photos`         : '',
            data.clubs_added   > 0 ? `${data.clubs_added} clubs`           : '',
          ].filter(Boolean).join(', ') || 'nothing'
          flash(`⚠️ ${teamName}: AF rate limited — ${saved} saved before limit`, 'error')
        } else if (data.photo_error) {
          flash(`⚠️ ${teamName}: ${data.photo_error}`, 'error')
        } else {
          const verb = action === 'force_enrich_af' ? 'reloaded' : 'loaded'
          const parts = [
            data.numbers_added > 0 ? `${data.numbers_added} shirt numbers` : '',
            data.photos_added  > 0 ? `${data.photos_added} photos`         : '',
            data.clubs_added   > 0 ? `${data.clubs_added} clubs`           : '',
          ].filter(Boolean)
          let summary = parts.length > 0 ? parts.join(', ') + ` ${verb}` : 'already up to date'
          if (data.no_af_id > 0) summary += ` (${data.no_af_id} players missing AF match — reload photos first)`
          flash(`✅ ${teamName}: ${summary}`, 'success')
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

  async function loadAllShirts() {
    // Teams with FD loaded but missing shirt numbers or photos — use AF enrichment
    const missing = teams.filter(t => t.fd_loaded && t.player_count > 0 && (t.number_count < t.player_count || t.photo_count < t.player_count))
    if (!missing.length) return
    setLoadAllShirtsRunning(true)
    for (let i = 0; i < missing.length; i++) {
      setLoadAllShirtsProgress(`${i + 1}/${missing.length}`)
      const team = missing[i]
      try {
        const res = await fetch('/api/admin-teams', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, action: 'enrich_af', team_name: team.name, steps: 'photos' }),
        })
        const data = await res.json()
        if (data.success) {
          setTeams(prev => prev.map(t => t.name === team.name
            ? { ...t, number_count: t.number_count + (data.numbers_added || 0), photo_count: t.photo_count + (data.photos_added || 0) }
            : t))
          // Stop bulk run if AF rate limit hit
          if (data.rate_limited) {
            flash(`⚠️ AF rate limited at team ${i + 1}/${missing.length} — resume tomorrow`, 'error')
            break
          }
        }
      } catch { /* continue on network error */ }
      if (i < missing.length - 1) await new Promise(r => setTimeout(r, 7000))
    }
    setLoadAllShirtsRunning(false)
    setLoadAllShirtsProgress('')
    loadTeams()
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

  async function triggerKnockoutNames() {
    setKnockoutNamesUpdating(true)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'update_knockout_names', payload: {} })
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error || 'Update failed', 'error'); setKnockoutNamesUpdating(false); return }
      flash(data.names_updated > 0 ? `✅ ${data.names_updated} match team name${data.names_updated !== 1 ? 's' : ''} resolved from standings` : 'No new names to resolve — all groups may still be in progress', 'success')
      if (data.names_updated > 0) loadMatches()
    } catch {
      flash('Network error', 'error')
    }
    setKnockoutNamesUpdating(false)
  }

  async function forceResync() {
    const resolvedIds = [...recentMatches, ...todaysMatches]
      .filter(m => m.result !== null)
      .map(m => m.id)
    if (resolvedIds.length === 0) { flash('No resolved matches in the recent window', 'error'); return }
    setForceResyncing(true)
    setForceResyncResult(null)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'force_resync', payload: { match_ids: resolvedIds } })
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error || 'Force resync failed', 'error'); setForceResyncing(false); return }
      setForceResyncResult(data)
      loadMatches(); loadStats(); loadEntrants()
      flash(`Fixed ${data.updated} match${data.updated !== 1 ? 'es' : ''} · ${data.entries_scored} entries re-scored`, 'success')
    } catch {
      flash('Network error during force resync', 'error')
    }
    setForceResyncing(false)
  }

  async function rescoreEntries() {
    const resolvedIds = [...recentMatches, ...todaysMatches]
      .filter(m => m.result !== null)
      .map(m => m.id)
    if (resolvedIds.length === 0) { flash('No resolved matches in the recent window', 'error'); return }
    setRescoring(true)
    setRescoreResult(null)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'rescore_entries', payload: { match_ids: resolvedIds } })
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error || 'Rescore failed', 'error'); setRescoring(false); return }
      setRescoreResult(data)
      loadMatches(); loadStats(); loadEntrants()
      flash(`Re-scored ${data.entries_scored} entries`, 'success')
    } catch {
      flash('Network error during rescore', 'error')
    }
    setRescoring(false)
  }

  async function refreshAllEvents() {
    setRefreshingEvents(true)
    setRefreshEventsResult(null)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'refresh_all_events', payload: {} })
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error || 'Refresh failed', 'error'); setRefreshingEvents(false); return }
      setRefreshEventsResult(data)
      flash(`${data.updated} matches refreshed, ${data.failed} not found on ESPN`, data.failed === 0 ? 'success' : 'error')
    } catch {
      flash('Network error during event refresh', 'error')
    }
    setRefreshingEvents(false)
  }

  async function reloadResultsCache() {
    setReloadingResults(true)
    try {
      await fetch('/api/football?endpoint=fixtures&status=FT&bust=1')
      flash('Results API cache refreshed', 'success')
    } catch {
      flash('Failed to refresh results cache', 'error')
    }
    setReloadingResults(false)
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
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'long' })
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }
  function fmtFull(iso: string) {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  type MatchEvent = { time: { elapsed: number; extra: number | null }; team: { name: string }; player: { name: string }; assist: { name: string } | null; type: string; detail: string }

  function MatchResultRow({ m }: { m: Match }) {
    const hasResult = !!m.result
    const isOpen = new Date(m.entries_close_at) > new Date()
    const matchScores = scores[m.id] || { home: '', away: '' }
    const [matchEvents, setMatchEvents] = useState<MatchEvent[] | 'loading' | null>(null)

    async function loadMatchEvents() {
      if (matchEvents === 'loading') return
      setMatchEvents('loading')
      try {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, action: 'load_match_events', payload: { matchId: m.id } }),
        })
        const data = await res.json()
        if (!res.ok) {
          flash(data.error || 'Failed to load events', 'error')
          setMatchEvents(null)
          return
        }
        setMatchEvents((data.events as MatchEvent[]) || [])
        flash(`Loaded ${data.count} events from API-Football`, 'success')
      } catch {
        flash('Network error loading events', 'error')
        setMatchEvents(null)
      }
    }

    function fmtMin(e: MatchEvent) {
      return e.time.extra ? `${e.time.elapsed}+${e.time.extra}'` : `${e.time.elapsed}'`
    }

    const events = Array.isArray(matchEvents) ? matchEvents : []
    const homeEvents = events.filter(e => e.team.name === m.home_team)
    const awayEvents = events.filter(e => e.team.name === m.away_team)

    return (
      <div className="admin-row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            <a href={`/world-cup/team?name=${encodeURIComponent(m.home_team)}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>{m.home_flag} {m.home_team}</a>
            {' vs '}
            <a href={`/world-cup/team?name=${encodeURIComponent(m.away_team)}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>{m.away_flag} {m.away_team}</a>
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
              {m.penalties_scored && (
                <span style={{ marginLeft: 6, color: 'var(--amber)', fontWeight: 700, fontSize: 11 }}>🎯 pens</span>
              )}
              {' '}
              <button onClick={loadMatchEvents} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 0.5, padding: 0 }}>
                {matchEvents === 'loading' ? '…' : matchEvents === null ? '⟳ scorers' : '⟳'}
              </button>
            </div>
          )}
          {/* Scorer/cards inline */}
          {Array.isArray(matchEvents) && matchEvents.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>No scorer data from API yet</div>
          )}
          {events.length > 0 && (
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <div>
                {homeEvents.map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: e.type === 'Card' ? (e.detail === 'Yellow Card' ? '#c8a800' : 'var(--red)') : 'var(--text-muted)', lineHeight: 1.7 }}>
                    {e.type === 'Goal' ? (e.detail === 'Own Goal' ? '⚽🔴' : e.detail === 'Penalty' ? '⚽(P)' : '⚽') : e.detail === 'Yellow Card' ? '🟨' : '🟥'} {e.player.name} {fmtMin(e)}
                  </div>
                ))}
              </div>
              <div>
                {awayEvents.map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: e.type === 'Card' ? (e.detail === 'Yellow Card' ? '#c8a800' : 'var(--red)') : 'var(--text-muted)', lineHeight: 1.7 }}>
                    {e.type === 'Goal' ? (e.detail === 'Own Goal' ? '⚽🔴' : e.detail === 'Penalty' ? '⚽(P)' : '⚽') : e.detail === 'Yellow Card' ? '🟨' : '🟥'} {e.player.name} {fmtMin(e)}
                  </div>
                ))}
              </div>
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
                {!['Round of 32', 'Round of 16', 'Quarter Final', 'Semi Final', 'Third Place', 'Final'].includes(m.stage) && (
                  <option value="draw">Draw</option>
                )}
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
            {['Round of 32', 'Round of 16', 'Quarter Final', 'Semi Final', 'Third Place', 'Final'].includes(m.stage) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!penaltiesScored[m.id]}
                  onChange={e => setPenaltiesScored(prev => ({ ...prev, [m.id]: e.target.checked }))}
                />
                Went to penalty shootout
              </label>
            )}
          </div>
        )}
      </div>
    )
  }

  function PatronSummaryRow({ patron }: { patron: PatronSummary }) {
    const [expanded, setExpanded] = useState(false)
    const isIneligible = ineligiblePhones.has(patron.phone)
    const isToggling = togglingIneligible === patron.phone
    return (
      <div style={{ background: 'var(--white)', border: `1px solid ${isIneligible ? 'rgba(255,59,59,0.4)' : 'var(--gray-border)'}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden', opacity: isIneligible ? 0.75 : 1 }}>
        <div onClick={() => setExpanded(e => !e)} style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>▶</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{patron.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--gray-bg)', padding: '1px 6px', borderRadius: 8 }}>
                {patron.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              📞 {patron.phone}
              {patron.email && <span style={{ marginLeft: 8 }}>✉️ {patron.email}</span>}
            </div>
            {(patron.golden_boot || patron.winner_pick) && (
              <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                {patron.golden_boot && (
                  <span style={{ fontSize: 11, color: 'var(--amber)' }}>
                    🥇 {patron.golden_boot.player_name}
                    {patron.golden_boot.is_correct === true && <span style={{ color: 'var(--green)' }}> ✓ +{patron.golden_boot.raffle_entries ?? 10}</span>}
                    {patron.golden_boot.is_correct === false && <span style={{ color: 'var(--red)' }}> ✗</span>}
                    {patron.golden_boot.is_correct === null && <span style={{ color: 'var(--amber)', opacity: 0.8 }}> ⏳+{patron.golden_boot.potential_raffle_entries ?? 10}</span>}
                  </span>
                )}
                {patron.winner_pick && (
                  <span style={{ fontSize: 11, color: 'var(--amber)' }}>
                    🏆 <a href={`/world-cup/team?name=${encodeURIComponent(patron.winner_pick.team_name)}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>{patron.winner_pick.team_flag} {patron.winner_pick.team_name}</a>
                    {patron.winner_pick.is_correct === true && <span style={{ color: 'var(--green)' }}> ✓ +{patron.winner_pick.raffle_entries}</span>}
                    {patron.winner_pick.is_correct === false && <span style={{ color: 'var(--red)' }}> ✗</span>}
                    {patron.winner_pick.is_correct === null && <span style={{ color: 'var(--amber)', opacity: 0.8 }}> ⏳+{patron.winner_pick.potential_raffle_entries ?? 15}</span>}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ textAlign: 'center', minWidth: 28 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>{patron.correct}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>✓</div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 28 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--amber)' }}>{patron.pending}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>pend</div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 28 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)' }}>{patron.wrong}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>✗</div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 36, borderLeft: '1px solid var(--border)', paddingLeft: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: isIneligible ? 'var(--text-dim)' : 'var(--gold)', textDecoration: isIneligible ? 'line-through' : 'none' }}>{patron.raffle_entries}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>tickets</div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); toggleIneligible(patron.phone, patron.name) }}
              disabled={isToggling}
              title={isIneligible ? 'Remove ineligibility' : 'Mark ineligible (hidden from patron)'}
              style={{ padding: '4px 7px', borderRadius: 6, border: `1px solid ${isIneligible ? 'rgba(255,59,59,0.5)' : 'var(--border)'}`, background: isIneligible ? 'rgba(255,59,59,0.15)' : 'transparent', cursor: 'pointer', fontSize: 14, opacity: isToggling ? 0.5 : 1 }}
            >
              {isIneligible ? '🚫' : '☑'}
            </button>
          </div>
        </div>
        {expanded && (
          <div style={{ borderTop: '1px solid var(--gray-border)', padding: '8px 14px' }}>
            {patron.entries.map((e, i) => (
              <div key={e.id} style={{ padding: '7px 0', borderBottom: i < patron.entries.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                {e.matches && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                      {fmtFull(e.matches.kickoff_at)} · {e.matches.stage}
                    </div>
                    <div>
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
                      {e.is_correct === true && <span style={{ color: 'var(--green)' }}>✓ Correct {e.raffle_entries > 1 ? `· 🎟×${e.raffle_entries}` : ''}</span>}
                      {e.is_correct === false && <span style={{ color: 'var(--red)' }}>✗ Wrong</span>}
                      {e.is_correct === null && <span style={{ color: 'var(--amber)' }}>⏳ Pending</span>}
                    </div>
                  </>
                )}
              </div>
            ))}
            {(patron.golden_boot || patron.winner_pick) && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Bonus Picks</div>
                {patron.golden_boot && (
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    🥇 Golden Boot: <strong>{patron.golden_boot.player_name}</strong> ({patron.golden_boot.player_team})
                    {' · '}
                    {patron.golden_boot.is_correct === true && <span style={{ color: 'var(--green)' }}>✓ Correct · 🎟×{patron.golden_boot.raffle_entries ?? 10}</span>}
                    {patron.golden_boot.is_correct === false && <span style={{ color: 'var(--red)' }}>✗ Wrong</span>}
                    {patron.golden_boot.is_correct === null && <span style={{ color: 'var(--amber)' }}>⏳ +{patron.golden_boot.potential_raffle_entries ?? 10} if correct</span>}
                  </div>
                )}
                {patron.winner_pick && (
                  <div style={{ fontSize: 13 }}>
                    🏆 Champion: <strong>{patron.winner_pick.team_flag} {patron.winner_pick.team_name}</strong>
                    {' · '}
                    {patron.winner_pick.is_correct === true && <span style={{ color: 'var(--green)' }}>✓ Correct · 🎟×{patron.winner_pick.raffle_entries}</span>}
                    {patron.winner_pick.is_correct === false && <span style={{ color: 'var(--red)' }}>✗ Wrong</span>}
                    {patron.winner_pick.is_correct === null && <span style={{ color: 'var(--amber)' }}>⏳ +{patron.winner_pick.potential_raffle_entries ?? 15} if correct</span>}
                  </div>
                )}
              </div>
            )}
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

      {/* Site decommission control — hides every patron page behind a single message */}
      <div className="card" style={{
        marginBottom: 16,
        borderColor: decommissionEnabled ? 'var(--red)' : 'var(--border)',
        background: decommissionEnabled ? 'rgba(255,59,59,0.06)' : undefined,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: decommissionEnabled ? 'var(--red)' : 'var(--text-muted)', marginBottom: 4 }}>
              {decommissionEnabled ? '🔒 Site is decommissioned' : 'Site status'}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              {decommissionEnabled
                ? 'Every patron page is hidden — visitors only see the message below.'
                : 'Live — patrons can enter predictions and view all pages normally.'}
            </p>
          </div>
          {!decommissionEnabled && !decommissionConfirming && (
            <button className="btn btn-secondary" style={{ width: 'auto', borderColor: 'var(--red)', color: 'var(--red)' }}
              onClick={() => setDecommissionConfirming(true)}>
              Decommission site…
            </button>
          )}
          {decommissionEnabled && (
            <button className="btn btn-primary" style={{ width: 'auto' }} disabled={decommissionSaving}
              onClick={() => saveDecommission(false)}>
              {decommissionSaving ? 'Restoring…' : '✅ Bring site back'}
            </button>
          )}
        </div>

        {(decommissionConfirming || decommissionEnabled) && (
          <div style={{ marginTop: 14 }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
              Message shown to patrons
            </label>
            <textarea
              value={decommissionMessage}
              onChange={e => setDecommissionMessage(e.target.value)}
              rows={2}
              disabled={decommissionEnabled && !decommissionConfirming}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>
        )}

        {decommissionConfirming && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setDecommissionConfirming(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" style={{ width: 'auto', background: 'var(--red)', borderColor: 'transparent' }}
              disabled={decommissionSaving || !decommissionMessage.trim()}
              onClick={() => saveDecommission(true)}>
              {decommissionSaving ? 'Applying…' : 'Confirm — hide the whole site'}
            </button>
          </div>
        )}
      </div>

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
            <Link href="/admin/checkins"
              style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid var(--gray-border)',
                background: 'transparent', color: 'var(--text)', fontWeight: 400,
                fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
              check-ins ↗
            </Link>
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
                    <Link href="/admin/checkins" style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--red)', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}>
                      Full check-in detail →
                    </Link>
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
                {(() => {
                  const sorted = Array.from(byMatch.entries()).sort((a, b) =>
                    (b[1][0].matches?.kickoff_at || '').localeCompare(a[1][0].matches?.kickoff_at || '')
                  )
                  const [latest, ...older] = sorted

                  const renderMatch = ([matchId, rows]: [string, CheckInRow[]], isLatest: boolean) => {
                    const m = rows[0].matches
                    const alreadyDrawn = m?.checkin_winner_name
                    return (
                      <div key={matchId} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                              {m?.home_flag} {m?.home_team} vs {m?.away_flag} {m?.away_team}
                              {isLatest && <span style={{ marginLeft: 8, fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--green)', border: '1px solid rgba(0,200,122,0.4)', borderRadius: 4, padding: '2px 5px' }}>Latest</span>}
                            </div>
                            <div className="muted" style={{ fontSize: 12 }}>{m?.stage} · {rows.length} checked in</div>
                          </div>
                          {alreadyDrawn ? (
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 2 }}>🏆 Winner Drawn</div>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>{m.checkin_winner_name}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.checkin_winner_phone}</div>
                              <button onClick={() => drawCheckinWinner(matchId)} disabled={drawingMatchId === matchId} style={{ marginTop: 4, fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Re-draw</button>
                            </div>
                          ) : (
                            <button className="btn btn-primary" style={{ width: 'auto', padding: '7px 14px', fontSize: 13, background: 'var(--red)', borderColor: 'transparent' }} onClick={() => drawCheckinWinner(matchId)} disabled={drawingMatchId === matchId}>
                              {drawingMatchId === matchId ? 'Drawing…' : `🎲 Draw Winner (${rows.length})`}
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {rows.slice(0, 10).map(c => (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{c.name}</span>
                              <span>·</span><span>{c.phone}</span>
                              {c.email && <><span>·</span><span style={{ color: 'var(--green)' }}>✉</span></>}
                              {c.shared_to && <span style={{ color: 'var(--amber)', fontSize: 11 }}>shared via {c.shared_to}</span>}
                            </div>
                          ))}
                          {rows.length > 10 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>+ {rows.length - 10} more</div>}
                        </div>
                      </div>
                    )
                  }

                  return (
                    <>
                      {latest && renderMatch(latest, true)}
                      {older.length > 0 && (
                        <>
                          <button
                            onClick={() => setCheckinEarlierOpen(o => !o)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', marginBottom: checkinEarlierOpen ? 12 : 0 }}
                          >
                            <span style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.5 }}>
                              Earlier matches ({older.length})
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{checkinEarlierOpen ? '▲' : '▼'}</span>
                          </button>
                          {checkinEarlierOpen && older.map(e => renderMatch(e, false))}
                        </>
                      )}
                    </>
                  )
                })()}
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
              <div style={{ marginTop: 10 }}>
                <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 13,
                  background: syncResult.updated > 0 ? 'rgba(0,200,122,0.1)' : 'rgba(119,119,112,0.1)',
                  color: syncResult.updated > 0 ? 'var(--green)' : 'var(--text-muted)',
                  border: `1px solid ${syncResult.updated > 0 ? 'rgba(0,200,122,0.3)' : 'var(--border)'}` }}>
                  {syncResult.message || `✅ ${syncResult.updated} match${syncResult.updated !== 1 ? 'es' : ''} updated · ${syncResult.entries_scored} entries scored${syncResult.events_loaded ? ` · ${syncResult.events_loaded} event${syncResult.events_loaded !== 1 ? 's' : ''} loaded` : ''}${syncResult.scores_corrected ? ` · ${syncResult.scores_corrected} score${syncResult.scores_corrected !== 1 ? 's' : ''} corrected` : ''}${syncResult.names_updated ? ` · ${syncResult.names_updated} team name${syncResult.names_updated !== 1 ? 's' : ''} resolved` : ''}`}
                </div>
                {syncResult.debug && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, fontSize: 12, background: 'rgba(119,119,112,0.08)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    <div style={{ marginBottom: 4, fontWeight: 700, fontFamily: 'var(--font-cond)', letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 10 }}>
                      Sync debug — FD: {syncResult.debug.fdFinishedCount} finished · DB unresolved: {syncResult.debug.dbUnresolvedCount}
                    </div>
                    {syncResult.debug.unmatched.length === 0 ? (
                      <div style={{ color: 'var(--green)', fontSize: 11 }}>✓ All unresolved DB matches were paired with FD results</div>
                    ) : (
                      <>
                        <div style={{ color: 'var(--amber)', marginBottom: 4, fontSize: 11 }}>⚠ {syncResult.debug.unmatched.length} DB match{syncResult.debug.unmatched.length !== 1 ? 'es' : ''} could not be paired:</div>
                        {syncResult.debug.unmatched.map((u, i) => (
                          <div key={i} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: i < syncResult.debug!.unmatched.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <div style={{ color: 'var(--text)', fontSize: 12 }}>{u.match}</div>
                            <div>DB kickoff: {new Date(u.dbKickoff).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'long' })}</div>
                            {u.nearestFd ? (
                              <>
                                <div>Nearest FD: {u.nearestFd}</div>
                                <div>FD kickoff: {new Date(u.nearestFdKickoff!).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'long' })} <span style={{ color: u.diffMin! > 5 ? 'var(--red)' : 'var(--green)' }}>({u.diffMin}m off)</span></div>
                              </>
                            ) : (
                              <div style={{ color: 'var(--red)' }}>No FD finished matches at all</div>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Resolve knockout team names</div>
                <div className="muted" style={{ fontSize: 12 }}>Writes real team names into R32+ match records once groups are confirmed — also runs automatically on every Sync</div>
              </div>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 16px', flexShrink: 0 }}
                disabled={knockoutNamesUpdating} onClick={triggerKnockoutNames}>
                {knockoutNamesUpdating ? 'Updating…' : '🏷 Resolve names'}
              </button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Fix resolved results</div>
                <div className="muted" style={{ fontSize: 12 }}>Re-syncs all recently-resolved matches from FD and re-scores every entry — fixes wrong results caused by simultaneous kickoffs</div>
              </div>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 16px', flexShrink: 0 }}
                disabled={forceResyncing} onClick={forceResync}>
                {forceResyncing ? 'Fixing…' : '⟳ Fix results'}
              </button>
            </div>
            {forceResyncResult && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize: 13,
                background: forceResyncResult.updated > 0 ? 'rgba(0,200,122,0.1)' : 'rgba(119,119,112,0.1)',
                color: forceResyncResult.updated > 0 ? 'var(--green)' : 'var(--text-muted)',
                border: `1px solid ${forceResyncResult.updated > 0 ? 'rgba(0,200,122,0.3)' : 'var(--border)'}` }}>
                {forceResyncResult.message || `✅ ${forceResyncResult.updated} match${forceResyncResult.updated !== 1 ? 'es' : ''} corrected · ${forceResyncResult.entries_scored} entries re-scored`}
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Re-score entries from stored results</div>
                <div className="muted" style={{ fontSize: 12 }}>Scores all entries for resolved matches using the result already in the DB — use when entries are pending despite a result being set</div>
              </div>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 16px', flexShrink: 0 }}
                disabled={rescoring} onClick={rescoreEntries}>
                {rescoring ? 'Scoring…' : '✓ Re-score entries'}
              </button>
            </div>
            {rescoreResult && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize: 13,
                background: rescoreResult.entries_scored > 0 ? 'rgba(0,200,122,0.1)' : 'rgba(119,119,112,0.1)',
                color: rescoreResult.entries_scored > 0 ? 'var(--green)' : 'var(--text-muted)',
                border: `1px solid ${rescoreResult.entries_scored > 0 ? 'rgba(0,200,122,0.3)' : 'var(--border)'}` }}>
                ✅ {rescoreResult.entries_scored} entries re-scored
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Re-fetch all match scorers</div>
                <div className="muted" style={{ fontSize: 12 }}>Forces ESPN re-fetch for every resolved match — fixes missing goals</div>
              </div>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 16px', flexShrink: 0 }}
                disabled={refreshingEvents} onClick={refreshAllEvents}>
                {refreshingEvents ? 'Refreshing…' : '⟳ All scorers'}
              </button>
            </div>
            {refreshEventsResult && (
              <div style={{ marginTop: 10, fontSize: 12, fontFamily: 'monospace', background: 'rgba(119,119,112,0.08)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', maxHeight: 200, overflowY: 'auto' }}>
                {refreshEventsResult.detail.map((line, i) => (
                  <div key={i} style={{ color: line.startsWith('✓') ? 'var(--green)' : 'var(--red)', lineHeight: 1.7 }}>{line}</div>
                ))}
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
              <h2>Recent matches (past 7 days)</h2>
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
      {tab === 'entrants' && (() => {
        const scorerByPhone = new Map(scorerPicks.map(s => [s.phone, s]))
        const winnerByPhone = new Map(winnerPicks.map(w => [w.phone, w]))

        const patronSummaries: PatronSummary[] = (() => {
          const byPhone = new Map<string, PatronSummary>()
          for (const e of entrants) {
            if (!byPhone.has(e.phone)) {
              byPhone.set(e.phone, {
                phone: e.phone, name: e.name, email: e.email, pub_id: e.pub_id,
                total: 0, correct: 0, pending: 0, wrong: 0, raffle_entries: 0,
                golden_boot: scorerByPhone.get(e.phone) || null,
                winner_pick: winnerByPhone.get(e.phone) || null,
                entries: [],
              })
            }
            const p = byPhone.get(e.phone)!
            p.total++
            p.raffle_entries += e.raffle_entries
            if (e.is_correct === true) p.correct++
            else if (e.is_correct === false) p.wrong++
            else p.pending++
            p.entries.push(e)
          }
          return Array.from(byPhone.values()).sort((a, b) => b.raffle_entries - a.raffle_entries)
        })()

        const filteredEntrants = entrantFilter === 'all' ? entrants
          : entrants.filter(e =>
              entrantFilter === 'correct' ? e.is_correct === true :
              entrantFilter === 'pending' ? e.is_correct === null :
              e.is_correct === false
            )

        return (
          <>
            <div className="card">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
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

              {/* View toggle */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {(['entries', 'by-person'] as const).map(v => (
                  <button key={v} onClick={() => setEntrantView(v)}
                    style={{ padding: '6px 14px', borderRadius: 16, border: `1px solid ${entrantView === v ? 'var(--green)' : 'var(--gray-border)'}`, background: entrantView === v ? 'var(--green)' : 'transparent', color: entrantView === v ? '#fff' : 'var(--text)', fontWeight: entrantView === v ? 600 : 400, cursor: 'pointer', fontSize: 13 }}>
                    {v === 'entries' ? 'All Entries' : 'By Person'}
                  </button>
                ))}
              </div>

              {/* Status filter — only in entries view */}
              {entrantView === 'entries' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {([
                    { key: 'all', label: 'All' },
                    { key: 'correct', label: '✓ Correct' },
                    { key: 'pending', label: '⏳ Pending' },
                    { key: 'wrong', label: '✗ Wrong' },
                  ] as const).map(({ key, label }) => (
                    <button key={key} onClick={() => setEntrantFilter(key)}
                      style={{ padding: '5px 12px', borderRadius: 14, fontSize: 12, cursor: 'pointer',
                        border: `1px solid ${entrantFilter === key ? (key === 'correct' ? 'var(--green)' : key === 'pending' ? 'var(--amber)' : key === 'wrong' ? 'var(--red)' : 'var(--green)') : 'var(--gray-border)'}`,
                        background: entrantFilter === key ? (key === 'correct' ? 'rgba(0,200,122,0.12)' : key === 'pending' ? 'rgba(245,197,24,0.12)' : key === 'wrong' ? 'rgba(255,59,59,0.12)' : 'rgba(0,200,122,0.12)') : 'transparent',
                        color: entrantFilter === key ? (key === 'correct' ? 'var(--green)' : key === 'pending' ? 'var(--amber)' : key === 'wrong' ? 'var(--red)' : 'var(--green)') : 'var(--text-muted)',
                        fontWeight: entrantFilter === key ? 600 : 400 }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                {entrantView === 'entries'
                  ? `${filteredEntrants.length} entr${filteredEntrants.length !== 1 ? 'ies' : 'y'}`
                  : `${patronSummaries.length} patron${patronSummaries.length !== 1 ? 's' : ''}`}
              </p>
            </div>

            {loadingEntrants ? (
              <p className="muted" style={{ textAlign: 'center', padding: 32 }}>Loading…</p>
            ) : entrantView === 'by-person' ? (
              patronSummaries.length === 0
                ? <p className="muted" style={{ textAlign: 'center', padding: 32 }}>No entries yet.</p>
                : patronSummaries.map(patron => <PatronSummaryRow key={patron.phone} patron={patron} />)
            ) : (
              filteredEntrants.length === 0
                ? <p className="muted" style={{ textAlign: 'center', padding: 32 }}>No entries match this filter.</p>
                : filteredEntrants.map((e) => (
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
                            <button onClick={() => deleteEntry(e.id)}
                              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--red)', background: 'rgba(255,59,59,0.12)', color: 'var(--red)', cursor: 'pointer', fontWeight: 700 }}>
                              Confirm
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)}
                              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--gray-border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(e.id)}
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
            )}
          </>
        )
      })()}

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
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.6 }}>
              Correct result = <strong style={{ color: 'var(--gold)' }}>1 ticket</strong>. Correct result + exact score = <strong style={{ color: 'var(--gold)' }}>3 tickets</strong>. Hat-trick bonus = <strong style={{ color: 'var(--gold)' }}>+7 tickets</strong>. Winner pick = <strong style={{ color: 'var(--gold)' }}>+15</strong>. Golden Boot = <strong style={{ color: 'var(--gold)' }}>+10</strong>. Wrong = 0 tickets.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--gold)' }}>Random Draw</strong> is <strong style={{ color: 'var(--gold)' }}>weighted</strong> — each ticket is one entry in a virtual drum. <strong style={{ color: 'var(--gold)' }}>Announce Winners</strong> instead lets you type in three winners already determined outside the app (e.g. a physical bucket draw) and runs the same reveal for them. Either way, draws happen in suspense order — <strong style={{ color: 'var(--gold)' }}>3rd place first</strong>, then 2nd, then 1st — and each reveal shows the winner&apos;s <strong style={{ color: 'var(--gold)' }}>pub first</strong>, then their name a beat later. Press any key to move on.
            </p>
            <p style={{ fontSize: 12, color: 'rgba(0,200,122,0.8)', margin: 0 }}>
              ✓ <strong>Safe to test:</strong> Nothing here is saved anywhere and no email is sent. Re-run as many times as you need before the official night.
            </p>
          </div>

          {/* Score Golden Boot */}
          <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(245,197,24,0.3)' }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
              🥇 Score Golden Boot (after the Final)
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              Enter the exact Golden Boot winner name — fuzzy match awards picks who named this player. Each patron gets their locked-in ticket value (varies by when they submitted).
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={goldenBootPlayerInput}
                onChange={e => setGoldenBootPlayerInput(e.target.value)}
                placeholder="e.g. Kylian Mbappé"
                style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14 }}
              />
              <button
                disabled={!goldenBootPlayerInput.trim() || goldenBootScoring}
                onClick={async () => {
                  if (!goldenBootPlayerInput.trim()) return
                  setGoldenBootScoring(true)
                  setGoldenBootResult(null)
                  const res = await fetch('/api/admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password, action: 'score_golden_boot', payload: { player_name: goldenBootPlayerInput.trim() } })
                  })
                  const data = await res.json()
                  setGoldenBootScoring(false)
                  if (data.success) {
                    setGoldenBootResult({ scored: data.scored })
                    flash(`✅ Golden Boot scored — ${data.scored} correct picks awarded tickets`, 'success')
                    setRafflePoolLoaded(false)
                  } else {
                    flash(`❌ Error: ${data.error}`, 'error')
                  }
                }}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-cond)', fontSize: 13, whiteSpace: 'nowrap' }}
              >
                {goldenBootScoring ? 'Scoring…' : 'Score'}
              </button>
            </div>
            {goldenBootResult && (
              <p style={{ marginTop: 8, fontSize: 13, color: 'var(--green)' }}>
                ✓ {goldenBootResult.scored} patron{goldenBootResult.scored !== 1 ? 's' : ''} had the correct pick and were awarded tickets.
              </p>
            )}
          </div>

          {/* Mode toggle */}
          {drawStep === 'idle' && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {([
                { key: 'random' as const, label: '🎲 Random Draw' },
                { key: 'announce' as const, label: '📣 Announce Winners' },
              ]).map(m => (
                <button key={m.key} onClick={() => { setRaffleMode(m.key); if (m.key === 'announce') setRaffleFilter('all') }}
                  style={{ padding: '7px 16px', borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${raffleMode === m.key ? 'var(--gold)' : 'var(--border)'}`,
                    background: raffleMode === m.key ? 'rgba(245,197,24,0.12)' : 'transparent',
                    color: raffleMode === m.key ? 'var(--gold)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12,
                    letterSpacing: 0.5 }}>
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Pub filter — random draw mode only */}
          {raffleMode === 'random' && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {(['all', 'haverhill', 'nashua'] as const).map(f => (
                <button key={f} onClick={() => { setRaffleFilter(f); resetDraw() }}
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
          )}

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
                {ineligiblePhones.size > 0 && (
                  <div style={{ padding: '8px 12px', background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.25)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: 'var(--red)' }}>
                    🚫 {ineligiblePhones.size} patron{ineligiblePhones.size !== 1 ? 's' : ''} marked ineligible and excluded from this pool
                  </div>
                )}
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

                {raffleMode === 'random' && filtered.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
                    <p className="muted">No eligible entrants yet. Correct predictions needed.</p>
                  </div>
                ) : (
                  <>
                    {/* Announce Winners — pick three patrons already determined outside the app */}
                    {raffleMode === 'announce' && drawStep === 'idle' && (() => {
                      const sortedPool = [...rafflePool].sort((a, b) => a.name.localeCompare(b.name))
                      const values = [announceSelections[3], announceSelections[2], announceSelections[1]]
                      const allFilled = values.every(v => v)
                      const allDistinct = new Set(values).size === 3

                      return (
                        <div className="card" style={{ marginBottom: 16 }}>
                          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>
                            📣 Pick the winners to announce
                          </div>
                          {([3, 2, 1] as const).map(place => (
                            <div key={place} style={{ marginBottom: 10 }}>
                              <label style={{ display: 'block', fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: RAFFLE_PLACE_META[place].color, marginBottom: 4 }}>
                                {RAFFLE_PLACE_META[place].label}
                              </label>
                              <select
                                value={announceSelections[place]}
                                onChange={e => setAnnounceSelections(prev => ({ ...prev, [place]: e.target.value }))}
                                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14 }}
                              >
                                <option value="">Select a patron…</option>
                                {sortedPool.map(p => (
                                  <option key={p.phone} value={p.phone}>
                                    {p.name} — {p.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'} — {p.tickets} tickets
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                          {allFilled && !allDistinct && (
                            <p style={{ color: 'var(--red)', fontSize: 12, margin: '4px 0 10px' }}>Each position needs a different patron.</p>
                          )}
                          <button
                            className="btn btn-gold"
                            disabled={!allFilled || !allDistinct}
                            style={{ marginTop: 4 }}
                            onClick={startAnnouncement}>
                            📣 Start the Announcement
                          </button>
                        </div>
                      )
                    })()}

                    {/* Winners revealed so far (3rd first, then 2nd, then 1st) */}
                    {revealedWinners.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        {revealedWinners.map((w) => {
                          const meta = RAFFLE_PLACE_META[w.place as 1 | 2 | 3]
                          return (
                            <div key={w.place} className="card pop-in" style={{
                              marginBottom: 10,
                              borderColor: meta.borderColor,
                              background: meta.bg,
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ fontSize: 36, flexShrink: 0 }}>{meta.medal}</div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: meta.color, marginBottom: 3 }}>
                                    {meta.label}
                                  </div>
                                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 15, fontWeight: 700, color: meta.color, marginBottom: 2 }}>
                                    {w.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'}
                                  </div>
                                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: 1, marginBottom: 2 }}>{w.name}</div>
                                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)' }}>
                                    📞 {w.phone}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: meta.color, letterSpacing: 1 }}>{w.tickets}</div>
                                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)' }}>tickets</div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Rolling animation (random draw) / brief pause (announce) */}
                    {drawStep === 'rolling' && currentPlace != null && (
                      <div className="card" style={{ textAlign: 'center', padding: '32px 20px', background: 'linear-gradient(135deg, #0d1f16, #111)', borderColor: 'rgba(0,200,122,0.3)', marginBottom: 16 }}>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 12 }}>
                          {isAnnouncing ? `📣 Announcing ${RAFFLE_PLACE_META[currentPlace].label}…` : `🎲 Drawing ${RAFFLE_PLACE_META[currentPlace].label}…`}
                        </div>
                        {!isAnnouncing && (
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: 2, color: 'var(--text)', minHeight: 40, transition: 'none' }}>
                            {rollingName}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pub revealed, name still hidden */}
                    {drawStep === 'pub' && pendingWinner && (
                      <div className="card pop-in" style={{
                        textAlign: 'center', padding: '28px 20px', marginBottom: 16,
                        borderColor: RAFFLE_PLACE_META[pendingWinner.place as 1 | 2 | 3].borderColor,
                        background: RAFFLE_PLACE_META[pendingWinner.place as 1 | 2 | 3].bg,
                      }}>
                        <div style={{ fontSize: 36, marginBottom: 6 }}>{RAFFLE_PLACE_META[pendingWinner.place as 1 | 2 | 3].medal}</div>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: RAFFLE_PLACE_META[pendingWinner.place as 1 | 2 | 3].color, marginBottom: 8 }}>
                          {RAFFLE_PLACE_META[pendingWinner.place as 1 | 2 | 3].label}
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, letterSpacing: 1, marginBottom: 10 }}>
                          {pendingWinner.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'}
                        </div>
                        <div className="pulse" style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                          revealing name…
                        </div>
                      </div>
                    )}

                    {/* Waiting for keystroke to advance */}
                    {drawStep === 'waiting-key' && currentPlace != null && (
                      <div className="card pulse" style={{ textAlign: 'center', padding: '16px 20px', marginBottom: 16, borderColor: 'rgba(245,197,24,0.4)', background: 'rgba(245,197,24,0.06)' }}>
                        <p style={{ margin: 0, fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: 'var(--gold)' }}>
                          ⌨️ Press any key to draw {RAFFLE_PLACE_META[currentPlace === 3 ? 2 : 1].label}
                        </p>
                      </div>
                    )}

                    {/* Start / reset button */}
                    {raffleMode === 'random' && drawStep === 'idle' && (
                      <button className="btn btn-gold" onClick={startDraw}>
                        🎲 Start the Draw — {filtered.length} players, {totalTickets} tickets
                      </button>
                    )}
                    {drawStep === 'done' && (
                      <button className="btn btn-secondary" onClick={resetDraw}>
                        🔄 Start Over
                      </button>
                    )}

                    {/* Top entrants preview */}
                    {raffleMode === 'random' && drawStep === 'idle' && filtered.length > 0 && (
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
                      {teams.reduce((s, t) => s + t.number_count, 0)} shirts ·{' '}
                      {teams.reduce((s, t) => s + t.photo_count, 0)} photos ·{' '}
                      {teams.reduce((s, t) => s + t.club_count, 0)} clubs
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      FD: 10 req/min — ~2 calls per team (names, ages, positions only — no numbers/photos).
                      AF: 100 req/day — "Delta shirts + photos" costs ~4 calls per team (shirt numbers + photos in one squad fetch). Clubs cost ~2 calls per player.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {(loadAllFdRunning || loadAllShirtsRunning) && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {loadAllFdRunning ? loadAllFdProgress : loadAllShirtsProgress}…
                      </span>
                    )}
                    <button className="btn btn-secondary"
                      style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }}
                      onClick={loadTeams} disabled={teamsLoading}>
                      Refresh
                    </button>
                    <button className="btn btn-secondary"
                      style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }}
                      disabled={loadAllFdRunning || loadAllShirtsRunning || !!teamAction || teams.every(t => t.number_count >= t.player_count && t.photo_count >= t.player_count && t.player_count > 0)}
                      onClick={loadAllShirts}
                      title="Fill missing shirt numbers and photos from API-Football for all teams. Won't overwrite complete data.">
                      {loadAllShirtsRunning
                        ? `Loading shirts + photos ${loadAllShirtsProgress}…`
                        : `Load all shirts + photos (${teams.filter(t => t.fd_loaded && t.player_count > 0 && (t.number_count < t.player_count || t.photo_count < t.player_count)).length} teams incomplete)`}
                    </button>
                    <button className="btn btn-primary"
                      style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }}
                      disabled={loadAllFdRunning || loadAllShirtsRunning || !!teamAction || teams.every(t => t.fd_loaded)}
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
                  const isFdLoading          = teamAction === team.name + ':fd'
                  const isPhotosLoading      = teamAction === team.name + ':photos'
                  const isForcePhotosLoading = teamAction === team.name + ':force-photos'
                  const isClubsLoading       = teamAction === team.name + ':clubs'
                  const isForceClubsLoading  = teamAction === team.name + ':force-clubs'
                  const isAnyBusy            = !!teamAction || loadAllFdRunning
                  return (
                    <div key={team.name} style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '8px 12px',
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      {/* Top row: identity + stats */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <a href={`/world-cup/team?name=${encodeURIComponent(team.name)}`}
                          target="_blank" rel="noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit', flexShrink: 0 }}>
                          <Flag emoji={team.flag} size={22} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{team.name}</div>
                            {team.coach_name && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{team.coach_name}</div>
                            )}
                            {team.cached_at && (
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                                FD {new Date(team.cached_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                            )}
                            {team.af_cached_at && (
                              <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 1 }}>
                                AF {new Date(team.af_cached_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                            )}
                          </div>
                        </a>
                        <div style={{ flex: 1 }} />
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {[
                            { label: 'players', val: team.player_count, max: 26 },
                            { label: 'shirts',  val: team.number_count, max: team.player_count },
                            { label: 'photos',  val: team.photo_count,  max: team.player_count },
                            { label: 'clubs',   val: team.club_count,   max: team.player_count },
                          ].map(({ label, val, max }) => {
                            const color = max === 0   ? 'var(--text-muted)'
                                        : val === 0   ? 'var(--red)'
                                        : val < max   ? 'var(--amber)'
                                        :               'var(--green)'
                            return (
                              <div key={label} style={{ textAlign: 'center', minWidth: 44 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color }}>
                                  {max === 0 ? '—' : label === 'players' ? `${val}` : `${val}/${max}`}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      {/* Bottom row: action buttons */}
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary"
                          style={{ width: 'auto', padding: '4px 9px', fontSize: 11 }}
                          disabled={isAnyBusy}
                          onClick={() => loadTeamFd(team.name)}
                          title="Load squad structure (names, ages, positions) from football-data.org">
                          {isFdLoading ? '…' : 'Load FD'}
                        </button>
                        <button className="btn btn-secondary"
                          style={{ width: 'auto', padding: '4px 9px', fontSize: 11 }}
                          disabled={isAnyBusy || !team.fd_loaded || team.player_count === 0 || (team.number_count === team.player_count && team.photo_count === team.player_count)}
                          onClick={() => loadTeamAf(team.name, 'enrich_af', 'photos')}
                          title="Fill missing shirt numbers and photos from API-Football (skips players already complete)">
                          {isPhotosLoading ? '…' : 'Delta shirts + photos'}
                        </button>
                        <button className="btn btn-secondary"
                          style={{ width: 'auto', padding: '4px 9px', fontSize: 11 }}
                          disabled={isAnyBusy || !team.fd_loaded || team.player_count === 0}
                          onClick={() => loadTeamAf(team.name, 'force_enrich_af', 'photos')}
                          title="Force re-fetch all shirt numbers and photos from API-Football">
                          {isForcePhotosLoading ? '…' : 'Reload shirts + photos'}
                        </button>
                        <button className="btn btn-secondary"
                          style={{ width: 'auto', padding: '4px 9px', fontSize: 11 }}
                          disabled={isAnyBusy || !team.fd_loaded || team.player_count === 0}
                          onClick={() => loadTeamAf(team.name, 'enrich_af', 'clubs')}
                          title="Fetch club info only for players currently missing it">
                          {isClubsLoading ? '…' : 'Delta clubs'}
                        </button>
                        <button className="btn btn-secondary"
                          style={{ width: 'auto', padding: '4px 9px', fontSize: 11 }}
                          disabled={isAnyBusy || !team.fd_loaded || team.player_count === 0}
                          onClick={() => loadTeamAf(team.name, 'force_enrich_af', 'clubs')}
                          title="Force re-fetch all club info from API-Football">
                          {isForceClubsLoading ? '…' : 'Reload clubs'}
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
