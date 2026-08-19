import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { insumos } from '@/db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError, NotFoundError } from '@/lib/errors'
import { updateInsumoSchema } from '@/lib/validations/cotizador'
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
    const parsed = updateInsumoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const current = await db.query.insumos.findFirst({
      where: eq(insumos.id, id),
      columns: { id: true },
    })
    if (!current) throw new NotFoundError('Insumo')

    if (parsed.data.nombre) {
      const duplicado = await db.query.insumos.findFirst({
        where: and(eq(insumos.nombre, parsed.data.nombre), ne(insumos.id, id)),
        columns: { id: true },
      })
      if (duplicado) {
        return NextResponse.json({ error: 'Ya existe un insumo con ese nombre' }, { status: 409 })
      }
    }

    const { precio, ...rest } = parsed.data
    const [updated] = await db
      .update(insumos)
      .set({
        ...rest,
        ...(precio !== undefined ? { precio: precio.toFixed(2) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(insumos.id, id))
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

    const current = await db.query.insumos.findFirst({
      where: and(eq(insumos.id, id), eq(insumos.activo, true)),
      columns: { id: true },
    })
    if (!current) throw new NotFoundError('Insumo')

    // Baja lógica: las recetas que lo referencian conservan la fila; el
    // snapshot del cotizador ignora insumos inactivos
    await db
      .update(insumos)
      .set({ activo: false, updatedAt: new Date() })
      .where(eq(insumos.id, id))

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
