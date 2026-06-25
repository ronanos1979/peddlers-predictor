'use client'
import { useEffect, useState } from 'react'
import { useLocale } from '@/lib/useLocale'
import Link from 'next/link'

type TeamRow = {
  rank: number
  team: { id: number; name: string; logo: string }
  points: number
  all: { played: number; win: number; draw: number; lose: number }
  group: string
}

export default function GroupsPage() {
  const { t } = useLocale()
  const [groups, setGroups] = useState<TeamRow[][]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch('/api/football?endpoint=standings')
        const data = await res.json()
        const raw: TeamRow[][] = data.response?.[0]?.league?.standings || []
        setGroups(raw)
      } catch { /* show empty */ }
      setLoading(false)
    }
    load()
  }, [])

  const groupLabels = groups.map((_, i) => String.fromCharCode(65 + i))

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>
          {t.wc2026}
        </div>
        <h1>{t.groupsTitle}</h1>
        <p className="muted">{t.allGroupsSub}</p>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)' }}>
          {t.loading}
        </div>
      )}

      {!loading && groups.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
            {t.groupDrawUnavailable}
          </p>
          <p className="muted" style={{ marginTop: 6 }}>{t.checkBackJune11}</p>
        </div>
      )}

      {/* 2-column grid of group cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {groups.map((group, gi) => {
          const isDone = group.length >= 4 && group.every(r => r.all.played >= 3)
          return (
          <div key={gi} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            {/* Group header */}
            <div style={{
              padding: '8px 12px',
              background: 'var(--surface2)',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: 1, color: 'var(--green)' }}>
                {groupLabels[gi]}
              </span>
              <span style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {t.groupLabel}
              </span>
              {group.some(r => r.all.played > 0) && (
                <span style={{ fontFamily: 'var(--font-cond)', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: isDone ? 'var(--green)' : 'var(--amber)', padding: '1px 5px', borderRadius: 3, border: `1px solid ${isDone ? 'rgba(0,200,122,0.3)' : 'rgba(245,197,24,0.3)'}`, background: isDone ? 'rgba(0,200,122,0.08)' : 'rgba(245,197,24,0.08)' }}>
                  {isDone ? t.groupFinalStandings : t.groupInProgress}
                </span>
              )}
            </div>

            {/* Teams */}
            {group.map((row, ri) => (
              <Link
                key={row.team.id || row.team.name}
                href={`/world-cup/team?name=${encodeURIComponent(row.team.name)}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px',
                  borderBottom: ri < group.length - 1 ? '1px solid var(--border)' : 'none',
                  textDecoration: 'none', color: 'var(--text)',
                  background: ri < 2 ? 'rgba(0,200,122,0.03)' : 'transparent',
                }}
              >
                {/* Qualification dot */}
                <div style={{
                  width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                  background: ri < 2 ? 'var(--green)' : 'var(--border)',
                }} />

                {/* Team logo */}
                {row.team.logo ? (
                  <img src={row.team.logo} alt="" style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 22, height: 22, flexShrink: 0 }} />
                )}

                {/* Team name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {row.team.name}
                  </div>
                </div>

                {/* Points (shown once tournament starts) */}
                {row.all.played > 0 && (
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--green)', flexShrink: 0 }}>
                    {row.points}
                  </div>
                )}
              </Link>
            ))}
          </div>
          )
        })}
      </div>

      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingLeft: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
            <span style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t.advancesToR32}
            </span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        <Link href="/world-cup/standings" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
          📊 {t.fullStandingsTable}
        </Link>
        <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
          {t.homeArrow}
        </Link>
      </div>
    </div>
  )
}
