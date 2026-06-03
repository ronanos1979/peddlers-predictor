import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Pub = {
  id: string
  name: string
  city: string
  lat: number
  lng: number
  radius_m: number
  daily_code: string
}

export type Match = {
  id: string
  home_team: string
  away_team: string
  home_flag: string
  away_flag: string
  kickoff_at: string
  entries_close_at: string
  stage: string
  result: 'home' | 'draw' | 'away' | null
  is_active: boolean
  venue: string | null
  home_score: number | null
  away_score: number | null
}

export type Entry = {
  id: string
  pub_id: string
  match_id: string
  name: string
  phone: string
  email: string | null
  pick: 'home' | 'draw' | 'away'
  is_correct: boolean | null
  raffle_entries: number
  created_at: string
  home_score_pred: number | null
  away_score_pred: number | null
}
