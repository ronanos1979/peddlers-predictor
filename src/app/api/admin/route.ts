import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { checkRateLimit, getIp } from '@/lib/rateLimit'
import { getFdFixtures, FdRateLimitError } from '@/lib/footballData'

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
      const { match_id, result, home_score, away_score } = payload

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

      return NextResponse.json({ success: true, updated: entries?.length || 0 })
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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Admin API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
