import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { productos, users } from '@/db/schema'
import { eq, and, ilike } from 'drizzle-orm'
import { createProductoSchema } from '@/lib/validations/productos'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const searchParams = req.nextUrl.searchParams
    const search = searchParams.get('search') ?? undefined
    const includeInactiveParam = searchParams.get('includeInactive')

    // includeInactive is admin-only
    const includeInactive =
      session.user.role === 'admin' && includeInactiveParam === 'true'

    const conditions: ReturnType<typeof eq>[] = []

    if (!includeInactive) {
      conditions.push(eq(productos.activo, true))
    }

    if (search) {
      conditions.push(ilike(productos.nombre, `%${search}%`) as ReturnType<typeof eq>)
    }

    const rows = await db
      .select()
      .from(productos)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(productos.nombre)

    return NextResponse.json({ data: rows })
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
    const parsed = createProductoSchema.safeParse(body)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Datos inválidos'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const input = parsed.data

    const [producto] = await db
      .insert(productos)
      .values({
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        precio: input.precio,
        activo: true,
        creadoPor: session.user.id,
      })
      .returning()

    return NextResponse.json({ data: producto }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
