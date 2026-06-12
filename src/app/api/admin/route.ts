import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { checkRateLimit, getIp } from '@/lib/rateLimit'
import { getFdFixtures, getFdMatchEvents, FdRateLimitError } from '@/lib/footballData'

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

      // Auto-score winner_picks if this is the Final
      const { data: finalMatchData } = await supabaseAdmin
        .from('matches').select('stage, home_team, away_team').eq('id', match_id).single()
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
        teams: { home: { winner: boolean | null }; away: { winner: boolean | null } }
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
        .select('id, kickoff_at')
        .is('result', null)
        .lt('kickoff_at', twoHoursAgo)
        .neq('stage', 'Demo Match')

      if (!unresolved || unresolved.length === 0) {
        return NextResponse.json({ success: true, updated: 0, entries_scored: 0, message: 'No unresolved finished matches' })
      }

      let updated = 0
      let entries_scored = 0

      for (const match of unresolved) {
        const matchMs = new Date(match.kickoff_at).getTime()
        // Match by kickoff time within 5-minute tolerance
        const fdMatch = fdFinished.find(f => Math.abs(new Date(f.fixture.date).getTime() - matchMs) <= 5 * 60 * 1000)
        if (!fdMatch) continue

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
      }

      return NextResponse.json({ success: true, updated, entries_scored })
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

      const kickoffMs = new Date(match.kickoff_at).getTime()
      const norm = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim()
      const normHome = norm(match.home_team)
      const normAway = norm(match.away_team)

      type FdAdapted = {
        fixture: { id: number; date: string }
        teams: { home: { name: string }; away: { name: string } }
      }

      // Primary: FD finished fixtures → single-match endpoint for events
      let fdMatchId: number | null = null
      try {
        const fdData = await getFdFixtures({ status: 'FT' }) as { response?: FdAdapted[] }
        const fdFixtures = fdData?.response || []
        const fdMatch = fdFixtures.find(f => {
          const diff = Math.abs(new Date(f.fixture.date).getTime() - kickoffMs)
          if (diff > 10 * 60 * 1000) return false // must be within ±10 min
          const fh = norm(f.teams.home.name)
          const fa = norm(f.teams.away.name)
          return (fh.includes(normHome) || normHome.includes(fh)) &&
                 (fa.includes(normAway) || normAway.includes(fa))
        })
        if (fdMatch) fdMatchId = fdMatch.fixture.id
      } catch (e) {
        if (!(e instanceof FdRateLimitError)) console.error('FD fixture lookup error:', e)
      }

      let events: Array<{
        time: { elapsed: number; extra: number | null }
        team: { name: string }
        player: { name: string }
        assist: { name: string } | null
        type: string
        detail: string
      }> = []

      if (fdMatchId !== null) {
        // FD single-match endpoint — reliably has goals + bookings
        const evData = await getFdMatchEvents(String(fdMatchId)) as {
          events?: typeof events
          homeTeam?: { name: string }
          awayTeam?: { name: string }
        }
        events = evData?.events || []
      } else {
        // Fallback: AF fixtures/events (100 req/day limit)
        const AF_KEY = process.env.API_FOOTBALL_KEY
        if (!AF_KEY) {
          return NextResponse.json({
            error: `FD match not found for ${match.home_team} vs ${match.away_team} (within 10 min of ${match.kickoff_at}). FOOTBALL_DATA_API_KEY or API_FOOTBALL_KEY needed.`
          }, { status: 404 })
        }

        const date = match.kickoff_at.slice(0, 10)
        type AfFixture = { fixture: { id: number; date: string }; teams: { home: { name: string }; away: { name: string } } }

        const matchAf = async (url: string) => {
          const res = await fetch(url, { headers: { 'x-apisports-key': AF_KEY } })
          const data = await res.json()
          if (data?.errors?.requests) throw new Error('AF rate limit')
          return (data.response || []) as AfFixture[]
        }

        let afFixtures = await matchAf(
          `https://v3.football.api-sports.io/fixtures?league=1&season=2026&date=${date}`
        )
        if (afFixtures.length === 0) {
          afFixtures = await matchAf(`https://v3.football.api-sports.io/fixtures?league=1&season=2026`)
        }

        const afMatch = afFixtures.find(f => {
          const fh = norm(f.teams.home.name)
          const fa = norm(f.teams.away.name)
          return (fh.includes(normHome) || normHome.includes(fh)) &&
                 (fa.includes(normAway) || normAway.includes(fa))
        })

        if (!afMatch) {
          return NextResponse.json({
            error: `Match not found in FD or AF: ${match.home_team} vs ${match.away_team} on ${date}.`
          }, { status: 404 })
        }

        type AfEvent = {
          time: { elapsed: number; extra: number | null }
          team: { name: string }
          player: { name: string | null }
          assist: { name: string | null } | null
          type: string; detail: string
        }
        const evRes = await fetch(
          `https://v3.football.api-sports.io/fixtures/events?fixture=${afMatch.fixture.id}`,
          { headers: { 'x-apisports-key': AF_KEY } }
        )
        const evData = await evRes.json()
        if (evData?.errors?.requests) return NextResponse.json({ error: 'AF rate limit' }, { status: 429 })
        events = ((evData.response || []) as AfEvent[])
          .filter(e => e.type === 'Goal' || e.type === 'Card')
          .map(e => ({
            time:   { elapsed: e.time.elapsed, extra: e.time.extra ?? null },
            team:   { name: e.team.name },
            player: { name: e.player.name || '' },
            assist: e.assist?.name ? { name: e.assist.name } : null,
            type:   e.type,
            detail: e.detail === 'Second Yellow card' ? 'Yellow Red Card' : e.detail,
          }))
      }

      const { error: upsertErr } = await supabaseAdmin.from('match_events').upsert({
        match_id: matchId,
        af_fixture_id: fdMatchId ?? null,
        kickoff_at: match.kickoff_at,
        events,
        loaded_at: new Date().toISOString(),
      })
      if (upsertErr) return NextResponse.json({ error: `DB error: ${upsertErr.message}` }, { status: 500 })

      return NextResponse.json({ success: true, count: events.length, events, fd_match_id: fdMatchId })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Admin API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
