'use client'
import { useEffect, useState } from 'react'
import { useLocale } from '@/lib/useLocale'
import Link from 'next/link'

type StandingRow = {
  rank: number  // global rank 1-48 (NOT group rank 1-4 — use array index for group pos)
  team: { id: number; name: string; logo: string }
  points: number
  goalsDiff: number
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } }
}

type GroupEntry = {
  group: string           // "A" through "L"
  groupComplete: boolean
  third: StandingRow      // current 3rd-placed team (anchor for ranking)
  contenders: StandingRow[] // teams that could still swap into 3rd
  sortRank: number        // 1-12 after cross-group sort
}

const FD_TO_SCHED: Record<string, string> = {
  'Czech Republic': 'Czechia',
  'Korea Republic': 'South Korea',
  "Côte d'Ivoire": 'Ivory Coast',
  'United States': 'USA',
  'Turkey': 'Türkiye',
  'Cape Verde Islands': 'Cape Verde',
  'Bosnia-Herzegovina': 'Bosnia & Herzegovina',
  'Cabo Verde': 'Cape Verde',
}
function schedName(n: string) { return FD_TO_SCHED[n] ?? n }

// FIFA tiebreaker: Pts → GD → GF → GA (fewer) → disciplinary (not available from FD)
function sortThirds(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points
  if (b.goalsDiff !== a.goalsDiff) return b.goalsDiff - a.goalsDiff
  if (b.all.goals.for !== a.all.goals.for) return b.all.goals.for - a.all.goals.for
  return a.all.goals.against - b.all.goals.against
}

// Teams that could mathematically swap into 3rd place in an unfinished group.
// group[] is sorted ascending by global rank (= group position order).
function getContenders(group: StandingRow[]): StandingRow[] {
  const third = group[2]
  if (!third) return []
  const remaining = 3 - third.all.played
  if (remaining <= 0) return []

  const result: StandingRow[] = []
  // 4th could climb to 3rd if they can reach 3rd's current points
  if (group[3] && group[3].points + remaining * 3 >= third.points) result.push(group[3])
  // 2nd could drop to 3rd if 3rd can overtake them
  if (group[1] && third.points + remaining * 3 >= group[1].points) result.push(group[1])
  return result
}

