import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { toApiError, AuthzError, NotFoundError, ConflictError, ValidationError } from '@/lib/errors'
import { z } from 'zod'
import { registrarPagoPedido } from '@/lib/cuenta-corriente/pago.service'

const bodySchema = z.object({
  firmaUrl: z.string().min(1),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  precisionM: z.number().nonnegative().optional(),
  settlement: z.discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('efectivo'),
      monto: z.number().positive(),
    }),
    z.object({
      tipo: z.literal('a_cuenta'),
      monto: z.number().positive().optional(),
    }),
  ]),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (role !== 'repartidor' && role !== 'admin' && role !== 'gerente') {
      throw new AuthzError('Solo repartidor, admin o gerente pueden acceder a este endpoint')
    }

    const { id } = await params

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { firmaUrl, lat, lng, precisionM, settlement } = parsed.data

    const [pedido] = await db
      .select({
        id: pedidos.id,
        estado: pedidos.estado,
        saldoPendiente: pedidos.saldoPendiente,
      })
      .from(pedidos)
      .where(and(eq(pedidos.id, id), isNull(pedidos.deletedAt)))
      .limit(1)

    if (!pedido) throw new NotFoundError('Pedido')
    if (pedido.estado !== 'en_reparto') {
      throw new ConflictError('El pedido no está en estado en_reparto')
    }

    const registradoPor = session.user.id ?? null
    if (!registradoPor) throw new AuthzError('Usuario sin ID')

    const entregaFields = {
      estado: 'entregado' as const,
      entregadoAt: new Date(),
      entregadoPor: registradoPor,
      firmaUrl,
      entregaLat: lat ?? null,
      entregaLng: lng ?? null,
      entregaPrecisionM: precisionM ?? null,
      updatedAt: new Date(),
    }

    if (settlement.tipo === 'efectivo') {
      const saldo = parseFloat(pedido.saldoPendiente)
      if (settlement.monto > saldo) {
        throw new ValidationError(`El monto (${settlement.monto}) supera el saldo pendiente (${saldo})`)
      }

      await registrarPagoPedido({
        pedidoId: id,
        monto: settlement.monto.toFixed(2),
        metodoPago: 'efectivo',
        registradoPor,
      })
    }

    // Mark delivered (for both efectivo and a_cuenta)
    let updated: typeof pedidos.$inferSelect | undefined
    try {
      const rows = await db
        .update(pedidos)
        .set(entregaFields)
        .where(eq(pedidos.id, id))
        .returning()
      updated = rows[0]
    } catch (dbErr) {
      const pgCode = (dbErr as { code?: string }).code
      const pgMsg = (dbErr as Error).message ?? ''

      if (pgCode === '42703' || pgMsg.includes('does not exist')) {
        console.error('[entregar] DB update failed — likely migration 0022 not applied:', pgMsg)
        return NextResponse.json(
          {
            error:
              'Error de base de datos: columnas de entrega no encontradas. ' +
              'Aplicar migración ejecutando POST /api/admin/debug/run-missing-migrations',
          },
          { status: 503 },
        )
      }
      throw dbErr
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
