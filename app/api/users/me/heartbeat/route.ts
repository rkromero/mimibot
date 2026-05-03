import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function PUT() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  await db
    .update(users)
    .set({ lastSeenAt: new Date(), isOnline: true })
    .where(eq(users.id, session.user.id))

  return NextResponse.json({ ok: true })
}
