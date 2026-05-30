const mockEntries = [
  {
    id: 'entry-1', pick: 'home', is_correct: true, raffle_entries: 3,
    created_at: '2026-06-11T20:00:00Z', pub_id: 'haverhill',
    matches: {
      home_team: 'USA', away_team: 'Paraguay', home_flag: '🇺🇸', away_flag: '🇵🇾',
      kickoff_at: '2026-06-13T01:00:00Z', stage: 'Group D', result: 'home',
    },
  },
  {
    id: 'entry-2', pick: 'draw', is_correct: null, raffle_entries: 0,
    created_at: '2026-06-14T20:00:00Z', pub_id: 'haverhill',
    matches: {
      home_team: 'USA', away_team: 'Australia', home_flag: '🇺🇸', away_flag: '🇦🇺',
      kickoff_at: '2026-06-19T19:00:00Z', stage: 'Group D', result: null,
    },
  },
]

const mockScorerPick = { player_name: 'Christian Pulisic', player_team: 'AC Milan' }

// Build chainable Supabase mock
function makeChain(resolveWith: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'neq', 'order', 'single']
  methods.forEach(m => { chain[m] = jest.fn(() => chain) })
  ;(chain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
    Promise.resolve(resolveWith).then(resolve)
    return Promise.resolve(resolveWith)
  }
  return chain
}

let callCount = 0
jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: jest.fn(() => {
      callCount++
      // First from() call = entries query, second = scorer_picks query
      if (callCount % 2 === 1) {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              neq: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({ data: mockEntries, error: null }),
              }),
            }),
          }),
        }
      }
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

beforeEach(() => { callCount = 0 })

function makeRequest(phone: string): NextRequest {
  return new NextRequest(`http://localhost/api/my-picks?phone=${encodeURIComponent(phone)}`)
}

describe('GET /api/my-picks', () => {
  it('returns 400 when phone is missing', async () => {
    const req = new NextRequest('http://localhost/api/my-picks')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns entries and stats for a valid phone', async () => {
    const res = await GET(makeRequest('+16175550100'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entries).toHaveLength(2)
    expect(body.stats.total).toBe(2)
    expect(body.stats.correct).toBe(1)
    expect(body.stats.pending).toBe(1)
    expect(body.stats.raffle_entries).toBe(3)
  })

  it('includes scorerPick in response', async () => {
    const res = await GET(makeRequest('+16175550100'))
    const body = await res.json()
    expect(body.scorerPick).toEqual({
      player_name: 'Christian Pulisic',
      player_team: 'AC Milan',
    })
  })

  it('returns scorerPick: null when player has not made a Golden Boot pick', async () => {
    // Override the scorer pick call to return null
    const { supabaseAdmin } = await import('@/lib/supabaseAdmin')
    const mockFrom = supabaseAdmin.from as jest.Mock
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          neq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: mockEntries, error: null }),
          }),
        }),
      }),
    })).mockImplementationOnce(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }))

    const res = await GET(makeRequest('+16175550100'))
    const body = await res.json()
    expect(body.scorerPick).toBeNull()
  })
})
