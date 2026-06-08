'use client'
import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'

export default function WorldCupHub() {
  const { t } = useLocale()

  const sections = [
    { href: '/world-cup/groups', icon: '🗂️', label: t.groupsNavLabel, desc: t.groupsNavDesc },
    { href: '/world-cup/standings', icon: '📊', label: t.standings, desc: 'Live group tables' },
    { href: '/world-cup/bracket', icon: '🏆', label: t.bracket, desc: 'Full knockout draw' },
    { href: '/world-cup/results', icon: '⚽', label: t.results, desc: 'Completed matches' },
    { href: '/world-cup/scorers', icon: '🥇', label: t.scorers, desc: 'Golden Boot race' },
    { href: '/world-cup/team', icon: '⭐', label: t.myTeam, desc: 'Squad, manager, fixtures' },
    { href: '/world-cup/winner-pick', icon: '🏆', label: t.pickChampionLabel, desc: t.pickChampionDesc },
    { href: '/world-cup/winner-picks', icon: '📊', label: t.communityPicksLabel, desc: t.communityPicksDesc },
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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

      <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 20, display: 'block' }}>
        ← {t.home}
      </Link>
    </div>
  )
}
