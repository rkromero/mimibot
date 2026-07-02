import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { gastos, gastoCategorias } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError, NotFoundError } from '@/lib/errors'
import { updateGastoSchema } from '@/lib/validations/gastos'
import { validateUuidParam } from '@/lib/api/validate-params'
import { parseFechaAR } from '@/lib/dates'

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
    const parsed = updateGastoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const current = await db.query.gastos.findFirst({
      where: and(eq(gastos.id, id), isNull(gastos.deletedAt)),
      columns: { id: true },
    })
    if (!current) throw new NotFoundError('Gasto')

    const input = parsed.data

    if (input.categoriaId !== undefined) {
      const categoria = await db.query.gastoCategorias.findFirst({
        where: and(eq(gastoCategorias.id, input.categoriaId), eq(gastoCategorias.activo, true)),
        columns: { id: true },
      })
      if (!categoria) {
        return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 400 })
      }
    }

    const updates: Partial<typeof gastos.$inferInsert> = { updatedAt: new Date() }
    if (input.fecha !== undefined) updates.fecha = parseFechaAR(input.fecha)
    if (input.categoriaId !== undefined) updates.categoriaId = input.categoriaId
    if (input.monto !== undefined) updates.monto = input.monto.toFixed(2)
    if (input.descripcion !== undefined) updates.descripcion = input.descripcion
    if (input.proveedor !== undefined) updates.proveedor = input.proveedor
    if (input.comprobante !== undefined) updates.comprobante = input.comprobante
    if (input.metodoPago !== undefined) updates.metodoPago = input.metodoPago

    const [updated] = await db
      .update(gastos)
      .set(updates)
      .where(eq(gastos.id, id))
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

    const current = await db.query.gastos.findFirst({
      where: and(eq(gastos.id, id), isNull(gastos.deletedAt)),
      columns: { id: true },
    })
    if (!current) throw new NotFoundError('Gasto')

    await db
      .update(gastos)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(gastos.id, id))

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
