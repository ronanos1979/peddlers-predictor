import type { Metadata, Viewport } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import LangSwitcher from '@/components/LangSwitcher'
import SiteFooter from '@/components/SiteFooter'
import './globals.css'

export const metadata: Metadata = {
  title: "Peddler's Predictor — World Cup 2026",
  description: "Predict World Cup results at The Peddler's Daughter and win a TV!",
}

export const viewport: Viewport = {
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

        <SiteFooter />
      </body>
    </html>
  )
}
