import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import {
  leads, pipelineStages, actividadesCliente, pedidos, clientes, metas,
} from '@/db/schema'
import { eq, and, isNull, sql, desc, gte, lt, inArray } from 'drizzle-orm'

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const userId = session.user.id
    const now = new Date()

    // Non-agents get a zeroed response (they have their own dashboards)
    if (session.user.role !== 'agent') {
      return NextResponse.json({
        data: {
          nombre: session.user.name?.split(' ')[0] ?? 'usuario',
          meta: null,
          paraHoy: { leadsInactivos: 0, visitasHoy: 0, cobranzasVencidas: 0, pedidosPorEntregar: 0 },
          ultimosMovimientos: [],
        },
      })
    }

    const firstName = session.user.name?.split(' ')[0] ?? 'vendedor'

    // ── Meta del mes ────────────────────────────────────────────────────────────
    const [metaRow] = await db
      .select({
        pedidosObjetivo: metas.pedidosObjetivo,
      })
      .from(metas)
      .where(
        and(
          eq(metas.vendedorId, userId),
          eq(metas.periodoAnio, now.getFullYear()),
          eq(metas.periodoMes, now.getMonth() + 1),
        ),
      )
      .limit(1)

    let pedidosAlcanzados = 0
    if (metaRow) {
      const mesStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const mesEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const [pedidosCount] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(pedidos)
        .where(
          and(
            eq(pedidos.vendedorId, userId),
            isNull(pedidos.deletedAt),
            gte(pedidos.fecha, mesStart),
            lt(pedidos.fecha, mesEnd),
          ),
        )
      pedidosAlcanzados = pedidosCount?.total ?? 0
    }

    // ── Leads inactivos (non-terminal stage, no contact in 24h) ─────────────────
    const [leadsInactivosRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(leads)
      .innerJoin(pipelineStages, eq(leads.stageId, pipelineStages.id))
      .where(
        and(
          eq(leads.assignedTo, userId),
          eq(leads.isOpen, true),
          isNull(leads.deletedAt),
          eq(pipelineStages.isTerminal, false),
          sql`(${leads.lastContactedAt} IS NULL OR ${leads.lastContactedAt} < NOW() - INTERVAL '24 hours')`,
        ),
      )

    // ── Visitas programadas para hoy ─────────────────────────────────────────────
    const [visitasHoyRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(actividadesCliente)
      .where(
        and(
          eq(actividadesCliente.asignadoA, userId),
          eq(actividadesCliente.tipo, 'visita'),
          eq(actividadesCliente.estado, 'pendiente'),
          sql`DATE(${actividadesCliente.fechaProgramada}) = CURRENT_DATE`,
        ),
      )

    // ── Cobranzas vencidas (impago/parcial hace más de 30 días) ──────────────────
    const [cobranzasRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(pedidos)
      .where(
        and(
          eq(pedidos.vendedorId, userId),
          isNull(pedidos.deletedAt),
          sql`${pedidos.estadoPago} IN ('impago', 'parcial')`,
          sql`${pedidos.fecha} < NOW() - INTERVAL '30 days'`,
        ),
      )

    // ── Pedidos confirmados pendientes de entrega ────────────────────────────────
    const [porEntregarRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(pedidos)
      .where(
        and(
          eq(pedidos.vendedorId, userId),
          eq(pedidos.estado, 'confirmado'),
          isNull(pedidos.deletedAt),
        ),
      )

    // ── Últimos 5 movimientos (pedidos del vendedor) ─────────────────────────────
    const ultimosPedidos = await db
      .select({
        id: pedidos.id,
        estado: pedidos.estado,
        total: pedidos.total,
        createdAt: pedidos.createdAt,
        clienteNombre: clientes.nombre,
        clienteApellido: clientes.apellido,
      })
      .from(pedidos)
      .innerJoin(clientes, eq(pedidos.clienteId, clientes.id))
      .where(
        and(
          eq(pedidos.vendedorId, userId),
          isNull(pedidos.deletedAt),
        ),
      )
      .orderBy(desc(pedidos.createdAt))
      .limit(5)

    const ultimosMovimientos = ultimosPedidos.map((p) => ({
      tipo: 'pedido',
      descripcion: `Pedido ${p.estado}`,
      creadoEn: p.createdAt?.toISOString() ?? new Date().toISOString(),
      clienteNombre: `${p.clienteNombre} ${p.clienteApellido}`.trim(),
    }))

    return NextResponse.json({
      data: {
        nombre: firstName,
        meta: metaRow
          ? { pedidosAlcanzados, pedidosObjetivo: metaRow.pedidosObjetivo }
          : null,
        paraHoy: {
          leadsInactivos: leadsInactivosRow?.total ?? 0,
          visitasHoy: visitasHoyRow?.total ?? 0,
          cobranzasVencidas: cobranzasRow?.total ?? 0,
          pedidosPorEntregar: porEntregarRow?.total ?? 0,
        },
        ultimosMovimientos,
      },
    })
  } catch (err) {
    console.error('[dashboard/hoy]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
