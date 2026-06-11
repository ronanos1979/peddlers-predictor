'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { trackEvent } from '@/lib/analytics'
import { supabase, type Match, type Pub } from '@/lib/supabase'
import { distanceMetres, getPosition } from '@/lib/geo'
import { getDailyCode, isValidOverrideCode } from '@/lib/matchSchedule'
import { savePatron, loadPatron, firstName } from '@/lib/patron'
import Flag from '@/components/Flag'
import { useLocale } from '@/lib/useLocale'
import { PUB_DATA } from '@/lib/pubData'
import Link from 'next/link'

type Props = { pubId: string; match: Match; pub: Pub | null; isDemo?: boolean; onComplete?: () => void }

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

function isValidName(raw: string): boolean {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  return parts.length >= 2 && parts.every(p => p.length >= 2)
}

export default function EntryForm({ pubId, match, pub, isDemo = false, onComplete }: Props) {
  const { t } = useLocale()
  const [geoStatus, setGeoStatus] = useState<'prompt' | 'checking' | 'ok' | 'fail' | 'geo_blocked'>('prompt')
  const [overrideCode, setOverrideCode] = useState('')
  const [overrideError, setOverrideError] = useState('')
  const [geoMessage, setGeoMessage] = useState(t.checkingLocation)
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [userDistance, setUserDistance] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pick, setPick] = useState<'home' | 'draw' | 'away' | null>(null)
  const [homeScorePred, setHomeScorePred] = useState<number>(0)
  const [awayScorePred, setAwayScorePred] = useState<number>(0)
  const [scoreSkipped, setScoreSkipped] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')
  const [shared, setShared] = useState(false)
  const [returningPatron, setReturningPatron] = useState<string | null>(null)
  const [honeypot, setHoneypot] = useState('')
  const [nextMatch, setNextMatch] = useState<Match | null>(null)
  const dailyCode = getDailyCode()
  const pubInfo = PUB_DATA[pubId]

  // Track form drop-off — refs keep current values accessible at unmount time
  const submittedRef = useRef(false)
  const geoStatusRef = useRef(geoStatus)
  const pickRef = useRef(pick)
  const nameRef = useRef(name)
  const phoneRef = useRef(phone)
  useEffect(() => { geoStatusRef.current = geoStatus }, [geoStatus])
  useEffect(() => { pickRef.current = pick }, [pick])
  useEffect(() => { nameRef.current = name }, [name])
  useEffect(() => { phoneRef.current = phone }, [phone])
  useEffect(() => {
    return () => {
      if (!isDemo && geoStatusRef.current === 'ok' && pickRef.current && !submittedRef.current) {
        trackEvent('form_abandoned', { pub_id: pubId, pick: pickRef.current, had_name: !!nameRef.current, had_phone: isValidPhone(phoneRef.current) })
      }
    }
  }, []) // eslint-disable-line

  // Load patron cookie on mount
  useEffect(() => {
    const patron = loadPatron()
    if (patron) {
      setName(patron.name)
      setPhone(patron.phone)
      if (patron.email) setEmail(patron.email)
      setReturningPatron(firstName(patron.name))
    }
  }, [])

  // Countdown timer — counts down to kickoff (predictions close at kickoff)
  useEffect(() => {
    if (isDemo) { setTimeLeft(''); return }
    const tick = () => {
      const diff = new Date(match.kickoff_at).getTime() - Date.now()
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
      const { latitude: lat, longitude: lng } = pos.coords
      const dist = distanceMetres(lat, lng, pub.lat, pub.lng)
      setUserCoords({ lat, lng })
      setUserDistance(dist)
      if (dist <= pub.radius_m) {
        setGeoStatus('ok')
        setGeoMessage(`📍 ${t.locationVerified} — ${Math.round(dist * 3.28084)}ft from pub`)
        trackEvent('geo_verified', { pub_id: pubId, distance_m: Math.round(dist) })
        try {
          sessionStorage.setItem('peddlers_geo_ok', JSON.stringify({ type: 'geo', pubId: pub.id, lat, lng, dist, ts: Date.now() }))
        } catch {}
      } else {
        setGeoStatus('fail')
        setGeoMessage(t.locationDistanceFail.replace('{distance}', String(Math.round(dist * 3.28084))))
        trackEvent('geo_too_far', { pub_id: pubId, distance_m: Math.round(dist) })
      }
    } catch {
      setGeoStatus('geo_blocked')
      setGeoMessage(t.geoUnavailable)
      trackEvent('geo_blocked', { pub_id: pubId })
    }
  }, [pub, isDemo, t.demoMode, t.locationVerified, t.locationDistanceFail, t.pubCodeRequired])

  // Geo verification on mount — restore session cache, auto-check if permission granted, or show prompt
  useEffect(() => {
    if (isDemo || !pub) { checkGeo(); return }

    // Restore a valid cached result from this session (TTL: 30 min)
    try {
      const raw = sessionStorage.getItem('peddlers_geo_ok')
      if (raw) {
        const cached = JSON.parse(raw)
        if (Date.now() - cached.ts < 30 * 60 * 1000) {
          setGeoStatus('ok')
          if (cached.type === 'geo' && cached.dist != null) {
            setGeoMessage(`📍 ${t.locationVerified} — ${Math.round(cached.dist * 3.28084)}ft from pub`)
            if (cached.lat != null) setUserCoords({ lat: cached.lat, lng: cached.lng })
            if (cached.dist != null) setUserDistance(cached.dist)
          } else {
            setGeoMessage(`📍 ${t.locationVerified}`)
          }
          return
        }
      }
    } catch {}

    // If permission already granted, skip the prompt and check silently
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(result => {
        if (result.state === 'granted') {
          setGeoStatus('checking')
          setGeoMessage(t.checkingLocation)
          checkGeo()
        } else if (result.state === 'denied') {
          setGeoStatus('geo_blocked')
          setGeoMessage(t.geoUnavailable)
          trackEvent('geo_blocked', { pub_id: pubId })
        }
        // 'prompt' → leave as 'prompt', show location card
      }).catch(() => { /* Permissions API unavailable — show prompt card */ })
    }
  }, [isDemo, pub]) // eslint-disable-line

  const isClosed = !isDemo && new Date(match.kickoff_at) <= new Date()
  const phoneValid = isValidPhone(phone)
  const nameValid = isValidName(name)
  const canSubmit = nameValid && phone && phoneValid && pick && geoStatus === 'ok' && !isClosed && !submitting

  function handleOverrideCode() {
    if (isValidOverrideCode(overrideCode)) {
      setGeoStatus('ok')
      setGeoMessage(`📍 ${t.locationVerified}`)
      setOverrideError('')
      trackEvent('code_verified', { pub_id: pubId })
      try {
        sessionStorage.setItem('peddlers_geo_ok', JSON.stringify({ type: 'code', ts: Date.now() }))
      } catch {}
    } else {
      setOverrideError(t.invalidAccessCode)
      trackEvent('code_failed', { pub_id: pubId })
    }
  }

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
          is_demo: isDemo,
          honeypot,
          home_score_pred: scoreSkipped ? null : homeScorePred,
          away_score_pred: scoreSkipped ? null : awayScorePred,
          entry_lat: userCoords?.lat ?? null,
          entry_lng: userCoords?.lng ?? null,
          entry_distance_m: userDistance !== null ? Math.round(userDistance) : null,
        })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || t.somethingWentWrong); setSubmitting(false); return }

      submittedRef.current = true

      // Save patron cookie on successful entry
      if (!isDemo) {
        savePatron({ name, phone, pub_id: pubId, email: email || undefined })
        trackEvent('prediction_submitted', {
          pub_id: pubId,
          match: `${match.home_team} vs ${match.away_team}`,
          pick: pick as string,
          score_predicted: !scoreSkipped,
          returning: !!returningPatron,
          gave_email: !!email,
        })
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
            <Flag emoji={match.home_flag} size={22} style={{ marginRight: 6 }} />{match.home_team} vs <Flag emoji={match.away_flag} size={22} style={{ marginRight: 6 }} />{match.away_team}
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 20, color: 'var(--green)', marginBottom: 4 }}>
            {pickLabel(pick)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{match.stage}</div>
        </div>

        {!isDemo && (
          <div className="slide-up-delay" style={{ marginBottom: 14 }}>
            <div className="card" style={{ background: 'linear-gradient(135deg, #1a1200, #111)', border: '1px solid rgba(245,197,24,0.25)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 6 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', letterSpacing: 2 }}>+1</div>
                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.correctResultLabel}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, color: 'var(--text-muted)', alignSelf: 'center' }}>+</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', letterSpacing: 2 }}>+2</div>
                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.exactScoreLabel}</div>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center' }}>
                {t.raffleEntriesIfCorrect}
              </div>
            </div>
          </div>
        )}

        {!isDemo && (
          <div className="slide-up-delay" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 16px' }}>
              <div style={{ fontSize: 24, flexShrink: 0 }}>⏱</div>
              <div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                  {t.checkBackResult}
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)' }}>
                  Kickoff: {new Date(match.kickoff_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
                </div>
              </div>
            </div>
          </div>
        )}

        {!isDemo && pubInfo && !onComplete && (
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
          {onComplete && (
            <button className="btn btn-primary" onClick={onComplete}>
              {t.backToMatches}
            </button>
          )}
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

      {/* Big match banner */}
      {!isDemo && ['Quarter Final', 'Semi Final', 'Third Place', 'Final'].includes(match.stage) && (
        <div style={{
          background: match.stage === 'Final'
            ? 'linear-gradient(135deg, #1f1000, #0f0800)'
            : 'linear-gradient(135deg, #1a1200, #0f1000)',
          border: `1px solid ${match.stage === 'Final' ? 'rgba(245,197,24,0.6)' : 'rgba(245,197,24,0.35)'}`,
          borderRadius: 'var(--radius)',
          padding: '14px 16px',
          textAlign: 'center',
          marginBottom: 12,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: match.stage === 'Final' ? 32 : 26, color: 'var(--gold)', letterSpacing: 3 }}>
            {match.stage === 'Final' ? '⭐ THE FINAL ⭐' : `⚡ ${match.stage.toUpperCase()} ⚡`}
          </div>
          {match.stage === 'Final' && (
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--gold)', opacity: 0.75, letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 }}>
              {t.finalNight}
            </div>
          )}
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
          <div><Flag emoji={match.home_flag} size={24} style={{ marginRight: 8 }} />{match.home_team}</div>
          <div className="vs-divider" style={{ fontSize: 14, margin: '4px 0' }}>vs</div>
          <div><Flag emoji={match.away_flag} size={24} style={{ marginRight: 8 }} />{match.away_team}</div>
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
          {/* Geo strip — only shown after a check has been attempted */}
          {(geoStatus === 'ok' || geoStatus === 'checking' || geoStatus === 'fail') && (
            <div className="geo-strip">
              <div className={`geo-dot ${geoStatus}`} />
              <span>{geoMessage}</span>
            </div>
          )}

          {/* Location prompt card — shown before any check is made */}
          {geoStatus === 'prompt' && (
            <div className="card" style={{ marginBottom: 12, border: '1px solid rgba(0,200,122,0.3)', background: 'linear-gradient(135deg, #091a10, #111)', textAlign: 'center', padding: '20px 16px' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📍</div>
              <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 20, color: 'var(--text)', marginBottom: 6 }}>
                {t.verifyAtPub}
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
                {t.locationExplanation}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 16, marginBottom: 12 }}
                onClick={() => { setGeoStatus('checking'); setGeoMessage(t.checkingLocation); checkGeo() }}
              >
                {t.allowLocationAccess}
              </button>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                {t.browserWillAsk} <strong>{t.allowWord}</strong>.
              </div>
              <button
                type="button"
                onClick={() => { setGeoStatus('geo_blocked'); trackEvent('chose_code_path', { pub_id: pubId }) }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: '4px 0' }}
              >
                {t.enterCodeInstead}
              </button>
            </div>
          )}

          {/* Access code card — shown when location is denied or user chose code path */}
          {geoStatus === 'geo_blocked' && (
            <div className="card" style={{ marginBottom: 12, border: '1px solid rgba(245,197,24,0.35)', background: 'linear-gradient(135deg, #131000, #111)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 28 }}>🔑</span>
                <div>
                  <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 18, color: 'var(--gold)', letterSpacing: 0.5 }}>
                    {t.accessCode}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                    {t.askBarStaffCode}
                  </div>
                </div>
              </div>
              <input
                value={overrideCode}
                onChange={e => { setOverrideCode(e.target.value); setOverrideError('') }}
                placeholder={t.accessCodePlaceholder}
                onKeyDown={e => e.key === 'Enter' && handleOverrideCode()}
                autoComplete="off"
                style={{ fontSize: 20, padding: '14px 16px', letterSpacing: 2, marginBottom: 10, textTransform: 'lowercase' }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOverrideCode}
                style={{ width: '100%', fontSize: 16 }}
              >
                {t.verifyCode}
              </button>
              {overrideError && (
                <p className="error" style={{ marginBottom: 0, marginTop: 8 }}>{overrideError}</p>
              )}
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8, letterSpacing: 0.3 }}>
                  {t.enableLocationTitle}
                </div>
                <ul style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px 0', padding: '0 0 0 16px', lineHeight: 1.8 }}>
                  <li>{t.locationStepIphone}</li>
                  <li>{t.locationStepIphoneChrome}</li>
                  <li>{t.locationStepAndroid}</li>
                  <li>{t.locationStepOther}</li>
                </ul>
                <button
                  type="button"
                  onClick={() => { setGeoStatus('checking'); setGeoMessage(t.checkingLocation); checkGeo() }}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 14px', display: 'block', margin: '0 auto' }}
                >
                  {t.tryLocationAgain}
                </button>
              </div>
            </div>
          )}

          {/* Too far from pub — show access code as fallback */}
          {geoStatus === 'fail' && (
            <div className="card" style={{ marginBottom: 12, border: '1px solid rgba(245,197,24,0.25)', background: 'linear-gradient(135deg, #131000, #111)', textAlign: 'center', padding: '14px 16px' }}>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                {t.notCloseEnough}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={overrideCode}
                  onChange={e => { setOverrideCode(e.target.value); setOverrideError('') }}
                  placeholder={t.accessCodePlaceholder}
                  onKeyDown={e => e.key === 'Enter' && handleOverrideCode()}
                  autoComplete="off"
                  style={{ fontSize: 18, padding: '12px 14px', letterSpacing: 2, flex: 1, textTransform: 'lowercase' }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleOverrideCode}
                  style={{ width: 'auto', padding: '0 18px', fontSize: 14, flexShrink: 0 }}
                >
                  {t.verifyCode}
                </button>
              </div>
              {overrideError && (
                <p className="error" style={{ marginBottom: 0, marginTop: 8 }}>{overrideError}</p>
              )}
            </div>
          )}

          <div className="card">
            {/* Honeypot — hidden from humans, bots fill it */}
            <input
              type="text" name="website" value={honeypot} onChange={e => setHoneypot(e.target.value)}
              tabIndex={-1} aria-hidden="true" autoComplete="off"
              style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0, pointerEvents: 'none' }}
            />
            <div className="field">
              <label>{t.yourName}</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder={t.namePlaceholder} />
              {name && !nameValid && (
                <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4, fontFamily: 'var(--font-cond)' }}>
                  {t.enterFullName}
                </div>
              )}
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
                  {t.enter10DigitPhone}
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
                    {p === 'home' ? <><Flag emoji={match.home_flag} size={16} style={{ marginRight: 4 }} />{match.home_team}</> :
                     p === 'draw' ? '—' :
                     <><Flag emoji={match.away_flag} size={16} style={{ marginRight: 4 }} />{match.away_team}</>}
                  </div>
                </button>
              ))}
            </div>

            {pick && !scoreSkipped && (
              <div style={{ marginTop: 14, padding: '14px 16px', background: 'linear-gradient(135deg, #131000, #0f0e00)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245,197,24,0.3)' }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 2, textAlign: 'center' }}>
                  {t.predictScore}
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 16 }}>
                  {t.scoreOptional}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  {/* Home team */}
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Flag emoji={match.home_flag} size={18} />{match.home_team}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                      <button type="button" onClick={() => setHomeScorePred(h => Math.max(0, h - 1))}
                        style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 20, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, minWidth: 44, textAlign: 'center', color: 'var(--text)', lineHeight: 1 }}>
                        {homeScorePred}
                      </div>
                      <button type="button" onClick={() => setHomeScorePred(h => Math.min(20, h + 1))}
                        style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(245,197,24,0.4)', background: 'rgba(245,197,24,0.08)', color: 'var(--gold)', fontSize: 20, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-muted)', paddingTop: 28 }}>–</div>
                  {/* Away team */}
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Flag emoji={match.away_flag} size={18} />{match.away_team}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                      <button type="button" onClick={() => setAwayScorePred(a => Math.max(0, a - 1))}
                        style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 20, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, minWidth: 44, textAlign: 'center', color: 'var(--text)', lineHeight: 1 }}>
                        {awayScorePred}
                      </div>
                      <button type="button" onClick={() => setAwayScorePred(a => Math.min(20, a + 1))}
                        style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(245,197,24,0.4)', background: 'rgba(245,197,24,0.08)', color: 'var(--gold)', fontSize: 20, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => { setScoreSkipped(true); setHomeScorePred(0); setAwayScorePred(0) }}
                  style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
                  {t.skipNoScore}
                </button>
              </div>
            )}

            {pick && scoreSkipped && (
              <button type="button" onClick={() => setScoreSkipped(false)}
                style={{ display: 'block', width: '100%', marginTop: 10, padding: '10px 14px', background: 'rgba(245,197,24,0.06)', border: '1px dashed rgba(245,197,24,0.3)', borderRadius: 'var(--radius-sm)', color: 'var(--gold)', fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 }}>
                {t.addScorePrediction}
              </button>
            )}

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
