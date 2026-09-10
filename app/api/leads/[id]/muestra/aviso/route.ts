import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { canAccessLead } from '@/lib/authz'
import { validateUuidParam } from '@/lib/api/validate-params'
import { toApiError } from '@/lib/errors'
import {
  prepararAvisoMuestra,
  enviarAvisoMuestra,
  marcarMuestraAvisadaSinEnviar,
} from '@/lib/leads/muestra-despachada'

type Ctx = { params: Promise<{ id: string }> }

const postSchema = z.object({
  /** true = no mandar nada, solo sacarlo de pendientes ("ya le avisé por otro lado") */
  soloMarcar: z.boolean().optional(),
  /** true = mandarlo aunque ya se haya avisado (reenvío) */
  reenviar: z.boolean().optional(),
})

/**
 * Aviso "salió tu muestra" del panel del lead (ver lib/leads/muestra-aviso.ts).
 *
 * GET  → vista previa: texto armado, foto de la guía y, si no se puede mandar, por qué.
 *        Con `?reenviar=1` arma la vista previa aunque ya se haya avisado.
 * POST → manda la plantilla con la foto (o, con `soloMarcar`, marca el lead como avisado;
 *        con `reenviar`, la manda de nuevo aunque ya esté avisado).
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    await canAccessLead(session.user, id)

    const reenviar = req.nextUrl.searchParams.get('reenviar') === '1'
    const prep = await prepararAvisoMuestra(id, session.user.name ?? null, { reenviar })
    return NextResponse.json({
      data: {
        disponible: prep.ok,
        motivo: prep.ok ? null : prep.motivo,
        body: prep.ok ? prep.body : null,
        fotoKey: prep.fotoKey,
        pedidoId: prep.pedidoId,
        avisadaAt: prep.avisadaAt?.toISOString() ?? null,
        templateName: prep.templateName,
        expresoNombre: prep.ok ? prep.pedido.expresoNombre : null,
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    await canAccessLead(session.user, id)

    const body: unknown = await req.json().catch(() => ({}))
    const parsed = postSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    if (parsed.data.soloMarcar) {
      const r = await marcarMuestraAvisadaSinEnviar(id, session.user.id)
      return NextResponse.json({ data: { enviado: false, avisadaAt: r.avisadaAt.toISOString() } }, { status: 201 })
    }

    const r = await enviarAvisoMuestra(
      id,
      { id: session.user.id, name: session.user.name ?? null },
      { reenviar: parsed.data.reenviar === true },
    )
    return NextResponse.json(
      { data: { enviado: true, body: r.body, avisadaAt: r.avisadaAt.toISOString(), pedidoId: r.pedidoId } },
      { status: 201 },
    )
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
