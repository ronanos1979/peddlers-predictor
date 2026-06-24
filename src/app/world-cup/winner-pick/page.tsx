'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadPatron, savePatron } from '@/lib/patron'
import { useLocale } from '@/lib/useLocale'
import { getWinnerPickTickets, BONUS_TIERS, getActiveTierIndex } from '@/lib/bonusTickets'
import Flag from '@/components/Flag'
import Link from 'next/link'

type Team = { name: string; flag: string }

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

function WinnerPickContent() {
  const { t } = useLocale()
  const searchParams = useSearchParams()
  const pubId = searchParams.get('pub') || 'haverhill'

  const currentTickets = getWinnerPickTickets()
  const activeTierIdx = getActiveTierIndex()

  const [teams, setTeams] = useState<Team[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Team | null>(null)
  const [existingPick, setExistingPick] = useState<{ team_name: string; team_flag: string; is_correct: boolean | null; potential_raffle_entries: number | null } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')

  const patron = typeof window !== 'undefined' ? loadPatron() : null

  useEffect(() => {
    async function load() {
      const [{ data: homeRows }, { data: awayRows }] = await Promise.all([
        supabase.from('matches').select('home_team, home_flag').neq('stage', 'Demo Match'),
        supabase.from('matches').select('away_team, away_flag').neq('stage', 'Demo Match'),
      ])
      const PLACEHOLDER_RE = /TBD|Winner|Runner|Place|R32 |QF[0-9]|SF[0-9]|Group [A-L] /
      const teamMap = new Map<string, string>()
      homeRows?.forEach(m => { if (m.home_team && m.home_flag && !PLACEHOLDER_RE.test(m.home_team)) teamMap.set(m.home_team, m.home_flag) })
      awayRows?.forEach(m => { if (m.away_team && m.away_flag && !PLACEHOLDER_RE.test(m.away_team)) teamMap.set(m.away_team, m.away_flag) })
      const sorted = Array.from(teamMap.entries())
        .map(([name, flag]) => ({ name, flag }))
        .sort((a, b) => a.name.localeCompare(b.name))
      setTeams(sorted)

      if (patron?.phone) {
        const raw = patron.phone.replace(/\D/g, '')
        const phone = raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw
        if (phone.length === 10) {
          const { data } = await supabase
            .from('winner_picks')
            .select('team_name, team_flag, is_correct, potential_raffle_entries')
            .eq('phone', phone)
            .maybeSingle()
          if (data) setExistingPick(data)
        }
      }
    }
    load()
  }, []) // eslint-disable-line

  const norm = search.toLowerCase().trim()
  const filtered = norm ? teams.filter(t => t.name.toLowerCase().includes(norm)) : teams

  async function handleSubmit() {
    if (!selected) return
    const name  = patron?.name  || guestName.trim()
    const phone = patron?.phone || guestPhone.trim()
    if (!name || !phone) { setError(t.pleaseEnterNamePhone); return }
    const raw = phone.replace(/\D/g, '')
    const cleanPhone = raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw
    if (cleanPhone.length !== 10) { setError('Enter a valid 10-digit US phone number.'); return }

    setSubmitting(true)
    setError('')
    try {
      const { error: err } = await supabase.from('winner_picks').insert({
        pub_id:                  pubId,
        phone:                   cleanPhone,
        name,
        team_name:               selected.name,
        team_flag:               selected.flag,
        potential_raffle_entries: currentTickets,
      })
      if (err) {
        setError(err.code === '23505' ? t.onceSubmitted : err.message)
        setSubmitting(false)
        return
      }
      if (!patron) savePatron({ name, phone: cleanPhone, pub_id: pubId })
      setSubmitted(true)
    } catch {
      setError(t.somethingWentWrong)
      setSubmitting(false)
    }
  }

  // ── Already picked ──────────────────────────────────────────────────────
  if (submitted || existingPick) {
    const pick = existingPick || (selected ? { team_name: selected.name, team_flag: selected.flag, is_correct: null, potential_raffle_entries: null } : null)
    const pickTickets = pick?.potential_raffle_entries ?? currentTickets
    return (
      <div className="container">
        <div style={{ textAlign: 'center', paddingTop: 32 }}>
          <div className="pop-in" style={{ fontSize: 56, marginBottom: 10 }}>🏆</div>
          <div className="slide-up">
            <h1 style={{ marginBottom: 6 }}>{submitted ? t.pickLocked : t.yourChampionPick}</h1>
            <p className="muted" style={{ marginBottom: 20 }}>
              {pick?.is_correct === true
                ? t.correctBonusN.replace('{n}', String(pickTickets))
                : pick?.is_correct === false
                ? t.wrongKeepStacking
                : t.bonusIfTrophyN.replace('{n}', String(pickTickets))}
            </p>
          </div>
          <div className="slide-up-delay card" style={{ marginBottom: 20, border: '1px solid rgba(245,197,24,0.4)', background: 'rgba(245,197,24,0.05)', padding: '24px 20px' }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
              {t.yourWCChampionPick}
            </div>
            {pick?.team_flag && (
              <div style={{ marginBottom: 10 }}>
                <Flag emoji={pick.team_flag} size={52} />
              </div>
            )}
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: 1, color: 'var(--gold)', marginBottom: 8 }}>
              {pick?.team_name}
            </div>
            {pick?.is_correct === true && (
              <span style={{ background: 'rgba(0,200,122,0.15)', color: 'var(--green)', border: '1px solid rgba(0,200,122,0.3)', borderRadius: 6, padding: '5px 14px', fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700 }}>
                {t.correctPlusN.replace('{n}', String(pickTickets))}
              </span>
            )}
            {pick?.is_correct === false && (
              <span style={{ background: 'rgba(255,59,59,0.1)', color: 'var(--red)', border: '1px solid rgba(255,59,59,0.25)', borderRadius: 6, padding: '5px 14px', fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700 }}>
                {t.didntWin}
              </span>
            )}
          </div>
          <Link href="/world-cup/winner-picks" className="btn btn-gold" style={{ textDecoration: 'none', textAlign: 'center', display: 'block', marginBottom: 8 }}>
            {t.seeCommunityPicks}
          </Link>
          <Link href="/my-picks" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center', display: 'block', marginBottom: 8 }}>
            👤 {t.myPicks}
          </Link>
          <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
            {t.homeArrow}
          </Link>
        </div>
      </div>
    )
  }

  // ── Main picker ─────────────────────────────────────────────────────────
  return (
    <div className="container" style={{ paddingBottom: selected ? (patron ? 92 : 172) : 24 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>
          {t.bonusPickLabel}
        </div>
        <h1 style={{ marginBottom: 4 }}>{t.predictChampion}</h1>
        <p className="muted" style={{ marginBottom: 12 }}>{t.whichTeamLifts}</p>

        {/* Ticket schedule */}
        <div style={{
          background: 'rgba(245,197,24,0.07)',
          border: '1px solid rgba(245,197,24,0.4)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 12,
        }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
            {t.ticketsDropEachRound}
          </div>

          {/* Current tier (or max if before first tier) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', letterSpacing: 1, lineHeight: 1 }}>
              +{currentTickets}
            </span>
            <div>
              <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                {activeTierIdx >= 0 ? t[STAGE_LABEL_KEYS[BONUS_TIERS[activeTierIdx].label]] : t.bonusPickStageGroupMD3}
              </div>
              <span style={{ background: 'var(--gold)', color: '#000', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-cond)', letterSpacing: 1 }}>
                {t.ticketNowBadge}
              </span>
            </div>
          </div>

          {/* Future tiers */}
          {BONUS_TIERS.filter((_, i) => i > activeTierIdx).map(tier => (
            <div key={tier.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-muted)', letterSpacing: 1, minWidth: 36, textAlign: 'right', lineHeight: 1 }}>
                +{tier.winnerTickets}
              </span>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--text-muted)' }}>
                {t.ticketAfterDateStageN
                  .replace('{date}', fmtTierDate(tier.from))
                  .replace('{stage}', t[STAGE_LABEL_KEYS[tier.label]])
                  .replace('{n}', String(tier.winnerTickets))}
              </div>
            </div>
          ))}
        </div>

        <p style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
          {t.onceSubmitted}
        </p>
        <Link href="/world-cup/winner-picks" style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-muted)', textDecoration: 'none', textTransform: 'uppercase' }}>
          {t.seeCommunityPicksArrow}
        </Link>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.searchTeams}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '11px 14px 11px 40px',
            color: 'var(--text)', fontSize: 15, fontFamily: 'var(--font-body)',
          }}
        />
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        )}
      </div>

      {/* Team list */}
      {teams.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontFamily: 'var(--font-cond)', letterSpacing: 1 }}>{t.loadingTeams}</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
          <p className="muted">{t.noTeamsFound.replace('{search}', search)}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(team => {
            const isSel = selected?.name === team.name
            return (
              <div key={team.name} onClick={() => setSelected(isSel ? null : team)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                background: isSel ? 'rgba(245,197,24,0.08)' : 'var(--surface)',
                border: `1px solid ${isSel ? 'var(--gold)' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}>
                <div style={{ width: 32, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                  <Flag emoji={team.flag} size={26} />
                </div>
                <div style={{ flex: 1, fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 16, color: isSel ? 'var(--gold)' : 'var(--text)' }}>
                  {team.name}
                </div>
                {isSel && <div style={{ color: 'var(--gold)', fontSize: 20, flexShrink: 0 }}>✓</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Sticky lock-in bar */}
      {selected && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            {!patron && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Your name"
                  style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-body)' }} />
                <input value={guestPhone} onChange={e => setGuestPhone(e.target.value)} placeholder="Phone number" type="tel"
                  style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-body)' }} />
              </div>
            )}
            {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>{error}</p>}
            <button className="btn btn-gold" disabled={submitting} onClick={handleSubmit} style={{ width: '100%' }}>
              {submitting ? t.lockingIn : t.backTeamToWin.replace('{name}', selected.name)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function WinnerPickPage() {
  return <Suspense><WinnerPickContent /></Suspense>
}
