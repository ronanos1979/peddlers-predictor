jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {},
}))
jest.mock('@/lib/footballData', () => ({
  getFdFixtures: jest.fn(),
  getFdStandings: jest.fn(),
  FdRateLimitError: class FdRateLimitError extends Error {},
}))
jest.mock('@/lib/fetchEspnEvents', () => ({
  fetchEspnEvents: jest.fn(),
  scorerNameMatches: jest.fn(),
}))

import { tallyGoalsFromEvents } from '../syncResults'

// Regression test for a real production bug: Argentina 3-2 Cape Verde (R32, ET) was
// stored backwards as 2-3 because an own-goal event benefiting the home side (Argentina)
// was flipped a second time, crediting it to the away side (Cape Verde) instead.
describe('tallyGoalsFromEvents', () => {
  it('counts an own-goal event for the side teamSide already credits it to (no re-flip)', () => {
    const events = [
      { type: 'Goal', detail: 'Normal Goal', teamSide: 'home' }, // Messi 29'
      { type: 'Goal', detail: 'Normal Goal', teamSide: 'away' }, // Duarte 59'
      { type: 'Goal', detail: 'Normal Goal', teamSide: 'home' }, // Martinez 92'
      { type: 'Goal', detail: 'Normal Goal', teamSide: 'away' }, // Lopes Cabral 103'
      { type: 'Goal', detail: 'Own Goal', teamSide: 'home' },    // Borges o.g., credited to home (Argentina)
    ]
    expect(tallyGoalsFromEvents(events)).toEqual({ homeGoals: 3, awayGoals: 2 })
  })

  it('excludes goal-type events with no teamSide (penalty-shootout kicks)', () => {
    const events = [
      { type: 'Goal', detail: 'Normal Goal', teamSide: 'away' },
      { type: 'Goal', detail: 'Own Goal', teamSide: 'home' },
      { type: 'Goal', detail: 'Penalty' }, // shootout kick — no teamSide
      { type: 'Goal', detail: 'Penalty' }, // shootout kick — no teamSide
    ]
    expect(tallyGoalsFromEvents(events)).toEqual({ homeGoals: 1, awayGoals: 1 })
  })

  it('counts in-game penalties normally when they carry a teamSide', () => {
    const events = [
      { type: 'Goal', detail: 'Penalty', teamSide: 'home' },
      { type: 'Goal', detail: 'Normal Goal', teamSide: 'away' },
    ]
    expect(tallyGoalsFromEvents(events)).toEqual({ homeGoals: 1, awayGoals: 1 })
  })

  it('ignores non-goal events (cards)', () => {
    const events = [
      { type: 'Card', detail: 'Yellow Card', teamSide: 'home' },
      { type: 'Goal', detail: 'Normal Goal', teamSide: 'away' },
    ]
    expect(tallyGoalsFromEvents(events)).toEqual({ homeGoals: 0, awayGoals: 1 })
  })
})
