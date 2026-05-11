import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifyTotpCode } from '@/lib/totp'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { code } = await req.json() as { code: string }
    if (!code || code.length !== 6) {
      return NextResponse.json({ error: 'Código inválido' }, { status: 400 })
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { totpSecret: true },
    })

    if (!user?.totpSecret) {
      return NextResponse.json({ error: 'Generá el código QR primero' }, { status: 400 })
    }

    const isValid = await verifyTotpCode(code, user.totpSecret)
    if (!isValid) {
      return NextResponse.json({ error: 'Código incorrecto' }, { status: 400 })
    }

    await db.update(users).set({ totpEnabled: true }).where(eq(users.id, session.user.id))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[2fa/enable]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
