import { headers } from 'next/headers'
import Image from 'next/image'

export const metadata = {
  title: "Thanks for entering — The Peddler's Daughter",
}

export default async function DecommissionedPage() {
  const h = await headers()
  const raw = h.get('x-decommission-message')
  const message = raw
    ? decodeURIComponent(raw)
    : 'Thanks for entering. The winner will be announced soon.'

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '32px 20px',
      gap: 20,
    }}>
      <Image src="/logo.avif" alt="The Peddler's Daughter" width={180} height={68}
        style={{ objectFit: 'contain', height: 56, width: 'auto' }} priority />
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(22px, 5vw, 32px)',
        letterSpacing: 1,
        maxWidth: 560,
        lineHeight: 1.3,
        margin: 0,
      }}>
        {message}
      </p>
    </div>
  )
}
