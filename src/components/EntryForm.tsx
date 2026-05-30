'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, type Match, type Pub } from '@/lib/supabase'
import { distanceMetres, getPosition } from '@/lib/geo'
import { getDailyCode } from '@/lib/matchSchedule'
import { savePatron, loadPatron, firstName } from '@/lib/patron'
import { useLocale } from '@/lib/useLocale'
import { PUB_DATA } from '@/lib/pubData'
import Link from 'next/link'

type Props = { pubId: string; match: Match; pub: Pub | null; isDemo?: boolean }

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

function isValidPhone(raw: string): boolean {
  return normalizePhone(raw).length === 10
}

export default function EntryForm({ pubId, match, pub, isDemo = false }: Props) {
  const { t } = useLocale()
  const [geoStatus, setGeoStatus] = useState<'checking' | 'ok' | 'fail'>('checking')
  const [geoMessage, setGeoMessage] = useState(t.checkingLocation)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pick, setPick] = useState<'home' | 'draw' | 'away' | null>(null)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')
  const [shared, setShared] = useState(false)
  const [returningPatron, setReturningPatron] = useState<string | null>(null)
  const [nextMatch, setNextMatch] = useState<Match | null>(null)
  const dailyCode = getDailyCode()
  const pubInfo = PUB_DATA[pubId]

  // Load patron cookie on mount
  useEffect(() => {
    const patron = loadPatron()
    if (patron) {
      setName(patron.name)
      setPhone(patron.phone)
      setReturningPatron(firstName(patron.name))
    }
  }, [])

  // Countdown timer
  useEffect(() => {
    if (isDemo) { setTimeLeft(''); return }
    const tick = () => {
      const diff = new Date(match.entries_close_at).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft(t.entriesClosed); return }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [match, isDemo, t.entriesClosed])

  // Geolocation
  const checkGeo = useCallback(async () => {
    if (!pub || isDemo) {
      setGeoStatus('ok')
      setGeoMessage(t.demoMode)
      return
    }
    try {
      const pos = await getPosition()
      const dist = distanceMetres(pos.coords.latitude, pos.coords.longitude, pub.lat, pub.lng)
      if (dist <= pub.radius_m) {
        setGeoStatus('ok')
        setGeoMessage(`📍 ${t.locationVerified} - ${pub.city}`)
      } else {
        setGeoStatus('fail')
        setGeoMessage(t.locationDistanceFail.replace('{distance}', String(Math.round(dist))))
      }
    } catch {
      setGeoStatus('ok')
      setGeoMessage(t.pubCodeRequired)
    }
  }, [pub, isDemo, t.demoMode, t.locationVerified, t.locationDistanceFail, t.pubCodeRequired])

  useEffect(() => { checkGeo() }, [checkGeo])

  const isClosed = !isDemo && new Date(match.entries_close_at) < new Date()
  const phoneValid = isValidPhone(phone)
  const canSubmit = name && phone && phoneValid && pick && geoStatus !== 'fail' && !isClosed && !submitting

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pub_id: pubId, match_id: match.id,
          name, phone: normalizePhone(phone), pick,
          email: email || null,
          code: dailyCode,
          is_demo: isDemo
        })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || t.somethingWentWrong); setSubmitting(false); return }

      // Save patron cookie on successful entry
      if (!isDemo) {
        savePatron({ name, phone, pub_id: pubId })
      }

      if (!isDemo) {
        const { data: upcoming } = await supabase
          .from('matches')
          .select('*')
          .gt('kickoff_at', new Date().toISOString())
          .neq('id', match.id)
          .neq('stage', 'Demo Match')
          .order('kickoff_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (upcoming) setNextMatch(upcoming)
      }

      setSubmitted(true)
    } catch {
      setError(t.networkError)
      setSubmitting(false)
    }
  }

  function pickLabel(p: string | null) {
    if (p === 'home') return `${match.home_flag} ${t.homeTeamWin.replace('{team}', match.home_team)}`
    if (p === 'away') return `${match.away_flag} ${t.awayTeamWin.replace('{team}', match.away_team)}`
    return t.drawPick
  }

  async function handleShare() {
    const text = t.predictionShareText
      .replace('{pick}', pickLabel(pick))
      .replace('{home}', match.home_team)
      .replace('{away}', match.away_team)
      .replace('{url}', `https://peddlers-predictor.vercel.app/?pub=${pubId}`)
    try {
      if (navigator.share) await navigator.share({ text, url: `https://peddlers-predictor.vercel.app/?pub=${pubId}` })
      else {
        await navigator.clipboard.writeText(text)
        setShared(true)
        setTimeout(() => setShared(false), 2500)
      }
    } catch { /* ignore */ }
  }

  // Success screen
  if (submitted) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div className="pop-in" style={{ fontSize: 64, marginBottom: 8, display: 'block' }}>
          {isDemo ? '🎮' : '✅'}
        </div>
        <div className="slide-up">
          <h1 style={{ marginBottom: 6 }}>
            {isDemo ? t.youreDone : `${t.niceOne}${returningPatron ? '' : ', ' + firstName(name)}!`}
          </h1>
          <p className="muted" style={{ marginBottom: 20 }}>
            {isDemo
              ? t.demoSuccess
              : t.predictionLocked}
          </p>
        </div>

        <div className="slide-up-delay card card-glow" style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>
            {t.yourPredictionLabel}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: 1, marginBottom: 6 }}>
            {match.home_flag} {match.home_team} vs {match.away_flag} {match.away_team}
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 20, color: 'var(--green)', marginBottom: 4 }}>
            {pickLabel(pick)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{match.stage}</div>
        </div>

        {!isDemo && (
          <div className="slide-up-delay" style={{ marginBottom: 14 }}>
            <div className="card" style={{ background: 'linear-gradient(135deg, #1a1200, #111)', border: '1px solid rgba(245,197,24,0.25)', padding: '14px 16px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--gold)', letterSpacing: 2 }}>+3</div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {t.raffleEntriesIfCorrect}
              </div>
            </div>
          </div>
        )}

        {!isDemo && pubInfo && (
          <div className="slide-up-delay card" style={{ marginBottom: 14, textAlign: 'left' }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 8 }}>
              {t.nextPubVisit}
            </div>
            <h2 style={{ fontSize: 24, marginBottom: 6 }}>
              {t.comeWatchAt.replace('{city}', pubInfo.city)}
            </h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              {nextMatch
                ? t.nextChanceToPlay
                    .replace('{home}', nextMatch.home_team)
                    .replace('{away}', nextMatch.away_team)
                : t.bringFriendsBack}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <a href={pubInfo.mapsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center', paddingInline: 8 }}>
                {t.openMap}
              </a>
              <Link href={`/schedule?pub=${pubId}`} className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', paddingInline: 8 }}>
                {t.seeSchedule}
              </Link>
            </div>
          </div>
        )}

        <div className="slide-up-delay-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!isDemo && (
            <button className="share-btn" onClick={handleShare}>
              {shared ? t.copiedClipboard : t.sharePrediction}
            </button>
          )}
          {!isDemo && (
            <Link href={`/my-picks?phone=${encodeURIComponent(phone)}`}
              className="btn btn-primary" style={{ textDecoration: 'none' }}>
              {t.viewMyPicks}
            </Link>
          )}
          <Link href={`/leaderboard?pub=${pubId}`}
            className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
            {t.seeLeaderboard}
          </Link>
          {isDemo && (
            <Link href={`/?pub=${pubId}`}
              className="btn btn-gold" style={{ textDecoration: 'none', marginTop: 4 }}>
              {t.makeRealPrediction}
            </Link>
          )}
        </div>
      </div>
    )
  }

  // Entry form
  return (
    <>
      {/* Returning patron greeting */}
      {returningPatron && !isDemo && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(0,200,122,0.08)', border: '1px solid rgba(0,200,122,0.2)',
          borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 14
        }}>
          <div>
            <span style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, color: 'var(--green)' }}>
              {t.welcomeBack}, {returningPatron}! 👋
            </span>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              {t.prefilledPatron}
            </div>
          </div>
          <button
            onClick={() => {
              const { clearPatron } = require('@/lib/patron')
              clearPatron()
              setName('')
              setPhone('')
              setReturningPatron(null)
            }}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 0.5, padding: '4px 8px' }}
          >
            {t.notYou}
          </button>
        </div>
      )}

      {/* Match card */}
      <div className="match-hero">
        {isDemo && (
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 8 }}>
            {t.demoMatch}
          </div>
        )}
        <span className={`badge ${isClosed ? 'badge-closed' : 'badge-live'}`}
          style={{ marginBottom: 12, display: 'inline-flex' }}>
          <span>{isClosed ? '✕' : '●'}</span>
          {isClosed ? t.entriesClosed : t.entriesOpen}
        </span>
        <div className="match-teams-display">
          <div>{match.home_flag} {match.home_team}</div>
          <div className="vs-divider" style={{ fontSize: 14, margin: '4px 0' }}>vs</div>
          <div>{match.away_flag} {match.away_team}</div>
        </div>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>
          {match.stage}
          {!isDemo && timeLeft && !isClosed && (
            <span style={{ color: 'var(--green)', marginLeft: 8 }}>· {timeLeft} {t.remaining}</span>
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
              <label>{t.yourName}</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder={t.namePlaceholder} />
            </div>
            <div className="field">
              <label>
                {t.phoneNumber}{' '}
                <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  {t.phoneNote}
                </span>
              </label>
              <input value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                type="tel" placeholder="(555) 867-5309" inputMode="numeric" />
              {phone && !phoneValid && (
                <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4, fontFamily: 'var(--font-cond)' }}>
                  Enter a 10-digit US phone number
                </div>
              )}
            </div>
            <div className="field">
              <label>
                {t.email}{' '}
                <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  {t.emailNote}
                </span>
              </label>
              <input value={email} onChange={e => setEmail(e.target.value)}
                type="email" placeholder={t.emailPlaceholder} />
            </div>

            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
              {t.yourPrediction}
            </div>
            <div className="pick-grid">
              {(['home', 'draw', 'away'] as const).map(p => (
                <button key={p}
                  className={`pick-btn ${pick === p ? 'selected' : ''}`}
                  onClick={() => setPick(p)}>
                  <div className="pick-label">
                    {p === 'home' ? t.homeWin : p === 'draw' ? t.draw : t.awayWin}
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
              {submitting ? t.submitting : isDemo ? t.submitDemo : t.lockIn}
            </button>
          </div>
        </>
      )}
    </>
  )
}
