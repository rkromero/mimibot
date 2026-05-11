import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifyTotpCode } from '@/lib/totp'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { code } = await req.json() as { code: string }
    if (!code || code.length !== 6) {
      return NextResponse.json({ error: 'Código inválido' }, { status: 400 })
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { totpSecret: true, totpEnabled: true },
    })

    if (!user?.totpEnabled || !user.totpSecret) {
      return NextResponse.json({ error: '2FA no está activado' }, { status: 400 })
    }

    const isValid = await verifyTotpCode(code, user.totpSecret)
    if (!isValid) {
      return NextResponse.json({ error: 'Código incorrecto' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[2fa/verify]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
