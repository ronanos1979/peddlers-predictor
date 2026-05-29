'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, type Match, type Pub } from '@/lib/supabase'
import { distanceMetres, getPosition } from '@/lib/geo'
import { getDailyCode } from '@/lib/matchSchedule'
import Link from 'next/link'

type GeoStatus = 'checking' | 'ok' | 'fail'

export default function Home({ searchParams }: { searchParams: { pub?: string } }) {
  const pubId = searchParams.pub || 'haverhill'

  const [pub, setPub] = useState<Pub | null>(null)
  const [match, setMatch] = useState<Match | null>(null)
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null)
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('checking')
  const [geoMessage, setGeoMessage] = useState('Checking your location…')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pick, setPick] = useState<'home' | 'draw' | 'away' | null>(null)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')
  const [dailyCode] = useState(() => getDailyCode())

  // Load pub + auto-select current match by datetime
  useEffect(() => {
    async function load() {
      const { data: pubData } = await supabase.from('pubs').select('*').eq('id', pubId).single()
      if (pubData) setPub(pubData)

      const now = new Date()
      const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000) // 2 hours ago
      const windowEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000)   // 3 hours ahead

      // Get matches in a ±window around now, ordered by kickoff
      const { data: matches } = await supabase
        .from('matches')
        .select('*')
        .gte('kickoff_at', windowStart.toISOString())
        .lte('kickoff_at', windowEnd.toISOString())
        .order('kickoff_at', { ascending: true })

      if (matches && matches.length > 0) {
        // Find a match that's currently open for entries
        const live = matches.find((m: Match) =>
          new Date(m.kickoff_at) <= now &&
          new Date(m.entries_close_at) >= now
        )
        // Or the next upcoming one
        const upcoming = matches.find((m: Match) => new Date(m.kickoff_at) > now)

        if (live) {
          setMatch(live)
        } else if (upcoming) {
          setUpcomingMatch(upcoming)
        }
      }
    }
    load()
  }, [pubId])

  // Countdown timer
  useEffect(() => {
    if (!match) return
    const tick = () => {
      const diff = new Date(match.entries_close_at).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('Closed'); return }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [match])

  // Geolocation check
  const checkGeo = useCallback(async () => {
    if (!pub) return
    try {
      const pos = await getPosition()
      const dist = distanceMetres(pos.coords.latitude, pos.coords.longitude, pub.lat, pub.lng)
      if (dist <= pub.radius_m) {
        setGeoStatus('ok')
        setGeoMessage(`📍 Location verified — ${pub.name}, ${pub.city}`)
      } else {
        setGeoStatus('fail')
        setGeoMessage(`You must be inside the pub to enter (${Math.round(dist)}m away)`)
      }
    } catch {
      setGeoStatus('ok')
      setGeoMessage('📍 Location check skipped — pub code required')
    }
  }, [pub])

  useEffect(() => {
    if (pub) checkGeo()
  }, [pub, checkGeo])

  const isClosed = match ? new Date(match.entries_close_at) < new Date() : false
  const canSubmit = name && phone && pick && geoStatus !== 'fail' && !isClosed && !submitting

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pub_id: pubId,
          match_id: match?.id,
          name, phone, pick,
          code: dailyCode  // sent automatically — patron doesn't type it
        })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); setSubmitting(false); return }
      setSubmitted(true)
    } catch {
      setError('Network error — please try again')
      setSubmitting(false)
    }
  }

  // Format kickoff time nicely
  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    })
  }
  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    })
  }

  if (submitted && match) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', paddingTop: 32, paddingBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <h2>You&apos;re in!</h2>
          <p className="muted" style={{ marginBottom: 20 }}>Your prediction has been recorded.</p>
          <div className="card" style={{ background: 'var(--green-light)', border: '1px solid var(--green)' }}>
            <p style={{ fontSize: 14, color: 'var(--green-dark)' }}>
              <strong>{name}</strong><br />
              {match.home_flag} {match.home_team} vs {match.away_flag} {match.away_team}<br />
              Your pick: <strong>
                {pick === 'home' ? `${match.home_team} win` :
                 pick === 'away' ? `${match.away_team} win` : 'Draw'}
              </strong>
            </p>
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
            Every correct pick earns <strong>3 raffle entries</strong> toward the TV giveaway!
          </p>
          <Link href={`/leaderboard?pub=${pubId}`} className="btn btn-primary"
            style={{ textDecoration: 'none', display: 'block' }}>
            View leaderboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <p className="muted" style={{ marginBottom: 4 }}>📍 {pub?.city}</p>
        <h1>Make your pick</h1>
        <p className="muted">Predict the result — top pickers win the TV draw!</p>
      </div>

      {/* Active match — entries open */}
      {match && !isClosed && (
        <>
          <div className="card" style={{ textAlign: 'center' }}>
            <span className="badge badge-live" style={{ marginBottom: 10, display: 'inline-block' }}>
              ● Entries open
            </span>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
              {match.home_flag} {match.home_team} &nbsp;vs&nbsp; {match.away_flag} {match.away_team}
            </div>
            <p className="muted">{match.stage} · Closes in {timeLeft}</p>
          </div>

          <div className="geo-strip">
            <div className={`geo-dot ${geoStatus}`} />
            <span>{geoMessage}</span>
          </div>

          <div className="card">
            <div className="field">
              <label>Your name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="First name + last initial" />
            </div>
            <div className="field">
              <label>Phone number <span className="muted">(for raffle contact)</span></label>
              <input value={phone} onChange={e => setPhone(e.target.value)}
                type="tel" placeholder="+1 (555) 000-0000" />
            </div>

            <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
              Your prediction
            </label>
            <div className="pick-grid">
              {(['home', 'draw', 'away'] as const).map(p => (
                <button key={p} className={`pick-btn ${pick === p ? 'selected' : ''}`}
                  onClick={() => setPick(p)}>
                  <div className="pick-label">
                    {p === 'home' ? 'Home win' : p === 'draw' ? 'Draw' : 'Away win'}
                  </div>
                  <div className="pick-team">
                    {p === 'home' ? `${match.home_flag} ${match.home_team}` :
                     p === 'draw' ? '—' :
                     `${match.away_flag} ${match.away_team}`}
                  </div>
                </button>
              ))}
            </div>

            {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}
            <button className="btn btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? 'Submitting…' : 'Submit prediction'}
            </button>
          </div>
        </>
      )}

      {/* Upcoming match — entries not open yet */}
      {!match && upcomingMatch && (
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
            <strong>Kick-off: {formatTime(upcomingMatch.kickoff_at)}</strong>
          </p>
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            Predictions open at kick-off. Come back then!
          </p>
        </div>
      )}

      {/* No matches today */}
      {!match && !upcomingMatch && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>⚽</p>
          <p className="muted">No matches right now. Check back on the next match day!</p>
        </div>
      )}

      <Link href={`/leaderboard?pub=${pubId}`} className="btn btn-secondary"
        style={{ textDecoration: 'none', display: 'block', textAlign: 'center', marginTop: 12 }}>
        View leaderboard
      </Link>
    </div>
  )
}
