import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const { password, action, payload } = await req.json()

    // Simple password check
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Set match result
    if (action === 'set_result') {
      const { match_id, result } = payload

      if (!['home', 'draw', 'away'].includes(result)) {
        return NextResponse.json({ error: 'Invalid result' }, { status: 400 })
      }

      // Update match result
      await supabaseAdmin
        .from('matches')
        .update({ result, is_active: false })
        .eq('id', match_id)

      // Mark entries as correct/wrong and award raffle entries
      const { data: entries } = await supabaseAdmin
        .from('entries')
        .select('id, pick')
        .eq('match_id', match_id)

      if (entries) {
        for (const entry of entries) {
          const correct = entry.pick === result
          await supabaseAdmin
            .from('entries')
            .update({ is_correct: correct, raffle_entries: correct ? 3 : 0 })
            .eq('id', entry.id)
        }
      }

      return NextResponse.json({ success: true, updated: entries?.length || 0 })
    }

    // Update daily code for a pub
    if (action === 'update_code') {
      const { pub_id, daily_code } = payload
      await supabaseAdmin
        .from('pubs')
        .update({ daily_code: daily_code.toUpperCase() })
        .eq('id', pub_id)
      return NextResponse.json({ success: true })
    }

    // Create a new match
    if (action === 'create_match') {
      const { home_team, away_team, home_flag, away_flag, kickoff_at, entries_close_at, stage } = payload

      // Deactivate any current active match first
      await supabaseAdmin
        .from('matches')
        .update({ is_active: false })
        .eq('is_active', true)

      const { data } = await supabaseAdmin
        .from('matches')
        .insert({ home_team, away_team, home_flag, away_flag, kickoff_at, entries_close_at, stage, is_active: true })
        .select()
        .single()

      return NextResponse.json({ success: true, match: data })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Admin API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
