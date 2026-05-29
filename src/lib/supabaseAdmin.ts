import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseSecret = process.env.SUPABASE_SECRET_KEY!

// This client has full access - only use in API routes (server side)
export const supabaseAdmin = createClient(supabaseUrl, supabaseSecret)
