import { getDailyCode, isMatchLive, getPredictableWindowEnd } from '../matchSchedule'

// ─── Rule: Timing — rolling 4-day window ────────────────────────────────────
describe('getPredictableWindowEnd — rolling 4-day window', () => {
  function utc(y: number, m: number, d: number) {
    return new Date(Date.UTC(y, m - 1, d))
  }

  it('pre-tournament (June 3) covers through June 14 via June 15 floor', () => {
    // June 3 + 4 = June 7, but floor is June 15, so opening week is always visible
    const end = getPredictableWindowEnd(utc(2026, 6, 3))
    expect(end.toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })

  it('June 11 (tournament open day) covers through June 14', () => {
    // June 11 + 4 = June 15 — exactly the floor, so Jun 11–14 visible
    const end = getPredictableWindowEnd(utc(2026, 6, 11))
    expect(end.toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })

  it('June 12 covers through June 15 (window end June 16)', () => {
    const end = getPredictableWindowEnd(utc(2026, 6, 12))
    expect(end.toISOString()).toBe('2026-06-16T00:00:00.000Z')
  })

  it('June 13 covers through June 16 (window end June 17)', () => {
    const end = getPredictableWindowEnd(utc(2026, 6, 13))
    expect(end.toISOString()).toBe('2026-06-17T00:00:00.000Z')
  })

  it('June 14 covers through June 17 (window end June 18)', () => {
    const end = getPredictableWindowEnd(utc(2026, 6, 14))
    expect(end.toISOString()).toBe('2026-06-18T00:00:00.000Z')
  })

  it('June 15 covers through June 18 (window end June 19)', () => {
    const end = getPredictableWindowEnd(utc(2026, 6, 15))
    expect(end.toISOString()).toBe('2026-06-19T00:00:00.000Z')
  })

  it('rolls correctly throughout the tournament (July 15 → July 19)', () => {
    const end = getPredictableWindowEnd(utc(2026, 7, 15))
    expect(end.toISOString()).toBe('2026-07-19T00:00:00.000Z')
  })

  it('window end is always exactly 4 UTC days after the input date', () => {
    const cases = [
      [utc(2026, 6, 20), utc(2026, 6, 24)],
      [utc(2026, 7, 1),  utc(2026, 7, 5)],
      [utc(2026, 7, 19), utc(2026, 7, 23)],
    ] as const
    cases.forEach(([input, expected]) => {
      expect(getPredictableWindowEnd(input).toISOString()).toBe(expected.toISOString())
    })
  })
})

// ─── Rule: Predictions close at kick-off ────────────────────────────────────
describe('isMatchLive — predictions close at kick-off', () => {
  const KICKOFF = '2026-06-12T18:00:00Z'

  it('returns false before kick-off', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-12T17:59:59Z'))
    expect(isMatchLive(KICKOFF)).toBe(false)
    jest.useRealTimers()
  })

  it('returns true at the moment of kick-off', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(KICKOFF))
    expect(isMatchLive(KICKOFF)).toBe(true)
    jest.useRealTimers()
  })

  it('returns true during the match', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-12T18:45:00Z'))
    expect(isMatchLive(KICKOFF)).toBe(true)
    jest.useRealTimers()
  })

  it('returns false after 90 minutes', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-12T19:30:01Z'))
    expect(isMatchLive(KICKOFF)).toBe(false)
    jest.useRealTimers()
  })
})

// ─── Daily code format ───────────────────────────────────────────────────────
describe('getDailyCode', () => {
  it('returns peddlers + day-of-month', () => {
    expect(getDailyCode(new Date('2026-06-11T12:00:00Z'))).toBe('peddlers11')
    expect(getDailyCode(new Date('2026-07-19T12:00:00Z'))).toBe('peddlers19')
    expect(getDailyCode(new Date('2026-06-27T12:00:00Z'))).toBe('peddlers27')
  })
})
