import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

function openWindow() {
  return {
    kickoff_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    entries_close_at: new Date(Date.now() + 100 * 60 * 1000).toISOString(),
  }
}

export async function GET() {
  const { data: existing, error: selectError } = await supabaseAdmin
    .from('matches')
    .select('*')
    .eq('stage', 'Demo Match')
    .order('kickoff_at', { ascending: false })
    .limit(1)

  if (selectError) {
    return NextResponse.json({ error: 'Could not load demo match' }, { status: 500 })
  }

  if (existing && existing.length > 0) {
    return NextResponse.json({ ...existing[0], ...openWindow() })
  }

  const times = openWindow()
  const { data: created, error: insertError } = await supabaseAdmin
    .from('matches')
    .insert({
      home_team: 'USA',
      away_team: 'Ireland',
      home_flag: '🇺🇸',
      away_flag: '🇮🇪',
      kickoff_at: times.kickoff_at,
      entries_close_at: times.entries_close_at,
      stage: 'Demo Match',
      is_active: false,
      result: null,
    })
    .select('*')
    .single()

  if (insertError || !created) {
    return NextResponse.json({ error: 'Could not create demo match' }, { status: 500 })
  }

  return NextResponse.json({ ...created, ...times })
}
