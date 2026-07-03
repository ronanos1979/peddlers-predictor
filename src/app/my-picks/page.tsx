'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { trackEvent } from '@/lib/analytics'
import { useLocale } from '@/lib/useLocale'
import { loadPatron } from '@/lib/patron'
import Link from 'next/link'
import Flag from '@/components/Flag'
import HatTrickPlayerPicker from '@/components/HatTrickPlayerPicker'
import { BONUS_TIERS, MAX_WINNER_TICKETS, MAX_SCORER_TICKETS, getWinnerPickTickets, getScorerPickTickets } from '@/lib/bonusTickets'

function TeamLink({ name, flag }: { name: string; flag: string }) {
  return (
    <Link href={`/world-cup/team?name=${encodeURIComponent(name)}`} style={{ color: 'inherit', textDecoration: 'none' }}>
      <Flag emoji={flag} size={16} style={{ marginRight: 4 }} />{name}
    </Link>
  )
}

type EntryWithMatch = {
  id: string
  pick: 'home' | 'draw' | 'away'
  is_correct: boolean | null
  raffle_entries: number
  created_at: string
  pub_id: string
  home_score_pred: number | null
  away_score_pred: number | null
  hat_trick_pred: boolean | null
  hat_trick_scorer_pred: string | null
  matches: {
    home_team: string
    away_team: string
    home_flag: string
    away_flag: string
    kickoff_at: string
    stage: string
    result: string | null
    home_score: number | null
    away_score: number | null
    hat_trick_scored: boolean | null
    hat_trick_scorer: string | null
  }
}

type Stats = {
  total: number
  correct: number
  pending: number
  raffle_entries: number
}

function normName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim()
}
function scorerMatches(pred: string, actual: string): boolean {
  const p = normName(pred); const a = normName(actual)
  return p === a || a.includes(p) || p.includes(a)
}

type ScorerPick = { player_name: string; player_team: string; potential_raffle_entries: number | null; raffle_entries: number | null; is_correct: boolean | null }
type WinnerPick = { team_name: string; team_flag: string; is_correct: boolean | null; raffle_entries: number; potential_raffle_entries: number | null }

type EditState = {
  pick: 'home' | 'draw' | 'away'
  homeScore: number
  awayScore: number
  hasScore: boolean
  hatTrick: boolean
  hatTrickScorer: string
}

function ScoreStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))}
        style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--gray-border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, minWidth: 32, textAlign: 'center', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      <button type="button" onClick={() => onChange(Math.min(20, value + 1))}
        style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(245,197,24,0.4)', background: 'rgba(245,197,24,0.08)', color: 'var(--gold)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
    </div>
  )
}

