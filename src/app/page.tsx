'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { supabase, type Match } from '@/lib/supabase'
import { PUB_DATA, type PubInfo } from '@/lib/pubData'
import EntryForm from '@/components/EntryForm'
import CheckInCard from '@/components/CheckInCard'
import ShareCard from '@/components/ShareCard'
import Flag from '@/components/Flag'
import { trackEvent } from '@/lib/analytics'
import { loadPatron, clearPatron, firstName, savePubPref, loadPubPref } from '@/lib/patron'
import { distanceMetres } from '@/lib/geo'
import { getPredictableWindowEnd } from '@/lib/matchSchedule'
import { useLocale } from '@/lib/useLocale'
import { type Translations } from '@/lib/i18n'
import Link from 'next/link'


type RivalryTotals = {
  entries: number
  tickets: number
  correct: number
  scored: number
}

const EMPTY_RIVALRY: Record<string, RivalryTotals> = {
  haverhill: { entries: 0, tickets: 0, correct: 0, scored: 0 },
  nashua: { entries: 0, tickets: 0, correct: 0, scored: 0 },
}

// Reverse map: API-Football name → Supabase schedule name
const SCHEDULE_ALIASES: Record<string, string> = {
  'United States': 'USA',
  'Korea Republic': 'South Korea',
  "Côte d'Ivoire": 'Ivory Coast',
  'Turkey': 'Türkiye',
  'Czech Republic': 'Czechia',
}

type SavedTeam = { id: string; name: string; logo?: string; savedAt: string }

function fmtKickoff(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function MatchCountdown({ kickoffAt, t }: { kickoffAt: string; t: Translations }) {
  const [time, setTime] = useState({ d: 0, h: 0, m: 0, s: 0, done: false })
  useEffect(() => {
    const target = new Date(kickoffAt)
    const tick = () => {
      const diff = target.getTime() - Date.now()
      if (diff <= 0) { setTime(prev => ({ ...prev, done: true })); return }
      setTime({ d: Math.floor(diff / 86400000), h: Math.floor((diff % 86400000) / 3600000), m: Math.floor((diff % 3600000) / 60000), s: Math.floor((diff % 60000) / 1000), done: false })
    }
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv)
  }, [kickoffAt])
  if (time.done) return null
  const cells = time.d > 0
    ? [{ val: time.d, label: t.days }, { val: time.h, label: t.hours }, { val: time.m, label: t.mins }]
    : [{ val: time.h, label: t.hours }, { val: time.m, label: t.mins }, { val: time.s, label: t.secs }]
  return (
    <div className="countdown-grid" style={{ marginTop: 14, justifyContent: 'center' }}>
      {cells.map(({ val, label }) => (
        <div key={label} className="countdown-cell">
          <div className="countdown-num">{String(val).padStart(2, '0')}</div>
          <div className="countdown-label">{label}</div>
        </div>
      ))}
    </div>
  )
}

function isImageUrl(val?: string) {
  return !!val && /^https?:\/\//.test(val)
}

