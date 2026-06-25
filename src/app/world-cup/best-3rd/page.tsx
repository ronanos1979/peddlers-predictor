'use client'
import { useEffect, useState } from 'react'
import { useLocale } from '@/lib/useLocale'
import Link from 'next/link'

type StandingRow = {
  rank: number
  team: { id: number; name: string; logo: string }
  points: number
  goalsDiff: number
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } }
  fairPlayPoints?: number
}

type ThirdTeam = StandingRow & { group: string; groupComplete: boolean; sortRank: number }

// FD name → schedule name for team page links
const FD_TO_SCHED: Record<string, string> = {
  'Czech Republic': 'Czechia',
  'Korea Republic': 'South Korea',
  "Côte d'Ivoire": 'Ivory Coast',
  'United States': 'USA',
  'Turkey': 'Türkiye',
  'Cape Verde Islands': 'Cape Verde',
}
function toSchedName(fdName: string) { return FD_TO_SCHED[fdName] ?? fdName }

// FIFA tiebreaker order for best 3rd-placed teams:
// 1. Points  2. GD  3. Goals For  4. Goals Against (fewer)  5. Fair play  6. FIFA ranking
function sortThirds(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points
  if (b.goalsDiff !== a.goalsDiff) return b.goalsDiff - a.goalsDiff
  if (b.all.goals.for !== a.all.goals.for) return b.all.goals.for - a.all.goals.for
  if (a.all.goals.against !== b.all.goals.against) return a.all.goals.against - b.all.goals.against
  return 0
}

export default function Best3rdPage() {
  const { t } = useLocale()
  const [thirds, setThirds] = useState<ThirdTeam[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/football?endpoint=standings')
      .then(r => r.json())
      .then(data => {
        const raw: StandingRow[][] = data.response?.[0]?.league?.standings ?? []
        const all3rds: (StandingRow & { group: string; groupComplete: boolean })[] = []
        raw.forEach((group, i) => {
          const letter = String.fromCharCode(65 + i)
          const third = group.find(r => r.rank === 3)
          if (!third) return
          all3rds.push({ ...third, group: letter, groupComplete: third.all.played >= 3 })
        })
        const sorted = [...all3rds].sort(sortThirds)
        setThirds(sorted.map((t, i) => ({ ...t, sortRank: i + 1 })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const groupsComplete = thirds.filter(t => t.groupComplete).length
  const qualifying = thirds.slice(0, 8)
  const notQualifying = thirds.slice(8)

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>
          World Cup 2026
        </div>
        <h1>{t.best3rdTitle}</h1>
        <p className="muted">{t.best3rdSub}</p>
        {thirds.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: groupsComplete === 12 ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
              {t.best3rdComplete.replace('{done}', String(groupsComplete))}
            </span>
            {groupsComplete < 12 && (
              <span style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)' }}>
                · {t.best3rdInProgress.replace('{n}', String(12 - groupsComplete))}
              </span>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)' }}>
          {t.loading}
        </div>
      )}

      {!loading && thirds.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <p className="muted">{t.standingsUnavailable}</p>
          <p className="muted" style={{ marginTop: 6 }}>{t.checkBackAfterJune11}</p>
        </div>
      )}

      {qualifying.length > 0 && (
        <>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 8 }}>
            {t.best3rdQualifying} (1–8)
          </div>
          {qualifying.map(team => (
            <TeamRow key={team.team.id} team={team} qualifying t={t} />
          ))}
        </>
      )}

      {notQualifying.length > 0 && (
        <>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--red)', marginBottom: 8, marginTop: 20 }}>
            {t.best3rdNotQualifying}
          </div>
          {notQualifying.map(team => (
            <TeamRow key={team.team.id} team={team} qualifying={false} t={t} />
          ))}
        </>
      )}

      {!loading && thirds.length > 0 && thirds.length < 12 && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: 8, fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--amber)' }}>
          {t.best3rdInProgress.replace('{n}', String(12 - thirds.length))}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>
          Tiebreakers (FIFA)
        </div>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Points → Goal Difference → Goals Scored → Goals Conceded → Disciplinary → FIFA Ranking
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <Link href="/world-cup/standings" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', flex: 1 }}>
          📊 {t.groupStandings}
        </Link>
        <Link href="/world-cup" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', flex: 1 }}>
          ← {t.worldCupHub}
        </Link>
      </div>
    </div>
  )
}

type RowProps = {
  team: ThirdTeam
  qualifying: boolean
  t: ReturnType<typeof useLocale>['t']
}

function TeamRow({ team, qualifying, t }: RowProps) {
  const borderColor = qualifying ? 'rgba(0,200,122,0.25)' : 'rgba(255,59,59,0.15)'
  const rankColor = qualifying ? 'var(--green)' : 'var(--red)'
  const inProgress = !team.groupComplete

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 14px',
      background: qualifying ? 'rgba(0,200,122,0.03)' : 'var(--surface)',
      border: `1px solid ${borderColor}`,
      borderRadius: 8, marginBottom: 6,
      opacity: inProgress ? 0.85 : 1,
    }}>
      {/* Rank */}
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: rankColor, minWidth: 24, textAlign: 'center', flexShrink: 0 }}>
        {team.sortRank}
      </div>

      {/* Flag + name */}
      <Link
        href={`/world-cup/team?name=${encodeURIComponent(toSchedName(team.team.name))}`}
        style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, textDecoration: 'none', color: 'var(--text)' }}
      >
        {team.team.logo && (
          <img src={team.team.logo} alt="" style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {team.team.name}
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            Group {team.group}{inProgress ? ' · ⏳' : ''}
          </div>
        </div>
      </Link>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, flexShrink: 0, fontFamily: 'var(--font-cond)', fontSize: 12 }}>
        <div style={{ textAlign: 'center', minWidth: 22 }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.played}</div>
          <div style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{team.all.played}</div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 22 }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.gd}</div>
          <div style={{ color: team.goalsDiff > 0 ? 'var(--green)' : team.goalsDiff < 0 ? 'var(--red)' : 'var(--text-muted)', fontWeight: 700 }}>
            {team.goalsDiff > 0 ? `+${team.goalsDiff}` : team.goalsDiff}
          </div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 28 }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.points}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: qualifying ? 'var(--green)' : 'var(--text-muted)', fontWeight: 700 }}>
            {team.points}
          </div>
        </div>
      </div>
    </div>
  )
}
