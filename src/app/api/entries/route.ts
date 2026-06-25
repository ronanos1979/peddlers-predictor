import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getDailyCode } from '@/lib/matchSchedule'
import { checkRateLimit, getIp } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  try {
    // 5 submissions per IP per hour
    if (!checkRateLimit(`entries:${getIp(req)}`, 5, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many submissions — try again later' }, { status: 429 })
    }

    const { pub_id, match_id, name, phone, pick, code, email, honeypot, home_score_pred, away_score_pred, hat_trick_pred, hat_trick_scorer_pred, entry_lat, entry_lng, entry_distance_m } = await req.json()

    // Silently drop honeypot-filled submissions (bots fill hidden fields)
    if (honeypot) {
      return NextResponse.json({ success: true })
    }

    if (!pub_id || !match_id || !name || !phone || !pick) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    const trimmedName = String(name).trim()
    if (trimmedName.length > 100) {
      return NextResponse.json({ error: 'Name too long' }, { status: 400 })
    }
    const nameParts = trimmedName.split(/\s+/).filter(Boolean)
    if (nameParts.length < 2 || nameParts.some(p => p.length < 2)) {
      return NextResponse.json({ error: 'Please enter your full first and last name' }, { status: 400 })
    }

    const rawPhone = String(phone).trim()
    let digits: string
    if (rawPhone.startsWith('+')) {
      digits = '+' + rawPhone.replace(/\D/g, '')
      if (digits.length < 8) return NextResponse.json({ error: 'Enter a valid phone number' }, { status: 400 })
    } else {
      const stripped = rawPhone.replace(/\D/g, '')
      digits = stripped.length === 11 && stripped.startsWith('1') ? stripped.slice(1) : stripped
      if (digits.length !== 10) return NextResponse.json({ error: 'Enter a valid US or international phone number' }, { status: 400 })
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    if (!['home', 'draw', 'away'].includes(pick)) {
      return NextResponse.json({ error: 'Invalid pick' }, { status: 400 })
    }

    if (!['haverhill', 'nashua'].includes(pub_id)) {
      return NextResponse.json({ error: 'Unknown pub' }, { status: 400 })
    }

    // Get the match and determine if it's a demo — don't trust is_demo from client
    const { data: match } = await supabaseAdmin
      .from('matches').select('*').eq('id', match_id).single()
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 400 })
    }

    const isDemo = match.stage === 'Demo Match'

    if (!isDemo) {
      const todayCode = getDailyCode(new Date())
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayCode = getDailyCode(yesterday)
      const enteredCode = (code || '').toLowerCase().trim()
      if (enteredCode !== todayCode && enteredCode !== yesterdayCode) {
        return NextResponse.json(
          { error: 'Wrong pub code — ask your bartender' },
          { status: 400 }
        )
      }

      if (new Date(match.kickoff_at) <= new Date()) {
        return NextResponse.json({ error: 'Entries are closed for this match' }, { status: 400 })
      }

      const { data: existing } = await supabaseAdmin
        .from('entries').select('id').eq('phone', digits).eq('match_id', match_id).single()
      if (existing) {
        return NextResponse.json({ error: 'You have already entered this match' }, { status: 400 })
      }
    }

    const homePred = home_score_pred != null ? parseInt(String(home_score_pred), 10) : null
    const awayPred = away_score_pred != null ? parseInt(String(away_score_pred), 10) : null
    const validHomePred = homePred != null && !isNaN(homePred) && homePred >= 0 && homePred <= 20 ? homePred : null
    const validAwayPred = awayPred != null && !isNaN(awayPred) && awayPred >= 0 && awayPred <= 20 ? awayPred : null
    const scorerName = hat_trick_pred === true && typeof hat_trick_scorer_pred === 'string' ? hat_trick_scorer_pred.trim().slice(0, 80) : null
    const validHatTrickPred = hat_trick_pred === true && scorerName ? true : null

    const lat = entry_lat != null ? parseFloat(String(entry_lat)) : null
    const lng = entry_lng != null ? parseFloat(String(entry_lng)) : null
    const distM = entry_distance_m != null ? parseInt(String(entry_distance_m), 10) : null

    const { error: insertError } = await supabaseAdmin
      .from('entries')
      .insert({
        pub_id,
        match_id,
        name: trimmedName,
        phone: digits,
        pick,
        email: email ? String(email).trim().slice(0, 200) : null,
        is_correct: null,
        raffle_entries: 0,
        home_score_pred: validHomePred,
        away_score_pred: validAwayPred,
        hat_trick_pred: validHatTrickPred,
        hat_trick_scorer_pred: validHatTrickPred === true ? scorerName : null,
        entry_lat: lat != null && !isNaN(lat) ? lat : null,
        entry_lng: lng != null && !isNaN(lng) ? lng : null,
        entry_distance_m: distM != null && !isNaN(distM) ? distM : null,
      })

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Entries API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
