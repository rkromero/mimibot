import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, clientes } from '@/db/schema'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { updatePedidoSchema } from '@/lib/validations/pedidos'
import { confirmarPedido, aprobarPedido, revertirPedidoAAprobacion, actualizarItemsPedido } from '@/lib/pedidos/service'
import { evaluarClienteNuevo } from '@/lib/clientes/actividad.service'
import { toApiError, NotFoundError, ValidationError, AuthzError } from '@/lib/errors'
import { requireAdmin } from '@/lib/authz'
import { deletePedido } from '@/lib/delete/delete.service'
import { getSessionContext } from '@/lib/territorios/context'
import { validateUuidParam } from '@/lib/api/validate-params'
import { parseFechaAR, todayStrAR } from '@/lib/dates'
import { esRolVentas } from '@/lib/authz/roles'
import { assertPuedeCargarProductos } from '@/lib/authz/marcas'

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
  if (ctx.role === 'fabrica') return pedido

  // Agente: solo accede al pedido si el cliente sigue asignado a él HOY.
  if (esRolVentas(ctx.role)) {
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
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
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

    const cliente = pedido.cliente as { nombre: string; apellido: string; telefono: string | null; cuit: string | null } | null
    const vendedor = pedido.vendedor as { id: string; name: string | null; avatarColor: string } | null

    return NextResponse.json({
      data: {
        ...pedido,
        clienteNombre: cliente?.nombre ?? null,
        clienteApellido: cliente?.apellido ?? null,
        clienteTelefono: cliente?.telefono ?? null,
        clienteCuit: cliente?.cuit ?? null,
        vendedorNombre: vendedor?.name ?? null,
        vendedorAvatarColor: vendedor?.avatarColor ?? null,
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

    const ctx = await getSessionContext(session.user)

    if (ctx.role === 'fabrica') {
      throw new AuthzError('El rol fábrica no puede editar pedidos. Usá el endpoint de en-reparto.')
    }

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    await canAccessPedido(id, ctx)

    const body: unknown = await req.json()
    const parsed = updatePedidoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }

    const current = await db.query.pedidos.findFirst({ where: and(eq(pedidos.id, id), isNull(pedidos.deletedAt)) })
    if (!current) throw new NotFoundError('Pedido')

    const { estado, observaciones, items, fecha, descuento } = parsed.data

    // ── Guardia central de permisos por estado ────────────────────────────────
    const ESTADOS_BLOQUEADOS = new Set(['confirmado', 'listo_para_repartir', 'en_reparto', 'entregado'])
    if (esRolVentas(ctx.role) && ESTADOS_BLOQUEADOS.has(current.estado)) {
      throw new AuthzError('Solo un administrador puede modificar pedidos confirmados.')
    }

    // ── Actualización de items / fecha ────────────────────────────────────────
    if (items !== undefined) {
      // Cada producto debe pertenecer a una marca habilitada para el usuario.
      await assertPuedeCargarProductos(session.user, items.map((i) => i.productoId))
      const updated = await actualizarItemsPedido(
        id,
        items,
        { fecha, observaciones, descuento },
        session.user.id,
      )
      return NextResponse.json({ data: updated })
    }

    if (estado) {
      // ── Cancelar: no se permite desde confirmado/entregado ─────────────────
      if (estado === 'cancelado') {
        if (current.estado === 'confirmado' || current.estado === 'entregado') {
          throw new ValidationError('No se puede cancelar un pedido confirmado o entregado')
        }
      }

      // ── Aprobar: pendiente_aprobacion → confirmado ──────────────────────────
      if (estado === 'confirmado' && current.estado === 'pendiente_aprobacion') {
        if (esRolVentas(ctx.role)) {
          throw new AuthzError('Los agentes no pueden aprobar pedidos')
        }
        if (ctx.role === 'gerente') {
          if (!ctx.agentesVisibles.includes(current.vendedorId)) {
            throw new AuthzError('No podés aprobar pedidos de vendedores que no son de tu territorio')
          }
        }
        const updated = await aprobarPedido(id, session.user.id)

        void evaluarClienteNuevo(updated.clienteId).catch((err) => {
          console.warn('[pedidos] evaluarClienteNuevo failed:', err)
        })

        return NextResponse.json({ data: updated })
      }

      // ── Confirmar legacy: pendiente → confirmado ────────────────────────────
      if (estado === 'confirmado' && current.estado === 'pendiente') {
        const updated = await confirmarPedido(id, session.user.id)

        void evaluarClienteNuevo(updated.clienteId).catch((err) => {
          console.warn('[pedidos] evaluarClienteNuevo failed:', err)
        })

        return NextResponse.json({ data: updated })
      }

      // ── Revertir: confirmado → pendiente_aprobacion ─────────────────────────
      if (estado === 'pendiente_aprobacion' && current.estado === 'confirmado') {
        if (esRolVentas(ctx.role)) {
          throw new AuthzError('Los agentes no pueden revertir pedidos')
        }
        if (ctx.role === 'gerente') {
          if (!ctx.agentesVisibles.includes(current.vendedorId)) {
            throw new AuthzError('No podés revertir pedidos de vendedores que no son de tu territorio')
          }
        }
        const updated = await revertirPedidoAAprobacion(id, session.user.id)
        return NextResponse.json({ data: updated })
      }
    }

    // ── Actualización simple de campos ────────────────────────────────────────
    const fieldUpdates: Partial<typeof pedidos.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (estado !== undefined) fieldUpdates.estado = estado
    if (observaciones !== undefined) fieldUpdates.observaciones = observaciones
    if (fecha !== undefined) fieldUpdates.fecha = fecha ? parseFechaAR(fecha.slice(0, 10)) : parseFechaAR(todayStrAR())

    const [updated] = await db
      .update(pedidos)
      .set(fieldUpdates)
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
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    await deletePedido(id, session.user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
