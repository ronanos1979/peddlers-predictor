// Returns the daily patron code based on current date.
// Prefix comes from NEXT_PUBLIC_DAILY_CODE_PREFIX env var (falls back to 'peddlers').
export function getDailyCode(date: Date = new Date()): string {
  const prefix = (process.env.NEXT_PUBLIC_DAILY_CODE_PREFIX || 'peddlers').toLowerCase()
  const day = date.getDate()
  return `${prefix}${day}`
}

// Returns true if the supplied code matches today's (or yesterday's) daily code,
// case-insensitively. Used to validate the geo-override access code entered by patrons.
export function isValidOverrideCode(code: string, date: Date = new Date()): boolean {
  const normalised = code.trim().toLowerCase()
  if (!normalised) return false
  const yesterday = new Date(date)
  yesterday.setDate(yesterday.getDate() - 1)
  return normalised === getDailyCode(date) || normalised === getDailyCode(yesterday)
}

// Returns true if the current time is between a match's kickoff and 90 mins after
export function isMatchLive(kickoffAt: string): boolean {
  const kickoff = new Date(kickoffAt)
  const now = new Date()
  const end = new Date(kickoff.getTime() + 90 * 60 * 1000)
  return now >= kickoff && now <= end
}

// Returns the upper bound of matches users can currently predict on.
// Rolling 4-day window: today+4 (UTC midnight), with a floor of June 15 so that
// before the tournament starts, all opening-week matches (June 11–14) are always visible.
// e.g. June 3 (pre-tournament) → June 15, June 12 → June 16, June 13 → June 17.
export function getPredictableWindowEnd(now: Date = new Date()): Date {
  const rolling = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4))
  const june15  = new Date('2026-06-15T00:00:00Z')
  return rolling > june15 ? rolling : june15
}

// Returns the best match to show right now:
// 1. A match currently being played (kickoff <= now <= kickoff + 90min)
// 2. The next upcoming match within the next 3 hours
// 3. The most recently completed match (so the form stays visible)
export function selectActiveMatch(matches: Array<{
  kickoff_at: string
  entries_close_at: string
  result: string | null
}>): number {
  const now = new Date()

  // 1. Currently live
  const liveIdx = matches.findIndex(m => {
    const kickoff = new Date(m.kickoff_at)
    const close = new Date(m.entries_close_at)
    return now >= kickoff && now <= close
  })
  if (liveIdx !== -1) return liveIdx

  // 2. Opening soon (within 3 hours)
  const soonIdx = matches.findIndex(m => {
    const kickoff = new Date(m.kickoff_at)
    const diff = kickoff.getTime() - now.getTime()
    return diff > 0 && diff <= 3 * 60 * 60 * 1000
  })
  if (soonIdx !== -1) return soonIdx

  return -1
}
