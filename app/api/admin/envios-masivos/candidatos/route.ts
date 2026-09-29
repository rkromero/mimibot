import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { buscarCandidatos } from '@/lib/envios-masivos/candidatos'
import { resumirExclusiones } from '@/lib/envios-masivos/reglas'
import { filtrosEnvioSchema } from '@/lib/envios-masivos/validacion'

const schema = z.object({
  filtros: filtrosEnvioSchema,
  templateName: z.string().min(1).max(200),
})

/**
 * POST /api/admin/envios-masivos/candidatos — vista previa del grupo: leads
 * que cumplen los filtros, cada uno con su motivo de exclusión (o ninguno)
 * para la plantilla elegida, y el resumen de cuántos entran y cuántos no.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const candidatos = await buscarCandidatos(parsed.data.filtros, parsed.data.templateName)
    const resumen = resumirExclusiones(candidatos.map((c) => c.excluido))
    return NextResponse.json({ data: { candidatos, resumen } })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
