'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, type Match, type Pub } from '@/lib/supabase'
import { distanceMetres, getPosition } from '@/lib/geo'
import { getDailyCode } from '@/lib/matchSchedule'
import Link from 'next/link'

type Props = { pubId: string; match: Match; pub: Pub | null; isDemo?: boolean }

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
  const [shared, setShared] = useState(false)
  const dailyCode = getDailyCode()

  useEffect(() => {
    if (isDemo) { setTimeLeft(''); return }
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

  const checkGeo = useCallback(async () => {
    if (!pub || isDemo) { setGeoStatus('ok'); setGeoMessage('📍 Demo mode — no location check'); return }
    try {
      const pos = await getPosition()
      const dist = distanceMetres(pos.coords.latitude, pos.coords.longitude, pub.lat, pub.lng)
      if (dist <= pub.radius_m) {
        setGeoStatus('ok')
        setGeoMessage(`📍 Location verified — ${pub.city}`)
      } else {
        setGeoStatus('fail')
        setGeoMessage(`Must be inside the pub to enter (${Math.round(dist)}m away)`)
      }
    } catch {
      setGeoStatus('ok')
      setGeoMessage('📍 Pub code required to verify location')
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
        body: JSON.stringify({ pub_id: pubId, match_id: match.id, name, phone, pick, email: email || null, code: dailyCode, is_demo: isDemo })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); setSubmitting(false); return }
      setSubmitted(true)
    } catch {
      setError('Network error — please try again')
      setSubmitting(false)
    }
  }

  function pickLabel(p: string | null) {
    if (p === 'home') return `${match.home_flag} ${match.home_team} to win`
    if (p === 'away') return `${match.away_flag} ${match.away_team} to win`
    return 'A Draw'
  }

  async function handleShare() {
    const text = `I just predicted ${pickLabel(pick)} in ${match.home_flag} ${match.home_team} vs ${match.away_flag} ${match.away_team} at The Peddler's Daughter World Cup Predictor! ⚽🍺 Can you beat me? peddlers-predictor.vercel.app`
    try {
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(text)
        setShared(true)
        setTimeout(() => setShared(false), 2500)
      }
    } catch { /* ignore */ }
  }

  if (submitted) {
    const correct = match.result === pick
    const isScored = match.result !== null
    return (
      <div style={{ textAlign: 'center' }}>
        <div className="pop-in" style={{ fontSize: 64, marginBottom: 8, display: 'block' }}>
          {isDemo ? '🎮' : '✅'}
        </div>
        <div className="slide-up">
          <h1 style={{ marginBottom: 6 }}>
            {isDemo ? 'Demo done!' : "You're in!"}
          </h1>
          <p className="muted" style={{ marginBottom: 20 }}>
            {isDemo ? 'That\'s how it works — real picks start June 11!' : 'Your prediction has been locked in.'}
          </p>
        </div>

        <div className="slide-up-delay card card-glow" style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>
            Your prediction
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: 1, marginBottom: 4 }}>
            {match.home_flag} {match.home_team} vs {match.away_flag} {match.away_team}
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 18, color: 'var(--green)', marginBottom: 4 }}>
            {pickLabel(pick)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{match.stage}</div>
        </div>

        {!isDemo && (
          <div className="slide-up-delay-2" style={{ marginBottom: 14 }}>
            <div className="card" style={{ background: 'linear-gradient(135deg, #0d1a0d, #111)', border: '1px solid rgba(245,197,24,0.2)', padding: '14px 16px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', letterSpacing: 2 }}>+3</div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Raffle entries if correct
              </div>
            </div>
          </div>
        )}

        <div className="slide-up-delay-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!isDemo && (
            <button className="share-btn" onClick={handleShare}>
              {shared ? '✓ Copied to clipboard!' : '↑ Share your prediction'}
            </button>
          )}
          {!isDemo && (
            <Link href={`/my-picks?phone=${encodeURIComponent(phone)}`}
              className="btn btn-primary" style={{ textDecoration: 'none' }}>
              View my picks
            </Link>
          )}
          <Link href={`/leaderboard?pub=${pubId}`}
            className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
            🏆 See the leaderboard
          </Link>
          {isDemo && (
            <Link href={`/?pub=${pubId}`}
              className="btn btn-gold" style={{ textDecoration: 'none', marginTop: 4 }}>
              Make a real prediction →
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="match-hero">
        {isDemo && (
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 8 }}>
            Demo Match
          </div>
        )}
        <span className={`badge ${isClosed ? 'badge-closed' : 'badge-live'}`} style={{ marginBottom: 12, display: 'inline-flex' }}>
          <span>{isClosed ? '✕' : '●'}</span>
          {isClosed ? 'Entries Closed' : 'Entries Open'}
        </span>
        <div className="match-teams-display">
          <div>{match.home_flag} {match.home_team}</div>
          <div className="vs-divider" style={{ fontSize: 14, margin: '4px 0' }}>vs</div>
          <div>{match.away_flag} {match.away_team}</div>
        </div>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>
          {match.stage}
          {!isDemo && timeLeft && !isClosed && (
            <span style={{ color: 'var(--green)', marginLeft: 8 }}>· {timeLeft} remaining</span>
          )}
        </div>
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
              <input value={name} onChange={e => setName(e.target.value)} placeholder="First name + last initial" />
            </div>
            <div className="field">
              <label>Phone number <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(for raffle contact)</span></label>
              <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" placeholder="+1 (555) 000-0000" />
            </div>
            <div className="field">
              <label>Email <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — match updates)</span></label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" />
            </div>

            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
              Your prediction
            </div>
            <div className="pick-grid">
              {(['home', 'draw', 'away'] as const).map(p => (
                <button key={p} className={`pick-btn ${pick === p ? 'selected' : ''}`} onClick={() => setPick(p)}>
                  <div className="pick-label">{p === 'home' ? 'Home' : p === 'draw' ? 'Draw' : 'Away'}</div>
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
              {submitting ? 'Submitting…' : isDemo ? 'Submit Demo Pick' : 'Lock In My Prediction'}
            </button>
          </div>
        </>
      )}
    </>
  )
}
