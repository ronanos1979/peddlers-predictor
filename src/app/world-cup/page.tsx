'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'
import { supabase, type Match } from '@/lib/supabase'
import Flag from '@/components/Flag'

type GroupedMatches = Record<string, Match[]>

export default function WorldCupHub() {
  const { t } = useLocale()
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('matches')
        .select('*')
        .neq('stage', 'Demo Match')
        .order('kickoff_at', { ascending: true })
      setMatches((data as Match[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  const norm = filter.toLowerCase().trim()

  const filtered = useMemo(() => {
    if (!norm) return matches
    return matches.filter(m =>
      m.home_team.toLowerCase().includes(norm) ||
      m.away_team.toLowerCase().includes(norm) ||
      (m.venue || '').toLowerCase().includes(norm) ||
      m.stage.toLowerCase().includes(norm)
    )
  }, [matches, norm])

  const grouped = useMemo(() => {
    const g: GroupedMatches = {}
    filtered.forEach(m => {
      const date = new Date(m.kickoff_at).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      })
      if (!g[date]) g[date] = []
      g[date].push(m)
    })
    return g
  }, [filtered])

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })
  }

  function getStatus(m: Match) {
    const now = new Date()
    const kickoff = new Date(m.kickoff_at)
    const close   = new Date(m.entries_close_at)
    if (m.result) return 'done'
    if (now >= kickoff && now <= close) return 'live'
    if (now < kickoff) return 'upcoming'
    return 'closed'
  }

  function statusBadge(m: Match) {
    const s = getStatus(m)
    if (s === 'live') return <span className="badge badge-live">● {t.entriesOpen}</span>
    if (s === 'done') return (
      <span className="badge" style={{ background: 'var(--gray-border)', color: 'var(--text-muted)' }}>
        {m.result === 'home' ? t.teamWon.replace('{team}', m.home_team) :
         m.result === 'away' ? t.teamWon.replace('{team}', m.away_team) : t.draw}
      </span>
    )
    if (s === 'closed') return <span className="badge badge-closed">{t.closed}</span>
    return null
  }

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const sections = [
    { href: '/world-cup/groups',      icon: '🗂️', label: t.groupsNavLabel,     desc: t.groupsNavDesc },
    { href: '/world-cup/standings',   icon: '📊', label: t.standings,           desc: t.standingsSub },
    { href: '/world-cup/bracket',     icon: '🏆', label: t.bracket,             desc: t.bracketSub },
    { href: '/world-cup/results',     icon: '⚽', label: t.results,             desc: t.resultsSub },
    { href: '/world-cup/scorers',     icon: '🥇', label: t.scorers,             desc: t.scorersSub },
    { href: '/world-cup/team',        icon: '⭐', label: t.myTeam,              desc: t.teamInfo },
    { href: '/world-cup/winner-pick',   icon: '🏆', label: t.pickChampionLabel,          desc: t.pickChampionDesc },
    { href: '/world-cup/winner-picks',  icon: '📊', label: t.communityPicksLabel,         desc: t.communityPicksDesc },
    { href: '/world-cup/top-scorer-pick', icon: '🎯', label: t.pickTopScorer,             desc: t.topScorerBonus },
    { href: '/world-cup/scorer-picks',  icon: '📈', label: t.goldenBootCommunityNavLabel, desc: t.goldenBootCommunityNavDesc },
  ]

  return (
    <div className="container">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>
          {t.fifaWC2026}
        </div>
        <h1>{t.worldCupHub}</h1>
        <p className="muted">{t.worldCupHubSub}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 32 }}>
        {sections.map(({ href, icon, label, desc }) => (
          <Link key={href} href={href} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 16px',
            textDecoration: 'none',
            color: 'var(--text)',
            display: 'block',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(0,200,122,0.5)'; (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,200,122,0.05)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface)' }}
          >
            <div style={{ fontSize: 30, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 15, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
          </Link>
        ))}
      </div>

      {/* All 104 matches */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>
          {t.matchSchedule}
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>{t.scheduleSub}</p>
      </div>

      <div style={{ position: 'relative', marginBottom: 20 }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={t.filterPlaceholder}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '11px 40px 11px 40px',
            color: 'var(--text)', fontSize: 15, fontFamily: 'var(--font-body)',
          }}
        />
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
        {filter && (
          <button
            onClick={() => setFilter('')}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >×</button>
        )}
      </div>

      {norm && !loading && (
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: filtered.length ? 'var(--green)' : 'var(--text-muted)', marginBottom: 16 }}>
          {t.matchesFound.replace('{count}', String(filtered.length)).replace('{matches}', filtered.length === 1 ? t.matchSingular : t.matchPlural)}
        </div>
      )}

      {loading && <p className="muted" style={{ textAlign: 'center', padding: 40 }}>{t.loading}</p>}

      {!loading && filtered.length === 0 && norm && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <p className="muted">{t.noMatchesFound.replace('{filter}', filter)}</p>
          <button onClick={() => setFilter('')} className="btn btn-secondary" style={{ marginTop: 12, display: 'inline-block' }}>
            {t.clearFilter}
          </button>
        </div>
      )}

      {Object.entries(grouped).map(([date, dayMatches]) => (
        <div key={date} style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 1,
            marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {date}
            {date === todayLabel && (
              <span style={{ background: 'var(--green)', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                {t.today}
              </span>
            )}
          </div>

          {dayMatches.map(m => (
            <div key={m.id} style={{
              background: 'var(--surface)',
              border: `1px solid ${getStatus(m) === 'live' ? 'var(--green)' : 'var(--border)'}`,
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>
                    <Link href={`/world-cup/team?name=${encodeURIComponent(m.home_team)}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <Flag emoji={m.home_flag} size={20} style={{ marginRight: 5 }} /> {m.home_team}
                    </Link>
                    {' '}vs{' '}
                    <Link href={`/world-cup/team?name=${encodeURIComponent(m.away_team)}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <Flag emoji={m.away_flag} size={20} style={{ marginRight: 5 }} /> {m.away_team}
                    </Link>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {m.stage} · {fmtTime(m.kickoff_at)}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {statusBadge(m)}
                </div>
              </div>

              {m.venue ? (
                <div style={{
                  marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--font-cond)', fontSize: 12,
                  color: norm && m.venue.toLowerCase().includes(norm) ? 'var(--green)' : 'var(--text-muted)',
                }}>
                  <span>📍</span>
                  <span>{m.venue}</span>
                </div>
              ) : (
                <div style={{ marginTop: 8, fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--border)', letterSpacing: 0.5 }}>
                  {t.venueTba}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 8, display: 'block' }}>
        ← {t.home}
      </Link>
    </div>
  )
}
