import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessLead } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { cotizacionInputSchema } from '@/lib/validations/cotizador'
import { crearPropuesta, listarPropuestas } from '@/lib/cotizador/propuestas.service'
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
    await canAccessLead(session.user, id)

    const data = await listarPropuestas(id)
    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    // Vendedor solo sobre sus leads asignados; admin sobre todos
    await canAccessLead(session.user, id)

    const body: unknown = await req.json()
    const parsed = cotizacionInputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const propuesta = await crearPropuesta(id, parsed.data, session.user.id)
    return NextResponse.json({ data: propuesta }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
