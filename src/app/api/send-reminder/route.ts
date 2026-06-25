import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Match = {
  id: string
  home_team: string
  away_team: string
  home_flag: string
  away_flag: string
  stage: string
  kickoff_at: string
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'long',
    timeZone: 'America/New_York',
  })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    timeZone: 'America/New_York',
  })
}

function buildSubject(matches: Match[]) {
  if (matches.length === 1) {
    const m = matches[0]
    return `⚽ ${m.home_team} vs ${m.away_team} — Make your pick at Peddler's!`
  }
  return `⚽ ${matches.length} matches today — Make your picks at Peddler's!`
}

function buildHtml(matches: Match[], name: string, pubId: string) {
  const pubUrl = `https://peddlers-predictor.vercel.app/?pub=${pubId}`
  const pubName = pubId === 'haverhill' ? "Peddler's Haverhill" : "Peddler's Nashua"
  const first = name.split(' ')[0]

  const matchBlocks = matches.map(m => `
    <div style="background:#181818;border:1px solid #333;border-radius:10px;padding:16px 20px;margin-bottom:12px;">
      <div style="font-size:18px;font-weight:700;color:#f0ede8;margin-bottom:6px;">
        ${m.home_flag} ${m.home_team} &nbsp;vs&nbsp; ${m.away_team} ${m.away_flag}
      </div>
      <div style="font-size:13px;color:#777770;margin-bottom:4px;">${m.stage} &middot; ${fmtDate(m.kickoff_at)}</div>
      <div style="font-size:14px;font-weight:700;color:#00C87A;">Kick-off: ${fmtTime(m.kickoff_at)}</div>
    </div>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Match Reminder</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#f0ede8;">
  <div style="max-width:560px;margin:0 auto;padding:28px 16px 40px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #222;">
      <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#777770;margin-bottom:6px;">
        THE PEDDLER'S DAUGHTER
      </div>
      <div style="font-size:26px;font-weight:900;color:#FF9500;letter-spacing:2px;margin-bottom:2px;">
        World Cup Predictor
      </div>
      <div style="font-size:12px;color:#555550;">FIFA World Cup 2026</div>
    </div>

    <!-- Greeting -->
    <p style="font-size:16px;margin:0 0 6px;color:#f0ede8;">Hey ${first}! ⚽</p>
    <p style="font-size:14px;color:#999;margin:0 0 20px;line-height:1.6;">
      ${matches.length === 1 ? 'There&rsquo;s a match on' : 'There are matches on'} at ${pubName}.
      Make your prediction before kick-off to earn raffle tickets &mdash; more tickets means more chances to win the TV raffle.
    </p>

    <!-- Matches -->
    ${matchBlocks}

    <!-- CTA -->
    <div style="text-align:center;margin:28px 0 24px;">
      <a href="${pubUrl}"
        style="display:inline-block;background:#00C87A;color:#000;font-weight:700;font-size:15px;letter-spacing:0.5px;padding:15px 36px;border-radius:8px;text-decoration:none;text-transform:uppercase;">
        Make Your Pick &rarr;
      </a>
    </div>

    <p style="font-size:13px;color:#777770;text-align:center;margin:0 0 24px;">
      Up to 3 raffle entries per pick &mdash; raffle draw after the Final on July 19. More tickets = more chances!
    </p>

    <!-- Footer -->
    <div style="border-top:1px solid #222;padding-top:16px;text-align:center;">
      <p style="font-size:12px;color:#444;margin:0 0 4px;">
        The Peddler&rsquo;s Daughter &middot; Haverhill MA &amp; Nashua NH
      </p>
      <p style="font-size:11px;color:#333;margin:0;">
        You received this because you made a prediction at our pub. Reply to unsubscribe.
      </p>
    </div>

  </div>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    const { password, match_ids } = await req.json()

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY is not configured in environment variables' }, { status: 500 })
    }

    if (!Array.isArray(match_ids) || match_ids.length === 0) {
      return NextResponse.json({ error: 'No matches selected' }, { status: 400 })
    }

    const { data: matches, error: matchError } = await supabaseAdmin
      .from('matches')
      .select('id, home_team, away_team, home_flag, away_flag, stage, kickoff_at')
      .in('id', match_ids)
      .order('kickoff_at')

    if (matchError || !matches?.length) {
      return NextResponse.json({ error: 'Could not load selected matches' }, { status: 400 })
    }

    const { data: entries } = await supabaseAdmin
      .from('entries')
      .select('email, name, pub_id')
      .not('email', 'is', null)
      .neq('email', '')

    if (!entries?.length) {
      return NextResponse.json({ sent: 0, total: 0 })
    }

    // Deduplicate by lowercase email — keep first pub_id and name seen
    const emailMap = new Map<string, { name: string; pub_id: string }>()
    for (const e of entries) {
      if (!e.email) continue
      const key = e.email.toLowerCase().trim()
      if (!emailMap.has(key)) emailMap.set(key, { name: e.name, pub_id: e.pub_id })
    }

    const from = process.env.RESEND_FROM_EMAIL ?? 'World Cup Predictor <noreply@peddlerspredictor.com>'
    const subject = buildSubject(matches as Match[])

    let sent = 0
    const errors: string[] = []

    for (const [email, { name, pub_id }] of Array.from(emailMap.entries())) {
      const html = buildHtml(matches as Match[], name, pub_id)
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from, to: email, subject, html }),
        })
        if (res.ok) {
          sent++
        } else {
          const body = await res.json().catch(() => ({}))
          errors.push(`${email}: ${body.message ?? res.status}`)
        }
      } catch {
        errors.push(`${email}: network error`)
      }
    }

    return NextResponse.json({ sent, total: emailMap.size, errors: errors.slice(0, 10) })
  } catch (err) {
    console.error('send-reminder error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
