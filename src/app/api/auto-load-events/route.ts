import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchEspnEvents } from '@/lib/fetchEspnEvents'

// Public GET — called by the results page when completed matches have no cached events.
// Only fetches ESPN for matches where:
//   - result IS NOT NULL (admin has confirmed the score)
//   - kickoff was more than 1 hour ago
//   - no row exists in match_events (not yet cached)
// Supabase is the cache — subsequent page loads read from there, no ESPN calls needed.
export async function GET() {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data: matches, error } = await supabaseAdmin
    .from('matches')
    .select('id, kickoff_at, home_team, away_team')
    .not('result', 'is', null)
    .lt('kickoff_at', cutoff)
    .neq('stage', 'Demo Match')

  if (error || !matches?.length) {
    return NextResponse.json({ loaded: 0, skipped: 0 })
  }

  const { data: existing } = await supabaseAdmin
    .from('match_events')
    .select('match_id')
    .in('match_id', matches.map(m => m.id))

  const hasEvents = new Set((existing || []).map(e => e.match_id))
  const needEvents = matches.filter(m => !hasEvents.has(m.id))

  if (!needEvents.length) {
    return NextResponse.json({ loaded: 0, skipped: 0 })
  }

  const results = await Promise.allSettled(
    needEvents.map(m => fetchEspnEvents(m.id, m.kickoff_at, m.home_team, m.away_team))
  )

  const loaded = results.filter(r => r.status === 'fulfilled' && r.value !== null).length
  return NextResponse.json({ loaded, checked: needEvents.length })
}
