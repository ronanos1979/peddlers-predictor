import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getDailyCode } from '@/lib/matchSchedule'
import { checkRateLimit, getIp } from '@/lib/rateLimit'

export async function GET(req: NextRequest) {
  const match_id = req.nextUrl.searchParams.get('match_id')
  if (!match_id) return NextResponse.json({ count: 0 })
  const { count } = await supabaseAdmin
    .from('check_ins')
    .select('*', { count: 'exact', head: true })
    .eq('match_id', match_id)
  return NextResponse.json({ count: count ?? 0 })
}

export async function POST(req: NextRequest) {
  try {
    if (!checkRateLimit(`checkin:${getIp(req)}`, 5, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 })
    }

    const { pub_id, match_id, name, phone, email, code, shared_to } = await req.json()

    if (!pub_id || !match_id || !name || !phone) {
      return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 })
    }

    if (!['haverhill', 'nashua'].includes(pub_id)) {
      return NextResponse.json({ error: 'Unknown pub' }, { status: 400 })
    }

    const trimmedName = String(name).trim()
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return NextResponse.json({ error: 'Name must be 2–100 characters' }, { status: 400 })
    }

    const raw = String(phone).replace(/\D/g, '')
    const digits = raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw
    if (digits.length !== 10) {
      return NextResponse.json({ error: 'Enter a valid 10-digit US phone number' }, { status: 400 })
    }

    const { data: match } = await supabaseAdmin
      .from('matches').select('*').eq('id', match_id).single()
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 400 })

    if (match.stage !== 'Demo Match') {
      const kickoff = new Date(match.kickoff_at).getTime()
      const now = Date.now()
      if (now < kickoff) {
        return NextResponse.json({ error: "Match hasn't started yet" }, { status: 400 })
      }
      if (now > kickoff + 140 * 60 * 1000) {
        return NextResponse.json({ error: 'Check-in window has closed' }, { status: 400 })
      }
      if (match.result) {
        return NextResponse.json({ error: 'Match is already finished' }, { status: 400 })
      }

      const todayCode = getDailyCode(new Date())
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayCode = getDailyCode(yesterday)
      const enteredCode = (code || '').toLowerCase().trim()
      if (enteredCode !== todayCode && enteredCode !== yesterdayCode) {
        return NextResponse.json({ error: 'Wrong pub code — ask your bartender' }, { status: 400 })
      }
    }

    const { data: existing } = await supabaseAdmin
      .from('check_ins').select('id').eq('phone', digits).eq('match_id', match_id).single()
    if (existing) {
      return NextResponse.json({ error: "You're already checked in for this match!" }, { status: 400 })
    }

    const { error: insertError } = await supabaseAdmin
      .from('check_ins')
      .insert({
        pub_id,
        match_id,
        name: trimmedName,
        phone: digits,
        email: email ? String(email).trim().slice(0, 200) : null,
        shared_to: shared_to || null,
      })

    if (insertError) {
      console.error('Check-in insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save check-in' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Check-in API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
