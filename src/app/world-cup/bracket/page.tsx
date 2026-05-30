'use client'
import { useEffect, useState } from 'react'
import { supabase, type Match } from '@/lib/supabase'
import { useLocale } from '@/lib/useLocale'
import Link from 'next/link'

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

function isPlaceholder(name: string) {
  return /\b(TBD|Winner|Runner-up|3rd Place|R32|QF|SF|Group)\b/i.test(name)
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

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  }

  // Auto-advance to the first stage that has any real teams or incomplete matches
  useEffect(() => {
    if (!matches.length) return
    const stageWithAction = KNOCKOUT_STAGES.find(stage => {
      const ms = matches.filter(m => m.stage === stage)
      return ms.some(m => !isPlaceholder(m.home_team) || m.result)
    })
    if (stageWithAction) setActiveStage(stageWithAction)
  }, [matches])

  const staged = matches.filter(m => m.stage === activeStage)

  // Determine how many stages actually have at least one match in the DB
  const availableStages = KNOCKOUT_STAGES.filter(s => matches.some(m => m.stage === s))

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>
          World Cup 2026
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
          <p className="muted">No matches found for this round.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {staged.map((m, i) => {
          const homePH  = isPlaceholder(m.home_team)
          const awayPH  = isPlaceholder(m.away_team)
          const done    = !!m.result
          const homeRes = resultLabel(m, 'home')
          const awayRes = resultLabel(m, 'away')

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
              {/* Match number label */}
              <div style={{
                padding: '6px 14px',
                background: 'var(--surface2)',
                borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Match {i + 1}
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
                  opacity: homePH ? 0.45 : 1,
                }}>
                  <span style={{ fontSize: 22, lineHeight: 1, width: 28, textAlign: 'center', flexShrink: 0 }}>
                    {homePH ? '🏳' : m.home_flag}
                  </span>
                  <span style={{
                    flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15,
                    color: homeRes === 'W' ? 'var(--green)' : homeRes === 'L' ? 'var(--text-muted)' : 'var(--text)',
                  }}>
                    {homePH ? t.tbd : m.home_team}
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
                  opacity: awayPH ? 0.45 : 1,
                }}>
                  <span style={{ fontSize: 22, lineHeight: 1, width: 28, textAlign: 'center', flexShrink: 0 }}>
                    {awayPH ? '🏳' : m.away_flag}
                  </span>
                  <span style={{
                    flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15,
                    color: awayRes === 'W' ? 'var(--green)' : awayRes === 'L' ? 'var(--text-muted)' : 'var(--text)',
                  }}>
                    {awayPH ? t.tbd : m.away_team}
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
