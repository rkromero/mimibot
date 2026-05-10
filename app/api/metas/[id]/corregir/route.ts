import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { NotFoundError } from '@/lib/errors'
import { corregirMetaSchema } from '@/lib/validations/metas'
import {
  getMetaWithVendedor,
  isMesBloqueable,
  updateMetaVigente,
} from '@/lib/metas/metas.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const { id } = await params
    const meta = await getMetaWithVendedor(id)
    if (!meta) throw new NotFoundError('Meta')

    const status = isMesBloqueable(meta.periodoAnio, meta.periodoMes)

    if (status === 'bloqueado_pasado') {
      return NextResponse.json(
        { error: 'Las metas de períodos pasados no se pueden modificar' },
        { status: 403 },
      )
    }

    if (status === 'futuro') {
      return NextResponse.json(
        { error: 'La meta futura se edita con PUT /api/metas/[id]' },
        { status: 400 },
      )
    }

    // status === 'vigente': proceed with correction
    const body: unknown = await req.json()
    const parsed = corregirMetaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      )
    }

    const { motivo, ...updateFields } = parsed.data

    const updated = await updateMetaVigente(id, updateFields, motivo, session.user.id)

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
