'use client'
import { useEffect, useState } from 'react'
import { type Match } from '@/lib/supabase'
import EntryForm from '@/components/EntryForm'
import Link from 'next/link'

export default function DemoPage({ searchParams }: { searchParams: { pub?: string } }) {
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
          setError(match.error || 'Could not load demo.')
          return
        }
        setDemoMatch(match)
      } catch {
        setError('Could not load demo. Please try again.')
      }
    }
    load()
  }, [])

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <p className="muted" style={{ marginBottom: 4 }}>🎮 Demo mode</p>
        <h1>Try it out</h1>
        <p className="muted">
          See how predictions work before the tournament starts on June 11.
          Demo entries don&apos;t count toward the real leaderboard.
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
          <p className="muted">Loading demo…</p>
        </div>
      )}

      <Link href={`/?pub=${pubId}`} className="btn btn-secondary"
        style={{ textDecoration: 'none', display: 'block', textAlign: 'center', marginTop: 12 }}>
        ← Back to real predictions
      </Link>
    </div>
  )
}
