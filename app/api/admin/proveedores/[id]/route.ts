import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { proveedores } from '@/db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError, NotFoundError } from '@/lib/errors'
import { updateProveedorSchema } from '@/lib/validations/gastos'
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
    const parsed = updateProveedorSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const current = await db.query.proveedores.findFirst({
      where: eq(proveedores.id, id),
      columns: { id: true },
    })
    if (!current) throw new NotFoundError('Proveedor')

    if (parsed.data.nombre) {
      const duplicado = await db.query.proveedores.findFirst({
        where: and(eq(proveedores.nombre, parsed.data.nombre), ne(proveedores.id, id)),
        columns: { id: true },
      })
      if (duplicado) {
        return NextResponse.json({ error: 'Ya existe un proveedor con ese nombre' }, { status: 409 })
      }
    }

    const [updated] = await db
      .update(proveedores)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(proveedores.id, id))
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

    const current = await db.query.proveedores.findFirst({
      where: and(eq(proveedores.id, id), eq(proveedores.activo, true)),
      columns: { id: true },
    })
    if (!current) throw new NotFoundError('Proveedor')

    // Baja lógica: los gastos históricos conservan la referencia
    await db
      .update(proveedores)
      .set({ activo: false, updatedAt: new Date() })
      .where(eq(proveedores.id, id))

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
