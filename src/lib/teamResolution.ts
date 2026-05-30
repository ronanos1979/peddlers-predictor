// Team name resolution helpers — extracted for testability.
// Used by /api/team/route.ts to map display names to API-Football numeric IDs.

// Common/local names (Supabase schedule data) → API-Football official names
export const NAME_ALIASES: Record<string, string> = {
  'usa':         'united states',
  'south korea': 'korea republic',
  'ivory coast': "côte d'ivoire",
  'türkiye':     'turkey',
  'czechia':     'czech republic',
}

// API-Football official name → local Supabase schedule name (reverse of NAME_ALIASES)
export const REVERSE_ALIASES: Record<string, string> = {
  'united states':  'USA',
  'korea republic': 'South Korea',
  "côte d'ivoire":  'Ivory Coast',
  'turkey':         'Türkiye',
  'czech republic': 'Czechia',
}

// Regex matching youth / variant national teams that should never be picked as a senior squad.
export const YOUTH_RE =
  /\b(U\d{2}|Under[\s-]?\d+|Women|Futsal|Beach|Blind|Paralympic|Olympic)\b/i

export type TeamEntry = { id: number; name: string; national?: boolean }

/**
 * Try to resolve a display name to a numeric team ID using the WC 2026 teams list.
 * Returns null if the list is empty or the name cannot be matched.
 */
export function resolveFromWcList(
  name: string,
  wcTeams: Array<{ team: TeamEntry }>
): number | null {
  if (wcTeams.length === 0) return null
  const norm    = name.toLowerCase().trim()
  const aliased = NAME_ALIASES[norm] || norm

  const byAlias   = wcTeams.find(t => t.team.name.toLowerCase() === aliased)
  const byOrig    = wcTeams.find(t => t.team.name.toLowerCase() === norm)
  const byPartial = wcTeams.find(t => {
    const api = t.team.name.toLowerCase()
    return api.includes(norm) || norm.includes(api)
  })
  return (byAlias || byOrig || byPartial)?.team.id ?? null
}

/**
 * Resolve a display name to a numeric team ID from an API-Football search result.
 * Prefers senior national teams; excludes youth/women/futsal variants.
 */
export function resolveFromSearch(
  name: string,
  results: Array<{ team: TeamEntry }>
): number | null {
  if (results.length === 0) return null
  const norm    = name.toLowerCase().trim()
  const aliased = NAME_ALIASES[norm] || norm

  // Senior national teams only — exclude youth/variant squads
  const seniors = results.filter(
    t => t.team.national === true && !YOUTH_RE.test(t.team.name)
  )
  const pool = seniors.length > 0
    ? seniors
    : results.filter(t => !YOUTH_RE.test(t.team.name))

  if (pool.length === 0) return null

  // Exact match first
  const exact = pool.find(
    t => t.team.name.toLowerCase() === aliased ||
         t.team.name.toLowerCase() === norm
  )
  if (exact) return exact.team.id

  // Partial match — require actual name overlap; never return a completely unrelated team.
  // This is what prevented "Israel" being returned for a "USA" search.
  const partial = pool.find(t => {
    const api = t.team.name.toLowerCase()
    return api.includes(aliased) || aliased.includes(api) ||
           api.includes(norm)    || norm.includes(api)
  })
  return partial?.team.id ?? null
}

/**
 * Given the API-Football official team name (or the original search string),
 * return the name to use when querying the local Supabase match schedule.
 */
export function toLocalScheduleName(
  searchName: string | null,
  apiTeamName: string
): string {
  if (searchName) return searchName
  return REVERSE_ALIASES[apiTeamName.toLowerCase()] || apiTeamName
}

/**
 * Return true if a cached team entry looks like a youth or variant team —
 * meaning it was wrongly cached and should be treated as a miss.
 */
export function isBadCacheEntry(teamName: string): boolean {
  return YOUTH_RE.test(teamName)
}
