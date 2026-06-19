import { NextRequest, NextResponse } from 'next/server'
import { syncResults, FdRateLimitError } from '@/lib/syncResults'

// Vercel sets CRON_SECRET automatically and sends it as Bearer token
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncResults()
    console.log('[cron/sync-results]', result)
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    if (e instanceof FdRateLimitError) {
      console.error('[cron/sync-results] FD rate limited')
      return NextResponse.json({ error: 'Football data rate limited' }, { status: 429 })
    }
    console.error('[cron/sync-results] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
