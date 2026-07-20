import { NextResponse, NextRequest } from 'next/server'

// Paths that stay live even while the site is in decommission mode — the admin
// panel (so it can be turned back off), APIs, and the splash page itself.
const BYPASS_PREFIXES = ['/admin', '/api', '/decommissioned']

function isStaticAsset(pathname: string) {
  return /\.[a-zA-Z0-9]+$/.test(pathname) // has a file extension, e.g. /logo.avif, /favicon.ico
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (BYPASS_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/')) || isStaticAsset(pathname)) {
    return NextResponse.next()
  }

  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/app_settings?key=eq.decommission&select=value`
    const res = await fetch(url, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''}`,
      },
      cache: 'no-store',
    })
    const rows: { value?: { enabled?: boolean; message?: string } }[] = await res.json()
    const setting = rows?.[0]?.value

    if (setting?.enabled) {
      const requestHeaders = new Headers(req.headers)
      requestHeaders.set('x-decommissioned', '1')
      if (setting.message) requestHeaders.set('x-decommission-message', encodeURIComponent(setting.message))

      const destination = req.nextUrl.clone()
      destination.pathname = '/decommissioned'
      return NextResponse.rewrite(destination, { request: { headers: requestHeaders } })
    }
  } catch {
    // Fail open — if the settings fetch errors, don't take the whole site down over it.
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
