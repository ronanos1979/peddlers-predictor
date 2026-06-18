'use client'
import { useEffect, useState } from 'react'
import { supabase, type Match } from '@/lib/supabase'
import { useLocale } from '@/lib/useLocale'
import Flag from '@/components/Flag'
import Link from 'next/link'
import { isPlaceholder, parseGroupLetters, formatPlaceholder, parseMatchNumber } from './bracketHelpers'

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

// ── Sub-components ────────────────────────────────────────────────────────────

// Expandable standings table for a single group letter
function GroupTable({
  letter, groupMap, t,
}: { letter: string; groupMap: GroupMap; t: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const rows = groupMap[letter]
  return (
    <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 4 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '6px 10px',
          background: open ? 'rgba(0,200,122,0.08)' : 'var(--surface2)',
          border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: 1, color: open ? 'var(--green)' : 'var(--text-muted)' }}>
          Group {letter}
        </span>
        <span style={{ fontSize: 9, color: 'var(--green)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        !rows || rows.length === 0 ? (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', padding: '8px 10px', margin: 0 }}>
            {t.standingsUnavailable}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  {[t.pos, t.team, t.played, t.won, t.drawn, t.lost, t.points].map((h, hi) => (
                    <th key={hi} style={{
                      padding: '4px 5px', textAlign: hi <= 1 ? 'left' : 'center',
                      fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 9,
                      letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s, ri) => (
                  <tr key={s.team.id} style={{ background: ri < 2 ? 'rgba(0,200,122,0.05)' : 'transparent' }}>
                    <td style={{ padding: '5px 5px', textAlign: 'center', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 11, color: ri < 2 ? 'var(--green)' : 'var(--text-muted)' }}>{s.rank}</td>
                    <td style={{ padding: '5px 5px' }}>
                      <Link href={`/world-cup/team?id=${s.team.id}`} style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 11, color: 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {s.team.logo && <img src={s.team.logo} alt="" style={{ width: 12, height: 12, objectFit: 'contain', flexShrink: 0 }} />}
                        {s.team.name}
                      </Link>
                    </td>
                    <td style={{ padding: '5px 4px', textAlign: 'center', color: 'var(--text-muted)' }}>{s.all.played}</td>
                    <td style={{ padding: '5px 4px', textAlign: 'center', color: 'var(--text-muted)' }}>{s.all.win}</td>
                    <td style={{ padding: '5px 4px', textAlign: 'center', color: 'var(--text-muted)' }}>{s.all.draw}</td>
                    <td style={{ padding: '5px 4px', textAlign: 'center', color: 'var(--text-muted)' }}>{s.all.lose}</td>
                    <td style={{ padding: '5px 7px', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--green)' }}>{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

// Panel showing one source R32 match (used inside R16 drill-down)
function SourceMatchPanel({
  name, matchByNum, groupMap, fmtDate, t,
}: {
  name: string
  matchByNum: Record<number, Match>
  groupMap: GroupMap
  fmtDate: (s: string) => string
  t: Record<string, string>
}) {
  const matchNum = parseMatchNumber(name)
  if (!matchNum) return null
  const src = matchByNum[matchNum]
  if (!src) return null

  const homeLabel = isPlaceholder(src.home_team) ? formatPlaceholder(src.home_team) : src.home_team
  const awayLabel = isPlaceholder(src.away_team) ? formatPlaceholder(src.away_team) : src.away_team
  const allGroups = [
    ...parseGroupLetters(src.home_team),
    ...parseGroupLetters(src.away_team),
  ].filter((g, i, a) => a.indexOf(g) === i).sort()

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
        R32 {t.matchNumber.replace('{n}', String(matchNum))} · {fmtDate(src.kickoff_at)}
        {src.result && <span style={{ marginLeft: 6, color: 'var(--green)' }}>✓</span>}
      </div>
      {src.result ? (
        // Match played — show real teams with result
        <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
          <Link href={`/world-cup/team?name=${encodeURIComponent(src.home_team)}`} style={{ color: src.result === 'home' ? 'var(--green)' : 'var(--text-muted)', textDecoration: 'none' }}>{src.home_team}</Link>
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> vs </span>
          <Link href={`/world-cup/team?name=${encodeURIComponent(src.away_team)}`} style={{ color: src.result === 'away' ? 'var(--green)' : 'var(--text-muted)', textDecoration: 'none' }}>{src.away_team}</Link>
        </div>
      ) : (
        <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
          {isPlaceholder(src.home_team)
            ? <span style={{ color: 'var(--text)' }}>{homeLabel}</span>
            : <Link href={`/world-cup/team?name=${encodeURIComponent(src.home_team)}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{homeLabel}</Link>}
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> vs </span>
          {isPlaceholder(src.away_team)
            ? <span style={{ color: 'var(--text)' }}>{awayLabel}</span>
            : <Link href={`/world-cup/team?name=${encodeURIComponent(src.away_team)}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{awayLabel}</Link>}
        </div>
      )}
      {allGroups.map(letter => (
        <GroupTable key={letter} letter={letter} groupMap={groupMap} t={t} />
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

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
  const [matchByNum, setMatchByNum] = useState<Record<number, Match>>({})
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  // Load knockout matches for the bracket display
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

  // Load ALL matches (excl. demo) to build match-number → match lookup for R16 drill-down
  // M73 = the 73rd real match by kickoff order (group stage is matches 1–72)
  useEffect(() => {
    async function loadAll() {
      const { data } = await supabase
        .from('matches')
        .select('*')
        .neq('stage', 'Demo Match')
        .order('kickoff_at', { ascending: true })
      const map: Record<number, Match> = {}
      ;(data || []).forEach((m, i) => { map[i + 1] = m as Match })
      setMatchByNum(map)
    }
    loadAll()
  }, [])

  // Fetch group standings (5-min server cache) for inline group tables
  useEffect(() => {
    async function loadStandings() {
      try {
        const res = await fetch('/api/football?endpoint=standings')
        const data = await res.json()
        const raw: Standing[][] = data.response?.[0]?.league?.standings || []
        const map: GroupMap = {}
        raw.forEach((group, i) => { map[String.fromCharCode(65 + i)] = group })
        setGroupMap(map)
      } catch { /* standings unavailable — GroupTable shows empty state */ }
    }
    loadStandings()
  }, [])

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  }

  // Auto-advance to the first stage with real teams or results
  useEffect(() => {
    if (!matches.length) return
    const stageWithAction = KNOCKOUT_STAGES.find(stage =>
      matches.filter(m => m.stage === stage).some(m => !isPlaceholder(m.home_team) || m.result)
    )
    if (stageWithAction) setActiveStage(stageWithAction)
  }, [matches])

  function toggleCard(id: string) {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
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

          // R32: extract group letters from placeholder slots
          const involvedGroups = [
            ...(homePH ? parseGroupLetters(m.home_team) : []),
            ...(awayPH ? parseGroupLetters(m.away_team) : []),
          ].filter((g, idx, arr) => arr.indexOf(g) === idx).sort()

          // R16: check if slots reference R32 match numbers
          const homeMatchNum = homePH ? parseMatchNumber(m.home_team) : null
          const awayMatchNum = awayPH ? parseMatchNumber(m.away_team) : null

          const showGroupWidget   = involvedGroups.length > 0
          const showR16Widget     = !showGroupWidget && (homeMatchNum !== null || awayMatchNum !== null)
          const hasWidget         = showGroupWidget || showR16Widget

          // Widget button label
          const widgetLabel = showGroupWidget
            ? `${expanded ? t.hideGroups : t.seeGroups} ${involvedGroups.map(g => `Group ${g}`).join(' · ')}`
            : showR16Widget
            ? `${expanded ? t.hideGroups : t.seeGroups} ${[homeMatchNum, awayMatchNum].filter(Boolean).map(n => `R32 #${n}`).join(' · ')}`
            : ''

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
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {t.matchNumber.replace('{n}', String(i + 1))}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', textAlign: 'right' }}>
                  {m.venue ? `${m.venue} · ` : ''}{fmtDate(m.kickoff_at)}
                </span>
              </div>

              {/* Teams */}
              <div style={{ padding: '0 14px' }}>
                {/* Home */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: '1px solid var(--border)', opacity: homePH ? 0.7 : 1 }}>
                  {homePH ? (
                    <>
                      <span style={{ width: 28, textAlign: 'center', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 22, lineHeight: 1 }}>🏳</span>
                      </span>
                      <span style={{ flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)' }}>{homeLabel}</span>
                    </>
                  ) : (
                    <Link href={`/world-cup/team?name=${encodeURIComponent(m.home_team)}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, textDecoration: 'none' }}>
                      <span style={{ width: 28, textAlign: 'center', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Flag emoji={m.home_flag} size={22} />
                      </span>
                      <span style={{ flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15, color: homeRes === 'W' ? 'var(--green)' : homeRes === 'L' ? 'var(--text-muted)' : 'var(--text)' }}>
                        {homeLabel}
                      </span>
                    </Link>
                  )}
                  {homeRes && (
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: 1, color: homeRes === 'W' ? 'var(--green)' : homeRes === 'L' ? 'var(--red)' : 'var(--text-muted)' }}>
                      {homeRes}
                    </span>
                  )}
                </div>

                {/* Away */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', opacity: awayPH ? 0.7 : 1 }}>
                  {awayPH ? (
                    <>
                      <span style={{ width: 28, textAlign: 'center', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 22, lineHeight: 1 }}>🏳</span>
                      </span>
                      <span style={{ flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)' }}>{awayLabel}</span>
                    </>
                  ) : (
                    <Link href={`/world-cup/team?name=${encodeURIComponent(m.away_team)}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, textDecoration: 'none' }}>
                      <span style={{ width: 28, textAlign: 'center', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Flag emoji={m.away_flag} size={22} />
                      </span>
                      <span style={{ flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15, color: awayRes === 'W' ? 'var(--green)' : awayRes === 'L' ? 'var(--text-muted)' : 'var(--text)' }}>
                        {awayLabel}
                      </span>
                    </Link>
                  )}
                  {awayRes && (
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: 1, color: awayRes === 'W' ? 'var(--green)' : awayRes === 'L' ? 'var(--red)' : 'var(--text-muted)' }}>
                      {awayRes}
                    </span>
                  )}
                </div>
              </div>

              {/* Expandable drill-down widget (R32: groups · R16: source R32 matches) */}
              {hasWidget && (
                <>
                  <button
                    onClick={() => toggleCard(m.id)}
                    style={{
                      width: '100%', padding: '8px 14px',
                      background: expanded ? 'rgba(0,200,122,0.06)' : 'var(--surface2)',
                      border: 'none', borderTop: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: expanded ? 'var(--green)' : 'var(--text-muted)' }}>
                      {widgetLabel}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--green)' }}>{expanded ? '▲' : '▼'}</span>
                  </button>

                  {expanded && (
                    <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(0,200,122,0.02)', padding: '12px 14px' }}>
                      {/* R32 match: expandable group tables */}
                      {showGroupWidget && involvedGroups.map(letter => (
                        <GroupTable key={letter} letter={letter} groupMap={groupMap} t={t as Record<string, string>} />
                      ))}

                      {/* R16 match: source R32 match panels (each with their own expandable group tables) */}
                      {showR16Widget && (
                        <>
                          {[m.home_team, m.away_team].map((slot, si) => {
                            const num = parseMatchNumber(slot)
                            if (!num) return null
                            return (
                              <div key={si} style={si === 0 ? { paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--border)' } : {}}>
                                <SourceMatchPanel
                                  name={slot}
                                  matchByNum={matchByNum}
                                  groupMap={groupMap}
                                  fmtDate={fmtDate}
                                  t={t as Record<string, string>}
                                />
                              </div>
                            )
                          })}
                        </>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
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
