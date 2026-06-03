const mockEntries = [
  {
    id: 'entry-1', pick: 'home', is_correct: true, raffle_entries: 3,
    created_at: '2026-06-11T20:00:00Z', pub_id: 'haverhill',
    home_score_pred: 2, away_score_pred: 1,
    matches: {
      home_team: 'USA', away_team: 'Paraguay', home_flag: '🇺🇸', away_flag: '🇵🇾',
      kickoff_at: '2026-06-13T01:00:00Z', stage: 'Group D', result: 'home',
      home_score: 2, away_score: 1,
    },
  },
  {
    id: 'entry-2', pick: 'draw', is_correct: null, raffle_entries: 0,
    created_at: '2026-06-14T20:00:00Z', pub_id: 'haverhill',
    home_score_pred: null, away_score_pred: null,
    matches: {
      home_team: 'USA', away_team: 'Australia', home_flag: '🇺🇸', away_flag: '🇦🇺',
      kickoff_at: '2026-06-19T19:00:00Z', stage: 'Group D', result: null,
      home_score: null, away_score: null,
    },
  },
]

const mockScorerPick = { player_name: 'Christian Pulisic', player_team: 'AC Milan' }

// Spy that captures what phone value is passed to .eq('phone', ...)
let capturedPhone: string | null = null

let callCount = 0
jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: jest.fn(() => {
      callCount++
      if (callCount % 2 === 1) {
        // entries query
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn((_col: string, val: string) => {
              capturedPhone = val
              return {
                neq: jest.fn().mockReturnValue({
                  order: jest.fn().mockResolvedValue({ data: mockEntries, error: null }),
                }),
              }
            }),
          }),
        }
      }
      // scorer_picks query
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockScorerPick, error: null }),
          }),
        }),
      }
    }),
  },
}))

import { NextRequest } from 'next/server'
import { GET } from '../route'

beforeEach(() => { callCount = 0; capturedPhone = null })

function makeRequest(phone: string): NextRequest {
  return new NextRequest(`http://localhost/api/my-picks?phone=${encodeURIComponent(phone)}`)
}

describe('GET /api/my-picks', () => {
  it('returns 400 when phone is missing', async () => {
    const req = new NextRequest('http://localhost/api/my-picks')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for a phone number with too few digits', async () => {
    const res = await GET(makeRequest('12345'))
    expect(res.status).toBe(400)
  })

  it('returns entries and stats for a plain 10-digit phone', async () => {
    const res = await GET(makeRequest('6031231231'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entries).toHaveLength(2)
    expect(body.stats.total).toBe(2)
    expect(body.stats.correct).toBe(1)
    expect(body.stats.pending).toBe(1)
    expect(body.stats.raffle_entries).toBe(3)
  })

  it('normalizes a phone with spaces before querying', async () => {
    await GET(makeRequest('603 123 1231'))
    expect(capturedPhone).toBe('6031231231')
  })

  it('normalizes a formatted phone (parens and dashes) before querying', async () => {
    await GET(makeRequest('(603) 123-1231'))
    expect(capturedPhone).toBe('6031231231')
  })

  it('normalizes an 11-digit phone with leading 1 before querying', async () => {
    await GET(makeRequest('+16031231231'))
    expect(capturedPhone).toBe('6031231231')
  })

  it('returns the same entries regardless of phone format', async () => {
    const formats = ['6031231231', '603 123 1231', '(603) 123-1231', '+16031231231', '1-603-123-1231']
    for (const fmt of formats) {
      callCount = 0
      const res = await GET(makeRequest(fmt))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.entries).toHaveLength(2)
    }
  })

  it('includes score prediction fields in entries', async () => {
    const res = await GET(makeRequest('6031231231'))
    const body = await res.json()
    expect(body.entries[0].home_score_pred).toBe(2)
    expect(body.entries[0].away_score_pred).toBe(1)
    expect(body.entries[1].home_score_pred).toBeNull()
    expect(body.entries[1].away_score_pred).toBeNull()
  })

  it('includes actual score fields on matches', async () => {
    const res = await GET(makeRequest('6031231231'))
    const body = await res.json()
    expect(body.entries[0].matches.home_score).toBe(2)
    expect(body.entries[0].matches.away_score).toBe(1)
    expect(body.entries[1].matches.home_score).toBeNull()
    expect(body.entries[1].matches.away_score).toBeNull()
  })

  it('includes scorerPick in response', async () => {
    const res = await GET(makeRequest('6031231231'))
    const body = await res.json()
    expect(body.scorerPick).toEqual({
      player_name: 'Christian Pulisic',
      player_team: 'AC Milan',
    })
  })

  it('returns scorerPick: null when player has not made a Golden Boot pick', async () => {
    const { supabaseAdmin } = await import('@/lib/supabaseAdmin')
    const mockFrom = supabaseAdmin.from as jest.Mock
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn((_col: string, val: string) => {
          capturedPhone = val
          return {
            neq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: mockEntries, error: null }),
            }),
          }
        }),
      }),
    })).mockImplementationOnce(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }))

    const res = await GET(makeRequest('6031231231'))
    const body = await res.json()
    expect(body.scorerPick).toBeNull()
  })
})
