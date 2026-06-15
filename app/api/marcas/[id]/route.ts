import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { marcas } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { updateMarcaSchema } from '@/lib/validations/marcas'
import { withAdminAuth } from '@/lib/authz'
import { toApiError, NotFoundError, ValidationError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    return withAdminAuth(async () => {
      const body: unknown = await req.json()
      const parsed = updateMarcaSchema.safeParse(body)
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? 'Datos inválidos'
        return NextResponse.json({ error: message }, { status: 400 })
      }

      const marca = await db.query.marcas.findFirst({ where: eq(marcas.id, id) })
      if (!marca) throw new NotFoundError('Marca')

      // La marca por defecto (Mimi) no se puede desactivar: ventas la ve siempre.
      if (marca.esDefault && parsed.data.activo === false) {
        throw new ValidationError('No se puede desactivar la marca por defecto')
      }

      const updates: Partial<typeof marcas.$inferInsert> = { updatedAt: new Date() }
      if (parsed.data.nombre !== undefined) updates.nombre = parsed.data.nombre
      if (parsed.data.activo !== undefined) updates.activo = parsed.data.activo

      const [updated] = await db.update(marcas).set(updates).where(eq(marcas.id, id)).returning()

      return NextResponse.json({ data: updated })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
