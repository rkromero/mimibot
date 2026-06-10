import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { requireAdminOrGerente } from '@/lib/authz'
import { db } from '@/db'
import { rendicionValidaciones } from '@/db/schema'
import { toApiError } from '@/lib/errors'

const postSchema = z.object({
  repartidorId: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  efectivoEsperado: z.number(),
  efectivoRecibido: z.number(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdminOrGerente(session.user)

    const body = postSchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: 'Cuerpo inválido', details: body.error.flatten() }, { status: 400 })
    }

    const { repartidorId, fecha, efectivoEsperado, efectivoRecibido } = body.data
    const diferencia = efectivoRecibido - efectivoEsperado
    const now = new Date()

    const [row] = await db
      .insert(rendicionValidaciones)
      .values({
        repartidorId,
        fecha,
        efectivoEsperado: efectivoEsperado.toFixed(2),
        efectivoRecibido: efectivoRecibido.toFixed(2),
        diferencia: diferencia.toFixed(2),
        validadoPor: session.user.id,
        validadoAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [rendicionValidaciones.repartidorId, rendicionValidaciones.fecha],
        set: {
          efectivoEsperado: efectivoEsperado.toFixed(2),
          efectivoRecibido: efectivoRecibido.toFixed(2),
          diferencia: diferencia.toFixed(2),
          validadoPor: session.user.id,
          validadoAt: now,
          updatedAt: now,
        },
      })
      .returning()

    return NextResponse.json({ data: row })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
