'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PUB_DATA } from '@/lib/pubData'

function LocationBadge() {
  const params = useSearchParams()
  const pubId = params.get('pub')
  if (!pubId || !PUB_DATA[pubId]) return null
  return (
    <span style={{
      fontFamily: 'var(--font-cond)',
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--green)',
      letterSpacing: 0.5,
      whiteSpace: 'nowrap',
    }}>
      📍 {PUB_DATA[pubId].city}
    </span>
  )
}

export default function HeaderLocation() {
  return <Suspense fallback={null}><LocationBadge /></Suspense>
}
