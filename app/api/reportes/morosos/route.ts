import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, businessConfig } from '@/db/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'

export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Admin and gerente only
    if (session.user.role === 'agent') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const [config] = await db.select().from(businessConfig).where(eq(businessConfig.id, 1)).limit(1)
    const morosoDias = config?.clienteMorosoDias ?? 30

    const rows = await db.query.pedidos.findMany({
      where: and(
        isNull(pedidos.deletedAt),
        sql`${pedidos.estadoPago} IN ('impago', 'parcial')`,
        sql`${pedidos.fecha} < NOW() - (${morosoDias}::text || ' days')::interval`,
      ),
      with: {
        cliente: {
          columns: { id: true, nombre: true, apellido: true, telefono: true, cuit: true, territorioId: true },
        },
        vendedor: { columns: { id: true, name: true } },
      },
      orderBy: [pedidos.fecha],
    })

    const data = rows.map((r) => {
      const fechaPedido = r.fecha ? new Date(r.fecha) : new Date()
      const diasVencido = Math.floor((Date.now() - fechaPedido.getTime()) / (1000 * 60 * 60 * 24))
      return {
        id: r.id,
        fecha: r.fecha,
        diasVencido,
        saldoPendiente: r.saldoPendiente,
        estadoPago: r.estadoPago,
        clienteId: r.cliente?.id,
        clienteNombre: `${r.cliente?.nombre ?? ''} ${r.cliente?.apellido ?? ''}`.trim(),
        clienteTelefono: r.cliente?.telefono,
        clienteCuit: r.cliente?.cuit,
        vendedorId: r.vendedor?.id,
        vendedorNombre: r.vendedor?.name,
      }
    })

    return NextResponse.json({ data, morosoDias })
  } catch (err) {
    // Log full error for ops/diagnosis but degrade gracefully so the UI
    // can still render an empty state instead of an error screen.
    const rawMessage = err instanceof Error ? err.message : String(err)
    console.error('[morosos] DB error, returning empty fallback:', rawMessage, err)
    return NextResponse.json(
      { data: [], morosoDias: 30, _degraded: true },
      { status: 200 },
    )
  }
}
