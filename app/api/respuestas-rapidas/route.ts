import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { respuestasRapidas } from '@/db/schema'
import { asc, eq } from 'drizzle-orm'
import { withAuth } from '@/lib/authz'
import { toApiError, ConflictError } from '@/lib/errors'
import { respuestaRapidaSchema } from '@/lib/validations/respuesta-rapida'

const columnas = {
  id: respuestasRapidas.id,
  atajo: respuestasRapidas.atajo,
  titulo: respuestasRapidas.titulo,
  body: respuestasRapidas.body,
}

/**
 * GET /api/respuestas-rapidas — lista compartida de respuestas rápidas del
 * chat, ordenada por atajo. Cualquier usuario con sesión.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const data = await db
      .select(columnas)
      .from(respuestasRapidas)
      .orderBy(asc(respuestasRapidas.atajo))

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * POST /api/respuestas-rapidas — crea una respuesta rápida. Cualquier usuario
 * con sesión: las respuestas son del equipo, no de quien las carga.
 *
 * Body: `{ atajo, titulo, body }`. El atajo se normaliza (sin "/", minúsculas,
 * sin tildes) y tiene que ser único → 409 si ya existe.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    return await withAuth(async (user) => {
      const body: unknown = await req.json()
      const parsed = respuestaRapidaSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
      }

      const existente = await db.query.respuestasRapidas.findFirst({
        where: eq(respuestasRapidas.atajo, parsed.data.atajo),
        columns: { id: true },
      })
      if (existente) throw new ConflictError(`Ya existe una respuesta con el comando /${parsed.data.atajo}`)

      const [creada] = await db
        .insert(respuestasRapidas)
        .values({ ...parsed.data, createdBy: user.id })
        .returning(columnas)

      return NextResponse.json({ data: creada }, { status: 201 })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
