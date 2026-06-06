import type { Metadata, Viewport } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import LangSwitcher from '@/components/LangSwitcher'
import HeaderLocation from '@/components/HeaderLocation'
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
            <HeaderLocation />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LangSwitcher />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://www.fifplay.com/img/public/fifa-world-cup-2026-logo.png"
                alt="FIFA World Cup 2026"
                style={{ height: 30, width: 'auto', objectFit: 'contain' }}
              />
            </div>
          </div>
        </header>

        <main>{children}</main>

        <SiteFooter />
      </body>
    </html>
  )
}
