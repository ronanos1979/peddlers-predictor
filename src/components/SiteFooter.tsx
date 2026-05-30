'use client'
import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'

const FB_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

export default function SiteFooter() {
  const { t } = useLocale()
  const linkStyle = {
    color: 'var(--text-dim)' as const,
    textDecoration: 'none' as const,
    fontSize: 12,
    fontFamily: 'var(--font-cond)',
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  }
  return (
    <footer style={{ borderTop: '1px solid #1a1a1a', padding: '24px 16px 40px', maxWidth: 480, margin: '0 auto', position: 'relative', zIndex: 1 }}>

      {/* Facebook + website row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { href: 'https://www.facebook.com/peddlershaverhill/', label: 'Facebook · Haverhill', fb: true },
          { href: 'https://www.facebook.com/pg/PeddlersNashua/', label: 'Facebook · Nashua', fb: true },
          { href: 'https://www.thepeddlersdaughter.com/', label: '🌐 Website', fb: false },
        ].map(({ href, label, fb }) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid #222', borderRadius: 6, color: 'var(--text-dim)', textDecoration: 'none', fontSize: 11, fontFamily: 'var(--font-cond)', fontWeight: 700 }}>
            {fb && FB_ICON}
            {label}
          </a>
        ))}
      </div>

      {/* Nav links */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { href: '/rules', label: t.rules },
          { href: '/locations', label: t.locations },
          { href: '/schedule', label: t.schedule },
          { href: '/world-cup/standings', label: t.standings },
          { href: '/world-cup/results', label: t.results },
          { href: '/world-cup/scorers', label: t.scorers },
        ].map(({ href, label }) => (
          <Link key={label} href={href} style={linkStyle}>{label}</Link>
        ))}
      </div>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', letterSpacing: 0.5 }}>
        {t.footerLine}
      </p>
    </footer>
  )
}