function MyTeamWidget({ t }: { t: Translations }) {
  const [savedTeam, setSavedTeam] = useState<SavedTeam | null>(null)
  const [nextMatch, setNextMatch] = useState<Match | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('peddlers_home_team')
      if (!raw) { setLoaded(true); return }
      const team: SavedTeam = JSON.parse(raw)
      setSavedTeam(team)

      const names = [team.name]
      const alias = SCHEDULE_ALIASES[team.name]
      if (alias) names.push(alias)
      const orFilter = names.map(n => `home_team.eq.${n},away_team.eq.${n}`).join(',')

      supabase.from('matches').select('*')
        .or(orFilter)
        .gt('kickoff_at', new Date().toISOString())
        .neq('stage', 'Demo Match')
        .order('kickoff_at', { ascending: true })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => { setNextMatch(data); setLoaded(true) })
    } catch {
      setLoaded(true)
    }
  }, [])

  if (!loaded || !savedTeam) return null

  const teamHref = savedTeam.id.startsWith('name:')
    ? `/world-cup/team?name=${encodeURIComponent(savedTeam.name)}`
    : `/world-cup/team?id=${savedTeam.id}`

  const scheduleName = SCHEDULE_ALIASES[savedTeam.name] ?? savedTeam.name
  const isHome = nextMatch && (nextMatch.home_team === scheduleName || nextMatch.home_team === savedTeam.name)
  const opponentFlag = nextMatch ? (isHome ? nextMatch.away_flag : nextMatch.home_flag) : ''
  const opponentName = nextMatch ? (isHome ? nextMatch.away_team : nextMatch.home_team) : ''
  const myTeamFlag = nextMatch ? (isHome ? nextMatch.home_flag : nextMatch.away_flag) : ''

  return (
    <div className="card" style={{ marginBottom: 14, background: 'linear-gradient(135deg, #0d1520, #111)', borderColor: 'rgba(245,197,24,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)' }}>
          ⭐ {t.myTeam}
        </div>
        <Link href={teamHref} style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-dim)', textDecoration: 'none', textTransform: 'uppercase' }}>
          {t.open} →
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: nextMatch ? 14 : 4 }}>
        {isImageUrl(savedTeam.logo)
          ? <img src={savedTeam.logo} alt="" style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }} />
          : <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{savedTeam.logo}</div>
        }
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: 1 }}>{savedTeam.name}</div>
      </div>

      {nextMatch ? (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            {t.upNextMatch}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: 1, marginBottom: 4 }}>
            {isHome
              ? <>{myTeamFlag && <Flag emoji={myTeamFlag} size={20} style={{ marginRight: 4 }} />}{savedTeam.name} <span style={{ color: 'var(--text-dim)', fontSize: 16 }}>vs</span> {opponentFlag && <Flag emoji={opponentFlag} size={20} style={{ marginRight: 4, marginLeft: 4 }} />}{opponentName}</>
              : <>{opponentFlag && <Flag emoji={opponentFlag} size={20} style={{ marginRight: 4 }} />}{opponentName} <span style={{ color: 'var(--text-dim)', fontSize: 16 }}>vs</span> {myTeamFlag && <Flag emoji={myTeamFlag} size={20} style={{ marginRight: 4, marginLeft: 4 }} />}{savedTeam.name}</>
            }
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
            {nextMatch.stage}
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
            {fmtDate(nextMatch.kickoff_at)} · {fmtKickoff(nextMatch.kickoff_at)}
          </div>
          <MatchCountdown kickoffAt={nextMatch.kickoff_at} t={t} />
        </div>
      ) : (
        <p style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          {t.noUpcomingMatches}
        </p>
      )}
    </div>
  )
}