function MyPicksContent() {
  const { t } = useLocale()
  const searchParams = useSearchParams()
  const phoneParam = searchParams.get('phone')
  const [phone, setPhone] = useState(phoneParam || '')
  const [searched, setSearched] = useState(!!phoneParam)
  const [entries, setEntries] = useState<EntryWithMatch[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [scorerPick, setScorerPick] = useState<ScorerPick | null>(null)
  const [winnerPick, setWinnerPick] = useState<WinnerPick | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fromCookie, setFromCookie] = useState(false)
  const [showScoringInfo, setShowScoringInfo] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ pick: 'home', homeScore: 0, awayScore: 0, hasScore: false, hatTrick: false, hatTrickScorer: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [justUpdated, setJustUpdated] = useState<string | null>(null)

  const currentWinnerTickets = getWinnerPickTickets()
  const currentScorerTickets = getScorerPickTickets()
  const patron = loadPatron()
  const pubParam = patron?.pub_id ? `?pub=${patron.pub_id}` : ''

  const currentTierKey = currentWinnerTickets === MAX_WINNER_TICKETS
    ? 'group-early'
    : (BONUS_TIERS.find(tier => tier.winnerTickets === currentWinnerTickets)?.label ?? 'group-early')

  const scheduleRows = [
    { key: 'group-early', label: t.scoringInfoGroupEarly, winner: MAX_WINNER_TICKETS, scorer: MAX_SCORER_TICKETS },
    { key: BONUS_TIERS[0].label, label: t.scoringInfoGroupMD3, winner: BONUS_TIERS[0].winnerTickets, scorer: BONUS_TIERS[0].scorerTickets },
    { key: BONUS_TIERS[1].label, label: t.roundOf32, winner: BONUS_TIERS[1].winnerTickets, scorer: BONUS_TIERS[1].scorerTickets },
    { key: BONUS_TIERS[2].label, label: t.roundOf16, winner: BONUS_TIERS[2].winnerTickets, scorer: BONUS_TIERS[2].scorerTickets },
    { key: BONUS_TIERS[3].label, label: t.quarterFinals, winner: BONUS_TIERS[3].winnerTickets, scorer: BONUS_TIERS[3].scorerTickets },
    { key: BONUS_TIERS[4].label, label: t.semiFinals, winner: BONUS_TIERS[4].winnerTickets, scorer: BONUS_TIERS[4].scorerTickets },
  ]

  async function lookup(p?: string) {
    const num = p || phone
    if (!num.trim()) return
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const res = await fetch(`/api/my-picks?phone=${encodeURIComponent(num.trim())}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error); setLoading(false); return }
      setEntries(data.entries)
      setStats(data.stats)
      setScorerPick(data.scorerPick || null)
      setWinnerPick(data.winnerPick || null)
    } catch {
      setError(t.networkError)
    }
    setLoading(false)
  }

  // Auto-lookup: from URL param first, then patron cookie
  useEffect(() => {
    const hasCookie = !phoneParam && !!loadPatron()?.phone
    trackEvent('my_picks_viewed', { source: phoneParam ? 'url_param' : hasCookie ? 'cookie' : 'manual' })
    if (phoneParam) { lookup(phoneParam); return }
    const patron = loadPatron()
    if (patron?.phone) {
      setPhone(patron.phone)
      setFromCookie(true)
      lookup(patron.phone)
    }
  }, []) // eslint-disable-line

  function canEdit(e: EntryWithMatch): boolean {
    return e.is_correct === null && new Date(e.matches.kickoff_at) > new Date()
  }

  function startEdit(e: EntryWithMatch) {
    setEditingId(e.id)
    setEditError('')
    setEditState({
      pick: e.pick,
      homeScore: e.home_score_pred ?? 0,
      awayScore: e.away_score_pred ?? 0,
      hasScore: e.home_score_pred != null && e.away_score_pred != null,
      hatTrick: !!e.hat_trick_pred,
      hatTrickScorer: e.hat_trick_scorer_pred || '',
    })
  }

  async function saveEdit(entryId: string) {
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch('/api/entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_id: entryId,
          phone,
          pick: editState.pick,
          home_score_pred: editState.hasScore ? editState.homeScore : null,
          away_score_pred: editState.hasScore ? editState.awayScore : null,
          hat_trick_pred: editState.hatTrick || null,
          hat_trick_scorer_pred: editState.hatTrick ? editState.hatTrickScorer : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error || t.somethingWentWrong); setEditSaving(false); return }

      setEntries(prev => prev.map(e => e.id !== entryId ? e : {
        ...e,
        pick: editState.pick,
        home_score_pred: editState.hasScore ? editState.homeScore : null,
        away_score_pred: editState.hasScore ? editState.awayScore : null,
        hat_trick_pred: editState.hatTrick ? true : null,
        hat_trick_scorer_pred: editState.hatTrick ? editState.hatTrickScorer : null,
      }))
      setEditingId(null)
      setJustUpdated(entryId)
      setTimeout(() => setJustUpdated(null), 3000)
    } catch {
      setEditError(t.networkError)
    }
    setEditSaving(false)
  }

  function predictionLabel(pick: string, m: EntryWithMatch['matches']) {
    if (pick === 'home') return <><Link href={`/world-cup/team?name=${encodeURIComponent(m.home_team)}`} style={{ textDecoration: 'none', color: 'inherit' }}><Flag emoji={m.home_flag} size={14} style={{ marginRight: 4 }} />{t.teamToWin.replace('{team}', m.home_team)}</Link></>
    if (pick === 'away') return <><Link href={`/world-cup/team?name=${encodeURIComponent(m.away_team)}`} style={{ textDecoration: 'none', color: 'inherit' }}><Flag emoji={m.away_flag} size={14} style={{ marginRight: 4 }} />{t.teamToWin.replace('{team}', m.away_team)}</Link></>
    return <>{t.draw}</>
  }

  function resultLabel(result: string, m: EntryWithMatch['matches']) {
    if (result === 'home') return <><Link href={`/world-cup/team?name=${encodeURIComponent(m.home_team)}`} style={{ textDecoration: 'none', color: 'inherit' }}><Flag emoji={m.home_flag} size={14} style={{ marginRight: 4 }} />{t.teamWon.replace('{team}', m.home_team)}</Link></>
    if (result === 'away') return <><Link href={`/world-cup/team?name=${encodeURIComponent(m.away_team)}`} style={{ textDecoration: 'none', color: 'inherit' }}><Flag emoji={m.away_flag} size={14} style={{ marginRight: 4 }} />{t.teamWon.replace('{team}', m.away_team)}</Link></>
    return <>{t.draw}</>
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    })
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <h1>{t.myPicks}</h1>
        <p className="muted">{t.myPicksSub}</p>
      </div>

      {fromCookie && searched && !error ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button
            onClick={() => { setFromCookie(false); setSearched(false); setEntries([]); setStats(null); setScorerPick(null); setWinnerPick(null); setPhone('') }}
            style={{ background: 'none', border: 'none', fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 0' }}
          >
            {t.notYou} {t.searchByPhone}
          </button>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookup()}
              placeholder="+1 (555) 000-0000"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--gray-border)', background: 'var(--white)', color: 'var(--text)', fontSize: 15 }}
            />
            <button className="btn btn-primary" style={{ width: 'auto', padding: '10px 20px' }}
              onClick={() => lookup()}>
              {t.search}
            </button>
          </div>
          {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
        </div>
      )}

      {loading && <p className="muted" style={{ textAlign: 'center', padding: 32 }}>{t.loading}</p>}

      {!loading && searched && stats && (
        <>
          {/* Stats bar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { label: t.entered, value: stats.total },
              { label: t.correct, value: stats.correct },
              { label: t.pending, value: stats.pending },
              { label: t.raffleTicketsShort, value: stats.raffle_entries },
            ].map(({ label, value }) => (
              <div key={label} className="card" style={{ textAlign: 'center', padding: '12px 8px', marginBottom: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* How Tickets Work toggle */}
          <button
            onClick={() => setShowScoringInfo(v => !v)}
            style={{
              width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--gray-border)',
              borderRadius: showScoringInfo ? '10px 10px 0 0' : 10,
              padding: '10px 14px', cursor: 'pointer', marginBottom: showScoringInfo ? 0 : 12,
              fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)',
              letterSpacing: 0.5,
            }}
          >
            <span>ℹ {t.howTicketsWork}</span>
            <span style={{ fontSize: 11 }}>{showScoringInfo ? '▲' : '▼'}</span>
          </button>

          {showScoringInfo && (
            <div style={{
              border: '1px solid var(--gray-border)', borderTop: 'none',
              borderRadius: '0 0 10px 10px', padding: '14px 16px', marginBottom: 12,
              background: 'rgba(255,255,255,0.02)', fontSize: 13,
            }}>
              {/* Match predictions */}
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                {t.scoringInfoMatchTitle}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                {[t.scoringInfoMatchLine1, t.scoringInfoMatchLine2, t.scoringInfoMatchLine3].map(line => (
                  <div key={line} style={{ fontSize: 13, color: 'var(--text)' }}>{line}</div>
                ))}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.scoringInfoHatIndep}</div>
              </div>

              {/* Bonus picks */}
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>
                {t.scoringInfoBonusTitle}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{t.scoringInfoBonusDesc}</div>

              {/* Schedule table */}
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                {t.scoringInfoScheduleTitle}
              </div>
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--gray-border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 56px', background: 'rgba(255,255,255,0.05)', padding: '6px 10px', fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  <span>{t.stage}</span>
                  <span style={{ textAlign: 'center' }}>{t.scoringInfoChampion}</span>
                  <span style={{ textAlign: 'center' }}>{t.goldenBoot}</span>
                </div>
                {scheduleRows.map((row, i) => {
                  const isCurrent = row.key === currentTierKey
                  const isPast = scheduleRows.findIndex(r => r.key === currentTierKey) > i
                  return (
                    <div key={row.key} style={{
                      display: 'grid', gridTemplateColumns: '1fr 56px 56px',
                      padding: '7px 10px', alignItems: 'center',
                      borderTop: i === 0 ? 'none' : '1px solid var(--gray-border)',
                      background: isCurrent ? 'rgba(245,197,24,0.08)' : 'transparent',
                    }}>
                      <div style={{ fontSize: 12, color: isCurrent ? 'var(--gold)' : isPast ? 'var(--text-dim)' : 'var(--text)', fontWeight: isCurrent ? 700 : 400, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {row.label}
                        {isCurrent && <span style={{ fontSize: 9, fontFamily: 'var(--font-cond)', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, background: 'rgba(245,197,24,0.18)', borderRadius: 4, padding: '1px 5px' }}>{t.scoringInfoNow}</span>}
                      </div>
                      <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 15, color: isCurrent ? 'var(--gold)' : isPast ? 'var(--text-dim)' : 'var(--text)', letterSpacing: 1 }}>+{row.winner}</div>
                      <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 15, color: isCurrent ? 'var(--gold)' : isPast ? 'var(--text-dim)' : 'var(--text)', letterSpacing: 1 }}>+{row.scorer}</div>
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>{t.scoringInfoTotal}</div>
            </div>
          )}

          {/* Golden Boot CTA (when no pick yet) */}
          {!scorerPick && (
            <Link href={`/world-cup/top-scorer-pick${pubParam}`} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 10, marginBottom: 10,
                background: 'rgba(245,197,24,0.04)',
                border: '1px dashed rgba(245,197,24,0.4)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 28 }}>🥇</span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--gold)' }}>{t.noGoldenBootPickYet}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t.scoringInfoBonusDesc}</div>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>{t.goldenBootPickCta}</div>
              </div>
            </Link>
          )}

          {/* Golden Boot pick */}
          {scorerPick && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderRadius: 10, marginBottom: 10,
              background: 'rgba(245,197,24,0.06)',
              border: `1px solid ${scorerPick.is_correct === true ? 'rgba(0,200,122,0.5)' : scorerPick.is_correct === false ? 'rgba(255,59,59,0.3)' : 'rgba(245,197,24,0.35)'}`,
            }}>
              <div style={{ fontSize: 32, flexShrink: 0 }}>🥇</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 3 }}>
                  {t.yourTopScorerPick}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: 1, color: 'var(--gold)', lineHeight: 1.1 }}>
                  {scorerPick.player_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {scorerPick.player_team}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {scorerPick.is_correct === true ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>+{scorerPick.raffle_entries} ✓</div>
                    <div style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--font-cond)' }}>{t.correctExclaim}</div>
                  </>
                ) : scorerPick.is_correct === false ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>+0</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>{t.wrongLower}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--gold)', letterSpacing: 1, lineHeight: 1 }}>+{scorerPick.potential_raffle_entries ?? currentScorerTickets}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)' }}>{t.ifCorrect}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', marginTop: 2 }}>🔒 {t.ticketLocked}</div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* World Cup Winner CTA (when no pick yet) */}
          {!winnerPick && (
            <Link href={`/world-cup/winner-pick${pubParam}`} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 10, marginBottom: 10,
                background: 'rgba(0,200,122,0.03)',
                border: '1px dashed rgba(0,200,122,0.3)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 28 }}>🏆</span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--green)' }}>{t.noChampionPickYet}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t.bonusIfTrophyN.replace('{n}', String(currentWinnerTickets))}</div>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>{t.championPickCta}</div>
              </div>
            </Link>
          )}

          {/* World Cup Winner pick */}
          {winnerPick && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderRadius: 10, marginBottom: 16,
              background: 'rgba(0,200,122,0.05)',
              border: `1px solid ${winnerPick.is_correct === true ? 'rgba(0,200,122,0.5)' : winnerPick.is_correct === false ? 'rgba(255,59,59,0.3)' : 'rgba(0,200,122,0.25)'}`,
            }}>
              <div style={{ fontSize: 32, flexShrink: 0 }}>🏆</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 3 }}>
                  {t.yourWCChampionPick}
                </div>
                <Link href={`/world-cup/team?name=${encodeURIComponent(winnerPick.team_name)}`} style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: 1, color: winnerPick.is_correct === true ? 'var(--green)' : winnerPick.is_correct === false ? 'var(--text-muted)' : 'var(--text)', lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                  <Flag emoji={winnerPick.team_flag} size={22} />
                  {winnerPick.team_name}
                </Link>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {winnerPick.is_correct === true ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>+{winnerPick.raffle_entries} ✓</div>
                    <div style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--font-cond)' }}>{t.correctExclaim}</div>
                  </>
                ) : winnerPick.is_correct === false ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>+0</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>{t.wrongLower}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--green)', letterSpacing: 1, lineHeight: 1 }}>+{winnerPick.potential_raffle_entries ?? currentWinnerTickets}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)' }}>{t.ifCorrect}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', marginTop: 2 }}>🔒 {t.ticketLocked}</div>
                  </>
                )}
              </div>
            </div>
          )}

          {entries.length === 0 ? (
            <div className="card" style={{ textAlign: 'center' }}>
              <p className="muted">{t.noPicksFound}</p>
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                {t.sameNumberHint}
              </p>
            </div>
          ) : (
            entries.map(e => {
              const m = e.matches
              if (!m) return null
              const isEditing = editingId === e.id
              const showUpdated = justUpdated === e.id

              return (
                <div key={e.id} style={{
                  background: 'var(--white)',
                  border: `1px solid ${
                    showUpdated ? 'var(--green)' :
                    e.is_correct === true ? 'var(--green)' :
                    e.is_correct === false ? 'var(--red)' :
                    isEditing ? 'rgba(245,197,24,0.5)' :
                    'var(--gray-border)'
                  }`,
                  borderRadius: 10, padding: '14px', marginBottom: 8
                }}>
                  {/* Match header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        <TeamLink name={m.home_team} flag={m.home_flag} />
                        {' vs '}
                        <TeamLink name={m.away_team} flag={m.away_flag} />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {m.stage} · {fmtDate(m.kickoff_at)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      {showUpdated && (
                        <span className="badge" style={{ background: 'var(--green-light)', color: 'var(--green-dark)' }}>
                          ✓ {t.pickUpdated}
                        </span>
                      )}
                      {!showUpdated && e.is_correct === true && (
                        <span className="badge" style={{ background: 'var(--green-light)', color: 'var(--green-dark)' }}>
                          ✓ {t.correct}
                        </span>
                      )}
                      {!showUpdated && e.is_correct === false && (
                        <span className="badge" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                          ✗ {t.wrong}
                        </span>
                      )}
                      {!showUpdated && e.is_correct === null && !isEditing && (
                        <span className="badge badge-pending">{t.pending}</span>
                      )}
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {isEditing ? (
                    <div style={{ marginTop: 12, padding: '14px', background: 'rgba(245,197,24,0.04)', borderRadius: 8, border: '1px solid rgba(245,197,24,0.25)' }}>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 12 }}>
                        {t.editingYourPick}
                      </div>

                      {/* Pick buttons */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
                        {(['home', 'draw', 'away'] as const).map(p => (
                          <button key={p} type="button"
                            onClick={() => setEditState(s => ({ ...s, pick: p }))}
                            style={{
                              padding: '10px 6px', borderRadius: 8, border: `2px solid ${editState.pick === p ? 'var(--gold)' : 'var(--gray-border)'}`,
                              background: editState.pick === p ? 'rgba(245,197,24,0.12)' : 'var(--surface)',
                              color: editState.pick === p ? 'var(--gold)' : 'var(--text)',
                              fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            }}>
                            <span style={{ fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: editState.pick === p ? 'var(--gold)' : 'var(--text-muted)' }}>
                              {p === 'home' ? t.homeWin : p === 'draw' ? t.draw : t.awayWin}
                            </span>
                            <span style={{ fontSize: 12 }}>
                              {p === 'home' ? <><Flag emoji={m.home_flag} size={13} style={{ marginRight: 3 }} />{m.home_team}</> :
                               p === 'draw' ? '—' :
                               <><Flag emoji={m.away_flag} size={13} style={{ marginRight: 3 }} />{m.away_team}</>}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Score prediction */}
                      {editState.hasScore ? (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10, textAlign: 'center' }}>
                            {t.scorePredLabel}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-cond)' }}>
                                <Flag emoji={m.home_flag} size={13} style={{ marginRight: 3 }} />{m.home_team}
                              </div>
                              <ScoreStepper value={editState.homeScore} onChange={v => setEditState(s => ({ ...s, homeScore: v }))} />
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-muted)', paddingTop: 20 }}>–</div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-cond)' }}>
                                <Flag emoji={m.away_flag} size={13} style={{ marginRight: 3 }} />{m.away_team}
                              </div>
                              <ScoreStepper value={editState.awayScore} onChange={v => setEditState(s => ({ ...s, awayScore: v }))} />
                            </div>
                          </div>
                          <button type="button" onClick={() => setEditState(s => ({ ...s, hasScore: false, homeScore: 0, awayScore: 0 }))}
                            style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
                            {t.removeScoreGuess}
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setEditState(s => ({ ...s, hasScore: true }))}
                          style={{ display: 'block', width: '100%', marginBottom: 12, padding: '10px 14px', background: 'rgba(245,197,24,0.06)', border: '1px dashed rgba(245,197,24,0.3)', borderRadius: 8, color: 'var(--gold)', fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 }}>
                          {t.addScoreGuess}
                        </button>
                      )}

                      {/* Hat-trick */}
                      {editState.hatTrick ? (
                        <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(0,200,122,0.06)', border: '1px solid rgba(0,200,122,0.3)', borderRadius: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>⚡ {t.hatTrickPredicted}</span>
                            <button type="button" onClick={() => setEditState(s => ({ ...s, hatTrick: false, hatTrickScorer: '' }))}
                              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '3px 8px' }}>
                              {t.hatTrickRemove}
                            </button>
                          </div>
                          <HatTrickPlayerPicker
                            homeTeam={m.home_team}
                            homeFlag={m.home_flag}
                            awayTeam={m.away_team}
                            awayFlag={m.away_flag}
                            value={editState.hatTrickScorer}
                            onChange={v => setEditState(s => ({ ...s, hatTrickScorer: v }))}
                          />
                        </div>
                      ) : (
                        <button type="button" onClick={() => setEditState(s => ({ ...s, hatTrick: true }))}
                          style={{ display: 'block', width: '100%', marginBottom: 12, padding: '8px 14px', background: 'rgba(0,200,122,0.04)', border: '1px dashed rgba(0,200,122,0.3)', borderRadius: 8, color: 'var(--green)', fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 }}>
                          ⚡ {t.hatTrickBonusTitle}
                        </button>
                      )}

                      {editError && <p style={{ color: 'var(--red)', fontSize: 13, margin: '0 0 10px', fontFamily: 'var(--font-cond)' }}>{editError}</p>}

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => saveEdit(e.id)} disabled={editSaving || (editState.hatTrick && !editState.hatTrickScorer.trim())}
                          style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700, cursor: editSaving ? 'wait' : 'pointer', opacity: (editState.hatTrick && !editState.hatTrickScorer.trim()) ? 0.5 : 1 }}>
                          {editSaving ? t.submitting : t.saveChanges}
                        </button>
                        <button type="button" onClick={() => { setEditingId(null); setEditError('') }}
                          style={{ padding: '11px 16px', borderRadius: 8, border: '1px solid var(--gray-border)', background: 'var(--surface)', color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                          {t.cancelEdit}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Prediction summary */}
                      <div style={{
                        marginTop: 10, padding: '10px 12px',
                        background: 'var(--gray-bg)', borderRadius: 8,
                      }}>
                        {/* Your prediction row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <div>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.yourPrediction}: </span>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{predictionLabel(e.pick, m)}</span>
                          </div>
                          {e.raffle_entries > 0 && (
                            <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                              +{e.raffle_entries} {t.tickets}
                            </span>
                          )}
                          {e.is_correct === null && (
                            <span style={{ fontSize: 11, color: 'var(--amber)', opacity: 0.85 }}>
                              {e.home_score_pred != null && e.away_score_pred != null
                                ? t.pendingCouldEarnExact
                                : t.pendingCouldEarn1}
                            </span>
                          )}
                        </div>

                        {/* Score prediction row */}
                        {e.home_score_pred != null && e.away_score_pred != null && (
                          <div style={{ marginTop: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.scorePredLabel}: </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>
                              {e.home_score_pred} – {e.away_score_pred}
                            </span>
                          </div>
                        )}

                        {/* Actual result row */}
                        {m.result && (
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--gray-border)' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.actualResult}: </span>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{resultLabel(m.result, m)}</span>
                            {m.home_score != null && m.away_score != null && (
                              <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 6, color: 'var(--text-muted)' }}>
                                {m.home_score} – {m.away_score}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Hat-trick prediction */}
                      {e.hat_trick_pred === true && e.hat_trick_scorer_pred && (
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>⚡ {t.hatTrickBonusLabel}: <em>{e.hat_trick_scorer_pred}</em></span>
                          {m.hat_trick_scored === null ? (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+7 {t.ifCorrect}</span>
                          ) : m.hat_trick_scored === false ? (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.hatTrickMissed}</span>
                          ) : m.hat_trick_scorer && scorerMatches(e.hat_trick_scorer_pred, m.hat_trick_scorer) ? (
                            <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>{t.hatTrickHit} +7</span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.hatTrickMissed}</span>
                          )}
                        </div>
                      )}

                      {/* Change pick button (pre-kickoff only) */}
                      {canEdit(e) && (
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>
                            🔓 {t.locksAtKickoff}
                          </span>
                          <button type="button" onClick={() => startEdit(e)}
                            style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--gray-border)', background: 'var(--surface)', color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
                            ✏ {t.changePick}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })
          )}
        </>
      )}

      <Link href="/" className="btn btn-secondary"
        style={{ textDecoration: 'none', display: 'block', textAlign: 'center', marginTop: 12 }}>
        ← {t.back}
      </Link>
    </div>
  )
}

export default function MyPicksPage() {
  return <Suspense><MyPicksContent /></Suspense>
}
