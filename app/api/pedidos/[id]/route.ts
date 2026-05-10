import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, clientes } from '@/db/schema'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { updatePedidoSchema } from '@/lib/validations/pedidos'
import { confirmarPedido } from '@/lib/pedidos/service'
import { evaluarClienteNuevo } from '@/lib/clientes/actividad.service'
import { toApiError, NotFoundError, ValidationError, AuthzError } from '@/lib/errors'
import { requireAdmin } from '@/lib/authz'
import { deletePedido } from '@/lib/delete/delete.service'
import { getSessionContext } from '@/lib/territorios/context'

async function canAccessPedido(
  pedidoId: string,
  ctx: Awaited<ReturnType<typeof getSessionContext>>,
) {
  const pedido = await db.query.pedidos.findFirst({
    where: and(eq(pedidos.id, pedidoId), isNull(pedidos.deletedAt)),
    columns: { id: true, vendedorId: true, clienteId: true },
  })
  if (!pedido) throw new NotFoundError('Pedido')

  if (ctx.role === 'admin') return pedido

  if (ctx.role === 'agent') {
    if (pedido.vendedorId === ctx.userId) return pedido
    const cliente = await db.query.clientes.findFirst({
      where: and(eq(clientes.id, pedido.clienteId), eq(clientes.asignadoA, ctx.userId)),
      columns: { id: true },
    })
    if (!cliente) throw new AuthzError('No tenés acceso a este pedido')
    return pedido
  }

  if (ctx.role === 'gerente') {
    if (ctx.territoriosGestionados.length === 0) throw new AuthzError('No tenés acceso a este pedido')
    const cliente = await db.query.clientes.findFirst({
      where: and(
        eq(clientes.id, pedido.clienteId),
        inArray(clientes.territorioId, ctx.territoriosGestionados),
      ),
      columns: { id: true },
    })
    if (!cliente) throw new AuthzError('No tenés acceso a este pedido')
    return pedido
  }

  throw new AuthzError('No tenés acceso a este pedido')
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getSessionContext(session.user)
    const { id } = await params
    await canAccessPedido(id, ctx)

    const pedido = await db.query.pedidos.findFirst({
      where: and(eq(pedidos.id, id), isNull(pedidos.deletedAt)),
      with: {
        cliente: true,
        vendedor: { columns: { id: true, name: true, avatarColor: true } },
        items: {
          with: {
            producto: true,
          },
        },
        aplicaciones: true,
      },
    })

    if (!pedido) throw new NotFoundError('Pedido')

    return NextResponse.json({ data: pedido })
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

    const ctx = await getSessionContext(session.user)
    const { id } = await params
    await canAccessPedido(id, ctx)

    const body: unknown = await req.json()
    const parsed = updatePedidoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }

    const current = await db.query.pedidos.findFirst({ where: and(eq(pedidos.id, id), isNull(pedidos.deletedAt)) })
    if (!current) throw new NotFoundError('Pedido')

    const { estado, observaciones } = parsed.data

    // Validate state transitions
    if (estado === 'cancelado') {
      if (current.estado === 'confirmado' || current.estado === 'entregado') {
        throw new ValidationError('No se puede cancelar un pedido confirmado o entregado')
      }
    }

    // If changing to 'confirmado', delegate to service
    if (estado === 'confirmado' && current.estado !== 'confirmado') {
      const updated = await confirmarPedido(id, session.user.id)

      // Fire and forget — don't block the response
      void evaluarClienteNuevo(updated.clienteId).catch((err) => {
        console.warn('[pedidos] evaluarClienteNuevo failed:', err)
      })

      return NextResponse.json({ data: updated })
    }

    const updates: Partial<typeof pedidos.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (estado !== undefined) updates.estado = estado
    if (observaciones !== undefined) updates.observaciones = observaciones

    const [updated] = await db
      .update(pedidos)
      .set(updates)
      .where(eq(pedidos.id, id))
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
    await deletePedido(id, session.user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