function Countdown({ t }: { t: Translations }) {
  const [time, setTime] = useState({ days: 0, hours: 0, mins: 0, secs: 0, started: false })
  useEffect(() => {
    const target = new Date('2026-06-11T19:00:00Z')
    const tick = () => {
      const diff = target.getTime() - Date.now()
      if (diff <= 0) { setTime(t => ({ ...t, started: true })); return }
      setTime({ days: Math.floor(diff / 86400000), hours: Math.floor((diff % 86400000) / 3600000), mins: Math.floor((diff % 3600000) / 60000), secs: Math.floor((diff % 60000) / 1000), started: false })
    }
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv)
  }, [])
  if (time.started) return null
  return (
    <div className="card" style={{ textAlign: 'center', marginBottom: 20, background: 'linear-gradient(135deg, #0d1f16, #111)' }}>
      <div style={{ fontSize: 11, fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10 }}>
        {t.tournamentKicksOff}
      </div>
      <div className="countdown-grid">
        {[{ val: time.days, label: t.days }, { val: time.hours, label: t.hours }, { val: time.mins, label: t.mins }, { val: time.secs, label: t.secs }].map(({ val, label }) => (
          <div key={label} className="countdown-cell">
            <div className="countdown-num">{String(val).padStart(2, '0')}</div>
            <div className="countdown-label">{label}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', letterSpacing: 0.5 }}>
        {t.openingMatch}
      </p>
    </div>
  )
}

function PatronWelcome({ onClear, t, selectedPub, pubCity }: {
  onClear: () => void
  t: Translations
  selectedPub: string
  pubCity: string
}) {
  const [patron, setPatron] = useState<{ name: string; phone: string } | null>(null)
  const [tickets, setTickets] = useState<number | null>(null)
  const [rank, setRank] = useState<number | null>(null)

  useEffect(() => {
    const p = loadPatron()
    if (!p) return
    setPatron(p)
    trackEvent('patron_returning', { pub_id: selectedPub || 'unknown' })

    const raw = p.phone.replace(/\D/g, '')
    const phone = raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw

    if (!selectedPub || phone.length !== 10) {
      supabase.from('entries').select('raffle_entries').eq('phone', p.phone)
        .then(({ data }) => {
          if (data) setTickets(data.reduce((sum, e) => sum + (e.raffle_entries || 0), 0))
        })
      return
    }

    supabase.from('entries').select('phone, raffle_entries').eq('pub_id', selectedPub)
      .then(({ data }) => {
        if (!data) return
        const totals: Record<string, number> = {}
        data.forEach(e => {
          totals[e.phone] = (totals[e.phone] || 0) + (e.raffle_entries || 0)
        })
        const myTotal = totals[phone] || 0
        setTickets(myTotal)
        if (myTotal > 0) {
          const sorted = Object.values(totals).sort((a, b) => b - a)
          const r = sorted.findIndex(v => v <= myTotal) + 1
          if (r > 0) setRank(r)
        }
      })
  }, [selectedPub]) // eslint-disable-line

  if (!patron) return null

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(0,200,122,0.08), rgba(0,200,122,0.04))',
      border: '1px solid rgba(0,200,122,0.25)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 18px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: 1, color: 'var(--green)', marginBottom: 2 }}>
          {t.welcomeBack}, {firstName(patron.name)}! 👋
        </div>
        {tickets !== null && (
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)' }}>
            {t.youHave}{' '}
            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{tickets} {tickets === 1 ? t.raffleTicket : t.raffleTickets}</span>
            {rank !== null && pubCity && (
              <span style={{ color: 'var(--text-dim)' }}> · #{rank} at {pubCity}</span>
            )}
          </div>
        )}
        {tickets === 0 && (
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            {t.firstTicketsHint}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <Link href={`/my-picks?phone=${encodeURIComponent(patron.phone)}`}
          style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--green)', textDecoration: 'none', textAlign: 'right' }}>
          {t.myPicksLink}
        </Link>
        <button onClick={() => { clearPatron(); setPatron(null); onClear() }}
          style={{ background: 'none', border: 'none', fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', cursor: 'pointer', textAlign: 'right', padding: 0 }}>
          {t.notYou}
        </button>
      </div>
    </div>
  )
}

function DiscoveryStrip({ selectedPub }: { selectedPub: string }) {
  const { t } = useLocale()
  const pub = selectedPub || 'haverhill'
  const items = [
    { href: `/leaderboard?pub=${pub}`, icon: '🏆', title: t.leaderboard, desc: t.leaderboardDesc },
    { href: '/world-cup', icon: '⚽', title: t.worldCupHub, desc: t.worldCupHubDesc },
    { href: `/world-cup/top-scorer-pick?pub=${pub}`, icon: '🎯', title: t.goldenBoot, desc: t.goldenBootDesc },
  ]
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 0 12px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
      {items.map(item => (
        <Link key={item.href} href={item.href} style={{
          flex: '0 0 auto', width: 130,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '12px 12px 14px',
          textDecoration: 'none', display: 'block',
          transition: 'border-color 0.15s',
        }}>
          <div style={{ fontSize: 22, marginBottom: 5 }}>{item.icon}</div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text)', marginBottom: 2 }}>
            {item.title}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.35 }}>
            {item.desc}
          </div>
        </Link>
      ))}
    </div>
  )
}

function FlagTip() {
  const { t } = useLocale()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('peddlers_flag_tip')) {
      setShow(true)
    }
  }, [])

  if (!show) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      background: 'rgba(0,200,122,0.07)',
      border: '1px solid rgba(0,200,122,0.25)',
      borderRadius: 8,
      padding: '10px 14px',
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>🏳️</span>
        <span style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
          {t.flagTipText}
        </span>
      </div>
      <button
        onClick={() => { localStorage.setItem('peddlers_flag_tip', '1'); setShow(false) }}
        style={{ background: 'none', border: 'none', fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, color: 'var(--green)', cursor: 'pointer', flexShrink: 0, padding: '2px 0' }}
      >
        {t.flagTipDismiss} ✕
      </button>
    </div>
  )
}

function FirstTimeCard() {
  const { t } = useLocale()
  const [show, setShow] = useState(false)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('peddlers_toured')) {
      setShow(true)
    }
  }, [])

  function dismiss() {
    localStorage.setItem('peddlers_toured', '1')
    setShow(false)
  }

  if (!show) return null

  const steps = [
    t.onboardStep1,
    t.onboardStep2,
    t.onboardStep3,
    t.onboardStep4,
    t.onboardStep5,
  ]

  return (
    <div style={{
      background: 'rgba(245,197,24,0.06)',
      border: '1px solid rgba(245,197,24,0.2)',
      borderRadius: 10,
      marginBottom: 16,
      overflow: 'hidden',
    }}>
      <button onClick={() => setExpanded(e => !e)} style={{
        width: '100%', background: 'none', border: 'none',
        padding: '13px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', cursor: 'pointer',
      }}>
        <span style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: 'var(--gold)' }}>
          {t.newHereTitle}
        </span>
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {steps.map((text, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  flexShrink: 0, width: 20, height: 20,
                  background: 'rgba(245,197,24,0.15)', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, color: 'var(--gold)',
                }}>
                  {i + 1}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
          <button onClick={dismiss} className="btn btn-gold" style={{ width: '100%', fontSize: 13 }}>
            {t.gotIt}
          </button>
        </div>
      )}
    </div>
  )
}

