// Returns the daily patron code based on current date
// Format: peddlers + day-of-month, e.g. peddlers27 on June 27th
export function getDailyCode(date: Date = new Date()): string {
  const day = date.getDate()
  return `peddlers${day}`
}

// Returns true if the current time is between a match's kickoff and 90 mins after
export function isMatchLive(kickoffAt: string): boolean {
  const kickoff = new Date(kickoffAt)
  const now = new Date()
  const end = new Date(kickoff.getTime() + 90 * 60 * 1000)
  return now >= kickoff && now <= end
}

// Returns the upper bound of matches users can currently predict on.
// Rolling 4-day window: today through today+3 (UTC midnight exclusive).
// e.g. June 12 → June 16, June 13 → June 17.
// On June 11 (tournament open) this naturally covers June 11–14 (all group stage day 1–4).
export function getPredictableWindowEnd(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4))
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
