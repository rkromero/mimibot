import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { getHomeRouteByRole } from '@/lib/auth-utils'

// Purely public routes — bypassed without any auth checks
const PUBLIC_PREFIXES = [
  '/verify-2fa',
  '/api/auth',
  '/api/leads/intake',
  '/api/whatsapp/webhook',
  '/api/health',
]

// Routes that require admin or gerente role
const ADMIN_PREFIXES = ['/admin', '/api/admin']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow purely public API/utility routes
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  // Check session cookie existence (cheap — no JWT decode yet)
  const sessionToken =
    req.cookies.get('authjs.session-token')?.value ??
    req.cookies.get('__Secure-authjs.session-token')?.value

  // No session → only /login is allowed; redirect everything else with callbackUrl
  if (!sessionToken) {
    if (pathname.startsWith('/login')) return NextResponse.next()
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Session exists → decode JWT once to read role and TOTP state
  let token: { totpPending?: boolean; role?: string } | null = null
  try {
    token = await getToken({
      req,
      secret: process.env['AUTH_SECRET'] ?? process.env['NEXTAUTH_SECRET'],
    })
  } catch {
    // JWT decode failed — don't block; downstream API guards handle authorization
  }

  // TOTP still pending → redirect to verification page
  if (token?.totpPending) {
    return NextResponse.redirect(new URL('/verify-2fa', req.url))
  }

  const role = token?.role
  const homeRoute = getHomeRouteByRole(role)

  // Logged-in user at "/" or "/login" → send to their home
  if (pathname === '/' || pathname.startsWith('/login')) {
    if (token !== null) {
      // Token decoded successfully: redirect based on role
      return NextResponse.redirect(new URL(homeRoute, req.url))
    }
    // Token decode failed but cookie exists: let the server component resolve via auth() + DB
    return NextResponse.next()
  }

  // Admin-gated routes: allow admin and gerente; redirect anyone else to their home
  if (
    token !== null &&
    ADMIN_PREFIXES.some(
      (p) => pathname.startsWith(p) && !pathname.startsWith('/api/auth'),
    )
  ) {
    if (role !== 'admin' && role !== 'gerente') {
      return NextResponse.redirect(new URL(homeRoute, req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json)$).*)',
  ],
}
