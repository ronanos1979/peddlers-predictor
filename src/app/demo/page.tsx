'use client'
import { useEffect, useState } from 'react'
import { supabase, type Match, type Pub } from '@/lib/supabase'
import EntryForm from '@/components/EntryForm'
import Link from 'next/link'

export default function DemoPage({ searchParams }: { searchParams: { pub?: string } }) {
  const pubId = searchParams.pub || 'haverhill'
  const [pub, setPub] = useState<Pub | null>(null)
  const [demoMatch, setDemoMatch] = useState<Match | null>(null)

  useEffect(() => {
    async function load() {
      const { data: pubData } = await supabase.from('pubs').select('*').eq('id', pubId).single()
      if (pubData) setPub(pubData)

      const { data: match } = await supabase
        .from('matches')
        .select('*')
        .eq('stage', 'Demo Match')
        .single()

      if (match) {
        // Make the demo match always open by overriding close time in memory
        const alwaysOpen = {
          ...match,
          kickoff_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          entries_close_at: new Date(Date.now() + 100 * 60 * 1000).toISOString(),
        }
        setDemoMatch(alwaysOpen)
      }
    }
    load()
  }, [pubId])

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
        <EntryForm pubId={pubId} match={demoMatch} pub={pub} isDemo={true} />
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
