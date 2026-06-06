import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  const password = req.nextUrl.searchParams.get('password')
  const action = req.nextUrl.searchParams.get('action') || 'stats'

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (action === 'stats') {
    // Daily entry counts for last 30 days
    const { data: entries } = await supabaseAdmin
      .from('entries')
      .select('created_at, pub_id, is_correct, raffle_entries, name, phone, email')
      .order('created_at', { ascending: false })

    if (!entries) return NextResponse.json({ stats: [], totals: {} })

    // Group by date
    const byDate: Record<string, { haverhill: number; nashua: number; total: number }> = {}
    entries.forEach(e => {
      const date = new Date(e.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric'
      })
      if (!byDate[date]) byDate[date] = { haverhill: 0, nashua: 0, total: 0 }
      byDate[date].total++
      if (e.pub_id === 'haverhill') byDate[date].haverhill++
      if (e.pub_id === 'nashua') byDate[date].nashua++
    })

    const totals = {
      total_entries: entries.length,
      unique_phones: new Set(entries.map(e => e.phone)).size,
      emails_collected: entries.filter(e => e.email).length,
      correct: entries.filter(e => e.is_correct === true).length,
      haverhill: entries.filter(e => e.pub_id === 'haverhill').length,
      nashua: entries.filter(e => e.pub_id === 'nashua').length,
    }

    return NextResponse.json({ stats: Object.entries(byDate).slice(0, 30), totals })
  }

  if (action === 'entrants') {
    // Full list grouped by date
    const date = req.nextUrl.searchParams.get('date')
    let query = supabaseAdmin
      .from('entries')
      .select(`
        id, name, phone, email, pick, is_correct, raffle_entries,
        home_score_pred, away_score_pred,
        pub_id, created_at,
        matches (home_team, away_team, home_flag, away_flag, stage, kickoff_at)
      `)
      .order('created_at', { ascending: false })

    if (date) {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)
      query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString())
    }

    const { data } = await query
    return NextResponse.json({ entries: data || [] })
  }

  if (action === 'export-csv') {
    const { data } = await supabaseAdmin
      .from('entries')
      .select('name, phone, email, pub_id, pick, is_correct, raffle_entries, created_at')
      .order('created_at', { ascending: false })

    if (!data) return NextResponse.json({ csv: '' })

    const header = 'Name,Phone,Email,Pub,Pick,Correct,Raffle Entries,Date\n'
    const rows = data.map(e =>
      `"${e.name}","${e.phone}","${e.email || ''}","${e.pub_id}","${e.pick}","${e.is_correct ?? 'pending'}","${e.raffle_entries}","${e.created_at}"`
    ).join('\n')

    return new NextResponse(header + rows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="peddlers-entries.csv"'
      }
    })
  }

  if (action === 'checkins') {
    // Returns check-ins grouped by match for recent/live matches
    const { data } = await supabaseAdmin
      .from('check_ins')
      .select('id, name, phone, email, pub_id, shared_to, created_at, match_id, matches(home_team, away_team, home_flag, away_flag, kickoff_at, stage, checkin_winner_name, checkin_winner_phone, checkin_draw_at)')
      .order('created_at', { ascending: false })
      .limit(500)
    return NextResponse.json({ checkins: data || [] })
  }

  if (action === 'feedback') {
    const { data } = await supabaseAdmin
      .from('feedback')
      .select('id, message, email, page, created_at, read')
      .order('created_at', { ascending: false })
      .limit(200)
    return NextResponse.json({ feedback: data || [] })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
