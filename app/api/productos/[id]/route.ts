import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { productos, marcas } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { updateProductoSchema } from '@/lib/validations/productos'
import { requireAdmin } from '@/lib/authz'
import { assertPuedeVerMarca } from '@/lib/authz/marcas'
import { toApiError, NotFoundError } from '@/lib/errors'
import { deleteProducto } from '@/lib/delete/delete.service'
import { validateUuidParam } from '@/lib/api/validate-params'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const producto = await db.query.productos.findFirst({
      where: and(eq(productos.id, id), isNull(productos.deletedAt)),
    })

    if (!producto) throw new NotFoundError('Producto')

    // Ventas no pueden ver productos de marcas no habilitadas para ellos.
    await assertPuedeVerMarca(session.user, producto.marcaId)

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
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const existing = await db.query.productos.findFirst({
      where: and(eq(productos.id, id), isNull(productos.deletedAt)),
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

    if (parsed.data.marcaId !== undefined) {
      const marca = await db.query.marcas.findFirst({
        where: and(eq(marcas.id, parsed.data.marcaId), eq(marcas.activo, true)),
        columns: { id: true },
      })
      if (!marca) {
        return NextResponse.json({ error: 'Marca inválida o inactiva' }, { status: 400 })
      }
      updates.marcaId = parsed.data.marcaId
    }
    if (parsed.data.nombre !== undefined) updates.nombre = parsed.data.nombre
    if (parsed.data.descripcion !== undefined) updates.descripcion = parsed.data.descripcion
    if (parsed.data.precio !== undefined) updates.precio = parsed.data.precio
    if (parsed.data.costo !== undefined) updates.costo = parsed.data.costo ?? null
    if (parsed.data.categoria !== undefined) updates.categoria = parsed.data.categoria ?? null
    if (parsed.data.imagenUrl !== undefined) updates.imagenUrl = parsed.data.imagenUrl ?? null
    if (parsed.data.unidadVenta !== undefined) updates.unidadVenta = parsed.data.unidadVenta
    if (parsed.data.pesoG !== undefined) updates.pesoG = parsed.data.pesoG ?? null
    if (parsed.data.ivaPct !== undefined && parsed.data.ivaPct !== null) updates.ivaPct = parsed.data.ivaPct
    if (parsed.data.stockMinimo !== undefined) updates.stockMinimo = parsed.data.stockMinimo
    if (parsed.data.sku !== undefined) updates.sku = parsed.data.sku ?? null
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
    await deleteProducto(id, session.user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
