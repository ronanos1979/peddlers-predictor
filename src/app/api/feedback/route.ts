import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const { message, email, page } = await req.json()

    if (!message || typeof message !== 'string' || message.trim().length < 3) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    await supabaseAdmin.from('feedback').insert({
      message: message.trim().slice(0, 2000),
      email:   email?.trim().slice(0, 200) || null,
      page:    page?.slice(0, 200) || null,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Feedback error:', err)
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
  }
}
