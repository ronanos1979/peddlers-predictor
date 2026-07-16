'use client'
import { useEffect, useState } from 'react'
import { supabase, type Match } from '@/lib/supabase'
import { useLocale } from '@/lib/useLocale'
import Flag from '@/components/Flag'
import Link from 'next/link'
import { isPlaceholder, parseGroupLetters, formatPlaceholder, parseMatchNumber } from './bracketHelpers'

// FD team name → our schedule name
const FD_TO_SCHED: Record<string, string> = {
  'United States': 'USA',
  'Korea Republic': 'South Korea',
  "Côte d'Ivoire": 'Ivory Coast',
  'Turkey': 'Türkiye',
  'Czech Republic': 'Czechia',
  'Cape Verde Islands': 'Cape Verde',
  'Bosnia-Herzegovina': 'Bosnia & Herzegovina',
  'Cabo Verde': 'Cape Verde',
}
function fdSched(n: string): string { return FD_TO_SCHED[n] ?? n }

// A group is confirmed complete when all 4 teams have played all 3 games
function groupDone(group: Standing[]): boolean {
  return group.length >= 4 && group.every(r => r.all.played >= 3)
}

function groupRemainingLabel(rows: Standing[], t: Record<string, string>): string | null {
  if (rows.length < 4) return null
  const totalPlayed = rows.reduce((s, r) => s + r.all.played, 0) / 2
  const remaining = 6 - totalPlayed
  if (remaining <= 0) return null
  if (remaining === 1) {
    const notDone = rows.filter(r => r.all.played < 3)
    if (notDone.length === 2) return `${fdSched(notDone[0].team.name)} vs ${fdSched(notDone[1].team.name)}`
  }
  return t.groupMatchesLeft.replace('{n}', String(remaining))
}

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
  const done = rows ? groupDone(rows) : false
  const remainingLabel = rows && !done ? groupRemainingLabel(rows, t) : null
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: 1, color: open ? 'var(--green)' : 'var(--text-muted)' }}>
            Group {letter}
          </span>
          {rows && rows.length > 0 && (
            <span style={{ fontFamily: 'var(--font-cond)', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: done ? 'var(--green)' : 'var(--amber)', padding: '1px 5px', borderRadius: 3, border: `1px solid ${done ? 'rgba(0,200,122,0.3)' : 'rgba(245,197,24,0.3)'}`, background: done ? 'rgba(0,200,122,0.08)' : 'rgba(245,197,24,0.08)' }}>
              {done ? t.groupFinalStandings : t.groupInProgress}{remainingLabel && ` · ${remainingLabel}`}
            </span>
          )}
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
                    <td style={{ padding: '5px 5px', textAlign: 'center', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 11, color: ri < 2 ? 'var(--green)' : 'var(--text-muted)' }}>{ri + 1}</td>
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
        {matchNum <= 88 ? 'R32' : matchNum <= 96 ? 'R16' : matchNum <= 100 ? 'QF' : 'SF'} {t.matchNumber.replace('{n}', String(matchNum))} · {fmtDate(src.kickoff_at)}
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

type ResolvedTeam = { name: string; schedName: string; logo: string }
type Candidate    = { name: string; schedName: string; logo: string }

// Resolve a group slot to candidates. For a complete group returns the confirmed single team;
// for an in-progress group returns the current top-2 as potential candidates.
function resolveGroupCandidates(
  slot: string,
  groupMap: GroupMap,
): { teams: Candidate[]; confirmed: boolean } | null {
  const winnerM = slot.match(/^Group ([A-L]) Winner$/i)
  const runnerM = slot.match(/^Group ([A-L]) Runner-up$/i)
  const letter  = (winnerM || runnerM)?.[1].toUpperCase()
  if (!letter) return null
  const g = groupMap[letter]
  if (!g || g.length < 2) return { teams: [], confirmed: false }
  if (groupDone(g)) {
    const t = winnerM ? g[0].team : g[1].team
    return { teams: [{ name: fdSched(t.name), schedName: fdSched(t.name), logo: t.logo }], confirmed: true }
  }
  return {
    teams: [g[0], g[1]].map(r => ({ name: fdSched(r.team.name), schedName: fdSched(r.team.name), logo: r.team.logo })),
    confirmed: false,
  }
}

