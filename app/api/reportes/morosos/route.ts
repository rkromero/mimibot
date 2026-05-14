import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, businessConfig } from '@/db/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { getSessionContext } from '@/lib/territorios/context'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getSessionContext(session.user)

    const [config] = await db.select().from(businessConfig).where(eq(businessConfig.id, 1)).limit(1)
    const morosoDias = config?.clienteMorosoDias ?? 30

    // Selector opcional "Ver por agente" — solo válido para gerente/admin.
    const filterVendedorId = req.nextUrl.searchParams.get('vendedorId') ?? null

    // Traemos morosos uniendo con clientes para poder filtrar por asignación
    // (agente) o por territorios del gerente. La regla del agente es estricta:
    // solo ve morosos cuyo cliente sigue asignado a él HOY — si reasignaron al
    // cliente, los pedidos viejos desaparecen de su vista de morosos.
    let rows = await db.query.pedidos.findMany({
      where: and(
        isNull(pedidos.deletedAt),
        sql`${pedidos.estadoPago} IN ('impago', 'parcial')`,
        sql`${pedidos.fecha} < NOW() - (${morosoDias}::text || ' days')::interval`,
      ),
      with: {
        cliente: {
          columns: { id: true, nombre: true, apellido: true, telefono: true, cuit: true, territorioId: true, asignadoA: true },
        },
        vendedor: { columns: { id: true, name: true } },
      },
      orderBy: [pedidos.fecha],
    })

    // Aplico el filtro de rol en memoria (más simple que hacerlo en SQL con
    // joins variables y mantiene la query principal idéntica al flujo viejo).
    if (ctx.role === 'agent') {
      rows = rows.filter((r) => r.cliente?.asignadoA === ctx.userId)
    } else if (ctx.role === 'gerente') {
      const territoriosSet = new Set(ctx.territoriosGestionados)
      rows = rows.filter((r) => r.cliente?.territorioId && territoriosSet.has(r.cliente.territorioId))
      // Selector opcional: filtrar a un agente específico dentro de mis territorios
      if (filterVendedorId && ctx.agentesVisibles.includes(filterVendedorId)) {
        rows = rows.filter((r) => r.cliente?.asignadoA === filterVendedorId)
      }
    } else if (ctx.role === 'admin' && filterVendedorId) {
      // Admin también puede usar el selector
      rows = rows.filter((r) => r.cliente?.asignadoA === filterVendedorId)
    }

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
