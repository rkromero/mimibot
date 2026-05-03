import { NextRequest, NextResponse } from 'next/server'

// Rutas públicas — no requieren sesión
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/api/leads/intake',
  '/api/whatsapp/webhook',
  '/api/health',
]

// Middleware ligero sin acceso a DB para ser compatible con Edge Runtime.
// La verificación completa de sesión (role, permisos) se hace en cada route handler
// y server component mediante auth() de lib/auth.ts (que sí usa Node.js runtime).
export function middleware(req: NextRequest) {
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

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
