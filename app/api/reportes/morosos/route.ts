import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, businessConfig, clientes, users } from '@/db/schema'
import { and, eq, isNull, sql, inArray } from 'drizzle-orm'
import { getSessionContext } from '@/lib/territorios/context'
import { parsePagination } from '@/lib/api/pagination'
import { esRolVentas } from '@/lib/authz/roles'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getSessionContext(session.user)

    const [config] = await db.select().from(businessConfig).where(eq(businessConfig.id, 1)).limit(1)
    const morosoDias = config?.clienteMorosoDias ?? 30

    const filterVendedorId = req.nextUrl.searchParams.get('vendedorId') ?? null

    const { page, limit, sortBy, sortDir } = parsePagination(req.nextUrl.searchParams, {
      page: 1, limit: 50, sortBy: 'fecha', sortDir: 'asc',
    })

    // Build WHERE conditions — role filtering pushed to SQL
    const whereConditions = [
      isNull(pedidos.deletedAt),
      isNull(clientes.deletedAt),
      sql`${pedidos.estadoPago} IN ('impago', 'parcial')`,
      sql`${pedidos.fecha} < NOW() - (${morosoDias}::text || ' days')::interval`,
    ]

    if (esRolVentas(ctx.role)) {
      whereConditions.push(eq(clientes.asignadoA, ctx.userId))
    } else if (ctx.role === 'gerente') {
      if (ctx.territoriosGestionados.length === 0) {
        return NextResponse.json({ data: [], page: 1, limit, total: 0, totalPages: 1, morosoDias })
      }
      whereConditions.push(inArray(clientes.territorioId, ctx.territoriosGestionados))
      if (filterVendedorId && ctx.agentesVisibles.includes(filterVendedorId)) {
        whereConditions.push(eq(clientes.asignadoA, filterVendedorId))
      }
    } else if (ctx.role === 'admin' && filterVendedorId) {
      whereConditions.push(eq(clientes.asignadoA, filterVendedorId))
    }

    const where = and(...whereConditions)

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(pedidos)
      .innerJoin(clientes, eq(pedidos.clienteId, clientes.id))
      .where(where)

    const total = countRow?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / limit))

    const sortColumn = sortBy === 'saldoPendiente' ? pedidos.saldoPendiente
      : sortBy === 'clienteNombre' ? clientes.nombre
      : pedidos.fecha
    const orderSql = sortDir === 'desc'
      ? sql`${sortColumn} DESC`
      : sql`${sortColumn} ASC`

    const rows = await db
      .select({
        id: pedidos.id,
        fecha: pedidos.fecha,
        estadoPago: pedidos.estadoPago,
        saldoPendiente: pedidos.saldoPendiente,
        clienteId: clientes.id,
        clienteNombre: sql<string>`${clientes.nombre} || ' ' || ${clientes.apellido}`,
        clienteTelefono: clientes.telefono,
        clienteCuit: clientes.cuit,
        vendedorId: users.id,
        vendedorNombre: users.name,
      })
      .from(pedidos)
      .innerJoin(clientes, eq(pedidos.clienteId, clientes.id))
      .leftJoin(users, eq(pedidos.vendedorId, users.id))
      .where(where)
      .orderBy(orderSql)
      .limit(limit)
      .offset((page - 1) * limit)

    const data = rows.map((r) => {
      const fechaPedido = r.fecha ? new Date(r.fecha) : new Date()
      const diasVencido = Math.floor((Date.now() - fechaPedido.getTime()) / (1000 * 60 * 60 * 24))
      return { ...r, diasVencido }
    })

    return NextResponse.json({ data, page, limit, total, totalPages, morosoDias })
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err)
    console.error('[morosos] DB error, returning empty fallback:', rawMessage, err)
    return NextResponse.json(
      { data: [], page: 1, limit: 50, total: 0, totalPages: 1, morosoDias: 30, _degraded: true },
      { status: 200 },
    )
  }
}
