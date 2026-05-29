import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getDailyCode } from '@/lib/matchSchedule'

export async function POST(req: NextRequest) {
  try {
    const { pub_id, match_id, name, phone, pick, code, email, is_demo } = await req.json()

    if (!pub_id || !match_id || !name || !phone || !pick) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    if (!['home', 'draw', 'away'].includes(pick)) {
      return NextResponse.json({ error: 'Invalid pick' }, { status: 400 })
    }

    // Verify pub exists
    const { data: pub } = await supabaseAdmin
      .from('pubs').select('id').eq('id', pub_id).single()
    if (!pub) {
      return NextResponse.json({ error: 'Unknown pub' }, { status: 400 })
    }

    // Skip code check for demo entries
    if (!is_demo) {
      const todayCode = getDailyCode(new Date())
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayCode = getDailyCode(yesterday)
      const enteredCode = (code || '').toLowerCase().trim()
      if (enteredCode !== todayCode && enteredCode !== yesterdayCode) {
        return NextResponse.json(
          { error: 'Wrong pub code — ask your bartender' },
          { status: 400 }
        )
      }
    }

    // Get the match
    const { data: match } = await supabaseAdmin
      .from('matches').select('*').eq('id', match_id).single()
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 400 })
    }

    // For demo matches always allow; for real matches check close time
    if (!is_demo && new Date(match.entries_close_at) < new Date()) {
      return NextResponse.json({ error: 'Entries are closed for this match' }, { status: 400 })
    }

    // Prevent duplicates (allow re-entry on demo)
    if (!is_demo) {
      const { data: existing } = await supabaseAdmin
        .from('entries').select('id').eq('phone', phone).eq('match_id', match_id).single()
      if (existing) {
        return NextResponse.json({ error: 'You have already entered this match' }, { status: 400 })
      }
    }

    // Save entry
    const { error: insertError } = await supabaseAdmin
      .from('entries')
      .insert({
        pub_id,
        match_id,
        name,
        phone,
        pick,
        email: email || null,
        is_correct: null,
        raffle_entries: 0
      })

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Entries API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