// Recursively resolve a bracket slot to known candidate team names.
// Returns 1 confirmed team, or 2 potentials (one from each side of the source match), or [].
function resolveCandidates(
  slot: string,
  matchByNum: Record<number, Match>,
  groupMap: GroupMap,
  depth = 0,
): { teams: Candidate[]; confirmed: boolean } {
  if (depth > 5) return { teams: [], confirmed: false }

  // Real team already in DB
  if (!isPlaceholder(slot)) {
    return { teams: [{ name: slot, schedName: slot, logo: '' }], confirmed: true }
  }

  // Group-stage slot
  const group = resolveGroupCandidates(slot, groupMap)
  if (group) return group

  // 3rd-place slot — can't resolve to one team yet, return formatted label as text candidate
  const thirdM = slot.match(/^3rd Place \(([^)]+)\)/i)
  if (thirdM) {
    return { teams: [{ name: formatPlaceholder(slot), schedName: '', logo: '' }], confirmed: false }
  }

  // Match-number reference (R16, QF, SF, Final)
  const matchNum = parseMatchNumber(slot)
  if (matchNum) {
    const m = matchByNum[matchNum]
    if (!m) return { teams: [], confirmed: false }
    if (m.result) {
      const wantsLoser = /\bLoser\b/i.test(slot)
      const teamName = wantsLoser
        ? (m.result === 'home' ? m.away_team : m.result === 'away' ? m.home_team : null)
        : (m.result === 'home' ? m.home_team : m.result === 'away' ? m.away_team : null)
      if (!teamName) return { teams: [], confirmed: false }
      return resolveCandidates(teamName, matchByNum, groupMap, depth + 1)
    }
    // Match not yet played — collect all candidates from both sides
    const homeC = resolveCandidates(m.home_team, matchByNum, groupMap, depth + 1)
    const awayC = resolveCandidates(m.away_team, matchByNum, groupMap, depth + 1)
    const seen = new Set<string>()
    const unique = [...homeC.teams, ...awayC.teams].filter(t => {
      if (seen.has(t.name)) return false
      seen.add(t.name)
      return true
    })
    return { teams: unique, confirmed: false }
  }

  return { teams: [], confirmed: false }
}

// Keep for backwards compat with resolveGroupSlot call below
function resolveGroupSlot(name: string, groupMap: GroupMap): ResolvedTeam | null {
  const r = resolveGroupCandidates(name, groupMap)
  if (!r || !r.confirmed || r.teams.length === 0) return null
  return r.teams[0]
}

