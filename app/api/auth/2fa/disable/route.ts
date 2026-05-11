import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function DELETE() {
  try {
    const session = await auth()
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    await db
      .update(users)
      .set({ totpEnabled: false, totpSecret: null })
      .where(eq(users.id, session.user.id))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[2fa/disable]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
