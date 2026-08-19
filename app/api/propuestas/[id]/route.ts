import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { propuestas, activityLog } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { requireAdmin, canAccessLead } from '@/lib/authz'
import { toApiError, NotFoundError, AuthzError } from '@/lib/errors'
import { updatePropuestaSchema } from '@/lib/validations/cotizador'
import { validateUuidParam } from '@/lib/api/validate-params'

// Resolución de propuestas pendientes de aprobación (descuento sobre el tope).
// Solo admin.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const body: unknown = await req.json()
    const parsed = updatePropuestaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const current = await db.query.propuestas.findFirst({
      where: and(eq(propuestas.id, id), isNull(propuestas.deletedAt)),
      columns: { id: true, estado: true },
    })
    if (!current) throw new NotFoundError('Propuesta')
    if (current.estado !== 'pendiente_aprobacion') {
      return NextResponse.json(
        { error: 'Solo se pueden resolver propuestas pendientes de aprobación' },
        { status: 409 },
      )
    }

    const [updated] = await db
      .update(propuestas)
      .set({
        estado: parsed.data.estado,
        ...(parsed.data.estado === 'aprobada' ? { aprobadoPor: session.user.id } : {}),
        updatedAt: new Date(),
      })
      .where(eq(propuestas.id, id))
      .returning()

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

// Estados que un vendedor puede eliminar; el resto (aprobada, enviada,
// aceptada, vencida) queda reservado a admin
const ESTADOS_BORRABLES_VENDEDOR: ReadonlyArray<(typeof propuestas.$inferSelect)['estado']> = [
  'borrador', 'pendiente_aprobacion', 'rechazada',
]

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const propuesta = await db.query.propuestas.findFirst({
      where: and(eq(propuestas.id, id), isNull(propuestas.deletedAt)),
      columns: { id: true, numero: true, leadId: true, estado: true, creadoPor: true },
    })
    if (!propuesta) throw new NotFoundError('Propuesta')

    // Vendedor solo sobre sus leads asignados; admin sobre todos
    await canAccessLead(session.user, propuesta.leadId)

    if (session.user.role !== 'admin') {
      if (propuesta.creadoPor !== session.user.id) {
        throw new AuthzError('Solo podés eliminar propuestas que creaste vos')
      }
      if (!ESTADOS_BORRABLES_VENDEDOR.includes(propuesta.estado)) {
        throw new AuthzError(
          'Esta propuesta ya fue enviada al cliente: solo un administrador puede eliminarla',
        )
      }
    }

    // Baja lógica: la fila queda en la base y el número correlativo (que sale
    // de document_counters) nunca se reutiliza
    await db
      .update(propuestas)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(propuestas.id, id))

    await db.insert(activityLog).values({
      leadId: propuesta.leadId,
      userId: session.user.id,
      action: 'propuesta_eliminada',
      metadata: { propuestaId: propuesta.id, numero: propuesta.numero },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
