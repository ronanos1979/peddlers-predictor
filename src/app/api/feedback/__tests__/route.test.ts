// Mock supabaseAdmin before importing the route
const mockInsert = jest.fn().mockResolvedValue({ error: null })
jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: () => ({ insert: mockInsert }),
  },
}))
jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: () => true,
  getIp: () => 'test-ip',
}))

import { NextRequest } from 'next/server'
import { POST } from '../route'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/feedback', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockInsert.mockResolvedValue({ error: null })
  })

  it('returns 400 when message is missing', async () => {
    const res = await POST(makeRequest({ email: 'test@example.com' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  it('returns 400 when message is too short', async () => {
    const res = await POST(makeRequest({ message: 'Hi' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when message is empty string', async () => {
    const res = await POST(makeRequest({ message: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 for valid message', async () => {
    const res = await POST(makeRequest({ message: 'The bracket page is broken on mobile' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('saves message and optional email to Supabase', async () => {
    await POST(makeRequest({
      message: 'Score is showing wrong result for USA match',
      email: 'user@example.com',
      page: 'https://peddlers-predictor.vercel.app/world-cup/team?name=USA',
    }))
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Score is showing wrong result for USA match',
        email: 'user@example.com',
      })
    )
  })

  it('saves null email when not provided', async () => {
    await POST(makeRequest({ message: 'Something is broken on the leaderboard page' }))
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ email: null })
    )
  })

  it('trims and truncates long messages', async () => {
    const longMsg = 'A'.repeat(3000)
    await POST(makeRequest({ message: '  ' + longMsg + '  ' }))
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/^A{2000}$/),
      })
    )
  })
})
