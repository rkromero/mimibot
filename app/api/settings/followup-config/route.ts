import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { followUpConfig } from '@/db/schema'
import { z } from 'zod'

const configSchema = z.object({
  isEnabled: z.boolean().optional(),
  noResponseHours: z.number().int().min(1).max(720).optional(),
  stallingDelayMinutes: z.number().int().min(1).max(1440).optional(),
  maxFollowUps: z.number().int().min(1).max(10).optional(),
  retryHours: z.array(z.number().int().min(1)).min(1).max(5).optional(),
  stallingPhrases: z.array(z.string().min(1).max(100)).max(30).optional(),
  propuestaEnabled: z.boolean().optional(),
  propuestaHoras: z.number().int().min(1).max(23).optional(),
  propuestaMensaje: z.string().max(1000).nullable().optional(),
  propuestaTemplateName: z.string().max(200).nullable().optional(),
  propuestaTemplateLang: z.string().max(20).nullable().optional(),
  indagacionEnabled: z.boolean().optional(),
  indagacionHoras: z.number().int().min(1).max(12).optional(),
  indagacionFinalHoras: z.number().int().min(6).max(23).optional(),
  indagacionCierreHoras: z.number().int().min(1).max(168).optional(),
  horarioDesde: z.number().int().min(0).max(23).optional(),
  horarioHasta: z.number().int().min(1).max(24).optional(),
  indagacionMensajeFinal: z.string().max(1000).nullable().optional(),
  indagacionMensajeRetomar: z.string().max(1000).nullable().optional(),
  // Botón "Último seguimiento" del panel del lead
  ultimoSeguimientoTemplateName: z.string().max(200).nullable().optional(),
  ultimoSeguimientoTemplateLang: z.string().max(20).nullable().optional(),
  ultimoSeguimientoHoras: z.number().int().min(1).max(168).optional(),
  respuestasAutomaticasFrases: z.array(z.string().min(1).max(200)).max(50).optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const config = await db.query.followUpConfig.findFirst()
  return NextResponse.json(config ?? {
    isEnabled: true,
    noResponseHours: 24,
    stallingDelayMinutes: 60,
    maxFollowUps: 3,
    retryHours: [1, 22, 72],
    stallingPhrases: [],
    propuestaEnabled: true,
    propuestaHoras: 23,
    propuestaMensaje: null,
    propuestaTemplateName: null,
    propuestaTemplateLang: null,
    indagacionEnabled: true,
    indagacionHoras: 2,
    indagacionFinalHoras: 23,
    indagacionCierreHoras: 24,
    horarioDesde: 8,
    horarioHasta: 22,
    indagacionMensajeFinal: null,
    indagacionMensajeRetomar: null,
    ultimoSeguimientoTemplateName: null,
    ultimoSeguimientoTemplateLang: null,
    ultimoSeguimientoHoras: 10,
    respuestasAutomaticasFrases: [],
  })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const parsed = configSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })

  const [updated] = await db.insert(followUpConfig)
    .values({ id: 1, ...parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: followUpConfig.id, set: { ...parsed.data, updatedAt: new Date() } })
    .returning()

  return NextResponse.json(updated)
}
