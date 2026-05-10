import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { duplicarMetasMesAnterior, isMesBloqueable } from '@/lib/metas/metas.service'

const duplicarSchema = z.object({
  anioObjetivo: z
    .number({ invalid_type_error: 'El año debe ser un número' })
    .int('El año debe ser un entero')
    .min(2020, 'El año mínimo es 2020')
    .max(2100, 'El año máximo es 2100'),
  mesObjetivo: z
    .number({ invalid_type_error: 'El mes debe ser un número' })
    .int('El mes debe ser un entero')
    .min(1, 'El mes mínimo es 1')
    .max(12, 'El mes máximo es 12'),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const body: unknown = await req.json()
    const parsed = duplicarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      )
    }

    const { anioObjetivo, mesObjetivo } = parsed.data

    // Target period must be in the future (cannot duplicate to current or past months)
    const status = isMesBloqueable(anioObjetivo, mesObjetivo)
    if (status !== 'futuro') {
      return NextResponse.json(
        { error: 'Solo se puede duplicar a períodos futuros' },
        { status: 400 },
      )
    }

    const result = await duplicarMetasMesAnterior(anioObjetivo, mesObjetivo, session.user.id)

    return NextResponse.json({ data: result })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
