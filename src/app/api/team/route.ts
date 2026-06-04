// Cache-only team data route.
// All data is pre-loaded by admin via /api/admin-teams (load_fd + enrich_af).
// Public page views never call external APIs — reads from team_cache + player_cache only.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type SquadPlayer = {
  id: number; name: string; age: number; number: number
  position: string; photo: string; afId?: number
  club?: { name: string; logo?: string }
}

async function fetchLocalSchedule(teamName: string) {
  if (!teamName) return []
  const { data } = await supabaseAdmin
    .from('matches')
    .select('id,home_team,away_team,home_flag,away_flag,kickoff_at,stage,result')
    .neq('stage', 'Demo Match')
    .or(`home_team.eq.${teamName},away_team.eq.${teamName}`)
    .order('kickoff_at', { ascending: true })
  return data || []
}

export async function GET(req: NextRequest) {
  const idParam   = req.nextUrl.searchParams.get('id')
  const nameParam = req.nextUrl.searchParams.get('name')

  if (!idParam && !nameParam) {
    return NextResponse.json({ error: 'id or name required' }, { status: 400 })
  }

  try {
    let teamName  = nameParam || ''
    let cacheData: Record<string, unknown> | null = null

    if (idParam) {
      const { data } = await supabaseAdmin
        .from('team_cache')
        .select('team_name,data')
        .eq('team_id', parseInt(idParam))
        .maybeSingle()
      if (data) {
        teamName  = data.team_name
        cacheData = data.data as Record<string, unknown>
      }
    } else {
      const { data: rows } = await supabaseAdmin
        .from('team_cache')
        .select('team_name,data')
        .ilike('team_name', nameParam!)
        .order('cached_at', { ascending: false })
        .limit(1)
      const row = rows?.[0] ?? null
      if (row) {
        teamName  = row.team_name
        cacheData = row.data as Record<string, unknown>
      }
    }

    // Squad from player_cache — sorted by shirt number
    const squad: SquadPlayer[] = []
    let photosEnriched = false
    let clubsEnriched  = false

    if (teamName) {
      const { data: players } = await supabaseAdmin
        .from('player_cache')
        .select('fd_id,name,age,number,position,photo,photo_enriched,club_name,club_logo,club_enriched,af_id')
        .ilike('team_name', teamName)
        .order('number', { ascending: true })

      if (players && players.length > 0) {
        squad.push(...players.map(p => ({
          id:       p.fd_id,
          name:     p.name,
          age:      p.age      ?? 0,
          number:   p.number   ?? 0,
          position: p.position || 'Midfielder',
          photo:    p.photo    || '',
          afId:     p.af_id   ?? undefined,
          club:     p.club_name ? { name: p.club_name, logo: p.club_logo || undefined } : undefined,
        })))
        photosEnriched = players.every(p => p.photo_enriched)
        clubsEnriched  = players.every(p => p.club_enriched)
      }
    }

    const localSchedule = await fetchLocalSchedule(teamName)

    return NextResponse.json({
      teamInfo:       cacheData?.teamInfo  ?? null,
      squad,
      coach:          cacheData?.coach     ?? null,
      fixtures:       cacheData?.fixtures  ?? [],
      localSchedule,
      localTeamName:  teamName,
      photosEnriched,
      clubsEnriched,
    })
  } catch (err) {
    console.error('Team cache read error:', err)
    return NextResponse.json({ error: 'Failed to fetch team data' }, { status: 500 })
  }
}
