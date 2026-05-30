// Mock supabaseAdmin
const mockUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) })
const mockSelect = jest.fn().mockReturnValue({
  select: jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ data: [], error: null })
  })
})
jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      update: mockUpdate,
      select: mockSelect,
    }),
  },
}))
jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: () => true,
  getIp: () => 'test-ip',
}))

const CORRECT_PASSWORD = 'test-admin-password'
const originalEnv = process.env

beforeAll(() => {
  process.env = { ...originalEnv, ADMIN_PASSWORD: CORRECT_PASSWORD }
})
afterAll(() => {
  process.env = originalEnv
})

import { NextRequest } from 'next/server'
import { POST } from '../route'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin — authentication', () => {
  it('returns 401 for wrong password', async () => {
    const res = await POST(makeRequest({ password: 'wrong', action: 'ping', payload: {} }))
    expect(res.status).toBe(401)
  })

  it('returns 401 for missing password', async () => {
    const res = await POST(makeRequest({ action: 'ping', payload: {} }))
    expect(res.status).toBe(401)
  })

  it('returns 200 for correct password with ping', async () => {
    const res = await POST(makeRequest({ password: CORRECT_PASSWORD, action: 'ping', payload: {} }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 400 for unknown action with correct password', async () => {
    const res = await POST(makeRequest({ password: CORRECT_PASSWORD, action: 'unknown_action', payload: {} }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/admin — mark_feedback_read', () => {
  it('accepts mark_feedback_read with correct password', async () => {
    const res = await POST(makeRequest({
      password: CORRECT_PASSWORD,
      action: 'mark_feedback_read',
      payload: { id: 'some-uuid' },
    }))
    expect(res.status).toBe(200)
  })

  it('rejects mark_feedback_read with wrong password', async () => {
    const res = await POST(makeRequest({
      password: 'wrong',
      action: 'mark_feedback_read',
      payload: { id: 'some-uuid' },
    }))
    expect(res.status).toBe(401)
  })
})
