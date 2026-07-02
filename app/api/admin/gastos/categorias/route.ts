import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { gastoCategorias } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { createGastoCategoriaSchema } from '@/lib/validations/gastos'

export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const data = await db.query.gastoCategorias.findMany({
      where: eq(gastoCategorias.activo, true),
      orderBy: [asc(gastoCategorias.tipo), asc(gastoCategorias.nombre)],
    })

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const body: unknown = await req.json()
    const parsed = createGastoCategoriaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const existente = await db.query.gastoCategorias.findFirst({
      where: eq(gastoCategorias.nombre, parsed.data.nombre),
      columns: { id: true },
    })
    if (existente) {
      return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
    }

    const [categoria] = await db
      .insert(gastoCategorias)
      .values({ nombre: parsed.data.nombre, tipo: parsed.data.tipo })
      .returning()

    return NextResponse.json({ data: categoria }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
