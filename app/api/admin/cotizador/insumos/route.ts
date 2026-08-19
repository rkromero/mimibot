import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { insumos } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { createInsumoSchema } from '@/lib/validations/cotizador'

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const data = await db
      .select()
      .from(insumos)
      .orderBy(asc(insumos.tipo), asc(insumos.nombre))

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
    const parsed = createInsumoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const existente = await db.query.insumos.findFirst({
      where: eq(insumos.nombre, parsed.data.nombre),
      columns: { id: true, activo: true },
    })
    if (existente?.activo) {
      return NextResponse.json({ error: 'Ya existe un insumo con ese nombre' }, { status: 409 })
    }
    // Si existía dado de baja, se reactiva con los datos nuevos
    if (existente) {
      const [reactivado] = await db
        .update(insumos)
        .set({ ...parsed.data, precio: parsed.data.precio.toFixed(2), activo: true, updatedAt: new Date() })
        .where(eq(insumos.id, existente.id))
        .returning()
      return NextResponse.json({ data: reactivado }, { status: 201 })
    }

    const [insumo] = await db
      .insert(insumos)
      .values({ ...parsed.data, precio: parsed.data.precio.toFixed(2) })
      .returning()

    return NextResponse.json({ data: insumo }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
