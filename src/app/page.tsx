'use client'
import { useEffect, useState } from 'react'
import { supabase, type Match, type Pub } from '@/lib/supabase'
import EntryForm from '@/components/EntryForm'
import Link from 'next/link'

export default function Home({ searchParams }: { searchParams: { pub?: string } }) {
  const pubId = searchParams.pub || 'haverhill'
  const [pub, setPub] = useState<Pub | null>(null)
  const [match, setMatch] = useState<Match | null>(null)
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: pubData } = await supabase.from('pubs').select('*').eq('id', pubId).single()
      if (pubData) setPub(pubData)

      const now = new Date()
      const windowStart = new Date(now.getTime() - 110 * 60 * 1000) // 110 min ago (covers full match)
      const windowEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000) // 3 hours ahead

      const { data: matches } = await supabase
        .from('matches')
        .select('*')
        .gte('kickoff_at', windowStart.toISOString())
        .lte('kickoff_at', windowEnd.toISOString())
        .neq('stage', 'Demo Match')
        .order('kickoff_at', { ascending: true })

      if (matches && matches.length > 0) {
        const live = matches.find((m: Match) =>
          new Date(m.kickoff_at) <= now && new Date(m.entries_close_at) >= now
        )
        const upcoming = matches.find((m: Match) => new Date(m.kickoff_at) > now)
        if (live) setMatch(live)
        else if (upcoming) setUpcomingMatch(upcoming)
      }
      setLoading(false)
    }
    load()
  }, [pubId])

  function formatKickoff(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    })
  }
  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    })
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <p className="muted" style={{ marginBottom: 4 }}>📍 {pub?.city || '...'}</p>
        <h1>Make your pick</h1>
        <p className="muted">Predict World Cup results — top pickers win the TV draw!</p>
      </div>

      {loading && <p className="muted" style={{ textAlign: 'center', padding: 40 }}>Loading…</p>}

      {!loading && match && (
        <EntryForm pubId={pubId} match={match} pub={pub} />
      )}

      {!loading && !match && upcomingMatch && (
        <div className="card" style={{ textAlign: 'center' }}>
          <span className="badge badge-pending" style={{ marginBottom: 10, display: 'inline-block' }}>
            Coming up
          </span>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            {upcomingMatch.home_flag} {upcomingMatch.home_team} &nbsp;vs&nbsp; {upcomingMatch.away_flag} {upcomingMatch.away_team}
          </div>
          <p className="muted">{upcomingMatch.stage}</p>
          <p style={{ marginTop: 8, fontSize: 14 }}>
            {formatDate(upcomingMatch.kickoff_at)}<br />
            <strong>Kick-off: {formatKickoff(upcomingMatch.kickoff_at)}</strong>
          </p>
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            Predictions open at kick-off and close at the final whistle.
          </p>
        </div>
      )}

      {!loading && !match && !upcomingMatch && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>⚽</p>
          <h2 style={{ marginBottom: 8 }}>No matches right now</h2>
          <p className="muted" style={{ marginBottom: 16 }}>Check the schedule for upcoming matches.</p>
          <Link href={`/demo?pub=${pubId}`} className="btn btn-primary"
            style={{ textDecoration: 'none', display: 'block', marginBottom: 8 }}>
            Try a demo prediction
          </Link>
        </div>
      )}

      {/* Nav links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        <Link href={`/schedule?pub=${pubId}`} className="btn btn-secondary"
          style={{ textDecoration: 'none', textAlign: 'center' }}>
          📅 Full match schedule
        </Link>
        <Link href={`/leaderboard?pub=${pubId}`} className="btn btn-secondary"
          style={{ textDecoration: 'none', textAlign: 'center' }}>
          🏆 Leaderboard
        </Link>
        <Link href="/my-picks" className="btn btn-secondary"
          style={{ textDecoration: 'none', textAlign: 'center' }}>
          👤 My picks
        </Link>
        <Link href={`/demo?pub=${pubId}`} className="btn btn-secondary"
          style={{ textDecoration: 'none', textAlign: 'center' }}>
          🎮 Try a demo
        </Link>
      </div>
    </div>
  )
}
