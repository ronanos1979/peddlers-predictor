import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })

  const { data: entries, error } = await supabaseAdmin
    .from('entries')
    .select(`
      id, pick, is_correct, raffle_entries, created_at, pub_id,
      matches (
        home_team, away_team, home_flag, away_flag,
        kickoff_at, stage, result
      )
    `)
    .eq('phone', phone)
    .neq('matches.stage', 'Demo Match')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })

  const stats = {
    total: entries?.length || 0,
    correct: entries?.filter(e => e.is_correct === true).length || 0,
    pending: entries?.filter(e => e.is_correct === null).length || 0,
    raffle_entries: entries?.reduce((sum, e) => sum + (e.raffle_entries || 0), 0) || 0
  }

  const { data: scorerPick } = await supabaseAdmin
    .from('scorer_picks')
    .select('player_name, player_team')
    .eq('phone', phone)
    .single()

  return NextResponse.json({ entries: entries || [], stats, scorerPick: scorerPick || null })
}
