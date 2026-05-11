import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Rutas públicas — no requieren sesión
const PUBLIC_PREFIXES = [
  '/login',
  '/verify-2fa',
  '/api/auth',
  '/api/leads/intake',
  '/api/whatsapp/webhook',
  '/api/health',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  // Verificar existencia de cookie de sesión (sin consultar la DB)
  const sessionToken =
    req.cookies.get('authjs.session-token')?.value ??
    req.cookies.get('__Secure-authjs.session-token')?.value

  if (!sessionToken) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Si hay sesión, verificar si tiene TOTP pendiente
  try {
    const token = await getToken({ req, secret: process.env['AUTH_SECRET'] ?? process.env['NEXTAUTH_SECRET'] })
    if (token?.totpPending) {
      return NextResponse.redirect(new URL('/verify-2fa', req.url))
    }
  } catch {
    // No bloquear si falla el decode — la verificación real ocurre en los route handlers
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
