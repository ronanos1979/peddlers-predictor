import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const { pub_id, match_id, name, phone, pick, code } = await req.json()

    // Validate required fields
    if (!pub_id || !match_id || !name || !phone || !pick || !code) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    // Validate pick value
    if (!['home', 'draw', 'away'].includes(pick)) {
      return NextResponse.json({ error: 'Invalid pick' }, { status: 400 })
    }

    // Check pub exists and verify daily code
    const { data: pub } = await supabaseAdmin
      .from('pubs')
      .select('*')
      .eq('id', pub_id)
      .single()

    if (!pub) {
      return NextResponse.json({ error: 'Unknown pub' }, { status: 400 })
    }

    if (code.toUpperCase() !== pub.daily_code.toUpperCase()) {
      return NextResponse.json({ error: 'Wrong pub code — ask your bartender' }, { status: 400 })
    }

    // Check match is active and entries are still open
    const { data: match } = await supabaseAdmin
      .from('matches')
      .select('*')
      .eq('id', match_id)
      .eq('is_active', true)
      .single()

    if (!match) {
      return NextResponse.json({ error: 'No active match found' }, { status: 400 })
    }

    if (new Date(match.entries_close_at) < new Date()) {
      return NextResponse.json({ error: 'Entries are closed for this match' }, { status: 400 })
    }

    // Check for duplicate entry (same phone + match)
    const { data: existing } = await supabaseAdmin
      .from('entries')
      .select('id')
      .eq('phone', phone)
      .eq('match_id', match_id)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'You have already entered this match' }, { status: 400 })
    }

    // Insert entry
    const { error: insertError } = await supabaseAdmin
      .from('entries')
      .insert({ pub_id, match_id, name, phone, pick })

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
