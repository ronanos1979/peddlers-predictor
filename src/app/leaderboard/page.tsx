'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { trackEvent } from '@/lib/analytics'
import { supabase, type Entry, type Match } from '@/lib/supabase'
import { useLocale } from '@/lib/useLocale'
import Flag from '@/components/Flag'
import Link from 'next/link'

type LeaderEntry = {
  name: string; pub_id: string; total_pts: number
  correct: number; score_exact: number; wrong: number; pending: number; total: number
  hasWinnerPending: boolean; hasScorerPending: boolean
  last_pick: string; last_correct: boolean | null
}

type AttendanceEntry = { name: string; pub_id: string; match_count: number }
type TopPick = { label: string; flag?: string; count: number }

function LeaderboardContent() {
  const { t } = useLocale()
  const searchParams = useSearchParams()
  const pubId = searchParams.get('pub')
  const [view, setView] = useState<'predictions' | 'attendance'>('predictions')
  const [entries, setEntries] = useState<LeaderEntry[]>([])
  const [attendanceEntries, setAttendanceEntries] = useState<AttendanceEntry[]>([])
  const [match, setMatch] = useState<Match | null>(null)
  const [filter, setFilter] = useState<'all' | 'this_pub'>('all')
  const [loading, setLoading] = useState(true)
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')
  const [topChampion, setTopChampion] = useState<TopPick | null>(null)
  const [topScorer, setTopScorer] = useState<TopPick | null>(null)

  async function load() {
    const [{ data: matchData }, { data: rawEntries }, { data: allWinnerPicks }, { data: allScorerPicks }, { data: winnerPicksData }, { data: scorerPicksData }] = await Promise.all([
      supabase.from('matches').select('*').eq('is_active', true).single(),
      supabase.from('entries').select('*').order('created_at', { ascending: false }),
      supabase.from('winner_picks').select('phone, raffle_entries, is_correct'),
      supabase.from('scorer_picks').select('phone, raffle_entries, is_correct'),
      supabase.from('winner_picks').select('team_name, team_flag'),
      supabase.from('scorer_picks').select('player_name, player_team'),
    ])
    setMatch(matchData)
    if (rawEntries) {
      const byPhone: Record<string, { name: string; pub_id: string; pts: number; correct: number; score_exact: number; wrong: number; pending: number; total: number; hasWinnerPending: boolean; hasScorerPending: boolean; last_pick: string; last_correct: boolean | null }> = {}
      rawEntries.forEach((e: Entry) => {
        if (!byPhone[e.phone]) byPhone[e.phone] = { name: e.name, pub_id: e.pub_id, pts: 0, correct: 0, score_exact: 0, wrong: 0, pending: 0, total: 0, hasWinnerPending: false, hasScorerPending: false, last_pick: e.pick, last_correct: e.is_correct }
        byPhone[e.phone].pts += e.raffle_entries
        byPhone[e.phone].total += 1
        if (e.is_correct === true) byPhone[e.phone].correct += 1
        if (e.is_correct === false) byPhone[e.phone].wrong += 1
        if (e.is_correct === null) byPhone[e.phone].pending += 1
        // raffle_entries is 3 (result+score) or 10 (result+score+hat-trick) when exact score is correct
        if (e.is_correct === true && (e.raffle_entries === 3 || e.raffle_entries === 10)) byPhone[e.phone].score_exact += 1
      })
      allWinnerPicks?.forEach(wp => {
        if (!byPhone[wp.phone]) return
        if (wp.raffle_entries > 0) byPhone[wp.phone].pts += wp.raffle_entries
        if (wp.is_correct === null) byPhone[wp.phone].hasWinnerPending = true
      })
      allScorerPicks?.forEach(sp => {
        if (!byPhone[sp.phone]) return
        if (sp.raffle_entries > 0) byPhone[sp.phone].pts += sp.raffle_entries
        if (sp.is_correct === null) byPhone[sp.phone].hasScorerPending = true
      })
      const sorted = Object.values(byPhone)
        .map(e => ({ name: e.name, pub_id: e.pub_id, total_pts: e.pts, correct: e.correct, score_exact: e.score_exact, wrong: e.wrong, pending: e.pending, total: e.total, hasWinnerPending: e.hasWinnerPending, hasScorerPending: e.hasScorerPending, last_pick: e.last_pick, last_correct: e.last_correct }))
        .sort((a, b) => b.total_pts - a.total_pts || b.correct - a.correct)
      setEntries(sorted)
      setLastUpdated(new Date().toLocaleTimeString())
    }

    // Aggregate top champion pick
    if (winnerPicksData && winnerPicksData.length > 0) {
      const wCounts: Record<string, { flag: string; count: number }> = {}
      winnerPicksData.forEach((p: { team_name: string; team_flag: string }) => {
        if (!wCounts[p.team_name]) wCounts[p.team_name] = { flag: p.team_flag, count: 0 }
        wCounts[p.team_name].count++
      })
      const topW = Object.entries(wCounts).sort((a, b) => b[1].count - a[1].count)[0]
      if (topW) setTopChampion({ label: topW[0], flag: topW[1].flag, count: topW[1].count })
    }

    // Aggregate top scorer pick
    if (scorerPicksData && scorerPicksData.length > 0) {
      const sCounts: Record<string, { team: string; count: number }> = {}
      scorerPicksData.forEach((p: { player_name: string; player_team: string }) => {
        if (!sCounts[p.player_name]) sCounts[p.player_name] = { team: p.player_team || '', count: 0 }
        sCounts[p.player_name].count++
      })
      const topS = Object.entries(sCounts).sort((a, b) => b[1].count - a[1].count)[0]
      if (topS) setTopScorer({ label: topS[0], count: topS[1].count })
    }

    setLoading(false)
  }

  async function loadAttendance() {
    setAttendanceLoading(true)
    try {
      const res = await fetch('/api/checkin-leaders')
      const data = await res.json()
      setAttendanceEntries(data.leaders || [])
    } catch { /* ignore */ }
    setAttendanceLoading(false)
  }

  useEffect(() => {
    trackEvent('leaderboard_viewed', { pub_id: pubId || 'unknown' })
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (view === 'attendance' && attendanceEntries.length === 0) loadAttendance()
  }, [view])

  const filtered = filter === 'this_pub' && pubId ? entries.filter(e => e.pub_id === pubId) : entries
  const filteredAttendance = filter === 'this_pub' && pubId
    ? attendanceEntries.filter(e => e.pub_id === pubId)
    : attendanceEntries
  const totalPoolTickets = filtered.reduce((s, e) => s + e.total_pts, 0)
  const medals = ['🥇', '🥈', '🥉']

  function pickLabel(pick: string, m: Match | null) {
    if (!m) return <>{pick}</>
    if (pick === 'home') return <><Link href={`/world-cup/team?name=${encodeURIComponent(m.home_team)}`} style={{ textDecoration: 'none', color: 'inherit' }}><Flag emoji={m.home_flag} size={14} style={{ marginRight: 4 }} />{m.home_team}</Link></>
    if (pick === 'away') return <><Link href={`/world-cup/team?name=${encodeURIComponent(m.away_team)}`} style={{ textDecoration: 'none', color: 'inherit' }}><Flag emoji={m.away_flag} size={14} style={{ marginRight: 4 }} />{m.away_team}</Link></>
    return <>{t.draw}</>
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>
          {t.liveRankings}
        </div>
        <h1>{t.leaderboard}</h1>
        <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.leaderboardSub}</p>
        {view === 'predictions' && totalPoolTickets > 0 && (
          <div style={{ display: 'inline-block', marginTop: 6, padding: '4px 10px', background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 20 }}>
            <span style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>
              🎟 {t.totalTicketsPool.replace('{n}', totalPoolTickets.toLocaleString())}
            </span>
          </div>
        )}
        {match && view === 'predictions' && (
          <p className="muted">{t.current}: <Link href={`/world-cup/team?name=${encodeURIComponent(match.home_team)}`} style={{ textDecoration: 'none', color: 'inherit' }}><Flag emoji={match.home_flag} size={14} style={{ marginRight: 4 }} />{match.home_team}</Link> vs <Link href={`/world-cup/team?name=${encodeURIComponent(match.away_team)}`} style={{ textDecoration: 'none', color: 'inherit' }}><Flag emoji={match.away_flag} size={14} style={{ marginRight: 4 }} />{match.away_team}</Link></p>
        )}
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['predictions', 'attendance'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '7px 16px', borderRadius: 20,
            border: `1px solid ${view === v ? (v === 'attendance' ? 'var(--red)' : 'var(--green)') : 'var(--border)'}`,
            background: view === v ? (v === 'attendance' ? 'rgba(255,59,59,0.12)' : 'rgba(0,200,122,0.12)') : 'transparent',
            color: view === v ? (v === 'attendance' ? 'var(--red)' : 'var(--green)') : 'var(--text-muted)',
            fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12, letterSpacing: 0.5, cursor: 'pointer',
          }}>
            {v === 'predictions' ? t.predictionsTab : t.attendanceTab}
          </button>
        ))}
      </div>

      {/* Pub filter + timestamp */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        {(['all', 'this_pub'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '7px 16px', borderRadius: 20,
            border: `1px solid ${filter === f ? 'var(--green)' : 'var(--border)'}`,
            background: filter === f ? 'rgba(0,200,122,0.12)' : 'transparent',
            color: filter === f ? 'var(--green)' : 'var(--text-muted)',
            fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12,
            letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer'
          }}>
            {f === 'all' ? t.allLocations : t.thisPub}
          </button>
        ))}
        {view === 'predictions' && (
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>↻ {lastUpdated}</span>
        )}
      </div>

      {/* PREDICTIONS tab */}
      {view === 'predictions' && (
        loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', letterSpacing: 1 }}>{t.loading}</div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🏆</div>
            <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{t.noEntriesYet}</p>
            <p className="muted" style={{ marginTop: 6 }}>{t.beFirstPrediction}</p>
          </div>
        ) : (
          filtered.map((e, i) => (
            <div key={i} className={`lb-entry${i === 0 ? ' lb-gold' : i === 1 ? ' lb-silver' : i === 2 ? ' lb-bronze' : ''}`}>
              <div className="lb-rank" style={{ color: i === 0 ? 'var(--gold)' : i === 1 ? '#b0b8c8' : i === 2 ? '#cd7f32' : 'var(--text-dim)', fontSize: i === 0 ? 26 : i === 1 ? 22 : 20 }}>
                {medals[i] || i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15 }}>{e.name}</div>
                <div style={{ fontSize: 11, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: '0 6px', lineHeight: 1.6 }}>
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓ {e.correct} {t.correct}</span>
                  <span style={{ color: 'var(--text-dim)' }}>·</span>
                  <span style={{ color: e.score_exact > 0 ? 'var(--gold)' : 'var(--text-dim)' }}>🎯 {e.score_exact} {t.lbExactScores}</span>
                  <span style={{ color: 'var(--text-dim)' }}>·</span>
                  <span style={{ color: e.wrong > 0 ? '#e05' : 'var(--text-dim)' }}>✗ {e.wrong} {t.wrongLower}</span>
                  <span style={{ color: 'var(--text-dim)' }}>·</span>
                  <span style={{ color: 'var(--text-dim)' }}>{e.total} {t.lbPredicted}</span>
                </div>
                {(e.pending > 0 || e.hasWinnerPending || e.hasScorerPending) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 8px', fontSize: 10, marginTop: 2, color: 'var(--text-dim)' }}>
                    {e.pending > 0 && <span>⏳ {e.pending} {t.lbMatchesPending}</span>}
                    {e.hasWinnerPending && <span style={{ color: 'rgba(245,197,24,0.7)' }}>🏆 {t.lbChampionPick}</span>}
                    {e.hasScorerPending && <span style={{ color: 'rgba(245,197,24,0.7)' }}>⚽ {t.lbGoldenBootPick}</span>}
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                  {e.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'}
                </div>
                {match && (
                  <span className={`pick-pill ${e.last_correct === true ? 'correct' : e.last_correct === false ? 'wrong' : ''}`}>
                    {pickLabel(e.last_pick, match)}
                    {e.last_correct === true ? ' ✓' : e.last_correct === false ? ' ✗' : ' ⏳'}
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="lb-pts">{e.total_pts}</div>
                {totalPoolTickets > 0 && (
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 0.3, color: 'var(--text-dim)', marginTop: 1 }}>
                    / {totalPoolTickets.toLocaleString()} · {(e.total_pts / totalPoolTickets * 100).toFixed(1)}%
                  </div>
                )}
                <div style={{ fontSize: 10, fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)' }}>{t.tickets}</div>
              </div>
            </div>
          ))
        )
      )}

      {/* ATTENDANCE tab */}
      {view === 'attendance' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{t.mostAttendedTitle}</div>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>{t.mostAttendedSub}</p>
          </div>
          {attendanceLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', letterSpacing: 1 }}>{t.loading}</div>
          ) : filteredAttendance.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🍺</div>
              <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{t.noCheckInsYet}</p>
              <p className="muted" style={{ marginTop: 6 }}>{t.beFirstCheckin}</p>
            </div>
          ) : (
            filteredAttendance.map((e, i) => (
              <div key={i} className={`lb-entry${i === 0 ? ' lb-gold' : i === 1 ? ' lb-silver' : i === 2 ? ' lb-bronze' : ''}`}>
                <div className="lb-rank" style={{ color: i === 0 ? 'var(--gold)' : i === 1 ? '#b0b8c8' : i === 2 ? '#cd7f32' : 'var(--text-dim)', fontSize: i === 0 ? 26 : i === 1 ? 22 : 20 }}>
                  {medals[i] || i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15 }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                    {e.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="lb-pts" style={{ color: 'var(--red)' }}>{e.match_count}</div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    {t.matchesAttended.replace('{count}', '').replace('{plural}', e.match_count !== 1 ? 's' : '').trim()}
                  </div>
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* Community Bonus Picks */}
      {view === 'predictions' && (topChampion || topScorer) && (
        <div style={{ marginTop: 20, padding: '16px', background: 'linear-gradient(135deg, #0f1a00, #1a1200)', borderRadius: 'var(--radius)', border: '1px solid rgba(245,197,24,0.2)' }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>
            {t.communityBonusPicks}
          </div>
          <p style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>{t.bonusPicksSub}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {topChampion && (
              <Link href="/world-cup/winner-picks" style={{ textDecoration: 'none', background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(245,197,24,0.15)', display: 'block' }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }}>{t.champPicksLabel}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {topChampion.flag && <span style={{ fontSize: 20 }}>{topChampion.flag}</span>}
                  <div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, color: 'var(--gold)' }}>{topChampion.label}</div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-dim)' }}>{topChampion.count} {topChampion.count === 1 ? t.vote : t.votes}</div>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--green)', marginTop: 6 }}>{t.seeAllPicks}</div>
              </Link>
            )}
            {topScorer && (
              <Link href="/world-cup/scorer-picks" style={{ textDecoration: 'none', background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(245,197,24,0.15)', display: 'block' }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }}>{t.goldenBootPicksLabel}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 20 }}>⚽</span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, color: 'var(--gold)' }}>{topScorer.label}</div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-dim)' }}>{topScorer.count} {topScorer.count === 1 ? t.vote : t.votes}</div>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--green)', marginTop: 6 }}>{t.seeAllPicks}</div>
              </Link>
            )}
          </div>
        </div>
      )}

      {view === 'predictions' && (
        <div style={{ marginTop: 16, padding: '14px 16px', background: 'linear-gradient(135deg, #1a1200, #0f1a00)', borderRadius: 'var(--radius)', border: '1px solid rgba(245,197,24,0.2)', fontSize: 13, color: 'var(--text-muted)' }}>
          🏆 <strong style={{ color: 'var(--gold)' }}>3 {t.raffleEntries}</strong> {t.perCorrectPick}
        </div>
      )}

      <Link href={`/?pub=${pubId || 'haverhill'}`} className="btn btn-secondary"
        style={{ textDecoration: 'none', textAlign: 'center', marginTop: 12 }}>
        ← {t.makePrediction}
      </Link>
    </div>
  )
}

export default function Leaderboard() {
  return <Suspense><LeaderboardContent /></Suspense>
}
