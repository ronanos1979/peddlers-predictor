// Cookie-based patron persistence
// Stores name and phone so returning patrons are greeted and pre-filled

const COOKIE_NAME = 'peddlers_patron'
const COOKIE_DAYS = 90 // persist for the whole tournament + a bit after

export type PatronCookie = {
  name: string
  phone: string
  pub_id?: string
}

export function savePatron(data: PatronCookie) {
  if (typeof document === 'undefined') return
  const expires = new Date()
  expires.setDate(expires.getDate() + COOKIE_DAYS)
  const value = encodeURIComponent(JSON.stringify(data))
  document.cookie = `${COOKIE_NAME}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`
}

export function loadPatron(): PatronCookie | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${COOKIE_NAME}=`))
  if (!match) return null
  try {
    return JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')))
  } catch {
    return null
  }
}

export function clearPatron() {
  if (typeof document === 'undefined') return
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`
}

export function firstName(fullName: string): string {
  return fullName.split(' ')[0] || fullName
}
