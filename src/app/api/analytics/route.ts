import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { checkRateLimit, getIp } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  if (!checkRateLimit(`analytics:${getIp(req)}`, 60, 60 * 1000)) {
    return NextResponse.json({ ok: false }, { status: 429 })
  }
  try {
    const { event, properties } = await req.json()
    if (!event || typeof event !== 'string' || event.length > 100) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    await supabaseAdmin.from('analytics_events').insert({ event, properties: properties || {} })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const password = req.headers.get('x-admin-password')
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const days = parseInt(req.nextUrl.searchParams.get('days') || '7')
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('analytics_events')
    .select('event, properties, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data || [] })
}