function WinnerPickCallout({ selectedPub }: { selectedPub: string }) {
  const { t } = useLocale()
  const [hasPick, setHasPick] = useState<boolean | null>(null)

  useEffect(() => {
    const p = loadPatron()
    if (!p?.phone) { setHasPick(false); return }
    const raw = p.phone.replace(/\D/g, '')
    const phone = raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw
    if (phone.length !== 10) { setHasPick(false); return }
    supabase.from('winner_picks').select('id').eq('phone', phone).maybeSingle()
      .then(({ data }) => setHasPick(!!data))
  }, [])

  if (hasPick === null || hasPick) return null

  const pub = selectedPub || 'haverhill'
  return (
    <Link href={`/world-cup/winner-pick?pub=${pub}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 14 }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,200,122,0.08), rgba(0,200,122,0.02))',
        border: '1px solid rgba(0,200,122,0.25)',
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        <div style={{ fontSize: 30, flexShrink: 0 }}>🏆</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 2 }}>
            {t.winnerPickCalloutLabel}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: 0.5, color: 'var(--text)', lineHeight: 1.2 }}>
            {t.winnerPickCalloutTitle}
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {t.winnerPickCalloutDesc}
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>
          {t.pickArrow}
        </div>
      </div>
    </Link>
  )
}

function GoldenBootCallout({ selectedPub }: { selectedPub: string }) {
  const { t } = useLocale()
  const [hasPick, setHasPick] = useState<boolean | null>(null)

  useEffect(() => {
    const p = loadPatron()
    if (!p?.phone) { setHasPick(false); return }
    const raw = p.phone.replace(/\D/g, '')
    const phone = raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw
    if (phone.length !== 10) { setHasPick(false); return }
    supabase.from('scorer_picks').select('id').eq('phone', phone).maybeSingle()
      .then(({ data }) => setHasPick(!!data))
  }, [])

  if (hasPick === null || hasPick) return null

  const pub = selectedPub || 'haverhill'
  return (
    <Link href={`/world-cup/top-scorer-pick?pub=${pub}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 18 }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(245,197,24,0.10), rgba(245,197,24,0.03))',
        border: '1px solid rgba(245,197,24,0.28)',
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        <div style={{ fontSize: 30, flexShrink: 0 }}>🎯</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 2 }}>
            {t.winnerPickCalloutLabel}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: 0.5, color: 'var(--text)', lineHeight: 1.2 }}>
            {t.goldenBootCalloutTitle}
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {t.goldenBootCalloutDesc}
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>
          {t.pickArrow}
        </div>
      </div>
    </Link>
  )
}

function MatchNightHub({
  pub,
  selectedPub,
  upcomingMatch,
  t,
}: {
  pub: PubInfo
  selectedPub: string
  upcomingMatch: Match | null
  t: Translations
}) {
  const [shared, setShared] = useState(false)

  async function sharePubNight() {
    const url = `https://peddlers-predictor.vercel.app/?pub=${selectedPub}`
    const text = t.pubShareText
      .replace('{city}', pub.city)
      .replace('{url}', url)
    try {
      if (navigator.share) await navigator.share({ text, url })
      else {
        await navigator.clipboard.writeText(text)
        setShared(true)
        setTimeout(() => setShared(false), 2500)
      }
    } catch { /* ignore cancelled share */ }
  }

  return (
    <div className="card" style={{ margin: '18px 0', background: 'linear-gradient(135deg, rgba(0,200,122,0.10), rgba(245,197,24,0.06))', borderColor: 'rgba(0,200,122,0.22)' }}>
      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 8 }}>
        {t.matchNightHub}
      </div>
      <h2 style={{ fontSize: 28, marginBottom: 6 }}>
        {t.watchAtPub.replace('{city}', pub.city)}
      </h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
        {upcomingMatch
          ? t.nextMatchHook
              .replace('{home}', upcomingMatch.home_team)
              .replace('{away}', upcomingMatch.away_team)
          : t.watchAtPubSub}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <a href={pub.mapsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center', paddingInline: 8 }}>
          {t.getDirectionsShort}
        </a>
        <button className="btn btn-secondary" onClick={sharePubNight} style={{ paddingInline: 8 }}>
          {shared ? t.copiedClipboard : t.inviteFriends}
        </button>
      </div>
    </div>
  )
}

