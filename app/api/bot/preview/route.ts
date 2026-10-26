import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { anthropic, BOT_MODEL } from '@/lib/claude/client'
import { z } from 'zod'
import { toApiError } from '@/lib/errors'
import {
  armarSeccionPlazo,
  armarSeccionPrecio,
  armarSeccionProductosExcluidos,
  PLAZO_PROPUESTA_DEFAULT,
  separarResumen,
} from '@/lib/claude/bot-context'
import { extraerSenales, reemplazarPlazoPropuesta } from '@/lib/claude/bot-reglas'
import { armarSeccionCotizacion, GRAMAJE_DEFAULT_BOT } from '@/lib/claude/bot-cotizacion'
import { listarGramajesCotizador } from '@/lib/claude/bot-propuesta'

const schema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(2000),
  })).min(1).max(50),
  systemPrompt: z.string().min(1).max(8000),
  /** Mismas secciones que arma el bot real, para probar precio / productos / plazo sin guardar */
  precioReferencia: z.string().max(500).nullable().optional(),
  productosExcluidos: z.array(z.string().max(80)).max(50).optional(),
  plazoPropuesta: z.string().max(160).optional(),
  gramajeDefault: z.number().int().min(1).max(1000).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body: unknown = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }

    const { messages, systemPrompt, precioReferencia, productosExcluidos, plazoPropuesta, gramajeDefault } = parsed.data
    const plazo = plazoPropuesta?.trim() || PLAZO_PROPUESTA_DEFAULT
    const gramajes = await listarGramajesCotizador().catch(() => [] as number[])
    const system = [
      reemplazarPlazoPropuesta(systemPrompt, plazo),
      armarSeccionPrecio(precioReferencia, plazo),
      armarSeccionProductosExcluidos(productosExcluidos),
      armarSeccionPlazo(plazo),
      armarSeccionCotizacion(gramajes, gramajeDefault ?? GRAMAJE_DEFAULT_BOT),
    ]
      .filter(Boolean)
      .join('\n\n')

    const result = await anthropic.messages.create({
      model: BOT_MODEL,
      max_tokens: 512,
      system,
      messages,
    })

    const raw = result.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    // Mismo filtrado que el bot real: marcadores y [RESUMEN] no se muestran
    const senales = extraerSenales(raw)
    const { visible, handoff } = separarResumen(senales.texto)
    const text = senales.listaEspera.length > 0
      ? `${visible}\n\n(lista de espera: ${senales.listaEspera.join(', ')})`
      : visible

    return NextResponse.json({ response: text, handoff: handoff && senales.listaEspera.length === 0 })
  } catch (err) {
    console.error('[bot/preview]', err)
    const { message, status } = toApiError(err)
    const detail = err instanceof Error ? err.message : undefined
    return NextResponse.json({ error: message, detail }, { status })
  }
}