export default function Best3rdPage() {
  const { t } = useLocale()
  const [entries, setEntries] = useState<GroupEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/football?endpoint=standings')
      .then(r => r.json())
      .then(data => {
        // raw is array-of-arrays: raw[i] = one group's teams sorted by global rank
        // Within each group the array index = group position (0=1st, 1=2nd, 2=3rd, 3=4th)
        // Note: row.rank = GLOBAL position 1-48, NOT group rank 1-4 — use index!
        const raw: StandingRow[][] = data.response?.[0]?.league?.standings ?? []

        const allEntries: GroupEntry[] = []
        raw.forEach((group, i) => {
          const letter = String.fromCharCode(65 + i)
          // group[2] is the 3rd-placed team (index 2 in sorted group array)
          const third = group[2]
          if (!third) return // group not yet loaded
          const gamesPlayed = third.all.played
          const groupComplete = gamesPlayed >= 3
          const contenders = groupComplete ? [] : getContenders(group)
          allEntries.push({ group: letter, groupComplete, third, contenders, sortRank: 0 })
        })

        // Sort by current 3rd-placed team's stats (FIFA tiebreakers)
        allEntries.sort((a, b) => sortThirds(a.third, b.third))
        // Assign display rank
        allEntries.forEach((e, i) => { e.sortRank = i + 1 })
        setEntries(allEntries)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const groupsComplete = entries.filter(e => e.groupComplete).length
  const qualifying = entries.slice(0, 8)
  const notQualifying = entries.slice(8)

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>
          World Cup 2026
        </div>
        <h1>{t.best3rdTitle}</h1>
        <p className="muted">{t.best3rdSub}</p>
        {entries.length > 0 && (
          <div style={{ marginTop: 8, fontFamily: 'var(--font-cond)', fontSize: 12, color: groupsComplete === 12 ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
            {t.best3rdComplete.replace('{done}', String(groupsComplete))}
            {groupsComplete < 12 && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                {' · '}{t.best3rdInProgress.replace('{n}', String(12 - groupsComplete))}
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

      {!loading && entries.length === 0 && (
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
          {qualifying.map(entry => (
            <GroupEntryCard key={entry.group} entry={entry} qualifying t={t} />
          ))}
        </>
      )}

      {notQualifying.length > 0 && (
        <>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--red)', marginBottom: 8, marginTop: 20 }}>
            {t.best3rdNotQualifying}
          </div>
          {notQualifying.map(entry => (
            <GroupEntryCard key={entry.group} entry={entry} qualifying={false} t={t} />
          ))}
        </>
      )}

      {!loading && entries.length > 0 && entries.length < 12 && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: 8, fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--amber)' }}>
          {12 - entries.length} group(s) have no data yet — they will appear as matches are played.
        </div>
      )}

      <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }}>
          FIFA Tiebreakers
        </div>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Points → Goal Difference → Goals Scored → Goals Conceded → Disciplinary → FIFA Ranking
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
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

type CardProps = {
  entry: GroupEntry
  qualifying: boolean
  t: ReturnType<typeof useLocale>['t']
}

function GroupEntryCard({ entry, qualifying, t }: CardProps) {
  const { group, groupComplete, third, contenders, sortRank } = entry
  const borderColor = qualifying ? 'rgba(0,200,122,0.28)' : 'rgba(255,59,59,0.18)'
  const rankColor   = qualifying ? 'var(--green)' : 'var(--red)'
  const gd          = third.goalsDiff

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      marginBottom: 8,
      background: qualifying ? 'rgba(0,200,122,0.03)' : 'var(--surface)',
      overflow: 'hidden',
    }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
        {/* Rank */}
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: rankColor, minWidth: 26, textAlign: 'center', flexShrink: 0 }}>
          {sortRank}
        </div>

        {/* Team info */}
        <Link
          href={`/world-cup/team?name=${encodeURIComponent(schedName(third.team.name))}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, textDecoration: 'none', color: 'var(--text)' }}
        >
          {third.team.logo && (
            <img src={third.team.logo} alt="" style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {third.team.name}
            </div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>Group {group}</span>
              {groupComplete
                ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓</span>
                : <span style={{ color: 'var(--amber)' }}>⏳ {third.all.played}/3 played</span>
              }
            </div>
          </div>
        </Link>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, flexShrink: 0, fontFamily: 'var(--font-cond)', fontSize: 12 }}>
          <div style={{ textAlign: 'center', minWidth: 22 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.played}</div>
            <div style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{third.all.played}</div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 28 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.gd}</div>
            <div style={{ fontWeight: 700, color: gd > 0 ? 'var(--green)' : gd < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
              {gd > 0 ? `+${gd}` : gd}
            </div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 28 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.points}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: qualifying ? 'var(--green)' : 'var(--text-muted)' }}>
              {third.points}
            </div>
          </div>
        </div>
      </div>
      {/* Current prediction row */}
      <div style={{ padding: '7px 14px 8px 54px', borderTop: '1px solid var(--border)', background: qualifying ? 'rgba(0,200,122,0.04)' : 'transparent', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: qualifying ? 'var(--green)' : 'var(--text-muted)', fontWeight: 700 }}>
          {qualifying
            ? groupComplete
              ? '✓ Qualified for Round of 32'
              : '→ On course for Round of 32'
            : groupComplete
              ? '✗ Did not qualify'
              : '→ Currently outside top 8'}
        </span>
        {!groupComplete && (
          <span style={{ fontFamily: 'var(--font-cond)', fontSize: 10, color: 'var(--text-dim)' }}>
            · may change
          </span>
        )}
      </div>

      {/* Contenders row for incomplete groups */}
      {!groupComplete && contenders.length > 0 && (
        <div style={{ padding: '8px 14px 10px 54px', borderTop: '1px solid var(--border)', background: 'rgba(245,197,24,0.04)' }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 5 }}>
            Could still be 3rd:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {contenders.map(team => (
              <Link
                key={team.team.id}
                href={`/world-cup/team?name=${encodeURIComponent(schedName(team.team.name))}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}
              >
                {team.team.logo && (
                  <img src={team.team.logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }} />
                )}
                <span style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)' }}>
                  {team.team.name}
                </span>
                <span style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-dim)' }}>
                  ({team.points} pts)
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* No games played yet */}
      {!groupComplete && third.all.played === 0 && (
        <div style={{ padding: '8px 14px 10px 54px', borderTop: '1px solid var(--border)', fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)' }}>
          No matches played yet
        </div>
      )}
    </div>
  )
}
