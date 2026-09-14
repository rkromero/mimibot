import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pushSubscriptions } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { toApiError } from '@/lib/errors'
import { vapidPublicKey } from '@/lib/push/web-push'

const suscripcionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
  userAgent: z.string().max(512).optional(),
})

/** Clave pública VAPID para que el navegador se suscriba. */
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ publicKey: vapidPublicKey() })
}

/** Alta o refresco de la suscripción de este dispositivo. */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const parsed = suscripcionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
    }
    const { endpoint, keys, userAgent } = parsed.data

    await db
      .insert(pushSubscriptions)
      .values({
        userId: session.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: session.user.id,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: userAgent ?? null,
          lastSeenAt: new Date(),
        },
      })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/** Baja de la suscripción de este dispositivo. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const parsed = z.object({ endpoint: z.string().url().max(2048) }).safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Endpoint inválido' }, { status: 400 })
    }

    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, parsed.data.endpoint), eq(pushSubscriptions.userId, session.user.id)))

    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
