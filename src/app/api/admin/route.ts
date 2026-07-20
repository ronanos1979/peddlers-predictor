import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { checkRateLimit, getIp } from '@/lib/rateLimit'
import { FdRateLimitError } from '@/lib/footballData'
import { fetchEspnEvents, scorerNameMatches } from '@/lib/fetchEspnEvents'
import { toEspnDate, toEspnTeamName } from '@/lib/espnEvents'
import { syncResults, resyncMatchIds, updateKnockoutNames } from '@/lib/syncResults'

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
      const { match_id, result, home_score, away_score, penalties_scored, auto_draw_min } = payload

      if (!['home', 'draw', 'away'].includes(result)) {
        return NextResponse.json({ error: 'Invalid result' }, { status: 400 })
      }

      const homeScore = home_score != null ? parseInt(String(home_score), 10) : null
      const awayScore = away_score != null ? parseInt(String(away_score), 10) : null
      const penaltiesScored = penalties_scored === true ? true : penalties_scored === false ? false : null

      await supabaseAdmin
        .from('matches')
        .update({
          result,
          home_score: homeScore != null && !isNaN(homeScore) ? homeScore : null,
          away_score: awayScore != null && !isNaN(awayScore) ? awayScore : null,
          penalties_scored: penaltiesScored,
        })
        .eq('id', match_id)

      // Fetch hat_trick_scored/scorer/penalties_scored if ESPN events were already loaded before result was set
      const { data: matchForBonuses } = await supabaseAdmin
        .from('matches').select('hat_trick_scored, hat_trick_scorer, penalties_scored').eq('id', match_id).single()
      const hatTrickScored = matchForBonuses?.hat_trick_scored ?? null
      const hatTrickScorer = (matchForBonuses as { hat_trick_scorer?: string | null } | null)?.hat_trick_scorer ?? null
      const penaltiesScoredVal = penaltiesScored ?? (matchForBonuses as { penalties_scored?: boolean | null } | null)?.penalties_scored ?? null

      const { data: entries } = await supabaseAdmin
        .from('entries')
        .select('id, pick, home_score_pred, away_score_pred, hat_trick_pred, hat_trick_scorer_pred, penalties_pred')
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
          const htPred = (entry as typeof entry & { hat_trick_scorer_pred?: string | null }).hat_trick_scorer_pred
          if (entry.hat_trick_pred === true && hatTrickScored === true && hatTrickScorer && htPred && scorerNameMatches(htPred, hatTrickScorer)) {
            raffle_entries += 7
          }
          const penPred = (entry as typeof entry & { penalties_pred?: boolean | null }).penalties_pred
          if (penPred === true && penaltiesScoredVal === true) {
            raffle_entries += 2
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
        // Award each winner pick their locked-in potential_raffle_entries (varies by when pick was submitted)
        const { data: championPicks } = await supabaseAdmin
          .from('winner_picks')
          .select('id, potential_raffle_entries')
          .eq('team_name', champion)
        if (championPicks) {
          for (const pick of championPicks) {
            await supabaseAdmin.from('winner_picks')
              .update({ is_correct: true, raffle_entries: pick.potential_raffle_entries ?? 15 })
              .eq('id', pick.id)
          }
        }
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

    // Score the Golden Boot — set is_correct + award potential_raffle_entries for correct pick
    if (action === 'score_golden_boot') {
      const { player_name } = payload
      if (!player_name) return NextResponse.json({ error: 'player_name required' }, { status: 400 })

      // Correct picks: award their locked-in potential_raffle_entries
      const { data: correctPicks } = await supabaseAdmin
        .from('scorer_picks')
        .select('id, potential_raffle_entries')
        .ilike('player_name', `%${player_name}%`)
      let scored = 0
      if (correctPicks) {
        for (const pick of correctPicks) {
          await supabaseAdmin.from('scorer_picks')
            .update({ is_correct: true, raffle_entries: pick.potential_raffle_entries ?? 10 })
            .eq('id', pick.id)
          scored++
        }
      }
      // Wrong picks: mark false, 0 tickets
      await supabaseAdmin.from('scorer_picks')
        .update({ is_correct: false, raffle_entries: 0 })
        .not('player_name', 'ilike', `%${player_name}%`)
        .is('is_correct', null)

      return NextResponse.json({ success: true, scored })
    }

    // Toggle the site-wide decommission splash (hides every patron page behind a single message)
    if (action === 'set_decommission') {
      const { enabled, message } = payload
      const { error } = await supabaseAdmin
        .from('app_settings')
        .upsert({ key: 'decommission', value: { enabled: !!enabled, message: String(message || '') }, updated_at: new Date().toISOString() })
      if (error) {
        return NextResponse.json({ error: `Could not save (${error.message}) — has supabase/app_settings.sql been run yet?` }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    if (action === 'sync_results') {
      try {
        const result = await syncResults()
        return NextResponse.json({ success: true, ...result })
      } catch (e) {
        if (e instanceof FdRateLimitError) {
          return NextResponse.json({ error: 'Football data rate limited — try again in a minute' }, { status: 429 })
        }
        throw e
      }
    }

    if (action === 'update_knockout_names') {
      try {
        const names_updated = await updateKnockoutNames()
        return NextResponse.json({ success: true, names_updated })
      } catch (e) {
        if (e instanceof FdRateLimitError) {
          return NextResponse.json({ error: 'Football data rate limited — try again in a minute' }, { status: 429 })
        }
        throw e
      }
    }

    if (action === 'force_resync') {
      const { match_ids } = payload as { match_ids: string[] }
      if (!Array.isArray(match_ids) || match_ids.length === 0) {
        return NextResponse.json({ error: 'match_ids array required' }, { status: 400 })
      }
      try {
        const result = await resyncMatchIds(match_ids)
        return NextResponse.json({ success: true, ...result })
      } catch (e) {
        if (e instanceof FdRateLimitError) {
          return NextResponse.json({ error: 'Football data rate limited — try again in a minute' }, { status: 429 })
        }
        throw e
      }
    }

    if (action === 'rescore_entries') {
      const { match_ids } = payload as { match_ids: string[] }
      if (!Array.isArray(match_ids) || match_ids.length === 0) {
        return NextResponse.json({ error: 'match_ids array required' }, { status: 400 })
      }

      const { data: matches } = await supabaseAdmin
        .from('matches')
        .select('id, result, home_score, away_score, hat_trick_scored, hat_trick_scorer, penalties_scored')
        .in('id', match_ids)
        .not('result', 'is', null)

      let entries_scored = 0
      for (const match of matches || []) {
        const { data: entries } = await supabaseAdmin
          .from('entries')
          .select('id, pick, home_score_pred, away_score_pred, hat_trick_pred, hat_trick_scorer_pred, penalties_pred')
          .eq('match_id', match.id)

        if (!entries) continue
        for (const entry of entries) {
          const is_correct = entry.pick === match.result
          let raffle_entries = 0
          if (is_correct) {
            const scoreCorrect =
              match.home_score != null && match.away_score != null &&
              entry.home_score_pred === match.home_score && entry.away_score_pred === match.away_score
            raffle_entries = scoreCorrect ? 3 : 1
          }
          const htPred = (entry as typeof entry & { hat_trick_scorer_pred?: string | null }).hat_trick_scorer_pred
          if (entry.hat_trick_pred === true && match.hat_trick_scored === true && match.hat_trick_scorer && htPred && scorerNameMatches(htPred, match.hat_trick_scorer)) {
            raffle_entries += 7
          }
          const penPred = (entry as typeof entry & { penalties_pred?: boolean | null }).penalties_pred
          const penScored = (match as typeof match & { penalties_scored?: boolean | null }).penalties_scored
          if (penPred === true && penScored === true) {
            raffle_entries += 2
          }
          await supabaseAdmin.from('entries').update({ is_correct, raffle_entries }).eq('id', entry.id)
          entries_scored++
        }
      }

      return NextResponse.json({ success: true, entries_scored })
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

    if (action === 'refresh_all_events') {
      // Re-fetch ESPN events for every resolved match (force overwrite existing events)
      const { data: resolvedMatches } = await supabaseAdmin
        .from('matches')
        .select('id, kickoff_at, home_team, away_team')
        .not('result', 'is', null)
        .neq('stage', 'Demo Match')
        .order('kickoff_at', { ascending: true })

      if (!resolvedMatches?.length) {
        return NextResponse.json({ success: true, updated: 0, failed: 0, detail: [] })
      }

      const results = await Promise.allSettled(
        resolvedMatches.map(m => fetchEspnEvents(m.id, m.kickoff_at, m.home_team, m.away_team))
      )

      const detail: string[] = []
      let updated = 0
      let failed = 0
      results.forEach((r, i) => {
        const m = resolvedMatches[i]
        const label = `${m.home_team} vs ${m.away_team}`
        if (r.status === 'fulfilled' && r.value) {
          updated++
          detail.push(`✓ ${label}: ${r.value.events.length} events`)
        } else {
          failed++
          detail.push(`✗ ${label}: not found on ESPN`)
        }
      })

      return NextResponse.json({ success: true, updated, failed, detail })
    }

    if (action === 'load_match_events') {
      const { matchId } = payload as { matchId: string }
      if (!matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 })

      const { data: match, error: matchErr } = await supabaseAdmin
        .from('matches').select('kickoff_at, home_team, away_team').eq('id', matchId).single()
      if (matchErr || !match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

      const result = await fetchEspnEvents(matchId, match.kickoff_at, match.home_team, match.away_team)
      if (!result) {
        const espnHome = toEspnTeamName(match.home_team)
        const espnAway = toEspnTeamName(match.away_team)
        const date = toEspnDate(match.kickoff_at)
        return NextResponse.json({
          error: `ESPN: no match found for ${match.home_team} vs ${match.away_team} (ESPN names: ${espnHome} vs ${espnAway}, ET date: ${date}).`
        }, { status: 404 })
      }

      return NextResponse.json({ success: true, count: result.events.length, events: result.events, espn_event_id: result.espnEventId })
    }

    if (action === 'mark_ineligible') {
      const { phone, name } = payload as { phone: string; name: string }
      if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })
      await supabaseAdmin.from('ineligible_patrons').upsert({ phone, name }, { onConflict: 'phone' })
      return NextResponse.json({ success: true })
    }

    if (action === 'mark_eligible') {
      const { phone } = payload as { phone: string }
      if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })
      await supabaseAdmin.from('ineligible_patrons').delete().eq('phone', phone)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Admin API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
