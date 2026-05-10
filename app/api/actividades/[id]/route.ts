import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { actividadesCliente } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { updateActividadSchema } from '@/lib/validations/actividades'
import { toApiError, NotFoundError, AuthzError } from '@/lib/errors'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params

    const existing = await db.query.actividadesCliente.findFirst({
      where: eq(actividadesCliente.id, id),
    })
    if (!existing) throw new NotFoundError('Actividad')

    // Only admin, the assignee, or the creator can edit
    const canEdit =
      session.user.role === 'admin' ||
      existing.asignadoA === session.user.id ||
      existing.creadoPor === session.user.id

    if (!canEdit) throw new AuthzError()

    const body: unknown = await req.json()
    const parsed = updateActividadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const updates: Partial<typeof actividadesCliente.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (parsed.data.estado !== undefined) {
      updates.estado = parsed.data.estado
      if (parsed.data.estado === 'completada') {
        updates.fechaCompletada = new Date()
      }
    }
    if (parsed.data.titulo !== undefined) updates.titulo = parsed.data.titulo
    if (parsed.data.notas !== undefined) updates.notas = parsed.data.notas
    if (parsed.data.fechaProgramada !== undefined) {
      updates.fechaProgramada = parsed.data.fechaProgramada ? new Date(parsed.data.fechaProgramada) : null
    }
    // Only admin can reassign
    if (parsed.data.asignadoA !== undefined && session.user.role === 'admin') {
      updates.asignadoA = parsed.data.asignadoA
    }

    const [updated] = await db
      .update(actividadesCliente)
      .set(updates)
      .where(eq(actividadesCliente.id, id))
      .returning()

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
