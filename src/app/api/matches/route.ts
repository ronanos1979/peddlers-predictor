import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select('*')
    .eq('is_active', true)
    .single()

  if (error) return NextResponse.json({ error: 'No active match' }, { status: 404 })
  return NextResponse.json(data)
}
