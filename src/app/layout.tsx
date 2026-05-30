import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: "Peddler's Predictor — World Cup 2026",
  description: "Predict World Cup results at The Peddler's Daughter and win a TV!",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="header-inner">
            <Link href="/">
              <Image
                src="/logo.avif"
                alt="The Peddler's Daughter"
                width={160}
                height={60}
                style={{ objectFit: 'contain', height: 48, width: 'auto' }}
                priority
              />
            </Link>
            <span className="header-tag">⚽ World Cup 2026</span>
          </div>
        </header>

        <main>{children}</main>

        <footer style={{
          borderTop: '1px solid #222',
          padding: '24px 16px 40px',
          maxWidth: 480,
          margin: '0 auto',
          fontSize: 13,
          color: '#666'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
            <a href="https://www.thepeddlersdaughter.com/" target="_blank" rel="noopener noreferrer"
              style={{ color: '#888', textDecoration: 'none' }}>Website</a>
            <Link href="/rules" style={{ color: '#888', textDecoration: 'none' }}>Rules</Link>
            <Link href="/locations" style={{ color: '#888', textDecoration: 'none' }}>Locations</Link>
            <Link href="/schedule" style={{ color: '#888', textDecoration: 'none' }}>Schedule</Link>
          </div>
          <p style={{ textAlign: 'center', fontSize: 12 }}>
            © 2026 The Peddler&apos;s Daughter · Irish Restaurant &amp; Pub
          </p>
        </footer>
      </body>
    </html>
  )
}
