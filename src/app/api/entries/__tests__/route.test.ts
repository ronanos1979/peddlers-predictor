// Tests covering the entry submission rules:
// - Email is optional
// - Score prediction is optional
// - Entries close at kick-off
// - One entry per person per match
// - Required fields validation

const FUTURE_KICKOFF = '2099-01-01T18:00:00Z'
const PAST_KICKOFF   = '2020-01-01T18:00:00Z'

let mockMatchData: { stage: string; kickoff_at: string } | null = {
  stage: 'Group A',
  kickoff_at: FUTURE_KICKOFF,
}
let mockExistingEntry: { id: string } | null = null
let insertedData: Record<string, unknown> | null = null

jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, _val: string) => ({
          single: async () =>
            table === 'matches'
              ? { data: mockMatchData, error: mockMatchData ? null : { message: 'Not found' } }
              : { data: mockExistingEntry, error: null },
          eq: () => ({
            single: async () => ({ data: mockExistingEntry, error: null }),
          }),
        }),
      }),
      insert: (data: Record<string, unknown>) => {
        insertedData = data
        return Promise.resolve({ error: null })
      },
    }),
  },
}))

jest.mock('@/lib/matchSchedule', () => ({
  getDailyCode: () => 'peddlers11',
}))

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: () => true,
  getIp: () => '127.0.0.1',
}))

import { NextRequest } from 'next/server'
import { POST } from '../route'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const BASE_BODY = {
  pub_id: 'haverhill',
  match_id: 'match-uuid',
  name: 'Sean O Brien',
  phone: '6031231234',
  pick: 'home',
  code: 'peddlers11',
}

beforeEach(() => {
  mockMatchData = { stage: 'Group A', kickoff_at: FUTURE_KICKOFF }
  mockExistingEntry = null
  insertedData = null
})

// ─── Rule: How to enter — email is optional ──────────────────────────────────
describe('Rule: email is optional', () => {
  it('accepts a submission with no email field', async () => {
    const res = await POST(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('accepts a submission with a valid email', async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, email: 'sean@example.com' }))
    expect(res.status).toBe(200)
  })

  it('saves email as null when not provided', async () => {
    await POST(makeRequest(BASE_BODY))
    expect((insertedData as Record<string, unknown>)?.email).toBeNull()
  })

  it('saves email when provided', async () => {
    await POST(makeRequest({ ...BASE_BODY, email: 'sean@example.com' }))
    expect((insertedData as Record<string, unknown>)?.email).toBe('sean@example.com')
  })

  it('rejects a malformed email if one is provided', async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, email: 'not-an-email' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/email/i)
  })
})

// ─── Rule: How to enter — score prediction is optional ───────────────────────
describe('Rule: score prediction is optional', () => {
  it('accepts a submission with no score fields', async () => {
    const res = await POST(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
  })

  it('saves null score predictions when not provided', async () => {
    await POST(makeRequest(BASE_BODY))
    expect((insertedData as Record<string, unknown>)?.home_score_pred).toBeNull()
    expect((insertedData as Record<string, unknown>)?.away_score_pred).toBeNull()
  })

  it('saves score predictions when both are provided', async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, home_score_pred: 2, away_score_pred: 1 }))
    expect(res.status).toBe(200)
    expect((insertedData as Record<string, unknown>)?.home_score_pred).toBe(2)
    expect((insertedData as Record<string, unknown>)?.away_score_pred).toBe(1)
  })

  it('saves zero as a valid score prediction', async () => {
    await POST(makeRequest({ ...BASE_BODY, home_score_pred: 0, away_score_pred: 0 }))
    expect((insertedData as Record<string, unknown>)?.home_score_pred).toBe(0)
    expect((insertedData as Record<string, unknown>)?.away_score_pred).toBe(0)
  })

  it('clamps out-of-range score predictions to null', async () => {
    await POST(makeRequest({ ...BASE_BODY, home_score_pred: 99, away_score_pred: -1 }))
    expect((insertedData as Record<string, unknown>)?.home_score_pred).toBeNull()
    expect((insertedData as Record<string, unknown>)?.away_score_pred).toBeNull()
  })
})

// ─── Rule: Timing — predictions close at kick-off ────────────────────────────
describe('Rule: predictions close at kick-off', () => {
  it('accepts entry when kick-off is in the future', async () => {
    mockMatchData = { stage: 'Group A', kickoff_at: FUTURE_KICKOFF }
    const res = await POST(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
  })

  it('rejects entry when kick-off has already passed', async () => {
    mockMatchData = { stage: 'Group A', kickoff_at: PAST_KICKOFF }
    const res = await POST(makeRequest(BASE_BODY))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/closed/i)
  })
})

// ─── Rule: Eligibility — one prediction per person per match ─────────────────
describe('Rule: one prediction per person per match', () => {
  it('rejects a duplicate entry for the same phone + match', async () => {
    mockExistingEntry = { id: 'existing-id' }
    const res = await POST(makeRequest(BASE_BODY))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/already entered/i)
  })

  it('accepts entry when no prior pick exists for this match', async () => {
    mockExistingEntry = null
    const res = await POST(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
  })
})

// ─── Rule: Eligibility — required fields ─────────────────────────────────────
describe('Rule: required fields (name, phone, pick)', () => {
  it('rejects missing name', async () => {
    const { name: _, ...body } = BASE_BODY
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(400)
  })

  it('rejects missing phone', async () => {
    const { phone: _, ...body } = BASE_BODY
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(400)
  })

  it('rejects missing pick', async () => {
    const { pick: _, ...body } = BASE_BODY
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(400)
  })

  it('rejects invalid pick value', async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, pick: 'win' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid pick/i)
  })

  it('accepts all three valid pick values', async () => {
    for (const pick of ['home', 'draw', 'away']) {
      mockExistingEntry = null
      const res = await POST(makeRequest({ ...BASE_BODY, pick }))
      expect(res.status).toBe(200)
    }
  })
})

// ─── Rule: Eligibility — unknown pub rejected ────────────────────────────────
describe('Rule: must select a valid pub', () => {
  it('rejects an unknown pub_id', async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, pub_id: 'manchester' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown pub/i)
  })

  it('accepts haverhill', async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, pub_id: 'haverhill' }))
    expect(res.status).toBe(200)
  })

  it('accepts nashua', async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, pub_id: 'nashua' }))
    expect(res.status).toBe(200)
  })
})
