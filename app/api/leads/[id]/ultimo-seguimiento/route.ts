import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessLead } from '@/lib/authz'
import { validateUuidParam } from '@/lib/api/validate-params'
import { toApiError } from '@/lib/errors'
import {
  prepararUltimoSeguimiento,
  enviarUltimoSeguimiento,
  cancelarUltimoSeguimiento,
} from '@/lib/followup/engine'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Botón "Último seguimiento" del panel del lead.
 *
 * GET    → vista previa: texto armado, cuándo cerraría y, si no se puede mandar, por qué.
 * POST   → manda la plantilla y programa el cierre (Perdido / "Dejó de responder").
 * DELETE → cancela el cierre pendiente.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    await canAccessLead(session.user, id)

    const prep = await prepararUltimoSeguimiento(id, session.user.name ?? null)
    return NextResponse.json({
      data: {
        disponible: prep.ok,
        motivo: prep.ok ? null : prep.motivo,
        body: prep.ok ? prep.body : null,
        cierraEl: prep.cierraEl.toISOString(),
        templateName: prep.templateName,
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    await canAccessLead(session.user, id)

    const r = await enviarUltimoSeguimiento(id, { id: session.user.id, name: session.user.name ?? null })
    return NextResponse.json({ data: { body: r.body, cierraEl: r.cierraEl.toISOString() } }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    await canAccessLead(session.user, id)

    const cancelado = await cancelarUltimoSeguimiento(id, 'cancelado a mano desde el panel del lead', session.user.id)
    return NextResponse.json({ data: { cancelado } })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
