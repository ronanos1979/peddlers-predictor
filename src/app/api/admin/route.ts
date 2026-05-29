import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
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
      const { match_id, result } = payload

      if (!['home', 'draw', 'away'].includes(result)) {
        return NextResponse.json({ error: 'Invalid result' }, { status: 400 })
      }

      await supabaseAdmin
        .from('matches')
        .update({ result })
        .eq('id', match_id)

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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Admin API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
