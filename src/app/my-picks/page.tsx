'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { trackEvent } from '@/lib/analytics'
import { useLocale } from '@/lib/useLocale'
import { loadPatron } from '@/lib/patron'
import Link from 'next/link'
import Flag from '@/components/Flag'

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

type ScorerPick = { player_name: string; player_team: string }
type WinnerPick = { team_name: string; team_flag: string; is_correct: boolean | null; raffle_entries: number }

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

  function pickLabel(pick: string, m: EntryWithMatch['matches']) {
    if (pick === 'home') return <><Flag emoji={m.home_flag} size={14} style={{ marginRight: 4 }} />{t.teamWon.replace('{team}', m.home_team)}</>
    if (pick === 'away') return <><Flag emoji={m.away_flag} size={14} style={{ marginRight: 4 }} />{t.teamWon.replace('{team}', m.away_team)}</>
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

          {/* Golden Boot pick */}
          {scorerPick && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderRadius: 10, marginBottom: 10,
              background: 'rgba(245,197,24,0.06)',
              border: '1px solid rgba(245,197,24,0.35)',
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
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)' }}>+10</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)' }}>{t.ifCorrect}</div>
              </div>
            </div>
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
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>+15 ✓</div>
                    <div style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--font-cond)' }}>{t.correctExclaim}</div>
                  </>
                ) : winnerPick.is_correct === false ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>+0</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>{t.wrongLower}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--green)' }}>+15</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)' }}>{t.ifCorrect}</div>
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
              return (
                <div key={e.id} style={{
                  background: 'var(--white)',
                  border: `1px solid ${
                    e.is_correct === true ? 'var(--green)' :
                    e.is_correct === false ? 'var(--red)' :
                    'var(--gray-border)'
                  }`,
                  borderRadius: 10, padding: '14px', marginBottom: 8
                }}>
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
                      {e.is_correct === true && (
                        <span className="badge" style={{ background: 'var(--green-light)', color: 'var(--green-dark)' }}>
                          ✓ {t.correct}
                        </span>
                      )}
                      {e.is_correct === false && (
                        <span className="badge" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                          ✗ {t.wrong}
                        </span>
                      )}
                      {e.is_correct === null && (
                        <span className="badge badge-pending">{t.pending}</span>
                      )}
                    </div>
                  </div>

                  <div style={{
                    marginTop: 10, padding: '8px 12px',
                    background: 'var(--gray-bg)', borderRadius: 8,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexWrap: 'wrap', gap: 6
                  }}>
                    <div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.yourPick}: </span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{pickLabel(e.pick, m)}</span>
                      {e.home_score_pred != null && e.away_score_pred != null && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>
                          ({e.home_score_pred}–{e.away_score_pred})
                        </span>
                      )}
                    </div>
                    {m.result && (
                      <div>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.result}: </span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{pickLabel(m.result, m)}</span>
                        {m.home_score != null && m.away_score != null && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>
                            ({m.home_score}–{m.away_score})
                          </span>
                        )}
                      </div>
                    )}
                    {e.raffle_entries > 0 && (
                      <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                        +{e.raffle_entries} {t.tickets}
                      </span>
                    )}
                  </div>
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
