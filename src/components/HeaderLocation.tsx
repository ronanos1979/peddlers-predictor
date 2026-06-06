'use client'
import { Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { PUB_DATA } from '@/lib/pubData'
import { savePubPref } from '@/lib/patron'

function PubSwitcher() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const pubId = params.get('pub')

  if (!pubId || !PUB_DATA[pubId]) return null

  function switchPub(id: string) {
    savePubPref(id)
    router.replace(`${pathname}?pub=${id}`, { scroll: false })
  }

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {(['haverhill', 'nashua'] as const).map(id => {
        const active = id === pubId
        return (
          <button
            key={id}
            onClick={() => !active && switchPub(id)}
            style={{
              background: active ? 'rgba(0,200,122,0.12)' : 'none',
              border: active ? '1px solid rgba(0,200,122,0.3)' : '1px solid transparent',
              borderRadius: 6,
              cursor: active ? 'default' : 'pointer',
              fontFamily: 'var(--font-cond)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.3,
              color: active ? 'var(--green)' : 'var(--text-muted)',
              padding: '3px 8px',
              opacity: active ? 1 : 0.55,
              whiteSpace: 'nowrap',
            }}
          >
            {active ? '📍 ' : ''}{PUB_DATA[id].city}
          </button>
        )
      })}
    </div>
  )
}

export default function HeaderLocation() {
  return <Suspense fallback={null}><PubSwitcher /></Suspense>
}
