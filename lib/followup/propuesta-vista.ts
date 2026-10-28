/**
 * Pregunta "¿pudiste ver la propuesta?" después de mandar el PDF: reglas puras.
 *
 * Si la persona contesta enseguida con un acuse corto ("gracias", "ok",
 * "lo veo y te digo"), el bot no le pregunta al toque qué le parecieron los
 * números: responde corto y el sistema le pregunta recién cuando pasó al
 * menos una hora desde la propuesta. Lo que toca la base está en `engine.ts`.
 */
import { HORARIO_DEFAULT, posponerAHorarioPermitido, type HorarioPermitido } from './indagacion'

/** Valor de leads.follow_up_reason mientras se espera para preguntar por la propuesta. */
export const REASON_PROPUESTA_VISTA = 'propuesta_vista'

/** Cuánto esperar, como mínimo, desde que salió la propuesta para preguntar si la vio. */
export const MINUTOS_ESPERA_PROPUESTA = 60

export const PREGUNTA_PROPUESTA_VISTA = 'Pudiste ver la propuesta? Qué te parecieron los números?'

const MINUTO_MS = 60 * 1000

/** Minutos enteros desde que se mandó la propuesta (nunca negativo). */
export function minutosDesde(propuestaEnviadaAt: Date, ahora: Date = new Date()): number {
  return Math.max(0, Math.floor((ahora.getTime() - propuestaEnviadaAt.getTime()) / MINUTO_MS))
}

const RE_ACUSE =
  /\b(gracias|grac|ok|oka|okey|okay|dale|perfecto|genial|buenisimo|barbaro|joya|excelente|listo|recibido|recibida|lo veo|la veo|lo reviso|la reviso|lo miro|la miro|lo leo|la leo|te aviso|te digo|te confirmo|lo analizo|la analizo|lo charlo|lo consulto|lo vemos|lo evaluo|lo evaluamos)\b/
const RE_OPINA =
  /\?|\b(vi|vimos|visto|cierra|cierran|parece|parecen|precio|precios|caro|cara|barato|descuento|pedido|muestra|cuanto|cuando|como|donde|por que|porque|cantidad|negros|blancos|unidades)\b/

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ?\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ¿Es solo un acuse de recibo? Corto, sin pregunta, con una fórmula de
 * agradecimiento / "después lo veo", y sin opinar sobre la propuesta.
 */
export function esAcuseDeRecibo(texto: string | null | undefined): boolean {
  const t = normalizar(texto ?? '')
  if (!t) return false
  if (t.split(' ').length > 10) return false
  if (RE_OPINA.test(t)) return false
  return RE_ACUSE.test(t)
}

/**
 * Cuándo preguntar: una hora después de la propuesta (o ya mismo si eso ya
 * pasó, con un minuto de margen), corrido al horario permitido.
 */
export function calcularPreguntaPropuestaVista(
  propuestaEnviadaAt: Date,
  ahora: Date = new Date(),
  horario: HorarioPermitido = HORARIO_DEFAULT,
): Date {
  const minimo = propuestaEnviadaAt.getTime() + MINUTOS_ESPERA_PROPUESTA * MINUTO_MS
  const at = new Date(Math.max(minimo, ahora.getTime() + MINUTO_MS))
  return posponerAHorarioPermitido(at, horario)
}

/**
 * Motivo para NO preguntar al momento de procesarlo, o null si corresponde.
 * - La persona volvió a escribir: el bot ya le contestó (o la charla siguió).
 * - El bot ya no está prendido: lo apagaron a mano o tomó la charla el vendedor.
 * - El lead ya no está en "Propuesta enviada" (null = no se pudo determinar, no se usa).
 */
export function motivoParaOmitirPreguntaPropuestaVista(params: {
  mensajesDelClienteDesdeProgramado: number
  botEnabled: boolean
  enEtapaPropuesta: boolean | null
}): string | null {
  if (!params.botEnabled) return 'el bot ya no sigue esta conversación'
  if (params.mensajesDelClienteDesdeProgramado > 0) return 'el cliente volvió a escribir'
  if (params.enEtapaPropuesta === false) return 'el lead ya no está en "Propuesta enviada"'
  return null
}
