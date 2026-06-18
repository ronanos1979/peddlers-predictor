'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { loadPatron } from '@/lib/patron'
import { GOLDEN_BOOT_CONTENDERS } from '@/lib/goldenBootContenders'
import { useLocale } from '@/lib/useLocale'
import Link from 'next/link'

type PlayerTally = { playerName: string; playerTeam: string; flag: string; count: number; pct: number }

export default function ScorerPicksPage() {
  const { t } = useLocale()
  const [tallies, setTallies] = useState<PlayerTally[]>([])
  const [total, setTotal] = useState(0)
  const [myPick, setMyPick] = useState('')
  const [loading, setLoading] = useState(true)
  const [pubBreakdown, setPubBreakdown] = useState<{ haverhill: number; nashua: number }>({ haverhill: 0, nashua: 0 })

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('scorer_picks')
        .select('player_name, player_team, phone, pub_id')

      if (!data) { setLoading(false); return }

      const counts: Record<string, { playerTeam: string; count: number }> = {}
      const pubCounts = { haverhill: 0, nashua: 0 }

      data.forEach(p => {
        if (!counts[p.player_name]) counts[p.player_name] = { playerTeam: p.player_team || '', count: 0 }
        counts[p.player_name].count++
        if (p.pub_id === 'haverhill') pubCounts.haverhill++
        if (p.pub_id === 'nashua') pubCounts.nashua++
      })

      const tot = data.length
      setTotal(tot)
      setPubBreakdown(pubCounts)

      // Build tallies, enriching with flag from GOLDEN_BOOT_CONTENDERS where possible
      const sorted = Object.entries(counts)
        .map(([playerName, { playerTeam, count }]) => {
          const contender = GOLDEN_BOOT_CONTENDERS.find(
            c => c.name.toLowerCase() === playerName.toLowerCase()
          )
          return {
            playerName,
            playerTeam,
            flag: contender?.flag ?? '🌍',
            count,
            pct: tot ? Math.round(count / tot * 100) : 0,
          }
        })
        .sort((a, b) => b.count - a.count)
      setTallies(sorted)

      const patron = loadPatron()
      if (patron?.phone) {
        const raw = patron.phone.replace(/\D/g, '')
        const phone = raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw
        const mine = data.find(p => p.phone === phone)
        if (mine) setMyPick(mine.player_name)
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
          {t.goldenBootCommunitySectionLabel}
        </div>
        <h1>{t.goldenBootCommunityTitle}</h1>
        {total > 0 && (
          <p className="muted">
            {total} {total === 1 ? t.patronHas : t.patronsHave} {t.pickedTopScorer}
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
          <div style={{ fontSize: 40, marginBottom: 10 }}>🎯</div>
          <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{t.noScorerPicksYet}</p>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>{t.beFirstScorerPick}</p>
          <Link href="/world-cup/top-scorer-pick" className="btn btn-gold" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
            {t.makeYourScorerPickBtn}
          </Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tallies.map((tally, i) => {
              const isMine = tally.playerName === myPick
              const isTop = i === 0
              return (
                <div key={tally.playerName} style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: isMine ? 'rgba(245,197,24,0.07)' : 'var(--surface)',
                  border: `1px solid ${isMine ? 'rgba(245,197,24,0.4)' : isTop ? 'rgba(245,197,24,0.25)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-dim)', flexShrink: 0, width: 26, textAlign: 'center' }}>
                      {i < 3 ? medals[i] : i + 1}
                    </div>
                    {tally.playerTeam ? (
                      <Link href={`/world-cup/team?name=${encodeURIComponent(tally.playerTeam)}`} style={{ fontSize: 22, flexShrink: 0, textDecoration: 'none' }}>{tally.flag}</Link>
                    ) : (
                      <div style={{ fontSize: 22, flexShrink: 0 }}>{tally.flag}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15, color: isMine ? 'var(--gold)' : 'var(--text)' }}>
                        {tally.playerName}
                        {isMine && (
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gold)', marginLeft: 8, fontWeight: 400, fontStyle: 'italic' }}>
                            {t.yourPickAnnotation}
                          </span>
                        )}
                      </div>
                      {tally.playerTeam && (
                        <Link href={`/world-cup/team?name=${encodeURIComponent(tally.playerTeam)}`} style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', marginTop: 1, display: 'block', textDecoration: 'none' }}>
                          {tally.playerTeam}
                        </Link>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: isMine ? 'var(--gold)' : isTop ? 'var(--gold)' : 'var(--text)' }}>
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
                      background: isMine ? 'var(--gold)' : isTop ? 'rgba(245,197,24,0.6)' : 'rgba(255,255,255,0.18)',
                      borderRadius: 2, transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>

          {!myPick && (
            <div style={{ marginTop: 16 }}>
              <Link href="/world-cup/top-scorer-pick" className="btn btn-gold" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
                {t.makeYourScorerPickBtn}
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
