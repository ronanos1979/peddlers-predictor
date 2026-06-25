'use client'
import { useEffect, useState } from 'react'
import { useLocale } from '@/lib/useLocale'
import Link from 'next/link'

type Standing = {
  rank: number
  team: { id: number; name: string; logo: string }
  points: number
  goalsDiff: number
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } }
  description: string | null
}

type Group = {
  group: string
  standings: Standing[][]
}

export default function StandingsPage() {
  const { t } = useLocale()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState('all')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/football?endpoint=standings')
        const data = await res.json()
        const raw = data.response?.[0]?.league?.standings || []
        // raw is array of groups, each is array of teams
        const grouped: Group[] = raw.map((g: Standing[]) => ({
          group: g[0]?.description?.includes('Group') ? g[0].description.split('-')[0].trim() : `Group`,
          standings: [g]
        }))
        setGroups(grouped)
      } catch { /* show empty */ }
      setLoading(false)
    }
    load()
  }, [])

  const groupLabels = groups.map((g, i) => `Group ${String.fromCharCode(65 + i)}`)
  const filtered = selectedGroup === 'all' ? groups : groups.filter((_, i) => groupLabels[i] === selectedGroup)

  function groupRemainingLabel(rows: Standing[]): string | null {
    if (rows.length < 4) return null
    const totalPlayed = rows.reduce((s, r) => s + r.all.played, 0) / 2
    const remaining = 6 - totalPlayed
    if (remaining <= 0) return null
    if (remaining === 1) {
      const notDone = rows.filter(r => r.all.played < 3)
      if (notDone.length === 2) return `${notDone[0].team.name} vs ${notDone[1].team.name}`
    }
    return t.groupMatchesLeft.replace('{n}', String(remaining))
  }

  function descColor(desc: string | null) {
    if (!desc) return 'var(--text-dim)'
    if (desc.toLowerCase().includes('qualif') || desc.toLowerCase().includes('advance')) return 'var(--green)'
    if (desc.toLowerCase().includes('elim')) return 'var(--red)'
    return 'var(--amber)'
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>{t.wc2026}</div>
        <h1>{t.groupStandings}</h1>
        <p className="muted">{t.standingsSub}</p>
      </div>

      {groupLabels.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
          {['all', ...groupLabels].map(g => (
            <button key={g} onClick={() => setSelectedGroup(g)} style={{
              padding: '5px 10px', borderRadius: 16,
              border: `1px solid ${selectedGroup === g ? 'var(--green)' : 'var(--border)'}`,
              background: selectedGroup === g ? 'rgba(0,200,122,0.12)' : 'transparent',
              color: selectedGroup === g ? 'var(--green)' : 'var(--text-muted)',
              fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 11,
              letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer'
            }}>
              {g === 'all' ? t.allFilter : g.replace('Group ', '')}
            </button>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>{t.loading}</div>}

      {!loading && groups.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{t.standingsUnavailable}</p>
          <p className="muted" style={{ marginTop: 6 }}>{t.checkBackAfterJune11}</p>
        </div>
      )}

      {filtered.map((group, gi) => {
        const groupRows = group.standings[0] ?? []
        const isDone = groupRows.length >= 4 && groupRows.every(s => s.all.played >= 3)
        const remainingLabel = isDone ? null : groupRemainingLabel(groupRows)
        return (
        <div key={gi} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: 1 }}>{groupLabels[groups.indexOf(group)]}</span>
            {groupRows.length > 0 && (
              <span style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: isDone ? 'var(--green)' : 'var(--amber)', padding: '2px 7px', borderRadius: 4, border: `1px solid ${isDone ? 'rgba(0,200,122,0.3)' : 'rgba(245,197,24,0.3)'}`, background: isDone ? 'rgba(0,200,122,0.08)' : 'rgba(245,197,24,0.08)' }}>
                {isDone ? t.groupFinalStandings : t.groupInProgress}{remainingLabel && ` · ${remainingLabel}`}
              </span>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[t.pos, t.team, t.played, t.won, t.drawn, t.lost, t.gf, t.ga, t.gd, t.points].map(h => (
                    <th key={h} style={{ padding: '8px 8px', textAlign: h === t.team ? 'left' : 'center', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.standings[0]?.map((s, i) => (
                  <tr key={s.team.id} style={{ borderBottom: i < group.standings[0].length - 1 ? '1px solid var(--border)' : 'none', background: i < 2 ? 'rgba(0,200,122,0.04)' : 'transparent' }}>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'var(--font-cond)', fontWeight: 700, color: descColor(s.description) }}>{s.rank}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {s.team.logo && <img src={s.team.logo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />}
                        <Link href={`/world-cup/team?id=${s.team.id}`} style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, color: 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          {s.team.name}
                        </Link>
                      </div>
                    </td>
                    {[s.all.played, s.all.win, s.all.draw, s.all.lose, s.all.goals.for, s.all.goals.against, s.goalsDiff].map((v, vi) => (
                      <td key={vi} style={{ padding: '10px 6px', textAlign: 'center', color: 'var(--text-muted)' }}>{v}</td>
                    ))}
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--green)' }}>{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--green)', fontFamily: 'var(--font-cond)', fontWeight: 700 }}>■ {t.qualified}</span>
          </div>
        </div>
        )
      })}

      <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 8 }}>← {t.home}</Link>
    </div>
  )
}
