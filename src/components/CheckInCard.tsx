'use client'
import { useState, useEffect } from 'react'
import { type Match } from '@/lib/supabase'
import { isValidOverrideCode } from '@/lib/matchSchedule'
import { loadPatron } from '@/lib/patron'
import Flag from '@/components/Flag'
import { useLocale } from '@/lib/useLocale'

type Props = { pubId: string; match: Match; pubCity: string }

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
}

export default function CheckInCard({ pubId, match, pubCity }: Props) {
  const { t } = useLocale()
  const [step, setStep] = useState<'idle' | 'form' | 'done'>('idle')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checkinCount, setCheckinCount] = useState<number | null>(null)
  const [sharedVia, setSharedVia] = useState<string | null>(null)

  // Pre-fill from patron cookie
  useEffect(() => {
    const p = loadPatron()
    if (p) { setName(p.name); setPhone(p.phone); if (p.email) setEmail(p.email) }
  }, [])

  // Load check-in count
  useEffect(() => {
    fetch(`/api/checkin?match_id=${match.id}`)
      .then(r => r.json())
      .then(d => setCheckinCount(d.count ?? null))
      .catch(() => {})
  }, [match.id, step])

  const matchLabel = `${match.home_team} vs ${match.away_team}`
  const shareText = `🍺 Watching ${matchLabel} LIVE at The Peddler's Daughter in ${pubCity}!\n\nPlay the World Cup 2026 Predictor — predict every match and win! 🏆\nhttps://peddlers-predictor.vercel.app/?pub=${pubId}\n#WorldCup2026 #PeddlersDaughter`
  const shareUrl = `https://peddlers-predictor.vercel.app/?pub=${pubId}`

  async function doShare(platform: string) {
    try {
      if (platform === 'native' && navigator.share) {
        await navigator.share({ text: shareText, url: shareUrl })
        setSharedVia('native')
      } else if (platform === 'x') {
        window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener')
        setSharedVia('x')
      } else if (platform === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener')
        setSharedVia('facebook')
      } else if (platform === 'copy') {
        await navigator.clipboard.writeText(shareText)
        setSharedVia('copy')
      }
    } catch { /* cancelled */ }
  }

  async function handleSubmit() {
    setError('')
    if (!isValidOverrideCode(code)) {
      setCodeError(t.checkInCodeError)
      return
    }
    setCodeError('')
    const digits = normalizePhone(phone)
    if (digits.length !== 10) { setError(t.enter10DigitPhone); return }
    if (!name.trim()) { setError(t.checkInNameError); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pub_id: pubId, match_id: match.id,
          name: name.trim(), phone: digits,
          email: email.trim() || null,
          code: code.trim(),
          shared_to: sharedVia,
        })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || t.networkError); setSubmitting(false); return }
      setStep('done')
    } catch {
      setError(t.networkError)
      setSubmitting(false)
    }
  }

  const canSubmit = name.trim().length >= 2 && normalizePhone(phone).length === 10 && !submitting

  if (step === 'idle') {
    return (
      <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #1a0000, #0f0000)', border: '1px solid rgba(255,59,59,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 6px var(--red)' }} />
          <span style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--red)' }}>
            {t.checkInLiveNow}
          </span>
          {checkinCount !== null && checkinCount > 0 && (
            <span style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {t.checkInCheckedCount.replace('{count}', String(checkinCount))}
            </span>
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: 1, marginBottom: 6 }}>
          <Flag emoji={match.home_flag} size={18} style={{ marginRight: 5 }} />{match.home_team}
          <span style={{ color: 'var(--text-muted)', fontSize: 15, fontFamily: 'var(--font-cond)', fontWeight: 400 }}> vs </span>
          <Flag emoji={match.away_flag} size={18} style={{ marginRight: 5 }} />{match.away_team}
        </div>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          {match.stage}{match.venue ? ` · ${match.venue}` : ''} · The Peddler&apos;s Daughter, {pubCity}
        </div>
        <button
          className="btn btn-primary"
          style={{ background: 'var(--red)', borderColor: 'transparent', fontSize: 15 }}
          onClick={() => setStep('form')}
        >
          {t.checkInCTA}
        </button>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
          {t.checkInSubtext}
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="card" style={{ marginBottom: 16, textAlign: 'center', border: '1px solid rgba(255,59,59,0.3)' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🍺</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: 1, marginBottom: 6 }}>
          {t.checkInSuccessTitle}
        </div>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          {t.checkInSuccessDetail.replace('{match}', matchLabel)}
          {checkinCount !== null && checkinCount > 0 && ` ${t.checkInSuccessCount.replace('{count}', String(checkinCount))}`}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
            {t.checkInShareTitle}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {'share' in navigator && (
              <button
                onClick={() => doShare('native')}
                className="btn btn-primary"
                style={{ fontSize: 15 }}
              >
                {sharedVia === 'native' ? t.checkInShared : t.checkInSharePhone}
              </button>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => doShare('x')}
                style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: '1px solid #333', background: '#000', color: '#fff', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {t.checkInShareX}
                {sharedVia === 'x' && <span style={{ color: 'var(--green)' }}>✓</span>}
              </button>
              <button
                onClick={() => doShare('facebook')}
                style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: '1px solid #1877F2', background: '#1877F2', color: '#fff', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                Facebook
                {sharedVia === 'facebook' && <span>✓</span>}
              </button>
            </div>
            <button
              onClick={() => doShare('copy')}
              style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 12, cursor: 'pointer' }}
            >
              {sharedVia === 'copy' ? t.checkInCopied : t.checkInCopyInsta}
            </button>
          </div>
        </div>

        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5, background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', textAlign: 'left' }}>
          &ldquo;{shareText.split('\n')[0]}&rdquo;
        </div>
      </div>
    )
  }

  // step === 'form'
  return (
    <div className="card" style={{ marginBottom: 16, border: '1px solid rgba(255,59,59,0.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 6px var(--red)' }} />
        <span style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--red)' }}>{t.checkInTitle}</span>
        <button
          onClick={() => setStep('idle')}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}
        >✕</button>
      </div>
      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        {t.checkInFormIntro.replace('{match}', matchLabel)}
      </div>

      <div className="field">
        <label>{t.checkInNameLabel}</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t.checkInNamePlaceholder} />
      </div>
      <div className="field">
        <label>{t.phoneNumber} <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{t.checkInPhoneNote}</span></label>
        <input value={phone} onChange={e => setPhone(formatPhone(e.target.value))} type="tel" placeholder={t.phonePlaceholder} inputMode="numeric" />
      </div>
      <div className="field">
        <label>{t.email} <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{t.checkInEmailNote}</span></label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder={t.emailPlaceholder} />
      </div>
      <div className="field">
        <label>{t.checkInCodeLabel} <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{t.checkInCodeNote}</span></label>
        <input
          value={code}
          onChange={e => { setCode(e.target.value); setCodeError('') }}
          placeholder={t.checkInCodePlaceholder}
          autoComplete="off"
          style={{ fontSize: 18, letterSpacing: 2, textTransform: 'lowercase' }}
        />
        {codeError && <p className="error" style={{ margin: '4px 0 0', fontSize: 12 }}>{codeError}</p>}
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

      <button
        className="btn btn-primary"
        disabled={!canSubmit}
        onClick={handleSubmit}
        style={{ background: canSubmit ? 'var(--red)' : undefined, borderColor: canSubmit ? 'transparent' : undefined }}
      >
        {submitting ? t.checkInSubmitting : t.checkInSubmitBtn}
      </button>
    </div>
  )
}
