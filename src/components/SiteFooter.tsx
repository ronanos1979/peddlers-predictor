'use client'
import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'

export default function SiteFooter() {
  const { t } = useLocale()
  return (
    <footer style={{ borderTop: '1px solid #1a1a1a', padding: '24px 16px 40px', maxWidth: 480, margin: '0 auto', position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { href: 'https://www.thepeddlersdaughter.com/', label: t.website, external: true },
          { href: '/rules', label: t.rules, external: false },
          { href: '/locations', label: t.locations, external: false },
          { href: '/schedule', label: t.schedule, external: false },
          { href: '/world-cup/standings', label: t.standings, external: false },
          { href: '/world-cup/results', label: t.results, external: false },
          { href: '/world-cup/scorers', label: t.scorers, external: false },
        ].map(({ href, label, external }) =>
          external ? (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: 12, fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {label}
            </a>
          ) : (
            <Link key={label} href={href}
              style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: 12, fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {label}
            </Link>
          )
        )}
      </div>
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', letterSpacing: 0.5 }}>
        {t.footerLine}
      </p>
    </footer>
  )
}