function PubRivalry({
  rivalry,
  selectedPub,
  t,
}: {
  rivalry: Record<string, RivalryTotals>
  selectedPub: string
  t: Translations
}) {
  const pubs = ['haverhill', 'nashua']
  const leader = pubs.reduce((best, id) => rivalry[id].tickets > rivalry[best].tickets ? id : best, pubs[0])
  const isTie = rivalry.haverhill.tickets === rivalry.nashua.tickets

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>
            {t.pubVsPub}
          </div>
          <h2 style={{ fontSize: 24, margin: 0 }}>{t.peddlersRivalry}</h2>
        </div>
        <span className="badge badge-pending">{isTie ? t.tied : t.leading.replace('{city}', PUB_DATA[leader].city)}</span>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{t.pubRivalrySub}</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {pubs.map(id => {
          const totals = rivalry[id]
          const accuracy = totals.scored ? Math.round((totals.correct / totals.scored) * 100) : 0
          const active = id === selectedPub
          return (
            <div key={id} style={{ border: `1px solid ${active ? 'rgba(0,200,122,0.45)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', padding: '12px 14px', background: active ? 'rgba(0,200,122,0.07)' : 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontFamily: 'var(--font-cond)', fontSize: 16 }}>{PUB_DATA[id].city}</strong>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: active ? 'var(--green)' : 'var(--gold)' }}>{totals.tickets}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <span>{totals.entries} {t.players}</span>
                <span>{totals.correct} {t.correct}</span>
                <span>{accuracy}% {t.accuracy}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HomeContent() {
  const { t } = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pubParam = searchParams.get('pub')
  const pubId = (pubParam && PUB_DATA[pubParam]) ? pubParam : ''
  const [selectedPub, setSelectedPub] = useState(pubId)
  const pub: PubInfo | null = selectedPub ? PUB_DATA[selectedPub] : null
  const [predictableMatches, setPredictableMatches] = useState<Match[]>([])
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [pickStats, setPickStats] = useState<Record<string, { home: number; draw: number; away: number }>>({})
  const [loading, setLoading] = useState(false)
  const [liveMatches, setLiveMatches] = useState<Match[]>([])
  const [patronKey, setPatronKey] = useState(0)
  const [rivalry, setRivalry] = useState<Record<string, RivalryTotals>>(EMPTY_RIVALRY)
  const [geoDetecting, setGeoDetecting] = useState(false)

  function choosePub(id: string) {
    setSelectedPub(id)
    setPredictableMatches([])
    setSelectedMatch(null)
    setCompletedIds(new Set())
    setPickStats({})
    savePubPref(id)
    router.replace(`/?pub=${id}`, { scroll: false })
  }

  // Sync when header location switcher changes ?pub= param
  useEffect(() => {
    if (pubId && pubId !== selectedPub) {
      setSelectedPub(pubId)
      setPredictableMatches([])
      setSelectedMatch(null)
      setCompletedIds(new Set())
      setPickStats({})
    }
  }, [pubId]) // eslint-disable-line

  // Auto-select pub on first load: saved pref → GPS nearest → manual
  useEffect(() => {
    if (pubId) return
    const saved = loadPubPref()
    if (saved && PUB_DATA[saved]) { choosePub(saved); return }
    if (!navigator.geolocation) { choosePub('haverhill'); return }
    setGeoDetecting(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        const dH = distanceMetres(lat, lng, PUB_DATA.haverhill.lat, PUB_DATA.haverhill.lng)
        const dN = distanceMetres(lat, lng, PUB_DATA.nashua.lat, PUB_DATA.nashua.lng)
        choosePub(dH <= dN ? 'haverhill' : 'nashua')
        setGeoDetecting(false)
      },
      () => { setGeoDetecting(false); choosePub('haverhill') },
      { timeout: 7000, maximumAge: 300000 }
    )
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!selectedPub) return
    setLoading(true)
    setSelectedMatch(null)
    async function load() {
      const now = new Date()
      const windowEnd = getPredictableWindowEnd(now)

      // Matches currently in progress (kicked off ≤ 140 min ago, no result yet)
      const liveStart = new Date(now.getTime() - 140 * 60 * 1000)
      const { data: live } = await supabase.from('matches').select('*')
        .lt('kickoff_at', now.toISOString())
        .gte('kickoff_at', liveStart.toISOString())
        .is('result', null)
        .neq('stage', 'Demo Match')
        .order('kickoff_at', { ascending: true })
      setLiveMatches(live || [])

      const { data: matches } = await supabase.from('matches').select('*')
        .gte('kickoff_at', now.toISOString())
        .lt('kickoff_at', windowEnd.toISOString())
        .neq('stage', 'Demo Match')
        .order('kickoff_at', { ascending: true })
      setPredictableMatches(matches || [])

      if (!matches?.length) { setLoading(false); return }

      const matchIds = matches.map((m: Match) => m.id)

      // Community pick stats for all matches in window
      const { data: allPicks } = await supabase
        .from('entries').select('match_id, pick').in('match_id', matchIds)
      const stats: Record<string, { home: number; draw: number; away: number }> = {}
      allPicks?.forEach(e => {
        if (!stats[e.match_id]) stats[e.match_id] = { home: 0, draw: 0, away: 0 }
        if (e.pick === 'home') stats[e.match_id].home++
        else if (e.pick === 'draw') stats[e.match_id].draw++
        else if (e.pick === 'away') stats[e.match_id].away++
      })
      setPickStats(stats)

      // Patron's existing picks in this window
      const patron = loadPatron()
      if (patron?.phone) {
        const raw = patron.phone.replace(/\D/g, '')
        const phone = raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw
        if (phone.length === 10) {
          const { data: existing } = await supabase
            .from('entries').select('match_id').eq('phone', phone).in('match_id', matchIds)
          if (existing?.length) {
            setCompletedIds(new Set(existing.map((e: { match_id: string }) => e.match_id)))
          }
        }
      }

      setLoading(false)
    }
    load()
  }, [selectedPub])

  useEffect(() => {
    async function loadRivalry() {
      const { data } = await supabase
        .from('entries')
        .select('pub_id, phone, raffle_entries, is_correct')

      const next: Record<string, RivalryTotals> = {
        haverhill: { entries: 0, tickets: 0, correct: 0, scored: 0 },
        nashua: { entries: 0, tickets: 0, correct: 0, scored: 0 },
      }
      const uniquePhones: Record<string, Set<string>> = {
        haverhill: new Set(),
        nashua: new Set(),
      }

      data?.forEach(entry => {
        if (!next[entry.pub_id]) return
        if (entry.phone) uniquePhones[entry.pub_id].add(entry.phone)
        next[entry.pub_id].tickets += entry.raffle_entries || 0
        if (entry.is_correct !== null) next[entry.pub_id].scored += 1
        if (entry.is_correct === true) next[entry.pub_id].correct += 1
      })

      next.haverhill.entries = uniquePhones.haverhill.size
      next.nashua.entries = uniquePhones.nashua.size

      setRivalry(next)
    }
    loadRivalry()
  }, [])

  const navItems = [
    { href: `/schedule?pub=${selectedPub || 'haverhill'}`, icon: '📅', label: t.allMatches104, desc: t.allMatches104Desc },
    { href: `/leaderboard?pub=${selectedPub || 'haverhill'}`, icon: '🏆', label: t.leaderboard, desc: "Who's in the lead" },
    { href: '/my-picks', icon: '👤', label: t.myPicks, desc: 'Your predictions & tickets' },
    { href: '/world-cup', icon: '⚽', label: t.worldCupHub, desc: t.worldCupHubDesc },
    { href: `/world-cup/top-scorer-pick?pub=${selectedPub || 'haverhill'}`, icon: '🎯', label: t.goldenBootPlus10, desc: t.pickTopScorerShort },
    { href: '/overall-picks', icon: '📊', label: t.overallPicks, desc: 'How the pub is picking' },
    { href: '/rules', icon: '📋', label: t.rules, desc: 'How the game works' },
    { href: `/demo?pub=${selectedPub || 'haverhill'}`, icon: '🎮', label: t.demo, desc: 'Try a prediction first' },
    { href: '/locations', icon: '📍', label: t.locations, desc: 'Haverhill, MA & Nashua, NH' },
  ]

  return (
    <div className="container">
      {/* Hero */}
      <div style={{ padding: '20px 0 16px' }}>
        {/* Full-width pub name + tournament label */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, letterSpacing: 2, color: 'var(--amber)', lineHeight: 1, marginBottom: 4 }}>
            The Peddler&apos;s Daughter
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {t.tournamentLine}
          </div>
        </div>

        {/* Two-column: WC logo (1/3) | predictor text (2/3) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: '0 0 33%', display: 'flex', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/wc2026.png"
              alt="FIFA World Cup 2026"
              style={{ width: '100%', maxWidth: 110, height: 'auto', objectFit: 'contain' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 34, marginBottom: 8, lineHeight: 1.1 }}>
              {t.heroTitle.split('\n')[0]}<br /><span style={{ color: 'var(--green)' }}>{t.heroTitle.split('\n')[1]}</span>
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
              {t.heroSub}
            </p>
            {(rivalry.haverhill.entries + rivalry.nashua.entries) > 0 && (
              <div style={{ display: 'inline-block', background: 'rgba(0,200,122,0.1)', border: '1px solid rgba(0,200,122,0.25)', borderRadius: 20, padding: '5px 12px', fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--green)' }}>
                🏃 {t.totalPlayers.replace('{count}', String(rivalry.haverhill.entries + rivalry.nashua.entries))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Flag tip — dismissible notice about clicking flags */}
      <FlagTip />

      {/* Discovery strip — scrollable feature teaser */}
      <DiscoveryStrip selectedPub={selectedPub} />

      {/* Returning patron greeting */}
      <PatronWelcome
        key={patronKey}
        onClear={() => setPatronKey(k => k + 1)}
        t={t}
        selectedPub={selectedPub}
        pubCity={pub?.city || ''}
      />

      {/* First-time visitor explainer */}
      <FirstTimeCard />

      {/* Countdown */}
      <Countdown t={t} />

      {/* Winner pick callout — shown before matches so it's the first thing seen */}
      {selectedPub && <WinnerPickCallout selectedPub={selectedPub} />}

      {/* ── MATCHES — shown first, prominently ── */}
      {selectedPub && loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', letterSpacing: 1 }}>{t.loading}</div>
      )}

      {/* Live match check-in cards — shown when a match is in progress */}
      {selectedPub && !loading && pub && liveMatches.length > 0 && !selectedMatch && (
        <div style={{ marginBottom: 8 }}>
          {liveMatches.map(m => (
            <CheckInCard key={m.id} pubId={selectedPub} match={m} pubCity={pub.city} />
          ))}
        </div>
      )}

      {selectedPub && !loading && pub && (() => {
        const pubObj = { id: pub.id, name: pub.name, city: `${pub.city}, ${pub.state}`, lat: pub.lat, lng: pub.lng, radius_m: pub.radius_m, daily_code: '' }

        if (selectedMatch) {
          return (
            <div>
              <button
                onClick={() => setSelectedMatch(null)}
                style={{ background: 'none', border: 'none', fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-muted)', cursor: 'pointer', padding: '8px 0 12px 0', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {t.backToMatches}
              </button>
              <EntryForm
                pubId={selectedPub}
                match={selectedMatch}
                pub={pubObj}
                onComplete={() => {
                  setCompletedIds(prev => new Set(Array.from(prev).concat(selectedMatch.id)))
                  setSelectedMatch(null)
                }}
              />
            </div>
          )
        }

        if (predictableMatches.length === 0) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 4 }}>
              <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🏆</div>
                <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 16, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{t.noMatchesNow}</p>
                <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>{t.noMatchesSub}</p>
              </div>
              <Link href={`/demo?pub=${selectedPub}`} className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
                {t.tryDemo}
              </Link>
            </div>
          )
        }

        const days: { label: string; matches: Match[] }[] = []
        for (const m of predictableMatches) {
          const label = new Date(m.kickoff_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
          const existing = days.find(d => d.label === label)
          if (existing) existing.matches.push(m)
          else days.push({ label, matches: [m] })
        }

        return (
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>
              {t.makePredictions}
            </div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              {t.tapTeamTip}
            </div>
            {days.map(({ label, matches }) => (
              <div key={label} style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                  {label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {matches.map(m => {
                    const done = completedIds.has(m.id)
                    const s = pickStats[m.id]
                    const total = s ? s.home + s.draw + s.away : 0
                    const hp = total ? Math.round(s.home / total * 100) : 0
                    const dp = total ? Math.round(s.draw / total * 100) : 0
                    const ap = total ? 100 - hp - dp : 0
                    return (
                      <div key={m.id} style={{
                        background: done ? 'rgba(255,255,255,0.02)' : 'var(--surface)',
                        border: `1px solid ${done ? 'rgba(255,255,255,0.06)' : 'var(--border)'}`,
                        borderRadius: 10,
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        opacity: done ? 0.55 : 1,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 16, lineHeight: 1.4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 6px' }}>
                            <Link href={`/world-cup/team?name=${encodeURIComponent(m.home_team)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px 3px 5px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, color: 'var(--text)', textDecoration: 'none' }}>
                              <Flag emoji={m.home_flag} size={16} />{m.home_team}<span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 1 }}>↗</span>
                            </Link>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>vs</span>
                            <Link href={`/world-cup/team?name=${encodeURIComponent(m.away_team)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px 3px 5px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, color: 'var(--text)', textDecoration: 'none' }}>
                              <Flag emoji={m.away_flag} size={16} />{m.away_team}<span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 1 }}>↗</span>
                            </Link>
                          </div>
                          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                            {m.stage} · {fmtKickoff(m.kickoff_at)}
                          </div>
                          {total > 0 && (
                            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginTop: 5, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ color: done ? 'var(--text-muted)' : 'var(--green)' }}>{hp}{t.pctHome}</span>
                              <span>·</span>
                              <span>{dp}{t.pctDraw}</span>
                              <span>·</span>
                              <span style={{ color: done ? 'var(--text-muted)' : 'var(--amber)' }}>{ap}{t.pctAway}</span>
                              <span style={{ marginLeft: 2 }}>({total})</span>
                            </div>
                          )}
                        </div>
                        {done ? (
                          <span style={{ flexShrink: 0, fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--green)', background: 'rgba(0,200,122,0.1)', border: '1px solid rgba(0,200,122,0.2)', borderRadius: 6, padding: '4px 10px' }}>
                            {t.pickedBadge}
                          </span>
                        ) : (
                          <button onClick={() => setSelectedMatch(m)} className="btn btn-primary" style={{ flexShrink: 0, width: 'auto', padding: '8px 14px', fontSize: 13 }}>
                            {t.pickArrow}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Golden Boot callout — shown after matches if patron hasn't picked yet */}
      {selectedPub && !loading && !selectedMatch && (
        <GoldenBootCallout selectedPub={selectedPub} />
      )}

      {/* Nav grid — moved up so features are discoverable */}
      <div className="section-label" style={{ marginTop: 8 }}>{t.explore}</div>
      <div className="nav-grid" style={{ marginBottom: 20 }}>
        {navItems.map(({ href, icon, label, desc }) => (
          <Link key={label} href={href} className="nav-card">
            <div className="nav-card-icon">{icon}</div>
            <div className="nav-card-label">{label}</div>
            <div className="nav-card-desc">{desc}</div>
          </Link>
        ))}
      </div>

      {/* MatchNightHub and PubRivalry */}
      {selectedPub && pub && (
        <>
          <MatchNightHub pub={pub} selectedPub={selectedPub} upcomingMatch={predictableMatches[0] ?? null} t={t} />
          <PubRivalry rivalry={rivalry} selectedPub={selectedPub} t={t} />
        </>
      )}

      {/* My Team widget — only renders if a team is saved in localStorage */}
      <MyTeamWidget t={t} />

      {/* Location selector */}
      <div style={{ marginTop: 8, marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, textAlign: 'center' }}>
          {t.changeLocation}
        </div>
        <div className="loc-selector">
          <button className={`loc-btn ${selectedPub === 'haverhill' ? 'active' : ''}`} onClick={() => choosePub('haverhill')}>
            Haverhill, MA
          </button>
          <button className={`loc-btn ${selectedPub === 'nashua' ? 'active' : ''}`} onClick={() => choosePub('nashua')}>
            Nashua, NH
          </button>
        </div>
        {geoDetecting && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--green)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            {t.detectingPub}
          </div>
        )}
      </div>

      <ShareCard />
    </div>
  )
}

export default function Home() {
  const [splashPhase, setSplashPhase] = useState<'wc' | 'pub' | 'exit' | 'done'>('wc')

  useEffect(() => {
    const t1 = setTimeout(() => setSplashPhase('pub'),  1450)
    const t2 = setTimeout(() => setSplashPhase('exit'), 3050)
    const t3 = setTimeout(() => setSplashPhase('done'), 3500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <>
      {splashPhase !== 'done' && (
        <div className={`splash-screen${splashPhase === 'exit' ? ' splash-exiting' : ''}`}>
          <div className="splash-stage">
            {/* WC logo — spins in, then bursts out when pub logo appears */}
            <div className={`splash-wc-wrap${splashPhase !== 'wc' ? ' splash-wc-exiting' : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/wc2026.png" alt="FIFA World Cup 2026" style={{ width: 180, height: 180, objectFit: 'contain' }} />
            </div>
            {/* Pub logo — rises in after WC logo exits */}
            {splashPhase !== 'wc' && (
              <div className="splash-pub-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.avif" alt="The Peddler's Daughter" style={{ width: 280, maxWidth: '85vw', objectFit: 'contain' }} />
              </div>
            )}
          </div>
          {/* Tagline — only shown during the WC phase; pub logo speaks for itself */}
          <div className="splash-tagline" style={{ visibility: splashPhase === 'wc' ? 'visible' : 'hidden' }}>
            FIFA World Cup 2026
          </div>
        </div>
      )}
      <Suspense><HomeContent /></Suspense>
    </>
  )
}
