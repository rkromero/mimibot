import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { duplicarRecetaSchema } from '@/lib/validations/cotizador'
import { duplicarReceta } from '@/lib/cotizador/recetas.service'
import { validateUuidParam } from '@/lib/api/validate-params'

// Clona la receta origen (items + packaging + margen) para un cliente,
// forzando esCotizador = false: la copia nunca compite con las del cotizador.
export async function POST(
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
    const parsed = duplicarRecetaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const receta = await duplicarReceta(id, parsed.data)
    return NextResponse.json({ data: receta }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
