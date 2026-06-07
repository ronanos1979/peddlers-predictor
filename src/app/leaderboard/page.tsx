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
  correct: number; total: number; last_pick: string; last_correct: boolean | null
}

function LeaderboardContent() {
  const { t } = useLocale()
  const searchParams = useSearchParams()
  const pubId = searchParams.get('pub')
  const [entries, setEntries] = useState<LeaderEntry[]>([])
  const [match, setMatch] = useState<Match | null>(null)
  const [filter, setFilter] = useState<'all' | 'this_pub'>('all')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState('')

  async function load() {
    const [{ data: matchData }, { data: rawEntries }, { data: winnerBonuses }] = await Promise.all([
      supabase.from('matches').select('*').eq('is_active', true).single(),
      supabase.from('entries').select('*').order('created_at', { ascending: false }),
      supabase.from('winner_picks').select('phone, raffle_entries').gt('raffle_entries', 0),
    ])
    setMatch(matchData)
    if (rawEntries) {
      const byPhone: Record<string, { name: string; pub_id: string; pts: number; correct: number; total: number; last_pick: string; last_correct: boolean | null }> = {}
      rawEntries.forEach((e: Entry) => {
        if (!byPhone[e.phone]) byPhone[e.phone] = { name: e.name, pub_id: e.pub_id, pts: 0, correct: 0, total: 0, last_pick: e.pick, last_correct: e.is_correct }
        byPhone[e.phone].pts += e.raffle_entries
        byPhone[e.phone].total += 1
        if (e.is_correct) byPhone[e.phone].correct += 1
      })
      // Add tournament winner pick bonus
      winnerBonuses?.forEach(wp => {
        if (byPhone[wp.phone]) byPhone[wp.phone].pts += wp.raffle_entries
      })
      const sorted = Object.values(byPhone)
        .map(e => ({ name: e.name, pub_id: e.pub_id, total_pts: e.pts, correct: e.correct, total: e.total, last_pick: e.last_pick, last_correct: e.last_correct }))
        .sort((a, b) => b.total_pts - a.total_pts || b.correct - a.correct)
      setEntries(sorted)
      setLastUpdated(new Date().toLocaleTimeString())
    }
    setLoading(false)
  }

  useEffect(() => {
    trackEvent('leaderboard_viewed', { pub_id: pubId || 'unknown' })
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [])

  const filtered = filter === 'this_pub' && pubId ? entries.filter(e => e.pub_id === pubId) : entries
  const medals = ['🥇', '🥈', '🥉']

  function pickLabel(pick: string, m: Match | null) {
    if (!m) return <>{pick}</>
    if (pick === 'home') return <><Flag emoji={m.home_flag} size={14} style={{ marginRight: 4 }} />{m.home_team}</>
    if (pick === 'away') return <><Flag emoji={m.away_flag} size={14} style={{ marginRight: 4 }} />{m.away_team}</>
    return <>{t.draw}</>
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>
          {t.liveRankings}
        </div>
        <h1>{t.leaderboard}</h1>
        <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>Raffle ticket standings — more tickets = more chances, but anyone can win the draw</p>
        {match && (
          <p className="muted">{t.current}: <Flag emoji={match.home_flag} size={14} style={{ marginRight: 4 }} />{match.home_team} vs <Flag emoji={match.away_flag} size={14} style={{ marginRight: 4 }} />{match.away_team}</p>
        )}
      </div>

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
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>↻ {lastUpdated}</span>
      </div>

      {loading ? (
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
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                {e.correct}/{e.total} {t.correct} · {e.pub_id === 'haverhill' ? 'Haverhill' : 'Nashua'}
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
              <div style={{ fontSize: 10, fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)' }}>{t.tickets}</div>
            </div>
          </div>
        ))
      )}

      <div style={{ marginTop: 16, padding: '14px 16px', background: 'linear-gradient(135deg, #1a1200, #0f1a00)', borderRadius: 'var(--radius)', border: '1px solid rgba(245,197,24,0.2)', fontSize: 13, color: 'var(--text-muted)' }}>
        🏆 <strong style={{ color: 'var(--gold)' }}>3 {t.raffleEntries}</strong> {t.perCorrectPick}
      </div>

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
