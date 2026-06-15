import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { users, marcas, usuarioMarcas } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { asignarMarcasSchema } from '@/lib/validations/marcas'
import { withAdminAuth } from '@/lib/authz'
import { esRolVentas } from '@/lib/authz/roles'
import { toApiError, NotFoundError, ValidationError } from '@/lib/errors'
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

    return withAdminAuth(async () => {
      const rows = await db
        .select({ marcaId: usuarioMarcas.marcaId })
        .from(usuarioMarcas)
        .where(eq(usuarioMarcas.usuarioId, id))

      return NextResponse.json({ data: rows.map((r) => r.marcaId) })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    return withAdminAuth(async () => {
      const body: unknown = await req.json()
      const parsed = asignarMarcasSchema.safeParse(body)
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? 'Datos inválidos'
        return NextResponse.json({ error: message }, { status: 400 })
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, id),
        columns: { id: true, role: true },
      })
      if (!user) throw new NotFoundError('Usuario')
      if (!esRolVentas(user.role)) {
        throw new ValidationError('Solo se asignan marcas a usuarios de ventas (agent/vendedor/rtv)')
      }

      // Solo se persisten marcas activas y NO default: la default (Mimi) es
      // implícita y no requiere asignación.
      const asignables = await db
        .select({ id: marcas.id })
        .from(marcas)
        .where(and(eq(marcas.activo, true), eq(marcas.esDefault, false)))
      const asignablesSet = new Set(asignables.map((m) => m.id))
      const finalIds = Array.from(new Set(parsed.data.marcaIds)).filter((m) => asignablesSet.has(m))

      await db.transaction(async (tx) => {
        await tx.delete(usuarioMarcas).where(eq(usuarioMarcas.usuarioId, id))
        if (finalIds.length > 0) {
          await tx.insert(usuarioMarcas).values(finalIds.map((marcaId) => ({ usuarioId: id, marcaId })))
        }
      })

      return NextResponse.json({ data: finalIds })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
