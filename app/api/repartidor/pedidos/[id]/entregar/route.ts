import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { toApiError, AuthzError, NotFoundError, ConflictError } from '@/lib/errors'
import { z } from 'zod'

const bodySchema = z.object({
  firmaUrl: z.string().min(1),
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
    const { firmaUrl } = parsed.data

    const [pedido] = await db
      .select({ id: pedidos.id, estado: pedidos.estado })
      .from(pedidos)
      .where(and(eq(pedidos.id, id), isNull(pedidos.deletedAt)))
      .limit(1)

    if (!pedido) throw new NotFoundError('Pedido')
    if (pedido.estado !== 'en_reparto') {
      throw new ConflictError('El pedido no está en estado en_reparto')
    }

    const entregadoPor = session.user.id ?? null

    let updated: typeof pedidos.$inferSelect | undefined
    try {
      const rows = await db
        .update(pedidos)
        .set({
          estado: 'entregado',
          entregadoAt: new Date(),
          entregadoPor,
          firmaUrl,
          updatedAt: new Date(),
        })
        .where(eq(pedidos.id, id))
        .returning()
      updated = rows[0]
    } catch (dbErr) {
      const pgCode = (dbErr as { code?: string }).code
      const pgMsg = (dbErr as Error).message ?? ''

      // PostgreSQL 42703 = undefined_column — migration 0022 not applied
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
