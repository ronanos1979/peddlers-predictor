'use client'
import { useEffect, useState } from 'react'
import { supabase, type Match } from '@/lib/supabase'
import { useLocale } from '@/lib/useLocale'
import Flag from '@/components/Flag'
import Link from 'next/link'
import { isPlaceholder, parseGroupLetters, formatPlaceholder } from './bracketHelpers'

const KNOCKOUT_STAGES = [
  'Round of 32',
  'Round of 16',
  'Quarter Final',
  'Semi Final',
  'Third Place',
  'Final',
]

const STAGE_LABELS: Record<string, string> = {
  'Round of 32':  'R32',
  'Round of 16':  'R16',
  'Quarter Final': 'QF',
  'Semi Final':   'SF',
  'Third Place':  '3rd',
  'Final':        'Final',
}

type Standing = {
  rank: number
  team: { id: number; name: string; logo: string }
  points: number
  goalsDiff: number
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } }
}

type GroupMap = Record<string, Standing[]>

function resultLabel(m: Match, side: 'home' | 'away') {
  if (!m.result) return null
  if (m.result === 'draw') return 'D'
  return (side === 'home' && m.result === 'home') || (side === 'away' && m.result === 'away') ? 'W' : 'L'
}

export default function BracketPage() {
  const { t } = useLocale()
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStage, setActiveStage] = useState('Round of 32')
  const [groupMap, setGroupMap] = useState<GroupMap>({})
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('matches')
        .select('*')
        .in('stage', KNOCKOUT_STAGES)
        .order('kickoff_at', { ascending: true })
      setMatches((data || []) as Match[])
      setLoading(false)
    }
    load()
  }, [])

  // Fetch standings once — used to populate inline group widget
  useEffect(() => {
    async function loadStandings() {
      try {
        const res = await fetch('/api/football?endpoint=standings')
        const data = await res.json()
        const raw: Standing[][] = data.response?.[0]?.league?.standings || []
        const map: GroupMap = {}
        raw.forEach((group, i) => {
          map[String.fromCharCode(65 + i)] = group // index 0 → "A", 1 → "B" …
        })
        setGroupMap(map)
      } catch { /* standings unavailable — widget shows empty state */ }
    }
    loadStandings()
  }, [])

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  }

  // Auto-advance to the first stage that has any real teams or results
  useEffect(() => {
    if (!matches.length) return
    const stageWithAction = KNOCKOUT_STAGES.find(stage => {
      const ms = matches.filter(m => m.stage === stage)
      return ms.some(m => !isPlaceholder(m.home_team) || m.result)
    })
    if (stageWithAction) setActiveStage(stageWithAction)
  }, [matches])

  function toggleCard(id: string) {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const staged = matches.filter(m => m.stage === activeStage)
  const availableStages = KNOCKOUT_STAGES.filter(s => matches.some(m => m.stage === s))

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>
          {t.wc2026}
        </div>
        <h1>{t.bracketTitle}</h1>
        <p className="muted">{t.bracketSub}</p>
      </div>

      {/* Round tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {availableStages.map(stage => (
          <button
            key={stage}
            onClick={() => setActiveStage(stage)}
            style={{
              padding: '6px 12px', borderRadius: 20,
              border: `1px solid ${activeStage === stage ? 'var(--green)' : 'var(--border)'}`,
              background: activeStage === stage ? 'rgba(0,200,122,0.12)' : 'transparent',
              color: activeStage === stage ? 'var(--green)' : 'var(--text-muted)',
              fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12,
              letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {STAGE_LABELS[stage] || stage}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)' }}>
          {t.loading}
        </div>
      )}

      {!loading && staged.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <p className="muted">{t.noMatchesRound}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {staged.map((m, i) => {
          const homePH  = isPlaceholder(m.home_team)
          const awayPH  = isPlaceholder(m.away_team)
          const done    = !!m.result
          const homeRes = resultLabel(m, 'home')
          const awayRes = resultLabel(m, 'away')
          const expanded = expandedCards.has(m.id)

          const homeLabel = homePH ? formatPlaceholder(m.home_team) : m.home_team
          const awayLabel = awayPH ? formatPlaceholder(m.away_team) : m.away_team

          // Collect unique group letters from placeholder slots in this match
          const involvedGroups = [
            ...(homePH ? parseGroupLetters(m.home_team) : []),
            ...(awayPH ? parseGroupLetters(m.away_team) : []),
          ].filter((g, idx, arr) => arr.indexOf(g) === idx).sort()

          const showWidget = involvedGroups.length > 0

          return (
            <div
              key={m.id}
              style={{
                background: 'var(--surface)',
                border: `1px solid ${done ? 'rgba(0,200,122,0.2)' : 'var(--border)'}`,
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {/* Match header */}
              <div style={{
                padding: '6px 14px',
                background: 'var(--surface2)',
                borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  {t.matchNumber.replace('{n}', String(i + 1))}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)' }}>
                  {fmtDate(m.kickoff_at)}
                </span>
              </div>

              {/* Teams */}
              <div style={{ padding: '0 14px' }}>
                {/* Home */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 0',
                  borderBottom: '1px solid var(--border)',
                  opacity: homePH ? 0.7 : 1,
                }}>
                  <span style={{ width: 28, textAlign: 'center', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {homePH ? <span style={{ fontSize: 22, lineHeight: 1 }}>🏳</span> : <Flag emoji={m.home_flag} size={22} />}
                  </span>
                  <span style={{
                    flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700,
                    fontSize: homePH ? 13 : 15,
                    fontStyle: homePH ? 'italic' : 'normal',
                    color: homeRes === 'W' ? 'var(--green)' : homeRes === 'L' ? 'var(--text-muted)' : homePH ? 'var(--text-muted)' : 'var(--text)',
                  }}>
                    {homeLabel}
                  </span>
                  {homeRes && (
                    <span style={{
                      fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: 1,
                      color: homeRes === 'W' ? 'var(--green)' : homeRes === 'L' ? 'var(--red)' : 'var(--text-muted)',
                    }}>
                      {homeRes}
                    </span>
                  )}
                </div>

                {/* Away */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 0',
                  opacity: awayPH ? 0.7 : 1,
                }}>
                  <span style={{ width: 28, textAlign: 'center', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {awayPH ? <span style={{ fontSize: 22, lineHeight: 1 }}>🏳</span> : <Flag emoji={m.away_flag} size={22} />}
                  </span>
                  <span style={{
                    flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700,
                    fontSize: awayPH ? 13 : 15,
                    fontStyle: awayPH ? 'italic' : 'normal',
                    color: awayRes === 'W' ? 'var(--green)' : awayRes === 'L' ? 'var(--text-muted)' : awayPH ? 'var(--text-muted)' : 'var(--text)',
                  }}>
                    {awayLabel}
                  </span>
                  {awayRes && (
                    <span style={{
                      fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: 1,
                      color: awayRes === 'W' ? 'var(--green)' : awayRes === 'L' ? 'var(--red)' : 'var(--text-muted)',
                    }}>
                      {awayRes}
                    </span>
                  )}
                </div>
              </div>

              {/* Group standings widget */}
              {showWidget && (
                <>
                  <button
                    onClick={() => toggleCard(m.id)}
                    style={{
                      width: '100%',
                      padding: '8px 14px',
                      background: expanded ? 'rgba(0,200,122,0.06)' : 'var(--surface2)',
                      border: 'none',
                      borderTop: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: expanded ? 'var(--green)' : 'var(--text-muted)' }}>
                      {expanded ? t.hideGroups : t.seeGroups}{' '}
                      {involvedGroups.map(g => `Group ${g}`).join(' · ')}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--green)' }}>{expanded ? '▲' : '▼'}</span>
                  </button>

                  {expanded && (
                    <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(0,200,122,0.02)' }}>
                      {involvedGroups.map(letter => {
                        const rows = groupMap[letter]
                        return (
                          <div key={letter} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, letterSpacing: 1, marginBottom: 8, color: 'var(--green)' }}>
                              Group {letter}
                            </div>
                            {!rows || rows.length === 0 ? (
                              <p className="muted" style={{ fontSize: 12, margin: 0 }}>{t.standingsUnavailable}</p>
                            ) : (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                  <thead>
                                    <tr>
                                      {[t.pos, t.team, t.played, t.won, t.drawn, t.lost, t.points].map((h, hi) => (
                                        <th key={hi} style={{
                                          padding: '4px 6px',
                                          textAlign: hi <= 1 ? 'left' : 'center',
                                          fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 10,
                                          letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted)',
                                          whiteSpace: 'nowrap',
                                        }}>
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((s, ri) => (
                                      <tr key={s.team.id} style={{ background: ri < 2 ? 'rgba(0,200,122,0.06)' : 'transparent' }}>
                                        <td style={{ padding: '7px 6px', textAlign: 'center', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12, color: ri < 2 ? 'var(--green)' : 'var(--text-muted)' }}>
                                          {s.rank}
                                        </td>
                                        <td style={{ padding: '7px 6px' }}>
                                          <Link href={`/world-cup/team?id=${s.team.id}`} style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 12, color: 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                            {s.team.logo && <img src={s.team.logo} alt="" style={{ width: 14, height: 14, objectFit: 'contain', flexShrink: 0 }} />}
                                            {s.team.name}
                                          </Link>
                                        </td>
                                        <td style={{ padding: '7px 4px', textAlign: 'center', color: 'var(--text-muted)' }}>{s.all.played}</td>
                                        <td style={{ padding: '7px 4px', textAlign: 'center', color: 'var(--text-muted)' }}>{s.all.win}</td>
                                        <td style={{ padding: '7px 4px', textAlign: 'center', color: 'var(--text-muted)' }}>{s.all.draw}</td>
                                        <td style={{ padding: '7px 4px', textAlign: 'center', color: 'var(--text-muted)' }}>{s.all.lose}</td>
                                        <td style={{ padding: '7px 8px', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--green)' }}>{s.points}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <div style={{ padding: '8px 14px', display: 'flex', justifyContent: 'flex-end' }}>
                        <Link href="/world-cup/groups" style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--green)', textDecoration: 'none', textTransform: 'uppercase' }}>
                          {t.fullStandingsTable} →
                        </Link>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        <Link href="/world-cup/standings" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
          ← {t.groupStandings}
        </Link>
      </div>
    </div>
  )
}
