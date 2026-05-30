'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Match } from '@/lib/supabase'
import { PUB_DATA, type PubInfo } from '@/lib/pubData'
import EntryForm from '@/components/EntryForm'
import Link from 'next/link'

export default function Home({ searchParams }: { searchParams: { pub?: string } }) {
  const router = useRouter()
  const pubId = (searchParams.pub && PUB_DATA[searchParams.pub]) ? searchParams.pub : ''
  const [selectedPub, setSelectedPub] = useState<string>(pubId)
  const pub: PubInfo | null = selectedPub ? PUB_DATA[selectedPub] : null
  const [match, setMatch] = useState<Match | null>(null)
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(false)

  function choosePub(id: string) {
    setSelectedPub(id)
    setMatch(null)
    setUpcomingMatch(null)
    router.replace(`/?pub=${id}`, { scroll: false })
  }

  useEffect(() => {
    if (!selectedPub) return
    setLoading(true)
    async function load() {
      const now = new Date()
      const windowStart = new Date(now.getTime() - 110 * 60 * 1000)
      const windowEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000)

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
  }, [selectedPub])

  function formatKickoff(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  }
  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  return (
    <div className="container">

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '24px 0 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⚽</div>
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>World Cup Predictor</h1>
        <p className="muted">Pick the winner of every match. Top pickers win a TV!</p>
      </div>

      {/* Location selector */}
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'center' }}>
          Choose your location
        </p>
        <div className="loc-selector">
          <button className={`loc-btn ${selectedPub === 'haverhill' ? 'active' : ''}`}
            onClick={() => choosePub('haverhill')}>
            📍 Haverhill, MA
          </button>
          <button className={`loc-btn ${selectedPub === 'nashua' ? 'active' : ''}`}
            onClick={() => choosePub('nashua')}>
            📍 Nashua, NH
          </button>
        </div>
      </div>

      {/* No location chosen */}
      {!selectedPub && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>👆</p>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Select your pub above</p>
          <p className="muted">Choose Haverhill or Nashua to get started.</p>
        </div>
      )}

      {/* Loading */}
      {selectedPub && loading && (
        <p className="muted" style={{ textAlign: 'center', padding: 40 }}>Loading…</p>
      )}

      {/* Active match */}
      {selectedPub && !loading && match && pub && (
        <EntryForm pubId={selectedPub} match={match} pub={{
          id: pub.id, name: pub.name, city: `${pub.city}, ${pub.state}`,
          lat: pub.lat, lng: pub.lng, radius_m: pub.radius_m, daily_code: ''
        }} />
      )}

      {/* Upcoming match */}
      {selectedPub && !loading && !match && upcomingMatch && (
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
          <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            Predictions open at kick-off and close at the final whistle.
          </p>
        </div>
      )}

      {/* No match */}
      {selectedPub && !loading && !match && !upcomingMatch && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 10 }}>🏆</p>
          <p style={{ fontWeight: 500, marginBottom: 6 }}>No matches right now</p>
          <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
            Check the schedule for upcoming matches or try the demo.
          </p>
          <Link href={`/demo?pub=${selectedPub}`} className="btn btn-primary"
            style={{ textDecoration: 'none', display: 'block' }}>
            🎮 Try a demo prediction
          </Link>
        </div>
      )}

      {/* Nav grid */}
      <div className="nav-grid" style={{ marginTop: 20 }}>
        {[
          { href: `/schedule?pub=${selectedPub || 'haverhill'}`, icon: '📅', label: 'Full schedule' },
          { href: `/leaderboard?pub=${selectedPub || 'haverhill'}`, icon: '🏆', label: 'Leaderboard' },
          { href: '/my-picks', icon: '👤', label: 'My picks' },
          { href: '/rules', icon: '📋', label: 'Rules' },
          { href: `/demo?pub=${selectedPub || 'haverhill'}`, icon: '🎮', label: 'Try demo' },
          { href: '/locations', icon: '📍', label: 'Locations' },
        ].map(({ href, icon, label }) => (
          <Link key={href} href={href} className="nav-card">
            <div className="nav-card-icon">{icon}</div>
            <div className="nav-card-label">{label}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
