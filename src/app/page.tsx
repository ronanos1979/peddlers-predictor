'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Match } from '@/lib/supabase'
import { PUB_DATA, type PubInfo } from '@/lib/pubData'
import EntryForm from '@/components/EntryForm'
import { loadPatron, clearPatron, firstName } from '@/lib/patron'
import Link from 'next/link'

function Countdown() {
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
        Tournament kicks off in
      </div>
      <div className="countdown-grid">
        {[{ val: time.days, label: 'Days' }, { val: time.hours, label: 'Hours' }, { val: time.mins, label: 'Mins' }, { val: time.secs, label: 'Secs' }].map(({ val, label }) => (
          <div key={label} className="countdown-cell">
            <div className="countdown-num">{String(val).padStart(2, '0')}</div>
            <div className="countdown-label">{label}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', letterSpacing: 0.5 }}>
        Mexico 🇲🇽 vs South Africa 🇿🇦 · June 11 · Mexico City
      </p>
    </div>
  )
}

function PatronWelcome({ onClear }: { onClear: () => void }) {
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
          Welcome back, {firstName(patron.name)}! 👋
        </div>
        {tickets !== null && (
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)' }}>
            You have{' '}
            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{tickets} raffle {tickets === 1 ? 'ticket' : 'tickets'}</span>
            {' '}so far
          </div>
        )}
        {tickets === 0 && (
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            Make a correct pick to earn your first tickets!
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <Link href={`/my-picks?phone=${encodeURIComponent(patron.phone)}`}
          style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--green)', textDecoration: 'none', textAlign: 'right' }}>
          My picks →
        </Link>
        <button onClick={() => { clearPatron(); setPatron(null); onClear() }}
          style={{ background: 'none', border: 'none', fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', cursor: 'pointer', textAlign: 'right', padding: 0 }}>
          Not you?
        </button>
      </div>
    </div>
  )
}

export default function Home({ searchParams }: { searchParams: { pub?: string } }) {
  const router = useRouter()
  const pubId = (searchParams.pub && PUB_DATA[searchParams.pub]) ? searchParams.pub : ''
  const [selectedPub, setSelectedPub] = useState(pubId)
  const pub: PubInfo | null = selectedPub ? PUB_DATA[selectedPub] : null
  const [match, setMatch] = useState<Match | null>(null)
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(false)
  const [patronKey, setPatronKey] = useState(0)

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
      const { data: matches } = await supabase.from('matches').select('*')
        .gte('kickoff_at', windowStart.toISOString())
        .lte('kickoff_at', windowEnd.toISOString())
        .neq('stage', 'Demo Match')
        .order('kickoff_at', { ascending: true })
      if (matches?.length) {
        const live = matches.find((m: Match) => new Date(m.kickoff_at) <= now && new Date(m.entries_close_at) >= now)
        const upcoming = matches.find((m: Match) => new Date(m.kickoff_at) > now)
        if (live) setMatch(live)
        else if (upcoming) setUpcomingMatch(upcoming)
      }
      setLoading(false)
    }
    load()
  }, [selectedPub])

  function fmtKickoff(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  return (
    <div className="container">
      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '28px 0 24px' }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 8 }}>
          FIFA World Cup 2026 · June 11 – July 19
        </div>
        <h1 style={{ fontSize: 42, marginBottom: 8 }}>
          World Cup<br /><span style={{ color: 'var(--green)' }}>Predictor</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 280, margin: '0 auto' }}>
          Predict every match at The Peddler&apos;s Daughter. Most correct picks wins a TV.
        </p>
      </div>

      {/* Returning patron greeting */}
      <PatronWelcome key={patronKey} onClear={() => setPatronKey(k => k + 1)} />

      {/* Countdown */}
      <Countdown />

      {/* Location selector */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-dim)', textAlign: 'center', marginBottom: 8 }}>
          Choose your location
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

      {!selectedPub && (
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px', borderStyle: 'dashed', borderColor: 'var(--border2)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>👆</div>
          <p style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Select your pub above</p>
          <p className="muted">Choose Haverhill or Nashua to get started</p>
        </div>
      )}

      {selectedPub && loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', letterSpacing: 1 }}>Loading…</div>
      )}

      {selectedPub && !loading && match && pub && (
        <EntryForm pubId={selectedPub} match={match} pub={{
          id: pub.id, name: pub.name, city: `${pub.city}, ${pub.state}`,
          lat: pub.lat, lng: pub.lng, radius_m: pub.radius_m, daily_code: ''
        }} />
      )}

      {selectedPub && !loading && !match && upcomingMatch && (
        <div className="match-hero">
          <span className="badge badge-pending" style={{ marginBottom: 12, display: 'inline-flex' }}>Coming up</span>
          <div className="match-teams-display">
            <div>{upcomingMatch.home_flag} {upcomingMatch.home_team}</div>
            <div className="vs-divider" style={{ fontSize: 14, margin: '4px 0' }}>vs</div>
            <div>{upcomingMatch.away_flag} {upcomingMatch.away_team}</div>
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{upcomingMatch.stage}</div>
          <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15 }}>
            {fmtDate(upcomingMatch.kickoff_at)} · {fmtKickoff(upcomingMatch.kickoff_at)}
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>Predictions open at kick-off and close at the final whistle</p>
        </div>
      )}

      {selectedPub && !loading && !match && !upcomingMatch && (
        <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🏆</div>
          <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 16, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>No matches right now</p>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Check the schedule or try the demo.</p>
          <Link href={`/demo?pub=${selectedPub}`} className="btn btn-primary" style={{ textDecoration: 'none' }}>
            🎮 Try a demo prediction
          </Link>
        </div>
      )}

      {/* Nav grid */}
      <div className="section-label" style={{ marginTop: 24 }}>Explore</div>
      <div className="nav-grid">
        {[
          { href: `/schedule?pub=${selectedPub || 'haverhill'}`, icon: '📅', label: 'Schedule' },
          { href: `/leaderboard?pub=${selectedPub || 'haverhill'}`, icon: '🏆', label: 'Leaderboard' },
          { href: '/my-picks', icon: '👤', label: 'My Picks' },
          { href: '/rules', icon: '📋', label: 'Rules' },
          { href: `/demo?pub=${selectedPub || 'haverhill'}`, icon: '🎮', label: 'Try Demo' },
          { href: '/locations', icon: '📍', label: 'Locations' },
        ].map(({ href, icon, label }) => (
          <Link key={label} href={href} className="nav-card">
            <div className="nav-card-icon">{icon}</div>
            <div className="nav-card-label">{label}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
