'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, type Match, type Pub } from '@/lib/supabase'
import { distanceMetres, getPosition } from '@/lib/geo'
import { getDailyCode } from '@/lib/matchSchedule'
import Link from 'next/link'

type Props = {
  pubId: string
  match: Match
  pub: Pub | null
  isDemo?: boolean
}

export default function EntryForm({ pubId, match, pub, isDemo = false }: Props) {
  const [geoStatus, setGeoStatus] = useState<'checking' | 'ok' | 'fail'>('checking')
  const [geoMessage, setGeoMessage] = useState('Checking your location…')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pick, setPick] = useState<'home' | 'draw' | 'away' | null>(null)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')
  const dailyCode = getDailyCode()

  // Countdown
  useEffect(() => {
    if (isDemo) { setTimeLeft('90:00'); return }
    const tick = () => {
      const diff = new Date(match.entries_close_at).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('Closed'); return }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [match, isDemo])

  // Geo
  const checkGeo = useCallback(async () => {
    if (!pub || isDemo) { setGeoStatus('ok'); setGeoMessage('📍 Demo mode — no location check'); return }
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
  }, [pub, isDemo])

  useEffect(() => { checkGeo() }, [checkGeo])

  const isClosed = !isDemo && new Date(match.entries_close_at) < new Date()
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
          match_id: match.id,
          name, phone, pick,
          email: email || null,
          code: dailyCode,
          is_demo: isDemo
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

  if (submitted) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
        <h2>{isDemo ? 'Demo entry recorded!' : "You're in!"}</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          {isDemo
            ? 'This is how it works — your real picks start June 11!'
            : 'Your prediction has been recorded.'}
        </p>
        <div style={{
          background: 'var(--green-light)', border: '1px solid var(--green)',
          borderRadius: 10, padding: '14px 16px', marginBottom: 16, fontSize: 14,
          color: 'var(--green-dark)'
        }}>
          <strong>{name}</strong><br />
          {match.home_flag} {match.home_team} vs {match.away_flag} {match.away_team}<br />
          Your pick: <strong>
            {pick === 'home' ? `${match.home_team} win` :
             pick === 'away' ? `${match.away_team} win` : 'Draw'}
          </strong>
        </div>
        {!isDemo && (
          <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
            Every correct pick earns <strong>3 raffle entries</strong> toward the TV giveaway!
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!isDemo && (
            <Link href={`/my-picks?phone=${encodeURIComponent(phone)}`}
              className="btn btn-primary" style={{ textDecoration: 'none' }}>
              View my picks
            </Link>
          )}
          <Link href={`/leaderboard?pub=${pubId}`}
            className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
            View leaderboard
          </Link>
          {isDemo && (
            <Link href={`/?pub=${pubId}`}
              className="btn btn-primary" style={{ textDecoration: 'none', marginTop: 4 }}>
              Go to real predictions →
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Match card */}
      <div className="card" style={{ textAlign: 'center' }}>
        {isDemo && (
          <div style={{
            background: 'var(--amber-light)', color: 'var(--amber)',
            borderRadius: 6, padding: '4px 10px', fontSize: 12,
            fontWeight: 600, display: 'inline-block', marginBottom: 10
          }}>
            DEMO — try it out!
          </div>
        )}
        <span className={`badge ${isClosed ? 'badge-closed' : 'badge-live'}`}
          style={{ marginBottom: 10, display: 'inline-block' }}>
          {isClosed ? 'Entries closed' : '● Entries open'}
        </span>
        <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>
          {match.home_flag} {match.home_team} &nbsp;vs&nbsp; {match.away_flag} {match.away_team}
        </div>
        <p className="muted">{match.stage}{!isDemo && ` · Closes in ${timeLeft}`}</p>
      </div>

      {!isClosed && (
        <>
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
            <div className="field">
              <label>
                Email address <span className="muted">(optional — for match updates)</span>
              </label>
              <input value={email} onChange={e => setEmail(e.target.value)}
                type="email" placeholder="you@example.com" />
            </div>

            <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
              Your prediction
            </label>
            <div className="pick-grid">
              {(['home', 'draw', 'away'] as const).map(p => (
                <button key={p}
                  className={`pick-btn ${pick === p ? 'selected' : ''}`}
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
              {submitting ? 'Submitting…' : isDemo ? 'Submit demo pick' : 'Submit prediction'}
            </button>
          </div>
        </>
      )}
    </>
  )
}
