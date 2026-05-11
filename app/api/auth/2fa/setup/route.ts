import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateSecret, generateTotpUri } from '@/lib/totp'
import qrcode from 'qrcode'

export async function GET() {
  try {
    const session = await auth()
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const secret = generateSecret()
    const uri = await generateTotpUri(secret, session.user.email)
    const qrDataUrl = await qrcode.toDataURL(uri)

    // Persist pending secret — will be activated after first verification
    await db.update(users).set({ totpSecret: secret }).where(eq(users.id, session.user.id))

    return NextResponse.json({ secret, qrDataUrl })
  } catch (err) {
    console.error('[2fa/setup]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
