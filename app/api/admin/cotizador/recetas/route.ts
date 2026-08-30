import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { createRecetaSchema } from '@/lib/validations/cotizador'
import { crearReceta, listarRecetas } from '@/lib/cotizador/recetas.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    // Filtros: ?clienteId=xxx | ?esCotizador=true | ?generales=true
    // (generales = clienteId null). Sin params devuelve todas.
    const sp = req.nextUrl.searchParams
    const clienteId = sp.get('clienteId') ?? undefined
    if (clienteId !== undefined && !UUID_RE.test(clienteId)) {
      return NextResponse.json({ error: 'clienteId inválido' }, { status: 400 })
    }

    const data = await listarRecetas({
      clienteId,
      esCotizador: sp.get('esCotizador') === 'true',
      generales: sp.get('generales') === 'true',
    })
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
    const parsed = createRecetaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const receta = await crearReceta(parsed.data)
    return NextResponse.json({ data: receta }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
