/**
 * ESPN unofficial API helpers for WC 2026 match events.
 * ESPN is the only free source that provides goal scorers, assists, and cards
 * for WC 2026. FD free tier omits goals/bookings entirely; AF free tier
 * blocks seasons > 2024.
 *
 * Base URL: https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world
 * No API key required.
 */

// ESPN uses US Eastern time (UTC-4 in summer) for date grouping.
// A 02:00 UTC kickoff on June 12 is 22:00 ET on June 11 and appears under that date.
const ET_OFFSET_MS = 4 * 60 * 60 * 1000

// Two schedule team names that differ from ESPN's display names.
// All other 46 WC 2026 teams match exactly (verified June 2026).
export const ESPN_NAME_MAP: Record<string, string> = {
  'USA':                  'United States',
  'Bosnia & Herzegovina': 'Bosnia-Herzegovina',
}

/** Convert a UTC ISO kickoff timestamp to the YYYYMMDD string ESPN uses. */
export function toEspnDate(kickoffAtUtc: string): string {
  const etMs = new Date(kickoffAtUtc).getTime() - ET_OFFSET_MS
  return new Date(etMs).toISOString().slice(0, 10).replace(/-/g, '')
}

/** Map a schedule team name to the ESPN display name (identity for most teams). */
export function toEspnTeamName(scheduleName: string): string {
  return ESPN_NAME_MAP[scheduleName] ?? scheduleName
}

/**
 * Parse ESPN's clock displayValue into elapsed minutes + optional added time.
 * Examples: "9'" → {elapsed:9, extra:null}
 *           "45'+4'" → {elapsed:45, extra:4}
 *           "90'+2'" → {elapsed:90, extra:2}
 */
export function parseEspnMinute(display: string): { elapsed: number; extra: number | null } {
  const m = display.match(/^(\d+)'(?:\+(\d+)')?$/)
  if (m) return { elapsed: parseInt(m[1], 10), extra: m[2] ? parseInt(m[2], 10) : null }
  return { elapsed: 0, extra: null }
}

/**
 * Map an ESPN keyEvent type string to our stored event type and detail.
 * Returns null for event types we don't store (substitutions, kickoffs, etc.).
 */
export function mapEspnEventType(espnType: string): { type: 'Goal' | 'Card'; detail: string } | null {
  // goal---penalty and penalty---scored both represent a scored penalty kick.
  // ESPN uses penalty---scored in commentary plays (often absent from keyEvents).
  if (espnType === 'goal---penalty' || espnType === 'penalty---scored') return { type: 'Goal', detail: 'Penalty' }
  if (espnType === 'own-goal')       return { type: 'Goal', detail: 'Own Goal' }
  // 'goal', 'goal---header', 'goal---volley', 'goal---free-kick', etc.
  if (espnType === 'goal' || espnType.startsWith('goal---')) return { type: 'Goal', detail: 'Normal Goal' }
  switch (espnType) {
    case 'yellow-card':     return { type: 'Card', detail: 'Yellow Card' }
    case 'yellow-red-card': return { type: 'Card', detail: 'Yellow Red Card' }
    case 'red-card':        return { type: 'Card', detail: 'Red Card' }
    default:                return null
  }
}
