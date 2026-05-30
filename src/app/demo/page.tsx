'use client'
import { useEffect, useState } from 'react'
import { type Match } from '@/lib/supabase'
import EntryForm from '@/components/EntryForm'
import { useLocale } from '@/lib/useLocale'
import Link from 'next/link'

export default function DemoPage({ searchParams }: { searchParams: { pub?: string } }) {
  const { t } = useLocale()
  const pubId = searchParams.pub || 'haverhill'
  const [demoMatch, setDemoMatch] = useState<Match | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setError('')
      try {
        const res = await fetch('/api/demo-match', { cache: 'no-store' })
        const match = await res.json()
        if (!res.ok) {
          setError(match.error || t.couldNotLoadDemo)
          return
        }
        setDemoMatch(match)
      } catch {
        setError(t.couldNotLoadDemoRetry)
      }
    }
    load()
  }, [t.couldNotLoadDemo, t.couldNotLoadDemoRetry])

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <p className="muted" style={{ marginBottom: 4 }}>{t.demoModeShort}</p>
        <h1>{t.tryItOut}</h1>
        <p className="muted">
          {t.demoPageSub}
        </p>
      </div>

      {demoMatch ? (
        <EntryForm pubId={pubId} match={demoMatch} pub={null} isDemo={true} />
      ) : error ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted">{error}</p>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted">{t.loadingDemo}</p>
        </div>
      )}

      <Link href={`/?pub=${pubId}`} className="btn btn-secondary"
        style={{ textDecoration: 'none', display: 'block', textAlign: 'center', marginTop: 12 }}>
        ← {t.backToPredictions}
      </Link>
    </div>
  )
}
