import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { z } from 'zod'
import { moverClienteATerritorio } from '@/lib/territorios/asignacion.service'

const bodySchema = z.object({
  territorioId: z.string().uuid('ID de territorio inválido'),
})

type RouteCtx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const { id: clienteId } = await params
    const body: unknown = await req.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const result = await moverClienteATerritorio(clienteId, parsed.data.territorioId, session.user.id)
    return NextResponse.json({ data: result })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
