'use client'
import { useEffect, useState } from 'react'
import { useLocale } from '@/lib/useLocale'
import { supabase } from '@/lib/supabase'
import { loadPatron } from '@/lib/patron'
import Link from 'next/link'

type Scorer = {
  player: { id: number; name: string; nationality: string; photo: string }
  statistics: Array<{ team: { name: string; logo: string }; goals: { total: number } }>
}

export default function TopScorerPickPage({ searchParams }: { searchParams: { pub?: string } }) {
  const { t } = useLocale()
  const pubId = searchParams.pub || 'haverhill'
  const [scorers, setScorers] = useState<Scorer[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Scorer | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [existingPick, setExistingPick] = useState<string | null>(null)
  const [error, setError] = useState('')
  const patron = typeof window !== 'undefined' ? loadPatron() : null

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/football?endpoint=players/topscorers')
        const data = await res.json()
        setScorers(data.response || [])
      } catch { /* show empty */ }

      // Check for existing pick
      if (patron?.phone) {
        const { data } = await supabase.from('scorer_picks').select('player_name').eq('phone', patron.phone).single()
        if (data) setExistingPick(data.player_name)
      }
      setLoading(false)
    }
    load()
  }, [])

  const filtered = search
    ? scorers.filter(s => s.player.name.toLowerCase().includes(search.toLowerCase()) || s.statistics[0]?.team.name.toLowerCase().includes(search.toLowerCase()))
    : scorers

  async function handleSubmit() {
    if (!selected || !patron) return
    setSubmitting(true)
    setError('')
    try {
      const { error: err } = await supabase.from('scorer_picks').insert({
        pub_id: pubId,
        phone: patron.phone,
        name: patron.name,
        player_name: selected.player.name,
        player_team: selected.statistics[0]?.team.name || '',
        player_id: selected.player.id,
      })
      if (err) { setError(err.message); setSubmitting(false); return }
      setSubmitted(true)
    } catch {
      setError(t.somethingWentWrong)
      setSubmitting(false)
    }
  }

  if (!patron) {
    return (
      <div className="container">
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>🥇 {t.bonusPick}</div>
          <h1>{t.pickTopScorer}</h1>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{t.makeMatchPredictionFirst}</p>
          <p className="muted" style={{ marginBottom: 16 }}>{t.needMatchPrediction}</p>
          <Link href={`/?pub=${pubId}`} className="btn btn-primary" style={{ textDecoration: 'none' }}>← {t.makePrediction}</Link>
        </div>
      </div>
    )
  }

  if (submitted || existingPick) {
    return (
      <div className="container">
        <div style={{ textAlign: 'center', paddingTop: 32 }}>
          <div className="pop-in" style={{ fontSize: 56, marginBottom: 10 }}>🥇</div>
          <div className="slide-up">
            <h1 style={{ marginBottom: 6 }}>{t.topScorerSuccess}</h1>
            <p className="muted" style={{ marginBottom: 20 }}>{t.topScorerBonus}</p>
          </div>
          <div className="slide-up-delay card card-glow" style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>{t.yourTopScorerPick}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: 1, color: 'var(--gold)' }}>
              {existingPick || selected?.player.name}
            </div>
          </div>
          <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>← {t.home}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>🥇 {t.bonusPick}</div>
        <h1>{t.pickTopScorer}</h1>
        <p className="muted">{t.topScorerSub}</p>
      </div>

      <div className="field" style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.searchPlayer}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', width: '100%', color: 'var(--text)', fontSize: 15, fontFamily: 'var(--font-body)' }}
        />
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>{t.loadingPlayers}</div>}

      {!loading && filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted">{t.noPlayersFound}</p>
          <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>{t.searchPlayerAbove}</p>
        </div>
      )}

      {filtered.map(s => {
        const isSelected = selected?.player.id === s.player.id
        return (
          <div key={s.player.id} onClick={() => setSelected(isSelected ? null : s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 10, marginBottom: 8, cursor: 'pointer',
              background: isSelected ? 'rgba(245,197,24,0.08)' : 'var(--surface)',
              border: `1px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
              transition: 'all 0.15s'
            }}>
            {s.player.photo && <img src={s.player.photo} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15, color: isSelected ? 'var(--gold)' : 'var(--text)' }}>{s.player.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {s.statistics[0]?.team.logo && <img src={s.statistics[0].team.logo} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />}
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.statistics[0]?.team.name} · {s.player.nationality}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: isSelected ? 'var(--gold)' : 'var(--text-dim)', letterSpacing: 1 }}>
                {s.statistics[0]?.goals.total ?? 0}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', fontWeight: 700, textTransform: 'uppercase' }}>{t.goalsLabel}</div>
            </div>
            {isSelected && <div style={{ color: 'var(--gold)', fontSize: 18, flexShrink: 0 }}>✓</div>}
          </div>
        )
      })}

      {selected && (
        <div style={{ position: 'sticky', bottom: 16, marginTop: 16 }}>
          {error && <p className="error" style={{ marginBottom: 8, textAlign: 'center' }}>{error}</p>}
          <button className="btn btn-gold" disabled={submitting} onClick={handleSubmit}>
            {submitting ? t.submitting : `🥇 ${t.lockInTopScorer}: ${selected.player.name}`}
          </button>
        </div>
      )}
    </div>
  )
}
