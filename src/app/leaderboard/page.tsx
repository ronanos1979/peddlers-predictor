'use client'
import { useEffect, useState } from 'react'
import { supabase, type Entry, type Match } from '@/lib/supabase'
import Link from 'next/link'

type LeaderEntry = {
  name: string
  pub_id: string
  total_pts: number
  correct: number
  total: number
  last_pick: string
  last_correct: boolean | null
}

export default function Leaderboard({ searchParams }: { searchParams: { pub?: string } }) {
  const pubId = searchParams.pub
  const [entries, setEntries] = useState<LeaderEntry[]>([])
  const [match, setMatch] = useState<Match | null>(null)
  const [filter, setFilter] = useState<'all' | 'this_pub'>('all')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState('')

  async function load() {
    const { data: matchData } = await supabase
      .from('matches')
      .select('*')
      .eq('is_active', true)
      .single()
    setMatch(matchData)

    const { data: rawEntries } = await supabase
      .from('entries')
      .select('*')
      .order('created_at', { ascending: false })

    if (rawEntries) {
      // Aggregate by phone number across all matches
      const byPhone: Record<string, { name: string; pub_id: string; pts: number; correct: number; total: number; last_pick: string; last_correct: boolean | null }> = {}
      rawEntries.forEach((e: Entry) => {
        if (!byPhone[e.phone]) {
          byPhone[e.phone] = { name: e.name, pub_id: e.pub_id, pts: 0, correct: 0, total: 0, last_pick: e.pick, last_correct: e.is_correct }
        }
        byPhone[e.phone].pts += e.raffle_entries
        byPhone[e.phone].total += 1
        if (e.is_correct) byPhone[e.phone].correct += 1
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
    load()
    // Refresh every 30 seconds
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  const filtered = filter === 'this_pub' && pubId
    ? entries.filter(e => e.pub_id === pubId)
    : entries

  const medals = ['🥇', '🥈', '🥉']
  const pickLabel = (pick: string, m: Match | null) => {
    if (!m) return pick
    if (pick === 'home') return `${m.home_flag} ${m.home_team}`
    if (pick === 'away') return `${m.away_flag} ${m.away_team}`
    return 'Draw'
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <p className="muted" style={{ marginBottom: 4 }}>🍺 The Peddler&apos;s Daughter</p>
        <h1>Leaderboard</h1>
        {match && (
          <p className="muted">Current match: {match.home_flag} {match.home_team} vs {match.away_flag} {match.away_team}</p>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'this_pub'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '7px 16px',
              borderRadius: 20,
              border: '1px solid var(--gray-border)',
              background: filter === f ? 'var(--white)' : 'transparent',
              fontWeight: filter === f ? 600 : 400,
              cursor: 'pointer',
              color: 'var(--text)',
              fontSize: 13
            }}
          >
            {f === 'all' ? 'All locations' : 'This pub'}
          </button>
        ))}
        <span className="muted" style={{ fontSize: 12, alignSelf: 'center', marginLeft: 'auto' }}>
          Updated {lastUpdated}
        </span>
      </div>

      {loading ? (
        <p className="muted" style={{ textAlign: 'center', padding: 40 }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted">No entries yet — be the first!</p>
        </div>
      ) : (
        filtered.map((e, i) => (
          <div key={i} className="lb-entry">
            <div className="lb-rank">{medals[i] || i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {e.correct}/{e.total} correct
              </div>
              {match && e.last_correct === null && (
                <span className={`pick-pill`}>{pickLabel(e.last_pick, match)} ⏳</span>
              )}
              {match && e.last_correct === true && (
                <span className="pick-pill correct">{pickLabel(e.last_pick, match)} ✓</span>
              )}
              {match && e.last_correct === false && (
                <span className="pick-pill wrong">{pickLabel(e.last_pick, match)}</span>
              )}
            </div>
            <div>
              <div className="lb-pts">{e.total_pts} pts</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>raffle</div>
            </div>
          </div>
        ))
      )}

      <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--amber-light)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
        🏆 <strong>3 raffle entries</strong> per correct prediction. TV giveaway at the end of the tournament!
      </div>

      <Link href={`/?pub=${pubId || 'haverhill'}`} className="btn btn-secondary" style={{ textDecoration: 'none', display: 'block', textAlign: 'center', marginTop: 12 }}>
        ← Make a prediction
      </Link>
    </div>
  )
}
