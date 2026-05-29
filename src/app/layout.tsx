import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: "Peddler's Predictor — World Cup",
  description: "Predict match results at The Peddler's Daughter and win a TV!",
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
                style={{ objectFit: 'contain', height: 52, width: 'auto' }}
                priority
              />
            </Link>
            <span className="header-tag">⚽ World Cup Predictor</span>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
