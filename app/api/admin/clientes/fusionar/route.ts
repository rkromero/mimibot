import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { fusionarClientes, resumenFusion } from '@/lib/clientes/fusion.service'
import { toApiError } from '@/lib/errors'

const fusionSchema = z.object({
  // target = base que se conserva; source = el que se absorbe y queda de baja
  targetId: z.string().uuid(),
  sourceId: z.string().uuid(),
})

// Resumen previo: qué se movería si se fusiona sourceId (para el modal)
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const sourceId = req.nextUrl.searchParams.get('sourceId')
    const parsed = z.string().uuid().safeParse(sourceId)
    if (!parsed.success) {
      return NextResponse.json({ error: 'sourceId inválido' }, { status: 400 })
    }

    const preview = await resumenFusion(parsed.data)
    return NextResponse.json({ data: preview })
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
    const parsed = fusionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }

    const { targetId, sourceId } = parsed.data
    const resumen = await fusionarClientes(targetId, sourceId)

    console.log(
      `[fusion] admin=${session.user.id} target=${targetId} source=${sourceId}`,
      resumen,
    )

    return NextResponse.json({ data: resumen })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
