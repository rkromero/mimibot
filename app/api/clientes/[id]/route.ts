import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { clientes, pedidos, pedidoItems, productos } from '@/db/schema'
import { eq, and, count, sum, isNull, desc, max, sql, ne } from 'drizzle-orm'
import { updateClienteSchema } from '@/lib/validations/clientes'
import { requireAdmin } from '@/lib/authz'
import { canAccessCliente } from '@/lib/authz/clientes'
import { toApiError, NotFoundError } from '@/lib/errors'
import { deleteCliente } from '@/lib/delete/delete.service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    await canAccessCliente(session.user, id)

    const cliente = await db.query.clientes.findFirst({
      where: and(eq(clientes.id, id), isNull(clientes.deletedAt)),
      with: {
        asignadoA: {
          columns: { id: true, name: true, avatarColor: true },
        },
        territorio: {
          columns: { id: true, nombre: true },
        },
      },
    })

    if (!cliente) throw new NotFoundError('Cliente')

    // Get pedidos summary (exclude soft-deleted): count, total facturado,
    // saldo pendiente acumulado y fecha del último pedido. Wrapped in try
    // because the productos joins below depend on schema sync; we don't want
    // a transient DB hiccup to break the whole detail view.
    let summary: {
      count: number
      total: string
      saldoPendiente: string
      ultimoPedidoFecha: Date | null
    } = { count: 0, total: '0', saldoPendiente: '0', ultimoPedidoFecha: null }
    try {
      const pedidosSummary = await db
        .select({
          count: count(),
          total: sum(pedidos.total),
          saldoPendiente: sum(pedidos.saldoPendiente),
          ultimoPedidoFecha: max(pedidos.fecha),
        })
        .from(pedidos)
        .where(and(eq(pedidos.clienteId, id), isNull(pedidos.deletedAt)))
      const row = pedidosSummary[0]
      if (row) {
        summary = {
          count: Number(row.count ?? 0),
          total: row.total ?? '0',
          saldoPendiente: row.saldoPendiente ?? '0',
          ultimoPedidoFecha: row.ultimoPedidoFecha ?? null,
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[clientes GET] pedidos summary failed:', msg)
    }

    // Productos habituales — top 6 productos más comprados por este cliente.
    // Wrapped in its own try so the detail view still works if productos has
    // schema drift in some environment.
    type ProductoHabitual = {
      id: string
      nombre: string
      precio: string
      sku: string | null
      totalCantidad: number
    }
    let productosHabituales: ProductoHabitual[] = []
    try {
      const habituales = await db
        .select({
          id: productos.id,
          nombre: productos.nombre,
          precio: productos.precio,
          sku: productos.sku,
          totalCantidad: sql<number>`SUM(${pedidoItems.cantidad})::int`,
        })
        .from(pedidoItems)
        .innerJoin(pedidos, eq(pedidos.id, pedidoItems.pedidoId))
        .innerJoin(productos, eq(productos.id, pedidoItems.productoId))
        .where(and(
          eq(pedidos.clienteId, id),
          isNull(pedidos.deletedAt),
          isNull(productos.deletedAt),
          eq(productos.activo, true),
          ne(pedidos.estado, 'cancelado'),
        ))
        .groupBy(productos.id, productos.nombre, productos.precio, productos.sku)
        .orderBy(desc(sql`SUM(${pedidoItems.cantidad})`))
        .limit(6)
      productosHabituales = habituales.map((h) => ({
        id: h.id,
        nombre: h.nombre,
        precio: h.precio,
        sku: h.sku,
        totalCantidad: Number(h.totalCantidad ?? 0),
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[clientes GET] productos habituales failed:', msg)
    }

    // Drizzle `with` replaces asignadoA UUID column with the user object —
    // flatten it back to what the frontend expects
    const asignadoUser = cliente.asignadoA as { id: string; name: string | null; avatarColor: string } | null
    const territorioData = cliente.territorio as { id: string; nombre: string } | null

    return NextResponse.json({
      data: {
        ...cliente,
        asignadoA: asignadoUser?.id ?? null,
        asignadoNombre: asignadoUser?.name ?? null,
        asignadoColor: asignadoUser?.avatarColor ?? null,
        territorioId: territorioData?.id ?? null,
        territorioNombre: territorioData?.nombre ?? null,
        pedidosSummary: {
          count: summary.count,
          total: summary.total,
          saldoPendiente: summary.saldoPendiente,
          ultimoPedidoFecha: summary.ultimoPedidoFecha,
        },
        productosHabituales,
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    await canAccessCliente(session.user, id)

    const body: unknown = await req.json()
    const parsed = updateClienteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }

    const current = await db.query.clientes.findFirst({ where: eq(clientes.id, id) })
    if (!current) throw new NotFoundError('Cliente')

    const updates: Partial<typeof clientes.$inferInsert> = {
      updatedAt: new Date(),
    }

    // Fields all roles can update
    if (parsed.data.nombre !== undefined) updates.nombre = parsed.data.nombre
    if (parsed.data.apellido !== undefined) updates.apellido = parsed.data.apellido
    if (parsed.data.email !== undefined) updates.email = parsed.data.email
    if (parsed.data.telefono !== undefined) updates.telefono = parsed.data.telefono
    if (parsed.data.direccion !== undefined) updates.direccion = parsed.data.direccion
    if (parsed.data.cuit !== undefined) updates.cuit = parsed.data.cuit

    // Only admins can reassign
    if (parsed.data.asignadoA !== undefined) {
      requireAdmin(session.user)
      updates.asignadoA = parsed.data.asignadoA
    }

    const [updated] = await db
      .update(clientes)
      .set(updates)
      .where(eq(clientes.id, id))
      .returning()

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const { id } = await params
    await deleteCliente(id, session.user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
