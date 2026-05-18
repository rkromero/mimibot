import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { movimientosCC, pedidos, clientes } from '@/db/schema'
import { eq, desc, sql, and, isNull } from 'drizzle-orm'
import { registrarPagoSchema } from '@/lib/validations/pedidos'
import { registrarPago } from '@/lib/cuenta-corriente/pago.service'
import { canAccessCliente } from '@/lib/authz/clientes'
import { toApiError, NotFoundError } from '@/lib/errors'
import { evaluarClienteNuevo } from '@/lib/clientes/actividad.service'
import { parsePagination } from '@/lib/api/pagination'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    await canAccessCliente(session.user, id)

    const cliente = await db.query.clientes.findFirst({
      where: eq(clientes.id, id),
      columns: { id: true },
    })
    if (!cliente) throw new NotFoundError('Cliente')

    // Parse pagination — use "cc" prefix mentally but still simple query params
    const { page, limit } = parsePagination(req.nextUrl.searchParams, { limit: 50 })

    const whereMovimientos = and(
      eq(movimientosCC.clienteId, id),
      isNull(movimientosCC.deletedAt),
    )

    // Calculate saldo from ALL movements (not paginated)
    const [saldoRow] = await db
      .select({
        totalDebito: sql<string>`coalesce(sum(case when tipo = 'debito' then monto::numeric else 0 end), 0)`,
        totalCredito: sql<string>`coalesce(sum(case when tipo = 'credito' then monto::numeric else 0 end), 0)`,
      })
      .from(movimientosCC)
      .where(whereMovimientos)

    const saldo =
      parseFloat(saldoRow?.totalDebito ?? '0') -
      parseFloat(saldoRow?.totalCredito ?? '0')

    // Count for pagination
    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(movimientosCC)
      .where(whereMovimientos)

    const total = countRow?.total ?? 0
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit)

    // Paginated movimientos
    const movimientos = await db.query.movimientosCC.findMany({
      where: whereMovimientos,
      with: {
        registradoPor: { columns: { id: true, name: true } },
        pedido: { columns: { id: true, total: true, estado: true } },
      },
      orderBy: [desc(movimientosCC.fecha)],
      limit,
      offset: (page - 1) * limit,
    })

    // Fetch pedidos (not paginated — typically small)
    const pedidosPendientes = await db.query.pedidos.findMany({
      where: and(eq(pedidos.clienteId, id), isNull(pedidos.deletedAt)),
      columns: {
        id: true,
        total: true,
        montoPagado: true,
        saldoPendiente: true,
        estado: true,
        estadoPago: true,
        fecha: true,
      },
      orderBy: [desc(pedidos.fecha)],
    })

    return NextResponse.json({
      data: {
        movimientos,
        movimientosTotal: total,
        movimientosTotalPages: totalPages,
        movimientosPage: page,
        movimientosLimit: limit,
        saldo,
        saldoLabel: saldo > 0 ? 'debe' : saldo < 0 ? 'a_favor' : 'saldado',
        pedidos: pedidosPendientes,
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    await canAccessCliente(session.user, id)

    const cliente = await db.query.clientes.findFirst({
      where: eq(clientes.id, id),
      columns: { id: true },
    })
    if (!cliente) throw new NotFoundError('Cliente')

    const body: unknown = await req.json()
    const parsed = registrarPagoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const result = await registrarPago(
      {
        clienteId: id,
        monto: parsed.data.monto,
        descripcion: parsed.data.descripcion ?? null,
        fecha: parsed.data.fecha ? new Date(parsed.data.fecha) : new Date(),
        registradoPor: session.user.id,
      },
      db,
    )

    void evaluarClienteNuevo(id).catch((err) => {
      console.warn('[cuenta-corriente] evaluarClienteNuevo failed:', err)
    })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
