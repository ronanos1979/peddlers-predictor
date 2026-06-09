'use client'
import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useLocale } from '@/lib/useLocale'

function BreadcrumbInner() {
  const { t } = useLocale()
  const pathname = usePathname()
  const params = useSearchParams()
  const pub = params.get('pub')
  const pubSuffix = pub ? `?pub=${pub}` : ''

  // No breadcrumbs on home or admin
  if (pathname === '/' || pathname.startsWith('/admin')) return null

  const segments = pathname.split('/').filter(Boolean)

  const labelMap: Record<string, string> = {
    'leaderboard':      t.leaderboard,
    'schedule':         t.schedule,
    'rules':            t.rules,
    'my-picks':         t.myPicks,
    'overall-picks':    t.overallPicks,
    'locations':        t.locations,
    'feedback':         t.crumbFeedback,
    'demo':             t.crumbDemo,
    'world-cup':        t.worldCup,
    'groups':           t.groupsNavLabel,
    'standings':        t.standings,
    'results':          t.results,
    'scorers':          t.scorers,
    'bracket':          t.bracket,
    'team':             t.crumbTeam,
    'top-scorer-pick':  t.goldenBoot,
    'winner-pick':      t.crumbWinnerPick,
    'winner-picks':     t.crumbWinnerPicks,
    'how-to-qualify':   t.howToQualifyHubLabel,
  }

  const crumbs = [
    { label: t.home, href: `/${pubSuffix}` },
    ...segments.map((seg, i) => ({
      label: labelMap[seg] ?? seg,
      href: '/' + segments.slice(0, i + 1).join('/') + pubSuffix,
    })),
  ]

  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.05)',
      background: 'rgba(0,0,0,0.25)',
    }}>
      <div style={{
        maxWidth: 480, margin: '0 auto', padding: '5px 16px',
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      }}>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <span key={`${crumb.href}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {i > 0 && (
                <span style={{
                  color: 'var(--text-muted)', fontSize: 10, opacity: 0.4,
                  padding: '0 2px',
                }}>›</span>
              )}
              {isLast ? (
                <span style={{
                  fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700,
                  letterSpacing: 0.5, color: 'var(--text)', textTransform: 'uppercase',
                  padding: '0 2px',
                }}>
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} style={{
                  fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700,
                  letterSpacing: 0.5, color: 'var(--text-muted)', textDecoration: 'none',
                  textTransform: 'uppercase', padding: '0 2px',
                }}>
                  {crumb.label}
                </Link>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function Breadcrumb() {
  return <Suspense fallback={null}><BreadcrumbInner /></Suspense>
}
