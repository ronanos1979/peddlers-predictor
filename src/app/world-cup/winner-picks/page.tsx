'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { loadPatron } from '@/lib/patron'
import { useLocale } from '@/lib/useLocale'
import Flag from '@/components/Flag'
import Link from 'next/link'

type TeamTally = { name: string; flag: string; count: number; pct: number }

export default function WinnerPicksPage() {
  const { t } = useLocale()
  const [tallies, setTallies] = useState<TeamTally[]>([])
  const [total, setTotal] = useState(0)
  const [myPick, setMyPick] = useState('')
  const [loading, setLoading] = useState(true)
  const [pubBreakdown, setPubBreakdown] = useState<{ haverhill: number; nashua: number }>({ haverhill: 0, nashua: 0 })

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('winner_picks')
        .select('team_name, team_flag, phone, pub_id')

      if (!data) { setLoading(false); return }

      const counts: Record<string, { flag: string; count: number }> = {}
      const pubCounts = { haverhill: 0, nashua: 0 }

      data.forEach(p => {
        if (!counts[p.team_name]) counts[p.team_name] = { flag: p.team_flag, count: 0 }
        counts[p.team_name].count++
        if (p.pub_id === 'haverhill') pubCounts.haverhill++
        if (p.pub_id === 'nashua') pubCounts.nashua++
      })

      const tot = data.length
      setTotal(tot)
      setPubBreakdown(pubCounts)

      const sorted = Object.entries(counts)
        .map(([name, { flag, count }]) => ({ name, flag, count, pct: tot ? Math.round(count / tot * 100) : 0 }))
        .sort((a, b) => b.count - a.count)
      setTallies(sorted)

      const patron = loadPatron()
      if (patron?.phone) {
        const raw = patron.phone.replace(/\D/g, '')
        const phone = raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw
        const mine = data.find(p => p.phone === phone)
        if (mine) setMyPick(mine.team_name)
      }

      setLoading(false)
    }
    load()
  }, [])

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>
          {t.communityPicksSectionLabel}
        </div>
        <h1>{t.communityPicksTitle}</h1>
        {total > 0 && (
          <p className="muted">
            {total} {total === 1 ? t.patronHas : t.patronsHave} {t.pickedChampion}
            {pubBreakdown.haverhill > 0 && pubBreakdown.nashua > 0 && (
              <span style={{ color: 'var(--text-dim)' }}> · Haverhill {pubBreakdown.haverhill} · Nashua {pubBreakdown.nashua}</span>
            )}
          </p>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', letterSpacing: 1 }}>{t.loading}</div>
      ) : tallies.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🏆</div>
          <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{t.noChampionPicksYet}</p>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>{t.beFirstChampion}</p>
          <Link href="/world-cup/winner-pick" className="btn btn-gold" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
            {t.makeYourPickArrow}
          </Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tallies.map((tally, i) => {
              const isMine = tally.name === myPick
              const isTop = i === 0
              return (
                <div key={tally.name} style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: isMine ? 'rgba(245,197,24,0.07)' : 'var(--surface)',
                  border: `1px solid ${isMine ? 'rgba(245,197,24,0.4)' : isTop ? 'rgba(0,200,122,0.3)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-dim)', flexShrink: 0, width: 26, textAlign: 'center' }}>
                      {i < 3 ? medals[i] : i + 1}
                    </div>
                    <div style={{ width: 28, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                      <Flag emoji={tally.flag} size={22} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15, color: isMine ? 'var(--gold)' : 'var(--text)' }}>
                        {tally.name}
                        {isMine && (
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gold)', marginLeft: 8, fontWeight: 400, fontStyle: 'italic' }}>
                            {t.yourPickAnnotation}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: isMine ? 'var(--gold)' : isTop ? 'var(--green)' : 'var(--text)' }}>
                        {tally.count}
                      </div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {tally.pct}%
                      </div>
                    </div>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${tally.pct}%`,
                      background: isMine ? 'var(--gold)' : isTop ? 'var(--green)' : 'rgba(255,255,255,0.18)',
                      borderRadius: 2, transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>

          {!myPick && (
            <div style={{ marginTop: 16 }}>
              <Link href="/world-cup/winner-pick" className="btn btn-gold" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
                🏆 {t.makeYourPickArrow}
              </Link>
            </div>
          )}
        </>
      )}

      <Link href="/world-cup" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 10, display: 'block' }}>
        {t.backToWCHub}
      </Link>
    </div>
  )
}
