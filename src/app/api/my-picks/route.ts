import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  const rawPhone = req.nextUrl.searchParams.get('phone')
  if (!rawPhone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })

  const digits = rawPhone.replace(/\D/g, '')
  const phone = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (phone.length !== 10) return NextResponse.json({ error: 'Enter a valid phone number' }, { status: 400 })

  const { data: entries, error } = await supabaseAdmin
    .from('entries')
    .select(`
      id, pick, is_correct, raffle_entries, created_at, pub_id,
      home_score_pred, away_score_pred, hat_trick_pred, hat_trick_scorer_pred,
      matches (
        home_team, away_team, home_flag, away_flag,
        kickoff_at, stage, result, home_score, away_score, hat_trick_scored, hat_trick_scorer
      )
    `)
    .eq('phone', phone)
    .neq('matches.stage', 'Demo Match')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })

  const [{ data: scorerPick }, { data: winnerPick }] = await Promise.all([
    supabaseAdmin.from('scorer_picks').select('player_name, player_team, potential_raffle_entries, raffle_entries, is_correct').eq('phone', phone).maybeSingle(),
    supabaseAdmin.from('winner_picks').select('team_name, team_flag, is_correct, raffle_entries, potential_raffle_entries').eq('phone', phone).maybeSingle(),
  ])

  const stats = {
    total: entries?.length || 0,
    correct: entries?.filter(e => e.is_correct === true).length || 0,
    pending: entries?.filter(e => e.is_correct === null).length || 0,
    raffle_entries:
      (entries?.reduce((sum, e) => sum + (e.raffle_entries || 0), 0) || 0) +
      (winnerPick?.raffle_entries || 0) +
      (scorerPick?.raffle_entries || 0),
  }

  return NextResponse.json({ entries: entries || [], stats, scorerPick: scorerPick || null, winnerPick: winnerPick || null })
}
