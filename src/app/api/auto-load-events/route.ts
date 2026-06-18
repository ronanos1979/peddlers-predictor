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
    .lt('kickoff_at', cutoff)
    .neq('stage', 'Demo Match')

  if (error || !matches?.length) {
    return NextResponse.json({ loaded: 0, skipped: 0 })
  }

  // Fetch existing event rows — include events array to detect premature empty loads
  const { data: existing } = await supabaseAdmin
    .from('match_events')
    .select('match_id, events, loaded_at')
    .in('match_id', matches.map(m => m.id))

  const twentyFourHoursMs = 24 * 60 * 60 * 1000
  const skipSet = new Set(
    (existing || [])
      .filter(e => {
        const hasData = Array.isArray(e.events) && e.events.length > 0
        if (hasData) return true // has real events — skip
        // Empty events row: only skip if kickoff was >24h ago (genuine 0-0/no-cards match)
        const match = matches.find(m => m.id === e.match_id)
        if (!match) return true
        return Date.now() - new Date(match.kickoff_at).getTime() > twentyFourHoursMs
      })
      .map(e => e.match_id)
  )
  const needEvents = matches.filter(m => !skipSet.has(m.id))

  if (!needEvents.length) {
    return NextResponse.json({ loaded: 0, skipped: 0 })
  }

  const results = await Promise.allSettled(
    needEvents.map(m => fetchEspnEvents(m.id, m.kickoff_at, m.home_team, m.away_team))
  )

  const loaded = results.filter(r => r.status === 'fulfilled' && r.value !== null).length
  return NextResponse.json({ loaded, checked: needEvents.length })
}
