import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: "Peddler's Predictor — World Cup",
  description: "Predict match results at The Peddler's Daughter and win a TV!",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
