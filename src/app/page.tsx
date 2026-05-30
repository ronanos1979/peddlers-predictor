'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Match } from '@/lib/supabase'
import { PUB_DATA, type PubInfo } from '@/lib/pubData'
import EntryForm from '@/components/EntryForm'
import ShareCard from '@/components/ShareCard'
import { loadPatron, clearPatron, firstName, savePubPref, loadPubPref } from '@/lib/patron'
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

  // Determine which side of the match is the opponent
  const scheduleName = SCHEDULE_ALIASES[savedTeam.name] ?? savedTeam.name
  const isHome = nextMatch && (nextMatch.home_team === scheduleName || nextMatch.home_team === savedTeam.name)
  const opponentFlag = nextMatch ? (isHome ? nextMatch.away_flag : nextMatch.home_flag) : ''
  const opponentName = nextMatch ? (isHome ? nextMatch.away_team : nextMatch.home_team) : ''

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
              ? <>{savedTeam.logo && <span>{savedTeam.logo} </span>}{savedTeam.name} <span style={{ color: 'var(--text-dim)', fontSize: 16 }}>vs</span> {opponentFlag} {opponentName}</>
              : <>{opponentFlag} {opponentName} <span style={{ color: 'var(--text-dim)', fontSize: 16 }}>vs</span> {savedTeam.logo && <span> {savedTeam.logo}</span>} {savedTeam.name}</>
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

