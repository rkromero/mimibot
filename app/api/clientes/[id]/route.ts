import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { clientes, pedidos, users } from '@/db/schema'
import { eq, and, count, sum, isNull } from 'drizzle-orm'
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

    // Get pedidos summary (exclude soft-deleted)
    const pedidosSummary = await db
      .select({
        count: count(),
        total: sum(pedidos.total),
      })
      .from(pedidos)
      .where(and(eq(pedidos.clienteId, id), isNull(pedidos.deletedAt)))

    const summary = pedidosSummary[0]

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
          count: Number(summary?.count ?? 0),
          total: summary?.total ?? '0',
        },
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
