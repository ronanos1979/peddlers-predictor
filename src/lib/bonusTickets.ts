export type BonusTier = {
  label: string
  from: Date
  winnerTickets: number
  scorerTickets: number
}

// Ticket values decrease as the tournament progresses — picks lock in the value at submission time
export const BONUS_TIERS: BonusTier[] = [
  { label: 'Group Stage MD3', from: new Date('2026-06-24T00:00:00Z'), winnerTickets: 10, scorerTickets: 5 },
  { label: 'Round of 32',     from: new Date('2026-06-28T00:00:00Z'), winnerTickets: 7,  scorerTickets: 3 },
  { label: 'Round of 16',     from: new Date('2026-07-04T00:00:00Z'), winnerTickets: 5,  scorerTickets: 2 },
  { label: 'Quarter Finals',  from: new Date('2026-07-09T00:00:00Z'), winnerTickets: 3,  scorerTickets: 1 },
  { label: 'Semi Finals',     from: new Date('2026-07-14T00:00:00Z'), winnerTickets: 1,  scorerTickets: 1 },
]

export const MAX_WINNER_TICKETS = 15
export const MAX_SCORER_TICKETS = 10

function activeTier(now: Date): BonusTier | null {
  const applicable = BONUS_TIERS.filter(t => now >= t.from)
  return applicable.length ? applicable[applicable.length - 1] : null
}

export function getWinnerPickTickets(now: Date = new Date()): number {
  return activeTier(now)?.winnerTickets ?? MAX_WINNER_TICKETS
}

export function getScorerPickTickets(now: Date = new Date()): number {
  return activeTier(now)?.scorerTickets ?? MAX_SCORER_TICKETS
}
