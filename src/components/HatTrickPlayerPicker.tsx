'use client'
import { useState, useEffect } from 'react'
import { useLocale } from '@/lib/useLocale'
import Flag from '@/components/Flag'

type Player = { name: string; number: number; position: string; photo: string }

type Props = {
  homeTeam: string
  homeFlag: string
  awayTeam: string
  awayFlag: string
  value: string
  onChange: (name: string) => void
}

const POS_SHORT: Record<string, string> = {
  Goalkeeper: 'GK', Defender: 'DF', Midfielder: 'MF', Attacker: 'FW',
}

export default function HatTrickPlayerPicker({ homeTeam, homeFlag, awayTeam, awayFlag, value, onChange }: Props) {
  const { t } = useLocale()
  const [loading, setLoading] = useState(true)
  const [homePlayers, setHomePlayers] = useState<Player[]>([])
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([])
  const [noData, setNoData] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [homeRes, awayRes] = await Promise.all([
          fetch(`/api/team?name=${encodeURIComponent(homeTeam)}`),
          fetch(`/api/team?name=${encodeURIComponent(awayTeam)}`),
        ])
        const [homeData, awayData] = await Promise.all([homeRes.json(), awayRes.json()])
        if (cancelled) return
        const home: Player[] = (homeData.squad || []).map((p: Player) => ({ name: p.name, number: p.number, position: p.position, photo: p.photo }))
        const away: Player[] = (awayData.squad || []).map((p: Player) => ({ name: p.name, number: p.number, position: p.position, photo: p.photo }))
        setHomePlayers(home)
        setAwayPlayers(away)
        if (home.length === 0 && away.length === 0) setNoData(true)
      } catch {
        if (!cancelled) setNoData(true)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [homeTeam, awayTeam])

  // Selected state — player already chosen
  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'rgba(0,200,122,0.1)', border: '1px solid rgba(0,200,122,0.4)', borderRadius: 8 }}>
        <span style={{ fontSize: 16 }}>⚡</span>
        <span style={{ flex: 1, fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700, color: 'var(--green)', letterSpacing: 0.3 }}>{value}</span>
        <button type="button" onClick={() => { onChange(''); setSearch('') }}
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '3px 9px', flexShrink: 0 }}>
          {t.hatTrickChangePlayer}
        </button>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 2px', fontFamily: 'var(--font-cond)' }}>
        {t.hatTrickLoadingPlayers}
      </div>
    )
  }

  // No squad data loaded — fall back to text input
  if (noData) {
    return (
      <div>
        <div style={{ fontSize: 11, color: 'rgba(245,197,24,0.7)', marginBottom: 6, fontFamily: 'var(--font-cond)' }}>{t.hatTrickNoPlayers}</div>
        <input type="text" value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={t.hatTrickScorerPlaceholder}
          maxLength={80}
          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,122,0.3)', borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 14, padding: '8px 10px' }}
        />
      </div>
    )
  }

  // Searchable player list
  const q = search.toLowerCase().trim()
  const filterPlayers = (players: Player[]) => !q ? players : players.filter(p => p.name.toLowerCase().includes(q))
  const filteredHome = filterPlayers(homePlayers)
  const filteredAway = filterPlayers(awayPlayers)
  const hasResults = filteredHome.length > 0 || filteredAway.length > 0

  function renderPlayer(p: Player, flag: string) {
    const pos = POS_SHORT[p.position] ?? p.position?.slice(0, 2)?.toUpperCase() ?? ''
    return (
      <button key={p.name} type="button"
        onClick={() => { onChange(p.name); setSearch('') }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '9px 10px', textAlign: 'left',
          background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
          cursor: 'pointer', color: 'var(--text)',
        }}>
        {p.photo ? (
          <img src={p.photo} alt="" width={22} height={22}
            style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'rgba(255,255,255,0.05)' }} />
        ) : (
          <Flag emoji={flag} size={18} style={{ flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700 }}>
          {p.number > 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 5, minWidth: 18, display: 'inline-block' }}>
              {p.number}
            </span>
          )}
          {p.name}
        </span>
        {pos && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', fontWeight: 700, letterSpacing: 0.5, flexShrink: 0 }}>
            {pos}
          </span>
        )}
      </button>
    )
  }

  function renderTeamHeader(name: string, flag: string) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', position: 'sticky', top: 0,
        background: 'rgba(20,20,20,0.97)',
        fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700,
        letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <Flag emoji={flag} size={13} />{name}
      </div>
    )
  }

  return (
    <div>
      <input
        type="text" value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t.hatTrickSearchPlayers}
        autoFocus
        autoComplete="off"
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '9px 10px', marginBottom: 4,
          borderRadius: 6, border: '1px solid rgba(0,200,122,0.35)',
          background: 'rgba(0,0,0,0.35)', color: 'var(--text)',
          fontFamily: 'var(--font-body)', fontSize: 14,
        }}
      />
      {!hasResults ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 10px', fontFamily: 'var(--font-cond)' }}>
          {t.hatTrickNoMatch}
        </div>
      ) : (
        <div style={{
          maxHeight: 270, overflowY: 'auto',
          borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.25)',
        }}>
          {filteredHome.length > 0 && (
            <>
              {renderTeamHeader(homeTeam, homeFlag)}
              {filteredHome.map(p => renderPlayer(p, homeFlag))}
            </>
          )}
          {filteredAway.length > 0 && (
            <>
              {renderTeamHeader(awayTeam, awayFlag)}
              {filteredAway.map(p => renderPlayer(p, awayFlag))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
