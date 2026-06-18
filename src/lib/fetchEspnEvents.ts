import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { toEspnDate, toEspnTeamName, parseEspnMinute, mapEspnEventType } from '@/lib/espnEvents'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'

export type EspnMatchEvent = {
  time: { elapsed: number; extra: number | null }
  team: { name: string }
  player: { name: string }
  assist: { name: string } | null
  type: string
  detail: string
  teamSide: 'home' | 'away' | undefined
}

export async function fetchEspnEvents(
  matchId: string,
  kickoffAt: string,
  homeTeam: string,
  awayTeam: string,
): Promise<{ events: EspnMatchEvent[]; espnEventId: string } | null> {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim()

  const espnHomeName = toEspnTeamName(homeTeam)
  const espnAwayName = toEspnTeamName(awayTeam)
  const normHome = norm(espnHomeName)
  const normAway = norm(espnAwayName)
  const date = toEspnDate(kickoffAt)
  const kickoffEt = new Date(new Date(kickoffAt).getTime() - 4 * 60 * 60 * 1000)

  type EspnCompetitor = { homeAway: 'home' | 'away'; team: { id: string; displayName: string } }
  type EspnEvent = { id: string; competitions: Array<{ competitors: EspnCompetitor[] }> }

  const findInScoreboard = (events: EspnEvent[]) =>
    events.find(e => {
      const comps = e.competitions?.[0]?.competitors || []
      const hasHome = comps.some(c => { const n = norm(c.team.displayName); return n === normHome || n.includes(normHome) || normHome.includes(n) })
      const hasAway = comps.some(c => { const n = norm(c.team.displayName); return n === normAway || n.includes(normAway) || normAway.includes(n) })
      return hasHome && hasAway
    })

  let espnEvent: EspnEvent | undefined
  const sbRes = await fetch(`${ESPN_BASE}/scoreboard?dates=${date}`)
  if (sbRes.ok) {
    const sbData = await sbRes.json()
    espnEvent = findInScoreboard(sbData.events || [])
  }

  if (!espnEvent) {
    const prevDate = new Date(kickoffEt.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '')
    const sbRes2 = await fetch(`${ESPN_BASE}/scoreboard?dates=${prevDate}`)
    if (sbRes2.ok) {
      const sbData2 = await sbRes2.json()
      espnEvent = findInScoreboard(sbData2.events || [])
    }
  }

  if (!espnEvent) return null

  const comps = espnEvent.competitions[0].competitors
  const espnHomeId = comps.find(c => c.homeAway === 'home')?.team?.id
  const espnAwayId = comps.find(c => c.homeAway === 'away')?.team?.id

  const sumRes = await fetch(`${ESPN_BASE}/summary?event=${espnEvent.id}`)
  if (!sumRes.ok) return null
  const sumData = await sumRes.json()

  type EspnKeyEvent = {
    type: { type: string }
    clock: { displayValue: string }
    team?: { id: string; displayName: string }
    participants?: Array<{ athlete: { displayName: string } }>
  }

  const events: EspnMatchEvent[] = ((sumData.keyEvents || []) as EspnKeyEvent[])
    .filter(e => mapEspnEventType(e.type?.type) !== null)
    .map(e => {
      const mapped = mapEspnEventType(e.type?.type)!
      const teamId = e.team?.id
      const teamSide: 'home' | 'away' | undefined =
        teamId === espnHomeId ? 'home' : teamId === espnAwayId ? 'away' : undefined
      const teamName = teamSide === 'home' ? homeTeam
        : teamSide === 'away' ? awayTeam
        : (e.team?.displayName || '')
      const parts = e.participants || []
      return {
        time:   parseEspnMinute(e.clock?.displayValue || ''),
        team:   { name: teamName },
        player: { name: parts[0]?.athlete?.displayName || '' },
        assist: parts[1]?.athlete?.displayName ? { name: parts[1].athlete.displayName } : null,
        type:   mapped.type,
        detail: mapped.detail,
        teamSide,
      }
    })

  await supabaseAdmin.from('match_events').upsert({
    match_id: matchId,
    af_fixture_id: parseInt(espnEvent.id) || null,
    kickoff_at: kickoffAt,
    events,
    loaded_at: new Date().toISOString(),
  })

  return { events, espnEventId: espnEvent.id }
}
