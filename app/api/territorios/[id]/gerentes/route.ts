import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { asignarGerenteSchema } from '@/lib/validations/territorios'
import { asignarGerente } from '@/lib/territorios/territorios.service'

type RouteCtx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const { id: territorioId } = await params
    const body: unknown = await req.json()
    const parsed = asignarGerenteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const result = await asignarGerente(territorioId, parsed.data.gerenteId)
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
