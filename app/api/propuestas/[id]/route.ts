import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { propuestas } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError, NotFoundError } from '@/lib/errors'
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
