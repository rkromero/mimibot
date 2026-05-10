import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { productos } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { updateProductoSchema } from '@/lib/validations/productos'
import { requireAdmin } from '@/lib/authz'
import { toApiError, NotFoundError } from '@/lib/errors'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params

    const producto = await db.query.productos.findFirst({
      where: eq(productos.id, id),
    })

    if (!producto) throw new NotFoundError('Producto')

    return NextResponse.json({ data: producto })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const { id } = await params

    const existing = await db.query.productos.findFirst({
      where: eq(productos.id, id),
      columns: { id: true },
    })
    if (!existing) throw new NotFoundError('Producto')

    const body: unknown = await req.json()
    const parsed = updateProductoSchema.safeParse(body)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Datos inválidos'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const updates: Partial<typeof productos.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (parsed.data.nombre !== undefined) updates.nombre = parsed.data.nombre
    if (parsed.data.descripcion !== undefined) updates.descripcion = parsed.data.descripcion
    if (parsed.data.precio !== undefined) updates.precio = parsed.data.precio
    // Soft delete / reactivate via activo flag
    if (parsed.data.activo !== undefined) updates.activo = parsed.data.activo

    const [updated] = await db
      .update(productos)
      .set(updates)
      .where(eq(productos.id, id))
      .returning()

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
