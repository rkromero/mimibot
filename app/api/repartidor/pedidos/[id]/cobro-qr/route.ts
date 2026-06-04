import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { toApiError, AuthzError } from '@/lib/errors'
import { createPreference } from '@/lib/mercadopago/client'
import { z } from 'zod'

const APP_URL = 'https://mimibot-production-1c38.up.railway.app'
const WEBHOOK_URL = `${APP_URL}/api/webhooks/mercadopago`

const bodySchema = z.object({
  firmaUrl: z.string().min(1),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  precisionM: z.number().nonnegative().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (role !== 'repartidor' && role !== 'admin' && role !== 'gerente') {
      throw new AuthzError('Solo repartidor, admin o gerente pueden generar cobros QR')
    }

    const { id: pedidoId } = await params

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { firmaUrl, lat, lng, precisionM } = parsed.data

    const pedido = await db.query.pedidos.findFirst({
      where: and(eq(pedidos.id, pedidoId), isNull(pedidos.deletedAt)),
      columns: { id: true, estado: true, saldoPendiente: true, total: true },
    })

    if (!pedido) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }
    if (pedido.estado !== 'en_reparto') {
      return NextResponse.json(
        { error: 'El pedido debe estar en estado en_reparto para generar un cobro QR' },
        { status: 409 },
      )
    }

    const saldo = parseFloat(pedido.saldoPendiente)
    if (saldo <= 0) {
      return NextResponse.json(
        { error: 'El pedido no tiene saldo pendiente de cobro' },
        { status: 409 },
      )
    }

    const preference = await createPreference({
      items: [
        {
          title: `Pago pedido #${pedidoId.slice(-8).toUpperCase()}`,
          quantity: 1,
          unit_price: Math.round(saldo * 100) / 100,
          currency_id: 'ARS',
        },
      ],
      externalReference: pedidoId,
      notificationUrl: WEBHOOK_URL,
    })

    // Save preference ID + firma/GPS + entregadoPor so the webhook can mark delivered later.
    // Do NOT set estado='entregado' or entregadoAt here.
    await db
      .update(pedidos)
      .set({
        mpPreferenceId: preference.id,
        firmaUrl,
        entregaLat: lat ?? null,
        entregaLng: lng ?? null,
        entregaPrecisionM: precisionM ?? null,
        entregadoPor: session.user.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(pedidos.id, pedidoId))

    return NextResponse.json({
      preferenceId: preference.id,
      initPoint: preference.init_point,
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
