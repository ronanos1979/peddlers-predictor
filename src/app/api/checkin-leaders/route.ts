import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  const pubId = req.nextUrl.searchParams.get('pub')

  const { data, error } = await supabaseAdmin
    .from('check_ins')
    .select('name, phone, pub_id, match_id')

  if (error) return NextResponse.json({ leaders: [] })

  const rows = pubId && ['haverhill', 'nashua'].includes(pubId)
    ? (data || []).filter(r => r.pub_id === pubId)
    : (data || [])

  const byPhone = new Map<string, { name: string; pub_id: string; matches: Set<string> }>()
  for (const row of rows) {
    if (!byPhone.has(row.phone)) {
      byPhone.set(row.phone, { name: row.name, pub_id: row.pub_id, matches: new Set() })
    }
    byPhone.get(row.phone)!.matches.add(row.match_id)
  }

  const leaders = Array.from(byPhone.values())
    .map(e => ({ name: e.name, pub_id: e.pub_id, match_count: e.matches.size }))
    .sort((a, b) => b.match_count - a.match_count)

  return NextResponse.json({ leaders })
}
