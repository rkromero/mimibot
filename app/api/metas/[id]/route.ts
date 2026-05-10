import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { NotFoundError, AuthzError } from '@/lib/errors'
import { updateMetaSchema } from '@/lib/validations/metas'
import {
  getMetaWithVendedor,
  isMesBloqueable,
  updateMetaFutura,
} from '@/lib/metas/metas.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const meta = await getMetaWithVendedor(id)
    if (!meta) throw new NotFoundError('Meta')

    // Agent can only view their own meta
    if (session.user.role === 'agent' && meta.vendedorId !== session.user.id) {
      throw new AuthzError('No tenés acceso a esta meta')
    }

    return NextResponse.json({ data: meta })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
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

    if (status === 'vigente') {
      return NextResponse.json(
        { error: 'Para corregir la meta vigente usá el endpoint /corregir' },
        { status: 403 },
      )
    }

    // status === 'futuro': allow update normally
    const body: unknown = await req.json()
    const parsed = updateMetaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      )
    }

    const updated = await updateMetaFutura(id, parsed.data, session.user.id)
    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
