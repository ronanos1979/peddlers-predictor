import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { checkRateLimit, getIp } from '@/lib/rateLimit'
import { getFdFixtures, FdRateLimitError } from '@/lib/footballData'
import { toEspnDate, toEspnTeamName, parseEspnMinute, mapEspnEventType } from '@/lib/espnEvents'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'

type EspnMatchEvent = {
  time: { elapsed: number; extra: number | null }
  team: { name: string }
  player: { name: string }
  assist: { name: string } | null
  type: string
  detail: string
  teamSide: 'home' | 'away' | undefined
}

async function fetchEspnEvents(
  matchId: string,
  kickoffAt: string,
  homeTeam: string,
  awayTeam: string,
): Promise<{ events: EspnMatchEvent[]; espnEventId: string } | null> {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim()

  const espnHomeName = toEspnTeamName(homeTeam)
  const espnAwayName = toEspnTeamName(awayTeam)
  const normHome = norm(espnHomeName)
  const normAway = norm(espnAwayName)
  const date = toEspnDate(kickoffAt)
  const kickoffEt = new Date(new Date(kickoffAt).getTime() - 4 * 60 * 60 * 1000)

  type EspnCompetitor = { homeAway: 'home' | 'away'; team: { id: string; displayName: string } }
  type EspnEvent = { id: string; competitions: Array<{ competitors: EspnCompetitor[] }> }

  const findInScoreboard = (events: EspnEvent[]) =>
    events.find(e => {
      const comps = e.competitions?.[0]?.competitors || []
      const hasHome = comps.some(c => { const n = norm(c.team.displayName); return n === normHome || n.includes(normHome) || normHome.includes(n) })
      const hasAway = comps.some(c => { const n = norm(c.team.displayName); return n === normAway || n.includes(normAway) || normAway.includes(n) })
      return hasHome && hasAway
    })

  let espnEvent: EspnEvent | undefined
  const sbRes = await fetch(`${ESPN_BASE}/scoreboard?dates=${date}`)
  if (sbRes.ok) {
    const sbData = await sbRes.json()
    espnEvent = findInScoreboard(sbData.events || [])
  }

  if (!espnEvent) {
    const prevDate = new Date(kickoffEt.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '')
    const sbRes2 = await fetch(`${ESPN_BASE}/scoreboard?dates=${prevDate}`)
    if (sbRes2.ok) {
      const sbData2 = await sbRes2.json()
      espnEvent = findInScoreboard(sbData2.events || [])
    }
  }

  if (!espnEvent) return null

  const comps = espnEvent.competitions[0].competitors
  const espnHomeId = comps.find(c => c.homeAway === 'home')?.team?.id
  const espnAwayId = comps.find(c => c.homeAway === 'away')?.team?.id

  const sumRes = await fetch(`${ESPN_BASE}/summary?event=${espnEvent.id}`)
  if (!sumRes.ok) return null
  const sumData = await sumRes.json()

  type EspnKeyEvent = {
    type: { type: string }
    clock: { displayValue: string }
    team?: { id: string; displayName: string }
    participants?: Array<{ athlete: { displayName: string } }>
  }

  const events: EspnMatchEvent[] = ((sumData.keyEvents || []) as EspnKeyEvent[])
    .filter(e => mapEspnEventType(e.type?.type) !== null)
    .map(e => {
      const mapped = mapEspnEventType(e.type?.type)!
      const teamId = e.team?.id
      const teamSide: 'home' | 'away' | undefined =
        teamId === espnHomeId ? 'home' : teamId === espnAwayId ? 'away' : undefined
      const teamName = teamSide === 'home' ? homeTeam
        : teamSide === 'away' ? awayTeam
        : (e.team?.displayName || '')
      const parts = e.participants || []
      return {
        time:     parseEspnMinute(e.clock?.displayValue || ''),
        team:     { name: teamName },
        player:   { name: parts[0]?.athlete?.displayName || '' },
        assist:   parts[1]?.athlete?.displayName ? { name: parts[1].athlete.displayName } : null,
        type:     mapped.type,
        detail:   mapped.detail,
        teamSide,
      }
    })

  await supabaseAdmin.from('match_events').upsert({
    match_id: matchId,
    af_fixture_id: parseInt(espnEvent.id) || null,
    kickoff_at: kickoffAt,
    events,
    loaded_at: new Date().toISOString(),
  })

  return { events, espnEventId: espnEvent.id }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getIp(req)

    // Hard block IPs that have hit 10 failed attempts in 15 minutes
    if (!checkRateLimit(`admin:${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 })
    }

    const { password, action, payload } = await req.json()

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Login check
    if (action === 'ping') {
      return NextResponse.json({ success: true })
    }

    // Set match result and score all entries
    if (action === 'set_result') {
      const { match_id, result, home_score, away_score, auto_draw_min } = payload

      if (!['home', 'draw', 'away'].includes(result)) {
        return NextResponse.json({ error: 'Invalid result' }, { status: 400 })
      }

      const homeScore = home_score != null ? parseInt(String(home_score), 10) : null
      const awayScore = away_score != null ? parseInt(String(away_score), 10) : null

      await supabaseAdmin
        .from('matches')
        .update({
          result,
          home_score: homeScore != null && !isNaN(homeScore) ? homeScore : null,
          away_score: awayScore != null && !isNaN(awayScore) ? awayScore : null,
        })
        .eq('id', match_id)

      const { data: entries } = await supabaseAdmin
        .from('entries')
        .select('id, pick, home_score_pred, away_score_pred')
        .eq('match_id', match_id)

      if (entries) {
        for (const entry of entries) {
          const is_correct = entry.pick === result
          let raffle_entries = 0
          if (is_correct) {
            const scoreCorrect =
              homeScore != null && awayScore != null &&
              entry.home_score_pred === homeScore && entry.away_score_pred === awayScore
            raffle_entries = scoreCorrect ? 3 : 1
          }
          await supabaseAdmin
            .from('entries')
            .update({ is_correct, raffle_entries })
            .eq('id', entry.id)
        }
      }

      // Auto-draw check-in winner if threshold met and not already drawn
      let checkinDraw: { winner_name: string; winner_phone: string } | null = null
      const minDraw = auto_draw_min != null ? parseInt(String(auto_draw_min), 10) : 0
      if (minDraw > 0) {
        const { data: match } = await supabaseAdmin
          .from('matches').select('checkin_winner_name').eq('id', match_id).single()
        if (!match?.checkin_winner_name) {
          const { data: checkins } = await supabaseAdmin
            .from('check_ins').select('name, phone, email, pub_id').eq('match_id', match_id)
          if (checkins && checkins.length >= minDraw) {
            const winner = checkins[Math.floor(Math.random() * checkins.length)]
            await supabaseAdmin.from('matches').update({
              checkin_winner_name: winner.name,
              checkin_winner_phone: winner.phone,
              checkin_draw_at: new Date().toISOString(),
            }).eq('id', match_id)
            checkinDraw = { winner_name: winner.name, winner_phone: winner.phone }
            if (process.env.RESEND_API_KEY) {
              const { data: matchData } = await supabaseAdmin
                .from('matches').select('home_team, away_team').eq('id', match_id).single()
              const from = process.env.RESEND_FROM_EMAIL ?? 'World Cup Predictor <noreply@peddlerspredictor.com>'
              const matchLabel = matchData ? `${matchData.home_team} vs ${matchData.away_team}` : 'tonight\'s match'
              const pubLabel = winner.pub_id === 'haverhill' ? 'Haverhill' : winner.pub_id === 'nashua' ? 'Nashua' : winner.pub_id || 'Unknown'
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from,
                  to: ['ronan.osullivan@ronanos.com', 'mike@thepeddlersdaughter.com'],
                  subject: `🏆 Attendance Draw Winner — ${matchLabel}`,
                  html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#0a0a0a;color:#f0ede8;padding:28px 20px;border-radius:12px;">
                    <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#777770;margin-bottom:8px;">THE PEDDLER'S DAUGHTER</div>
                    <div style="font-size:24px;font-weight:900;color:#FF9500;margin-bottom:4px;">🏆 Attendance Draw Winner</div>
                    <div style="font-size:14px;color:#aaa;margin-bottom:20px;">${matchLabel} · ${pubLabel}</div>
                    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                      <tr><td style="padding:8px 0;color:#777770;font-size:13px;width:70px;">Name</td><td style="padding:8px 0;font-size:15px;font-weight:700;">${winner.name}</td></tr>
                      <tr><td style="padding:8px 0;color:#777770;font-size:13px;">Phone</td><td style="padding:8px 0;font-size:14px;">${winner.phone}</td></tr>
                      <tr><td style="padding:8px 0;color:#777770;font-size:13px;">Email</td><td style="padding:8px 0;font-size:14px;">${winner.email || 'Not provided'}</td></tr>
                      <tr><td style="padding:8px 0;color:#777770;font-size:13px;">Pub</td><td style="padding:8px 0;font-size:14px;">${pubLabel}</td></tr>
                    </table>
                    <p style="font-size:12px;color:#555;">Auto-draw triggered by check-in threshold · The Peddler's Daughter</p>
                  </div>`
                })
              }).catch(() => {})
            }
          }
        }
      }

      // Auto-score winner_picks if this is the Final; also fetch kickoff/names for ESPN
      const { data: finalMatchData } = await supabaseAdmin
        .from('matches').select('stage, home_team, away_team, kickoff_at').eq('id', match_id).single()
      if (finalMatchData?.stage === 'Final') {
        const champion = result === 'home' ? finalMatchData.home_team : finalMatchData.away_team
        await supabaseAdmin.from('winner_picks')
          .update({ is_correct: true, raffle_entries: 15 })
          .eq('team_name', champion)
        await supabaseAdmin.from('winner_picks')
          .update({ is_correct: false, raffle_entries: 0 })
          .neq('team_name', champion)
          .is('is_correct', null)
      }

      // Auto-load ESPN match events (fire-and-forget — don't block the response)
      if (finalMatchData?.kickoff_at) {
        fetchEspnEvents(match_id, finalMatchData.kickoff_at, finalMatchData.home_team, finalMatchData.away_team).catch(() => {})
      }

      return NextResponse.json({ success: true, updated: entries?.length || 0, checkin_draw: checkinDraw })
    }

    if (action === 'mark_feedback_read') {
      const { id } = payload
      await supabaseAdmin.from('feedback').update({ read: true }).eq('id', id)
      return NextResponse.json({ success: true })
    }

    if (action === 'sync_results') {
      type FdFixture = {
        fixture: { date: string; status: { short: string } }
        teams: { home: { name: string; winner: boolean | null }; away: { name: string; winner: boolean | null } }
        goals: { home: number | null; away: number | null }
      }

      let fdFinished: FdFixture[] = []
      try {
        const data = await getFdFixtures({ status: 'FT' }) as { response?: FdFixture[] }
        fdFinished = (data.response || []).filter(f => f.fixture.status.short === 'FT')
      } catch (e) {
        if (e instanceof FdRateLimitError) {
          return NextResponse.json({ error: 'Football data rate limited — try again in a minute' }, { status: 429 })
        }
        throw e
      }

      if (fdFinished.length === 0) {
        return NextResponse.json({ success: true, updated: 0, entries_scored: 0, message: 'No finished matches found from API' })
      }

      // Only consider matches that kicked off 2+ hours ago (safely finished) and have no result yet
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data: unresolved } = await supabaseAdmin
        .from('matches')
        .select('id, kickoff_at, home_team, away_team')
        .is('result', null)
        .lt('kickoff_at', twoHoursAgo)
        .neq('stage', 'Demo Match')

      if (!unresolved || unresolved.length === 0) {
        return NextResponse.json({ success: true, updated: 0, entries_scored: 0, message: 'No unresolved finished matches' })
      }

      let updated = 0
      let entries_scored = 0
      type SyncDebugUnmatched = { match: string; dbKickoff: string; nearestFd: string | null; nearestFdKickoff: string | null; diffMin: number | null }
      const unmatched: SyncDebugUnmatched[] = []
      const resolvedForEspn: Array<{ id: string; kickoff_at: string; home_team: string; away_team: string }> = []

      for (const match of unresolved) {
        const matchMs = new Date(match.kickoff_at).getTime()
        // Match by kickoff time within 5-minute tolerance
        const fdMatch = fdFinished.find(f => Math.abs(new Date(f.fixture.date).getTime() - matchMs) <= 5 * 60 * 1000)

        if (!fdMatch) {
          // Find the nearest FD match by time for debugging
          let nearestDiff = Infinity
          let nearestFd: FdFixture | null = null
          for (const f of fdFinished) {
            const diff = Math.abs(new Date(f.fixture.date).getTime() - matchMs)
            if (diff < nearestDiff) { nearestDiff = diff; nearestFd = f }
          }
          unmatched.push({
            match: `${match.home_team} vs ${match.away_team}`,
            dbKickoff: match.kickoff_at,
            nearestFd: nearestFd ? `${nearestFd.teams.home.name} vs ${nearestFd.teams.away.name}` : null,
            nearestFdKickoff: nearestFd ? nearestFd.fixture.date : null,
            diffMin: nearestFd ? Math.round(nearestDiff / 60000) : null,
          })
          continue
        }

        const result: 'home' | 'draw' | 'away' =
          fdMatch.teams.home.winner === true ? 'home' :
          fdMatch.teams.away.winner === true ? 'away' : 'draw'
        const homeScore = fdMatch.goals.home ?? null
        const awayScore = fdMatch.goals.away ?? null

        await supabaseAdmin.from('matches').update({ result, home_score: homeScore, away_score: awayScore }).eq('id', match.id)

        const { data: entries } = await supabaseAdmin
          .from('entries')
          .select('id, pick, home_score_pred, away_score_pred')
          .eq('match_id', match.id)

        if (entries) {
          for (const entry of entries) {
            const is_correct = entry.pick === result
            let raffle_entries = 0
            if (is_correct) {
              const scoreCorrect = homeScore != null && awayScore != null &&
                entry.home_score_pred === homeScore && entry.away_score_pred === awayScore
              raffle_entries = scoreCorrect ? 3 : 1
            }
            await supabaseAdmin.from('entries').update({ is_correct, raffle_entries }).eq('id', entry.id)
            entries_scored++
          }
        }
        updated++
        resolvedForEspn.push(match)
      }

      // Auto-load ESPN events for all newly resolved matches (parallel, errors suppressed)
      let events_loaded = 0
      if (resolvedForEspn.length > 0) {
        const espnResults = await Promise.allSettled(
          resolvedForEspn.map(m => fetchEspnEvents(m.id, m.kickoff_at, m.home_team, m.away_team))
        )
        events_loaded = espnResults.filter(r => r.status === 'fulfilled' && r.value !== null).length
      }

      return NextResponse.json({
        success: true, updated, entries_scored, events_loaded,
        debug: { fdFinishedCount: fdFinished.length, dbUnresolvedCount: unresolved.length, unmatched },
      })
    }

    if (action === 'draw_checkin_winner') {
      const { match_id } = payload
      const { data: checkins } = await supabaseAdmin
        .from('check_ins').select('name, phone, email, pub_id').eq('match_id', match_id)
      if (!checkins?.length) {
        return NextResponse.json({ error: 'No check-ins for this match' }, { status: 400 })
      }
      const winner = checkins[Math.floor(Math.random() * checkins.length)]
      await supabaseAdmin.from('matches').update({
        checkin_winner_name: winner.name,
        checkin_winner_phone: winner.phone,
        checkin_draw_at: new Date().toISOString(),
      }).eq('id', match_id)
      let emailed = false
      if (process.env.RESEND_API_KEY) {
        const { data: matchData } = await supabaseAdmin
          .from('matches').select('home_team, away_team').eq('id', match_id).single()
        const from = process.env.RESEND_FROM_EMAIL ?? 'World Cup Predictor <noreply@peddlerspredictor.com>'
        const matchLabel = matchData ? `${matchData.home_team} vs ${matchData.away_team}` : 'tonight\'s match'
        const pubLabel = winner.pub_id === 'haverhill' ? 'Haverhill' : winner.pub_id === 'nashua' ? 'Nashua' : winner.pub_id || 'Unknown'
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: ['ronan.osullivan@ronanos.com', 'mike@thepeddlersdaughter.com'],
            subject: `🏆 Attendance Draw Winner — ${matchLabel}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#0a0a0a;color:#f0ede8;padding:28px 20px;border-radius:12px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#777770;margin-bottom:8px;">THE PEDDLER'S DAUGHTER</div>
              <div style="font-size:24px;font-weight:900;color:#FF9500;margin-bottom:4px;">🏆 Attendance Draw Winner</div>
              <div style="font-size:14px;color:#aaa;margin-bottom:20px;">${matchLabel} · ${pubLabel}</div>
              <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <tr><td style="padding:8px 0;color:#777770;font-size:13px;width:70px;">Name</td><td style="padding:8px 0;font-size:15px;font-weight:700;">${winner.name}</td></tr>
                <tr><td style="padding:8px 0;color:#777770;font-size:13px;">Phone</td><td style="padding:8px 0;font-size:14px;">${winner.phone}</td></tr>
                <tr><td style="padding:8px 0;color:#777770;font-size:13px;">Email</td><td style="padding:8px 0;font-size:14px;">${winner.email || 'Not provided'}</td></tr>
                <tr><td style="padding:8px 0;color:#777770;font-size:13px;">Pub</td><td style="padding:8px 0;font-size:14px;">${pubLabel}</td></tr>
              </table>
              <p style="font-size:12px;color:#555;">Manual draw · The Peddler's Daughter</p>
            </div>`
          })
        }).catch(() => {})
        emailed = true
      }
      return NextResponse.json({ success: true, winner_name: winner.name, winner_phone: winner.phone, emailed })
    }

    if (action === 'delete_entry') {
      const { entry_id } = payload
      if (!entry_id) return NextResponse.json({ error: 'entry_id required' }, { status: 400 })
      const { error: delError } = await supabaseAdmin.from('entries').delete().eq('id', entry_id)
      if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === 'load_match_events') {
      const { matchId } = payload as { matchId: string }
      if (!matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 })

      const { data: match, error: matchErr } = await supabaseAdmin
        .from('matches').select('kickoff_at, home_team, away_team').eq('id', matchId).single()
      if (matchErr || !match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

      // ESPN unofficial API — free, no key required, has WC 2026 events
      const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'
      const norm = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim()

      const espnHomeName = toEspnTeamName(match.home_team)
      const espnAwayName = toEspnTeamName(match.away_team)
      const normHome = norm(espnHomeName)
      const normAway = norm(espnAwayName)

      // ESPN groups by US Eastern time (UTC-4); toEspnDate handles the offset
      const date = toEspnDate(match.kickoff_at)
      const kickoffEt = new Date(new Date(match.kickoff_at).getTime() - 4 * 60 * 60 * 1000)

      type EspnCompetitor = { homeAway: 'home' | 'away'; team: { id: string; displayName: string } }
      type EspnEvent = { id: string; competitions: Array<{ competitors: EspnCompetitor[] }> }

      const findInScoreboard = (events: EspnEvent[]) =>
        events.find(e => {
          const comps = e.competitions?.[0]?.competitors || []
          const hasHome = comps.some(c => { const n = norm(c.team.displayName); return n === normHome || n.includes(normHome) || normHome.includes(n) })
          const hasAway = comps.some(c => { const n = norm(c.team.displayName); return n === normAway || n.includes(normAway) || normAway.includes(n) })
          return hasHome && hasAway
        })

      // 1. Try ET date; fall back to ET date - 1 day as a safety net
      let espnEvent: EspnEvent | undefined
      const sbRes = await fetch(`${ESPN_BASE}/scoreboard?dates=${date}`)
      if (!sbRes.ok) return NextResponse.json({ error: `ESPN scoreboard fetch failed: ${sbRes.status}` }, { status: 502 })
      const sbData = await sbRes.json()
      espnEvent = findInScoreboard(sbData.events || [])

      if (!espnEvent) {
        const prevDate = new Date(kickoffEt.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '')
        const sbRes2 = await fetch(`${ESPN_BASE}/scoreboard?dates=${prevDate}`)
        if (sbRes2.ok) {
          const sbData2 = await sbRes2.json()
          espnEvent = findInScoreboard(sbData2.events || [])
        }
      }

      if (!espnEvent) {
        return NextResponse.json({
          error: `ESPN: no match found for ${match.home_team} vs ${match.away_team} (ESPN names: ${espnHomeName} vs ${espnAwayName}, ET date: ${date}).`
        }, { status: 404 })
      }

      const comps = espnEvent.competitions[0].competitors
      const homeComp = comps.find(c => c.homeAway === 'home')
      const awayComp = comps.find(c => c.homeAway === 'away')
      const espnHomeId = homeComp?.team?.id
      const espnAwayId = awayComp?.team?.id

      // 2. Fetch ESPN match summary for events
      const sumRes = await fetch(`${ESPN_BASE}/summary?event=${espnEvent.id}`)
      if (!sumRes.ok) return NextResponse.json({ error: `ESPN summary fetch failed: ${sumRes.status}` }, { status: 502 })
      const sumData = await sumRes.json()

      // 3. Parse keyEvents — goals and cards only
      type EspnKeyEvent = {
        type: { type: string }
        clock: { displayValue: string }
        team?: { id: string; displayName: string }
        participants?: Array<{ athlete: { displayName: string } }>
      }

      const events = ((sumData.keyEvents || []) as EspnKeyEvent[])
        .filter(e => mapEspnEventType(e.type?.type) !== null)
        .map(e => {
          const mapped = mapEspnEventType(e.type?.type)!
          const teamId = e.team?.id
          const teamSide: 'home' | 'away' | undefined =
            teamId === espnHomeId ? 'home' : teamId === espnAwayId ? 'away' : undefined
          const teamName = teamSide === 'home' ? match.home_team
            : teamSide === 'away' ? match.away_team
            : (e.team?.displayName || '')
          const parts = e.participants || []
          return {
            time:     parseEspnMinute(e.clock?.displayValue || ''),
            team:     { name: teamName },
            player:   { name: parts[0]?.athlete?.displayName || '' },
            assist:   parts[1]?.athlete?.displayName ? { name: parts[1].athlete.displayName } : null,
            type:     mapped.type,
            detail:   mapped.detail,
            teamSide,
          }
        })

      const { error: upsertErr } = await supabaseAdmin.from('match_events').upsert({
        match_id: matchId,
        af_fixture_id: parseInt(espnEvent.id) || null,
        kickoff_at: match.kickoff_at,
        events,
        loaded_at: new Date().toISOString(),
      })
      if (upsertErr) return NextResponse.json({ error: `DB error: ${upsertErr.message}` }, { status: 500 })

      return NextResponse.json({ success: true, count: events.length, events, espn_event_id: espnEvent.id })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Admin API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
