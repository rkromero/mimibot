import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { reasignacionMasivaSchema } from '@/lib/validations/territorios'
import { reasignacionMasiva } from '@/lib/territorios/asignacion.service'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const body: unknown = await req.json()
    const parsed = reasignacionMasivaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const result = await reasignacionMasiva(
      parsed.data.clienteIds,
      parsed.data.nuevoTerritorioId,
      session.user.id,
    )

    return NextResponse.json({ data: result })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
