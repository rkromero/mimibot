import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { respuestasRapidas } from '@/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { withAuth } from '@/lib/authz'
import { toApiError, ConflictError, NotFoundError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'
import { respuestaRapidaUpdateSchema } from '@/lib/validations/respuesta-rapida'

const columnas = {
  id: respuestasRapidas.id,
  atajo: respuestasRapidas.atajo,
  titulo: respuestasRapidas.titulo,
  body: respuestasRapidas.body,
}

/**
 * PATCH /api/respuestas-rapidas/[id] — edita atajo, título y/o texto.
 * El atajo sigue siendo único entre las demás → 409 si choca.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalidId = validateUuidParam(id)
    if (invalidId) return invalidId

    return await withAuth(async () => {
      const body: unknown = await req.json()
      const parsed = respuestaRapidaUpdateSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
      }

      const actual = await db.query.respuestasRapidas.findFirst({
        where: eq(respuestasRapidas.id, id),
        columns: { id: true },
      })
      if (!actual) throw new NotFoundError('Respuesta rápida')

      if (parsed.data.atajo !== undefined) {
        const otra = await db.query.respuestasRapidas.findFirst({
          where: and(eq(respuestasRapidas.atajo, parsed.data.atajo), ne(respuestasRapidas.id, id)),
          columns: { id: true },
        })
        if (otra) throw new ConflictError(`Ya existe una respuesta con el comando /${parsed.data.atajo}`)
      }

      const updates: Partial<typeof respuestasRapidas.$inferInsert> = { updatedAt: new Date() }
      if (parsed.data.atajo !== undefined) updates.atajo = parsed.data.atajo
      if (parsed.data.titulo !== undefined) updates.titulo = parsed.data.titulo
      if (parsed.data.body !== undefined) updates.body = parsed.data.body

      const [actualizada] = await db
        .update(respuestasRapidas)
        .set(updates)
        .where(eq(respuestasRapidas.id, id))
        .returning(columnas)

      return NextResponse.json({ data: actualizada })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/** DELETE /api/respuestas-rapidas/[id] — borra la respuesta (sin papelera). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalidId = validateUuidParam(id)
    if (invalidId) return invalidId

    return await withAuth(async () => {
      const actual = await db.query.respuestasRapidas.findFirst({
        where: eq(respuestasRapidas.id, id),
        columns: { id: true },
      })
      if (!actual) throw new NotFoundError('Respuesta rápida')

      await db.delete(respuestasRapidas).where(eq(respuestasRapidas.id, id))
      return NextResponse.json({ ok: true })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
