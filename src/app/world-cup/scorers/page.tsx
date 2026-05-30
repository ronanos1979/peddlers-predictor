'use client'
import { useEffect, useState } from 'react'
import { useLocale } from '@/lib/useLocale'
import Link from 'next/link'

type Scorer = {
  player: { id: number; name: string; nationality: string; photo: string; age: number }
  statistics: Array<{ team: { name: string; logo: string }; goals: { total: number; assists: number } }>
}

export default function ScorersPage() {
  const { t } = useLocale()
  const [scorers, setScorers] = useState<Scorer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/football?endpoint=players/topscorers')
        const data = await res.json()
        setScorers(data.response || [])
      } catch { /* show empty */ }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>
          🥇 Golden Boot Race
        </div>
        <h1>{t.topScorers}</h1>
        <p className="muted">{t.scorersSub}</p>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>Loading…</div>}

      {!loading && scorers.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🥇</div>
          <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>No goals scored yet</p>
          <p className="muted" style={{ marginTop: 6 }}>Check back after June 11</p>
        </div>
      )}

      {scorers.map((s, i) => {
        const stats = s.statistics[0]
        const goals = stats?.goals.total ?? 0
        const assists = stats?.goals.assists ?? 0
        return (
          <div key={s.player.id} className="card" style={{ padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: i === 0 ? 'var(--gold)' : i === 1 ? '#aaa' : i === 2 ? '#cd7f32' : 'var(--text-dim)', width: 32, flexShrink: 0, textAlign: 'center' }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
              </div>
              {s.player.photo && (
                <img src={s.player.photo} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{s.player.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {stats?.team.logo && <img src={stats.team.logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)' }}>{stats?.team.name} · {s.player.nationality}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--gold)', letterSpacing: 1 }}>{goals}</div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)' }}>{t.goalsLabel}</div>
                {assists > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{assists} {t.assists.toLowerCase()}</div>
                )}
              </div>
            </div>
          </div>
        )
      })}

      <div style={{ marginTop: 16 }}>
        <Link href="/world-cup/top-scorer-pick" className="btn btn-gold" style={{ textDecoration: 'none', textAlign: 'center' }}>
          🥇 {t.pickTopScorer}
        </Link>
      </div>
      <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 8 }}>← {t.home}</Link>
    </div>
  )
}
