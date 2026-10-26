/**
 * Propuesta automática al calificar: con la cantidad, el gramaje y el
 * packaging que el bot dejó en el [RESUMEN] se crea la propuesta (en
 * borrador, igual que desde la ficha) a nombre del vendedor asignado, queda
 * nota interna en el chat y push al asignado. Best-effort: nunca hace fallar
 * el handoff; si falta un dato, lo dice en una nota para cotizar a mano.
 */
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { propuestas, recetas } from '@/db/schema'
import { crearPropuesta } from '@/lib/cotizador/propuestas.service'
import { propuestaResultadoSchema } from '@/lib/validations/cotizador'
import { alertarEquipoBot, dejarNotaInternaBot } from './bot-alertas'
import {
  armarNotaPropuestaCreada,
  extraerDatosCotizacion,
  formatNumeroPropuesta,
  GRAMAJE_DEFAULT_BOT,
} from './bot-cotizacion'

/** Gramajes con receta activa en el cotizador (los que se pueden cotizar). */
export async function listarGramajesCotizador(): Promise<number[]> {
  const rows = await db.query.recetas.findMany({
    where: and(eq(recetas.esCotizador, true), eq(recetas.activo, true)),
    columns: { gramaje: true },
    orderBy: [asc(recetas.gramaje)],
  })
  return [...new Set(rows.map((r) => r.gramaje))]
}

export type ConfigPropuestaAutomatica = {
  propuestaAutomatica?: boolean | null
  gramajeDefault?: number | null
} | null | undefined

export async function crearPropuestaAutomatica(params: {
  leadId: string
  conversationId: string
  assignedTo: string | null
  nombreContacto: string | null
  resumen: string | null
  config: ConfigPropuestaAutomatica
}): Promise<void> {
  const { leadId, conversationId, assignedTo, nombreContacto, resumen, config } = params
  if (config?.propuestaAutomatica === false) return
  if (!resumen) return

  try {
    const yaTiene = await db.query.propuestas.findFirst({
      where: and(eq(propuestas.leadId, leadId), isNull(propuestas.deletedAt)),
      columns: { id: true, numero: true },
    })
    if (yaTiene) {
      console.log('[bot] propuesta automática: el lead ya tiene una propuesta, no se crea otra', { leadId, numero: yaTiene.numero })
      return
    }

    const gramajes = await listarGramajesCotizador()
    const extraccion = extraerDatosCotizacion(resumen, {
      gramajesDisponibles: gramajes,
      gramajeDefault: config?.gramajeDefault ?? GRAMAJE_DEFAULT_BOT,
    })
    if (!extraccion.ok) {
      await dejarNotaInternaBot({
        leadId,
        conversationId,
        assignedTo,
        texto: `No se creó la propuesta automática: ${extraccion.motivo}. Cotizá a mano desde la ficha del lead.`,
      })
      return
    }
    if (!assignedTo) {
      await dejarNotaInternaBot({
        leadId,
        conversationId,
        assignedTo,
        texto: 'No se creó la propuesta automática: el lead no tiene vendedor asignado. Asignalo y cotizá desde la ficha.',
      })
      return
    }

    const { datos } = extraccion
    const propuesta = await crearPropuesta(
      leadId,
      { cantidad: datos.cantidad, gramaje: datos.gramaje, packaging: datos.packaging, descuentoManualPct: 0 },
      assignedTo,
    )

    const parsed = propuestaResultadoSchema.safeParse(propuesta.resultado)
    const total = parsed.success ? (parsed.data.escenarios.find((e) => e.elegido)?.total ?? null) : null
    const vigente = /^(\d{4})-(\d{2})-(\d{2})$/.exec(propuesta.vigenteHasta)
    const vigenteHasta = vigente ? `${vigente[3]}/${vigente[2]}/${vigente[1]}` : null

    await dejarNotaInternaBot({
      leadId,
      conversationId,
      assignedTo,
      texto: armarNotaPropuestaCreada({ numero: propuesta.numero, datos, total, vigenteHasta }),
    })
    await alertarEquipoBot({
      conversationId,
      assignedTo,
      titulo: `Propuesta ${formatNumeroPropuesta(propuesta.numero)} lista para ${nombreContacto ?? 'un lead'}`,
      cuerpo: `${datos.cantidad} alfajores de ${datos.gramaje} g, ${datos.packaging}. Revisala y enviala.`,
    })
  } catch (err) {
    console.error('[bot] no se pudo crear la propuesta automática:', err)
    const detalle = err instanceof Error ? err.message : 'error desconocido'
    try {
      await dejarNotaInternaBot({
        leadId,
        conversationId,
        assignedTo,
        texto: `No se pudo crear la propuesta automática (${detalle}). Cotizá a mano desde la ficha del lead.`,
      })
    } catch (err2) {
      console.error('[bot] tampoco se pudo dejar la nota de la propuesta automática:', err2)
    }
  }
}