function PatronWelcome({ onClear, t }: { onClear: () => void; t: Translations }) {
  const [patron, setPatron] = useState<{ name: string; phone: string } | null>(null)
  const [tickets, setTickets] = useState<number | null>(null)

  useEffect(() => {
    const p = loadPatron()
    if (!p) return
    setPatron(p)
    // Load their raffle ticket count
    supabase
      .from('entries')
      .select('raffle_entries')
      .eq('phone', p.phone)
      .then(({ data }) => {
        if (data) setTickets(data.reduce((sum, e) => sum + (e.raffle_entries || 0), 0))
      })
  }, [])

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
      gap: 12
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: 1, color: 'var(--green)', marginBottom: 2 }}>
          {t.welcomeBack}, {firstName(patron.name)}! 👋
        </div>
        {tickets !== null && (
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)' }}>
            {t.youHave}{' '}
            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{tickets} {tickets === 1 ? t.raffleTicket : t.raffleTickets}</span>
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

export default function Home({ searchParams }: { searchParams: { pub?: string } }) {
  const { t } = useLocale()
  const router = useRouter()
  const pubId = (searchParams.pub && PUB_DATA[searchParams.pub]) ? searchParams.pub : ''
  const [selectedPub, setSelectedPub] = useState(pubId)
  const pub: PubInfo | null = selectedPub ? PUB_DATA[selectedPub] : null
  const [match, setMatch] = useState<Match | null>(null)
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null)
  const [closedMatches, setClosedMatches] = useState<Match[]>([])
  const [nextMatch, setNextMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(false)
  const [patronKey, setPatronKey] = useState(0)
  const [rivalry, setRivalry] = useState<Record<string, RivalryTotals>>(EMPTY_RIVALRY)

  function choosePub(id: string) {
    setSelectedPub(id)
    setMatch(null)
    setUpcomingMatch(null)
    setClosedMatches([])
    setNextMatch(null)
    savePubPref(id)
    router.replace(`/?pub=${id}`, { scroll: false })
  }

  // Restore saved pub on first load when no ?pub= in the URL
  useEffect(() => {
    if (pubId) return
    const saved = loadPubPref()
    if (saved && PUB_DATA[saved]) choosePub(saved)
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!selectedPub) return
    setLoading(true)
    async function load() {
      const now = new Date()
      const windowStart = new Date(now.getTime() - 110 * 60 * 1000)
      const windowEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000)
      const { data: matches } = await supabase.from('matches').select('*')
        .gte('kickoff_at', windowStart.toISOString())
        .lte('kickoff_at', windowEnd.toISOString())
        .neq('stage', 'Demo Match')
        .order('kickoff_at', { ascending: true })
      if (matches?.length) {
        const live = matches.find((m: Match) => new Date(m.kickoff_at) <= now && new Date(m.entries_close_at) >= now)
        const upcoming = matches.find((m: Match) => new Date(m.kickoff_at) > now)
        if (live) { setMatch(live); setLoading(false); return }
        if (upcoming) { setUpcomingMatch(upcoming); setLoading(false); return }
      }
      // No live or upcoming match — fetch today's closed matches and the next future match
      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)
      const [{ data: todayClosed }, { data: nextMatches }] = await Promise.all([
        supabase.from('matches').select('*')
          .gte('kickoff_at', todayStart.toISOString())
          .lte('kickoff_at', now.toISOString())
          .neq('stage', 'Demo Match')
          .order('kickoff_at', { ascending: true }),
        supabase.from('matches').select('*')
          .gt('kickoff_at', now.toISOString())
          .neq('stage', 'Demo Match')
          .order('kickoff_at', { ascending: true })
          .limit(3),
      ])
      setClosedMatches(todayClosed || [])
      setNextMatch(nextMatches?.[0] || null)
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

  return (
    <div className="container">
      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '28px 0 24px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, letterSpacing: 2, color: 'var(--amber)', lineHeight: 1, marginBottom: 4 }}>
          The Peddler&apos;s Daughter
        </div>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
          {t.tournamentLine}
        </div>
        <h1 style={{ fontSize: 42, marginBottom: 8 }}>
          {t.heroTitle.split('\n')[0]}<br /><span style={{ color: 'var(--green)' }}>{t.heroTitle.split('\n')[1]}</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 280, margin: '0 auto' }}>
          {t.heroSub}
        </p>
        {(rivalry.haverhill.entries + rivalry.nashua.entries) > 0 && (
          <div style={{ display: 'inline-block', marginTop: 14, background: 'rgba(0,200,122,0.1)', border: '1px solid rgba(0,200,122,0.25)', borderRadius: 20, padding: '6px 16px', fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: 'var(--green)' }}>
            🏃 {t.totalPlayers.replace('{count}', String(rivalry.haverhill.entries + rivalry.nashua.entries))}
          </div>
        )}
      </div>

      {/* Returning patron greeting */}
      <PatronWelcome key={patronKey} onClear={() => setPatronKey(k => k + 1)} t={t} />

      {/* Countdown */}
      <Countdown t={t} />

      {/* Location selector */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-dim)', textAlign: 'center', marginBottom: 8 }}>
          {t.chooseLocation}
        </div>
        <div className="loc-selector">
          <button className={`loc-btn ${selectedPub === 'haverhill' ? 'active' : ''}`} onClick={() => choosePub('haverhill')}>
            📍 Haverhill, MA
          </button>
          <button className={`loc-btn ${selectedPub === 'nashua' ? 'active' : ''}`} onClick={() => choosePub('nashua')}>
            📍 Nashua, NH
          </button>
        </div>
      </div>

      {selectedPub && pub && (
        <>
          <MatchNightHub pub={pub} selectedPub={selectedPub} upcomingMatch={upcomingMatch || match} t={t} />
          <PubRivalry rivalry={rivalry} selectedPub={selectedPub} t={t} />
        </>
      )}

      {!selectedPub && (
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px', borderStyle: 'dashed', borderColor: 'var(--border2)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>👆</div>
          <p style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{t.selectPubAbove}</p>
          <p className="muted">{t.selectPubSub}</p>
        </div>
      )}

      {selectedPub && loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', letterSpacing: 1 }}>{t.loading}</div>
      )}

      {selectedPub && !loading && match && pub && (
        <EntryForm pubId={selectedPub} match={match} pub={{
          id: pub.id, name: pub.name, city: `${pub.city}, ${pub.state}`,
          lat: pub.lat, lng: pub.lng, radius_m: pub.radius_m, daily_code: ''
        }} />
      )}

      {selectedPub && !loading && !match && upcomingMatch && (
        <div className="match-hero">
          <span className="badge badge-pending" style={{ marginBottom: 12, display: 'inline-flex' }}>{t.comingUp}</span>
          <div className="match-teams-display">
            <div>{upcomingMatch.home_flag} {upcomingMatch.home_team}</div>
            <div className="vs-divider" style={{ fontSize: 14, margin: '4px 0' }}>vs</div>
            <div>{upcomingMatch.away_flag} {upcomingMatch.away_team}</div>
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{upcomingMatch.stage}</div>
          <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15 }}>
            {fmtDate(upcomingMatch.kickoff_at)} · {fmtKickoff(upcomingMatch.kickoff_at)}
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>{t.predictionsOpen}</p>
        </div>
      )}

      {selectedPub && !loading && !match && !upcomingMatch && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 4 }}>
          {closedMatches.length > 0 && (
            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
                {t.todaysMatches}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {closedMatches.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', gap: 8 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>
                        {m.home_flag} {m.home_team} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs</span> {m.away_team} {m.away_flag}
                      </div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        {m.stage} · {fmtKickoff(m.kickoff_at)}
                      </div>
                    </div>
                    <span className="badge badge-closed" style={{ flexShrink: 0 }}>{t.closed}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {nextMatch && (
            <div className="card" style={{ background: 'linear-gradient(135deg, #0d1f16, #111)', borderColor: 'rgba(0,200,122,0.2)', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 10 }}>
                {t.upNextMatch}
              </div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                {nextMatch.home_flag} {nextMatch.home_team} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 14 }}>vs</span> {nextMatch.away_team} {nextMatch.away_flag}
              </div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {nextMatch.stage}
              </div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {fmtDate(nextMatch.kickoff_at)} · {fmtKickoff(nextMatch.kickoff_at)}
              </div>
              <MatchCountdown kickoffAt={nextMatch.kickoff_at} t={t} />
              <p style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
                {t.predictionsOpen}
              </p>
            </div>
          )}

          {closedMatches.length === 0 && !nextMatch && (
            <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🏆</div>
              <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 16, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{t.noMatchesNow}</p>
              <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>{t.noMatchesSub}</p>
            </div>
          )}

          <Link href={`/demo?pub=${selectedPub}`} className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
            {t.tryDemo}
          </Link>
        </div>
      )}

      {/* My Team widget — only renders if a team is saved in localStorage */}
      <MyTeamWidget t={t} />

      {/* Nav grid */}
      <div className="section-label" style={{ marginTop: 24 }}>{t.explore}</div>
      <div className="nav-grid">
        {[
          { href: `/schedule?pub=${selectedPub || 'haverhill'}`, icon: '📅', label: t.schedule },
          { href: `/leaderboard?pub=${selectedPub || 'haverhill'}`, icon: '🏆', label: t.leaderboard },
          { href: '/my-picks', icon: '👤', label: t.myPicks },
          { href: '/world-cup', icon: '⚽', label: t.worldCup },
          { href: `/world-cup/top-scorer-pick?pub=${selectedPub || 'haverhill'}`, icon: '🎯', label: t.goldenBoot },
          { href: '/rules', icon: '📋', label: t.rules },
          { href: `/demo?pub=${selectedPub || 'haverhill'}`, icon: '🎮', label: t.demo },
          { href: '/locations', icon: '📍', label: t.locations },
        ].map(({ href, icon, label }) => (
          <Link key={label} href={href} className="nav-card">
            <div className="nav-card-icon">{icon}</div>
            <div className="nav-card-label">{label}</div>
          </Link>
        ))}
      </div>

      <ShareCard />
    </div>
  )
}
