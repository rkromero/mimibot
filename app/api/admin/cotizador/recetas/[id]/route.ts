import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { recetas } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError, NotFoundError } from '@/lib/errors'
import { updateRecetaSchema } from '@/lib/validations/cotizador'
import { actualizarReceta } from '@/lib/cotizador/recetas.service'
import { validateUuidParam } from '@/lib/api/validate-params'

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
    const parsed = updateRecetaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const receta = await actualizarReceta(id, parsed.data)
    return NextResponse.json({ data: receta })
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

    const current = await db.query.recetas.findFirst({
      where: and(eq(recetas.id, id), eq(recetas.activo, true)),
      columns: { id: true },
    })
    if (!current) throw new NotFoundError('Receta')

    // Baja lógica: cotizaciones futuras no la ofrecen; el historial no se toca
    await db
      .update(recetas)
      .set({ activo: false, updatedAt: new Date() })
      .where(eq(recetas.id, id))

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
