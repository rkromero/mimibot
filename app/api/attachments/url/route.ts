import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSignedUrl } from '@/lib/r2/signed-url'
import { toApiError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const key = req.nextUrl.searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'key requerido' }, { status: 400 })

    // Prevenir directory traversal
    const sanitized = key.replace(/\.\./g, '').replace(/^\/+/, '')
    const url = await getSignedUrl(sanitized)

    // If client wants JSON (API usage), return URL; if browser (img/a), redirect
    const accept = req.headers.get('accept') ?? ''
    if (accept.includes('application/json')) {
      return NextResponse.json({ url })
    }
    return NextResponse.redirect(url)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
