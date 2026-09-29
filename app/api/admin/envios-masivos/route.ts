import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { crearEnvioMasivo } from '@/lib/envios-masivos/crear'
import { listarEnvios } from '@/lib/envios-masivos/detalle'
import { procesarEnvio } from '@/lib/envios-masivos/procesar'
import { filtrosEnvioSchema } from '@/lib/envios-masivos/validacion'

const crearSchema = z.object({
  nombre: z.string().min(1).max(120),
  templateName: z.string().min(1).max(200),
  templateLang: z.string().min(2).max(20),
  filtros: filtrosEnvioSchema,
  leadIds: z.array(z.string().uuid()).min(1).max(1000),
  /** ISO; null o ausente = ahora */
  programadoAt: z.string().datetime().nullable().optional(),
})

/** GET /api/admin/envios-masivos — últimos envíos (solo admin). */
export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)
    return NextResponse.json({ data: await listarEnvios() })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * POST /api/admin/envios-masivos — crea el envío con sus destinatarios. Si
 * arranca ahora, dispara el procesamiento sin esperar a que termine.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const parsed = crearSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const d = parsed.data

    const creado = await crearEnvioMasivo({
      nombre: d.nombre,
      templateName: d.templateName,
      templateLang: d.templateLang,
      filtros: d.filtros,
      leadIds: d.leadIds,
      programadoAt: d.programadoAt ? new Date(d.programadoAt) : null,
      creadoPor: session.user.id,
    })

    if (creado.inmediato) {
      void procesarEnvio(creado.id).catch((err) => console.error('[envios-masivos] error al arrancar:', err))
    }

    return NextResponse.json({ data: { ...creado, programadoAt: creado.programadoAt.toISOString() } }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
