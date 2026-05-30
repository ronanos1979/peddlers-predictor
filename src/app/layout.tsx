import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import LangSwitcher from '@/components/LangSwitcher'
import './globals.css'

export const metadata: Metadata = {
  title: "Peddler's Predictor — World Cup 2026",
  description: "Predict World Cup results at The Peddler's Daughter and win a TV!",
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="header-inner">
            <Link href="/">
              <Image src="/logo.avif" alt="The Peddler's Daughter" width={160} height={60}
                style={{ objectFit: 'contain', height: 44, width: 'auto' }} priority />
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LangSwitcher />
              <span className="header-tag">⚽ 2026</span>
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer style={{ borderTop: '1px solid #1a1a1a', padding: '24px 16px 40px', maxWidth: 480, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { href: 'https://www.thepeddlersdaughter.com/', label: 'Website', external: true },
              { href: '/rules', label: 'Rules', external: false },
              { href: '/locations', label: 'Locations', external: false },
              { href: '/schedule', label: 'Schedule', external: false },
              { href: '/world-cup/standings', label: 'Standings', external: false },
              { href: '/world-cup/results', label: 'Results', external: false },
              { href: '/world-cup/scorers', label: 'Scorers', external: false },
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
            © 2026 The Peddler&apos;s Daughter · Irish Restaurant &amp; Pub · Haverhill MA &amp; Nashua NH
          </p>
        </footer>
      </body>
    </html>
  )
}
