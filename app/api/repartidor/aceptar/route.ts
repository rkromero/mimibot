import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, inArray, isNull } from 'drizzle-orm'
import { toApiError, AuthzError } from '@/lib/errors'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (role !== 'repartidor' && role !== 'admin' && role !== 'gerente' && role !== 'fabrica') {
      throw new AuthzError('Solo repartidor, fabrica, admin o gerente pueden aceptar pedidos')
    }

    const body: unknown = await req.json()
    if (
      !body ||
      typeof body !== 'object' ||
      !('pedidoIds' in body) ||
      !Array.isArray((body as { pedidoIds: unknown }).pedidoIds)
    ) {
      return NextResponse.json({ error: 'pedidoIds debe ser un array' }, { status: 400 })
    }

    const pedidoIds = (body as { pedidoIds: unknown[] }).pedidoIds
    if (!pedidoIds.every((id) => typeof id === 'string')) {
      return NextResponse.json({ error: 'Todos los pedidoIds deben ser strings' }, { status: 400 })
    }

    const ids = pedidoIds as string[]
    if (ids.length === 0) {
      return NextResponse.json({ actualizados: [], omitidos: [] })
    }

    const rows = await db.query.pedidos.findMany({
      where: and(inArray(pedidos.id, ids), isNull(pedidos.deletedAt)),
      columns: { id: true, estado: true, esReparto: true, metodoEntrega: true },
    })

    const rowMap = new Map(rows.map((r) => [r.id, r]))
    const elegibles: string[] = []
    const omitidos: Array<{ id: string; motivo: string }> = []

    for (const id of ids) {
      const row = rowMap.get(id)
      if (!row) {
        omitidos.push({ id, motivo: 'No encontrado' })
        continue
      }
      if (row.estado !== 'listo_para_repartir') {
        omitidos.push({ id, motivo: `Estado inválido: '${row.estado}' (se requiere 'listo_para_repartir')` })
        continue
      }
      if (!row.esReparto && row.metodoEntrega !== 'expreso') {
        omitidos.push({ id, motivo: 'Solo se pueden aceptar pedidos de camioneta o expreso' })
        continue
      }
      elegibles.push(id)
    }

    let actualizados: (typeof pedidos.$inferSelect)[] = []
    if (elegibles.length > 0) {
      actualizados = await db
        .update(pedidos)
        .set({
          estado: 'en_reparto',
          repartidorId: session.user.id,
          aceptadoAt: new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(pedidos.id, elegibles))
        .returning()
    }

    return NextResponse.json({ actualizados, omitidos })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
