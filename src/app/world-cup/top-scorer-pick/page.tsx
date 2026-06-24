'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLocale } from '@/lib/useLocale'
import { supabase } from '@/lib/supabase'
import { loadPatron, savePatron } from '@/lib/patron'
import { getScorerPickTickets, BONUS_TIERS, MAX_SCORER_TICKETS, getActiveTierIndex } from '@/lib/bonusTickets'
import Link from 'next/link'
import { GOLDEN_BOOT_CONTENDERS, type Contender } from '@/lib/goldenBootContenders'

type PlayerPick = Contender
type LiveScorer = {
  player: { id: number; name: string; nationality: string; photo: string }
  statistics: Array<{ team: { name: string; logo: string }; goals: { total: number } }>
}

const TOP_CONTENDERS = GOLDEN_BOOT_CONTENDERS

const STAGE_LABEL_KEYS: Record<string, 'bonusPickStageGroupMD3' | 'bonusPickStageR32' | 'bonusPickStageR16' | 'bonusPickStageQF' | 'bonusPickStageSF'> = {
  'Group Stage MD3': 'bonusPickStageGroupMD3',
  'Round of 32':     'bonusPickStageR32',
  'Round of 16':     'bonusPickStageR16',
  'Quarter Finals':  'bonusPickStageQF',
  'Semi Finals':     'bonusPickStageSF',
}

function fmtTierDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function TopScorerPickContent() {
  const { t } = useLocale()
  const searchParams = useSearchParams()
  const pubId = searchParams.get('pub') || 'haverhill'

  const currentTickets = getScorerPickTickets()
  const activeTierIdx = getActiveTierIndex()

  const [search, setSearch]           = useState('')
  const [customTeam, setCustomTeam]   = useState('')
  const [selected, setSelected]       = useState<PlayerPick | null>(null)
  const [liveScorers, setLiveScorers] = useState<LiveScorer[]>([])
  const [existingPick, setExistingPick] = useState<{ player_name: string; player_team: string } | null>(null)
  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [error, setError]             = useState('')
  const [guestName, setGuestName]     = useState('')
  const [guestPhone, setGuestPhone]   = useState('')

  const patron = typeof window !== 'undefined' ? loadPatron() : null

  useEffect(() => {
    async function load() {
      // Try live top scorers from API (available once tournament starts)
      try {
        const res = await fetch('/api/football?endpoint=players/topscorers')
        const data = await res.json()
        if (data.response?.length) setLiveScorers(data.response)
      } catch { /* pre-tournament — ignore */ }

      // Check for existing pick
      if (patron?.phone) {
        const { data } = await supabase
          .from('scorer_picks')
          .select('player_name, player_team')
          .eq('phone', patron.phone)
          .single()
        if (data) setExistingPick(data)
      }
    }
    load()
  }, []) // eslint-disable-line

  const norm = search.toLowerCase().trim()

  // Filter top contenders by name or country
  const filteredContenders = norm
    ? TOP_CONTENDERS.filter(p =>
        p.name.toLowerCase().includes(norm) ||
        p.country.toLowerCase().includes(norm) ||
        p.team.toLowerCase().includes(norm)
      )
    : TOP_CONTENDERS

  // Custom pick: shown when user has typed something not matching any contender
  const showCustom = norm.length >= 2 && filteredContenders.length === 0

  // Live scorers filtered (de-dupe against top contenders by name)
  const contenderNames = new Set(TOP_CONTENDERS.map(p => p.name.toLowerCase()))
  const filteredLive = liveScorers
    .filter(s => !contenderNames.has(s.player.name.toLowerCase()))
    .filter(s => !norm || s.player.name.toLowerCase().includes(norm) || s.player.nationality.toLowerCase().includes(norm))

  async function handleSubmit() {
    if (!selected) return
    const name  = patron?.name  || guestName.trim()
    const phone = patron?.phone || guestPhone.trim()
    if (!name || !phone) { setError(t.pleaseEnterNamePhone); return }
    setSubmitting(true)
    setError('')
    try {
      const { error: err } = await supabase.from('scorer_picks').insert({
        pub_id:                  pubId,
        phone,
        name,
        player_name:             selected.name,
        player_team:             selected.team,
        player_id:               selected.id,
        potential_raffle_entries: currentTickets,
      })
      if (err) { setError(err.message); setSubmitting(false); return }
      if (!patron) savePatron({ name, phone, pub_id: pubId })
      setSubmitted(true)
    } catch {
      setError(t.somethingWentWrong)
      setSubmitting(false)
    }
  }

  // ── Already picked ───────────────────────────────────────────────────────────
  if (submitted || existingPick) {
    const pick = existingPick || (selected ? { player_name: selected.name, player_team: selected.team } : null)
    const contender = TOP_CONTENDERS.find(p => p.name === pick?.player_name)
    return (
      <div className="container">
        <div style={{ textAlign: 'center', paddingTop: 32 }}>
          <div className="pop-in" style={{ fontSize: 56, marginBottom: 10 }}>🥇</div>
          <div className="slide-up">
            <h1 style={{ marginBottom: 6 }}>{t.topScorerSuccess}</h1>
            <p className="muted" style={{ marginBottom: 20 }}>{t.topScorerBonusN.replace('{n}', String(currentTickets))}</p>
          </div>
          <div className="slide-up-delay card" style={{ marginBottom: 20, border: '1px solid rgba(245,197,24,0.4)', background: 'rgba(245,197,24,0.05)' }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>{t.yourTopScorerPick}</div>
            {contender && (
              <div style={{ fontSize: 40, marginBottom: 8 }}>{contender.flag}</div>
            )}
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: 1, color: 'var(--gold)', marginBottom: 4 }}>
              {pick?.player_name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {contender ? `${contender.team} · ${contender.country}` : pick?.player_team}
            </div>
          </div>
          <Link href="/my-picks" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center', marginBottom: 8 }}>
            👤 {t.myPicks}
          </Link>
          <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>← {t.home}</Link>
        </div>
      </div>
    )
  }

  // ── Main picker ───────────────────────────────────────────────────────────────
  return (
    <div className="container" style={{ paddingBottom: selected ? (patron ? 100 : 160) : 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>🥇 {t.bonusPick}</div>
        <h1 style={{ marginBottom: 4 }}>{t.pickTopScorer}</h1>
        <p className="muted" style={{ marginBottom: 12 }}>{t.topScorerSubN.replace('{n}', String(currentTickets))}</p>

        {/* Ticket schedule */}
        <div style={{
          background: 'rgba(245,197,24,0.07)',
          border: '1px solid rgba(245,197,24,0.4)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 4,
        }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
            {t.ticketsDropEachRound}
          </div>

          {/* Current tier */}
          {(() => {
            const prevTickets = activeTierIdx === 0 ? MAX_SCORER_TICKETS : activeTierIdx > 0 ? BONUS_TIERS[activeTierIdx - 1].scorerTickets : null
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  {prevTickets !== null && (
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-dim)', letterSpacing: 1, lineHeight: 1, textDecoration: 'line-through', opacity: 0.5 }}>
                      +{prevTickets}
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', letterSpacing: 1, lineHeight: 1 }}>
                    +{currentTickets}
                  </span>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                    {activeTierIdx >= 0 ? t[STAGE_LABEL_KEYS[BONUS_TIERS[activeTierIdx].label]] : t.bonusPickStageGroupMD3}
                  </div>
                  <span style={{ background: 'var(--gold)', color: '#000', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-cond)', letterSpacing: 1 }}>
                    {t.ticketNowBadge}
                  </span>
                </div>
              </div>
            )
          })()}

          {/* Future tiers */}
          {BONUS_TIERS.filter((_, i) => i > activeTierIdx).map(tier => (
            <div key={tier.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-muted)', letterSpacing: 1, minWidth: 36, textAlign: 'right', lineHeight: 1 }}>
                +{tier.scorerTickets}
              </span>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)' }}>
                {t.ticketAfterDateStageN
                  .replace('{date}', fmtTierDate(tier.from))
                  .replace('{stage}', t[STAGE_LABEL_KEYS[tier.label]])
                  .replace('{n}', String(tier.scorerTickets))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null) }}
          placeholder={t.searchPlayerCountry}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '12px 14px 12px 40px',
            color: 'var(--text)', fontSize: 15, fontFamily: 'var(--font-body)',
          }}
        />
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
        {search && (
          <button onClick={() => { setSearch(''); setSelected(null) }}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>

      {/* Live top scorers (once tournament starts) */}
      {filteredLive.length > 0 && (
        <>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 10 }}>
            {t.tournamentLeaders}
          </div>
          {filteredLive.slice(0, 5).map(s => {
            const isSelected = selected?.name === s.player.name
            return (
              <PlayerCard
                key={s.player.id}
                name={s.player.name}
                subtitle={`${s.statistics[0]?.team.name} · ${s.player.nationality}`}
                right={<><span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: isSelected ? 'var(--gold)' : 'var(--green)', letterSpacing: 1 }}>{s.statistics[0]?.goals.total ?? 0}</span><span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-cond)', display: 'block', textTransform: 'uppercase' }}>{t.goalsLower}</span></>}
                isSelected={isSelected}
                onSelect={() => setSelected(isSelected ? null : { name: s.player.name, team: s.statistics[0]?.team.name || '', country: s.player.nationality, flag: '', id: s.player.id })}
              />
            )
          })}
          <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
        </>
      )}

      {/* Top contenders */}
      {filteredContenders.length > 0 && (
        <>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
            {liveScorers.length > 0 ? t.topContenders : `⭐ ${t.topContenders}`}
          </div>
          {filteredContenders.map(p => {
            const isSelected = selected?.name === p.name
            return (
              <PlayerCard
                key={p.name}
                name={p.name}
                subtitle={`${p.team} · ${p.country}`}
                flag={p.flag}
                isSelected={isSelected}
                onSelect={() => setSelected(isSelected ? null : p)}
              />
            )
          })}
        </>
      )}

      {/* Custom player entry */}
      {showCustom && (
        <>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, marginTop: 8 }}>
            {t.notInList}
          </div>
          <div className="card" style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
              {t.pickQuoted.replace('{name}', search)}
            </div>
            <input
              value={customTeam}
              onChange={e => setCustomTeam(e.target.value)}
              placeholder={t.teamCountryPlaceholder}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px',
                color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-body)',
                marginBottom: 10,
              }}
            />
            <button
              onClick={() => setSelected({ name: search, team: customTeam || 'Unknown', country: customTeam || '', flag: '', id: null })}
              className="btn btn-secondary"
              style={{ width: '100%' }}
            >
              {t.selectPlayer.replace('{name}', search)}
            </button>
          </div>
        </>
      )}

      {!norm && filteredContenders.length === 0 && liveScorers.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <p className="muted">{t.noPlayersFound}</p>
        </div>
      )}

      {/* Sticky lock-in bar */}
      {selected && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          background: 'var(--bg)', borderTop: '1px solid var(--border)',
          padding: '12px 16px',
        }}>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            {!patron && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="Your name"
                  style={{
                    flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 12px', color: 'var(--text)',
                    fontSize: 14, fontFamily: 'var(--font-body)',
                  }}
                />
                <input
                  value={guestPhone}
                  onChange={e => setGuestPhone(e.target.value)}
                  placeholder="Phone number"
                  type="tel"
                  style={{
                    flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 12px', color: 'var(--text)',
                    fontSize: 14, fontFamily: 'var(--font-body)',
                  }}
                />
              </div>
            )}
            {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>{error}</p>}
            <button className="btn btn-gold" disabled={submitting} onClick={handleSubmit} style={{ width: '100%' }}>
              {submitting ? t.submitting : `🥇 ${t.lockInTopScorer}: ${selected.name}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerCard({
  name, subtitle, flag, right, isSelected, onSelect,
}: {
  name: string
  subtitle: string
  flag?: string
  right?: React.ReactNode
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <div onClick={onSelect} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: 10, marginBottom: 8, cursor: 'pointer',
      background: isSelected ? 'rgba(245,197,24,0.08)' : 'var(--surface)',
      border: `1px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
      transition: 'all 0.15s',
    }}>
      {flag !== undefined && (
        <div style={{ fontSize: 28, lineHeight: 1, width: 36, textAlign: 'center', flexShrink: 0 }}>
          {flag || '👤'}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 16, color: isSelected ? 'var(--gold)' : 'var(--text)' }}>
          {name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{subtitle}</div>
      </div>
      {right && <div style={{ textAlign: 'right', flexShrink: 0 }}>{right}</div>}
      {isSelected && <div style={{ color: 'var(--gold)', fontSize: 20, flexShrink: 0 }}>✓</div>}
    </div>
  )
}

export default function TopScorerPickPage() {
  return <Suspense><TopScorerPickContent /></Suspense>
}