function TeamSlot({
  dbName, isPlaceholder: isPH, resolved, flag, result, noBorderBottom, candidates,
}: {
  dbName: string
  isPlaceholder: boolean
  resolved: ResolvedTeam | null
  flag: string
  result: string | null
  noBorderBottom?: boolean
  candidates?: Candidate[]
}) {
  const borderStyle = noBorderBottom ? {} : { borderBottom: '1px solid var(--border)' }

  if (!isPH) {
    // Confirmed real team from DB
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', ...borderStyle }}>
        <Link href={`/world-cup/team?name=${encodeURIComponent(dbName)}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, textDecoration: 'none' }}>
          <span style={{ width: 28, textAlign: 'center', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Flag emoji={flag} size={22} />
          </span>
          <span style={{ flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15, color: result === 'W' ? 'var(--green)' : result === 'L' ? 'var(--text-muted)' : 'var(--text)' }}>
            {dbName}
          </span>
        </Link>
        {result && (
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: 1, color: result === 'W' ? 'var(--green)' : result === 'L' ? 'var(--red)' : 'var(--text-muted)' }}>
            {result}
          </span>
        )}
      </div>
    )
  }

  if (resolved) {
    // Group is complete — confirmed team from standings, not yet written to DB
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', ...borderStyle }}>
        <Link href={`/world-cup/team?name=${encodeURIComponent(resolved.schedName)}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, textDecoration: 'none' }}>
          <span style={{ width: 28, textAlign: 'center', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {resolved.logo
              ? <img src={resolved.logo} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
              : <span style={{ fontSize: 22, lineHeight: 1 }}>🏳</span>
            }
          </span>
          <span style={{ flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
            {resolved.name}
          </span>
        </Link>
        <span style={{ fontFamily: 'var(--font-cond)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--green)', opacity: 0.8 }}>
          ✓ confirmed
        </span>
      </div>
    )
  }

  // Potential candidates — show team names instead of opaque placeholder
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [showAll, setShowAll] = useState(false)
  if (candidates && candidates.length > 0) {
    const SHOW_MAX = 4
    const visible  = showAll ? candidates : candidates.slice(0, SHOW_MAX)
    const overflow = candidates.length - SHOW_MAX
    const fontSize = visible.length <= 2 ? 14 : visible.length <= 4 ? 13 : 11
    const logoSize = candidates.length === 1 ? 22 : 13
    return (
      <div style={{ ...borderStyle }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 0' }}>
          <span style={{ width: 28, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexWrap: 'wrap', paddingTop: 1 }}>
            {candidates.slice(0, 2).map(c =>
              c.logo
                ? <img key={c.name} src={c.logo} alt="" style={{ width: logoSize, height: logoSize, objectFit: 'contain' }} />
                : <span key={c.name} style={{ fontSize: logoSize, lineHeight: 1 }}>🏳</span>
            )}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {visible.map((c, ci) => (
                <span key={c.name}>
                  {ci > 0 && <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}> / </span>}
                  {c.schedName
                    ? <Link href={`/world-cup/team?name=${encodeURIComponent(c.schedName)}`} style={{ textDecoration: 'none', color: 'inherit' }}>{c.name}</Link>
                    : <span>{c.name}</span>
                  }
                </span>
              ))}
            </div>
            {overflow > 0 && !showAll && (
              <button
                onClick={e => { e.stopPropagation(); setShowAll(true) }}
                style={{
                  marginTop: 4, background: 'none', border: '1px solid var(--border)',
                  borderRadius: 5, padding: '2px 7px', cursor: 'pointer',
                  fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700,
                  color: 'var(--green)', letterSpacing: 0.5,
                }}
              >
                +{overflow} more ▼
              </button>
            )}
            {showAll && overflow > 0 && (
              <button
                onClick={e => { e.stopPropagation(); setShowAll(false) }}
                style={{
                  marginTop: 4, background: 'none', border: 'none',
                  padding: 0, cursor: 'pointer',
                  fontFamily: 'var(--font-cond)', fontSize: 10,
                  color: 'var(--text-dim)',
                }}
              >
                show less ▲
              </button>
            )}
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, color: 'var(--text-dim)', marginTop: 3, fontStyle: 'italic' }}>
              {formatPlaceholder(dbName)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Totally unknown placeholder
  const label = formatPlaceholder(dbName)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', ...borderStyle, opacity: 0.7 }}>
      <span style={{ width: 28, textAlign: 'center', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>🏳</span>
      </span>
      <span style={{ flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

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

          // Resolve confirmed group winners/runners-up from completed standings
          const homeResolved = homePH ? resolveGroupSlot(m.home_team, groupMap) : null
          const awayResolved = awayPH ? resolveGroupSlot(m.away_team, groupMap) : null
          const homeLabel = homeResolved ? homeResolved.name : homePH ? formatPlaceholder(m.home_team) : m.home_team
          const awayLabel = awayResolved ? awayResolved.name : awayPH ? formatPlaceholder(m.away_team) : m.away_team

          // Resolve potential candidates for unresolved placeholder slots (R16, QF, SF, Final)
          const homeC = (!homeResolved && homePH) ? resolveCandidates(m.home_team, matchByNum, groupMap) : null
          const awayC = (!awayResolved && awayPH) ? resolveCandidates(m.away_team, matchByNum, groupMap) : null

          // R32: extract group letters from placeholder slots (only still-unresolved ones need the widget)
          const involvedGroups = [
            ...(homePH && !homeResolved ? parseGroupLetters(m.home_team) : []),
            ...(awayPH && !awayResolved ? parseGroupLetters(m.away_team) : []),
          ].filter((g, idx, arr) => arr.indexOf(g) === idx).sort()

          // R16: check if slots reference R32 match numbers
          const homeMatchNum = homePH ? parseMatchNumber(m.home_team) : null
          const awayMatchNum = awayPH ? parseMatchNumber(m.away_team) : null

          const showGroupWidget   = involvedGroups.length > 0
          const showR16Widget     = !showGroupWidget && (homeMatchNum !== null || awayMatchNum !== null)
          const hasWidget         = showGroupWidget || showR16Widget

          // Widget button label
          function srcLabel(n: number): string {
            if (n <= 88) return `R32 M${n - 72}`
            if (n <= 96) return `R16 M${n - 88}`
            if (n <= 100) return `QF M${n - 96}`
            return `SF M${n - 100}`
          }
          const widgetLabel = showGroupWidget
            ? `${expanded ? t.hideGroups : t.seeGroups} ${involvedGroups.map(g => `Group ${g}`).join(' · ')}`
            : showR16Widget
            ? `${expanded ? t.hideGroups : t.seeGroups} ${[homeMatchNum, awayMatchNum].filter(Boolean).map(n => srcLabel(n as number)).join(' · ')}`
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
                <TeamSlot
                  dbName={m.home_team} isPlaceholder={homePH} resolved={homeResolved}
                  flag={m.home_flag} result={homeRes}
                  candidates={homeC?.teams}
                />
                {/* Away */}
                <TeamSlot
                  dbName={m.away_team} isPlaceholder={awayPH} resolved={awayResolved}
                  flag={m.away_flag} result={awayRes} noBorderBottom
                  candidates={awayC?.teams}
                />
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
