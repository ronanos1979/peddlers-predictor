import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * Global kill switch for all outbound email from this app. Defaults to BLOCKED
 * and fails closed — if the setting can't be read (table missing, DB error),
 * email sending is treated as blocked rather than allowed.
 */
export async function emailsAreBlocked(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'email_lockdown')
      .single()
    if (error || !data) return true
    const value = data.value as { enabled?: boolean } | null
    return value?.enabled !== false
  } catch {
    return true
  }
}

/** Records an email attempt — sent or blocked — for later audit. Best-effort only. */
export async function logEmailAttempt(type: string, recipients: string[], subject: string, blocked: boolean) {
  try {
    await supabaseAdmin.from('email_log').insert({ type, recipients, subject, blocked })
  } catch {
    // logging must never break the calling request
  }
}
