/**
 * Cadencia después de la propuesta: reglas puras (sin base de datos).
 *
 * El primer toque ("¿pudiste verla?", ~23 hs) ya existía en `propuesta.ts`.
 * Acá van los dos siguientes, siempre por plantilla y a nombre del bot (si la
 * persona contesta, el bot post-propuesta sigue la charla):
 *   1. Día 3 desde la propuesta: recordatorio + ofrecer muestra sin cargo.
 *   2. El día anterior al vencimiento de la propuesta: "vence el dd/mm".
 *
 * Que la persona haya contestado NO corta la cadencia (muchos dicen "gracias,
 * lo veo" y se enfrían): si la charla está viva cuando le toca salir, se espera
 * a 48 hs de silencio. Se corta si el lead avanzó de etapa (muestra, pedido),
 * se cerró, o el bot está apagado a mano. Lo que toca la base está en
 * `propuesta-cadencia.engine.ts`.
 */
import {
  conHoraLocal,
  HORARIO_DEFAULT,
  OFFSET_ARGENTINA_HORAS,
  posponerAHorarioPermitido,
  type HorarioPermitido,
} from './indagacion'

export const REASON_PROPUESTA_RECORDATORIO = 'propuesta_recordatorio'
export const REASON_PROPUESTA_VENCE = 'propuesta_vence'

/** Plantillas aprobadas en Meta ({{1}} nombre; la de vencimiento además {{2}} fecha dd/mm). */
export const TEMPLATE_PROPUESTA_RECORDATORIO = 'propuesta_recordatorio'
export const TEMPLATE_PROPUESTA_VENCE = 'propuesta_vence'

export const TEXTO_TEMPLATE_PROPUESTA_RECORDATORIO =
  'Hola {{1}}! Te escribo por la propuesta de alfajores que te pasamos. Pudiste verla? Si querés, te mandamos una ' +
  'muestra sin cargo para que pruebes el producto antes de decidir.'
export const TEXTO_TEMPLATE_PROPUESTA_VENCE =
  'Hola {{1}}! Te aviso que la propuesta que te pasamos vence el {{2}}. Si querés avanzar con esos valores, ' +
  'respondeme este mensaje y lo vemos.'

export const DIAS_RECORDATORIO_PROPUESTA = 3
/** Si alguien escribió hace menos de esto, la charla está viva: se espera. */
export const CHARLA_ACTIVA_HORAS = 48
/** Hora (Argentina) a la que sale cada toque. */
export const HORA_ENVIO_CADENCIA = 11

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS

/** "2026-11-11" → fecha local Argentina a la hora indicada. */
function fechaVigencia(vigenteHasta: string, hora: number, horario: HorarioPermitido): Date {
  const [y, m, d] = vigenteHasta.split('-').map(Number) as [number, number, number]
  return conHoraLocal(new Date(Date.UTC(y, m - 1, d, 12)), hora, horario.offsetHoras ?? OFFSET_ARGENTINA_HORAS)
}

/** "2026-11-11" → "11/11". */
export function formatVigencia(vigenteHasta: string): string {
  const [, m, d] = vigenteHasta.split('-')
  return `${d}/${m}`
}

/** Día 3 desde que salió la propuesta, a las 11 (Argentina). */
export function calcularRecordatorioPropuesta(
  propuestaEnviadaAt: Date,
  horario: HorarioPermitido = HORARIO_DEFAULT,
): Date {
  const base = new Date(propuestaEnviadaAt.getTime() + DIAS_RECORDATORIO_PROPUESTA * DIA_MS)
  return posponerAHorarioPermitido(conHoraLocal(base, HORA_ENVIO_CADENCIA, horario.offsetHoras ?? OFFSET_ARGENTINA_HORAS), horario)
}

/** El día anterior al vencimiento, a las 11 (Argentina). */
export function calcularAvisoVencimiento(vigenteHasta: string, horario: HorarioPermitido = HORARIO_DEFAULT): Date {
  const vence = fechaVigencia(vigenteHasta, HORA_ENVIO_CADENCIA, horario)
  return new Date(vence.getTime() - DIA_MS)
}

/** Último momento útil para avisar: el mismo día del vencimiento, antes de que termine el horario. */
export function limiteAvisoVencimiento(vigenteHasta: string, horario: HorarioPermitido = HORARIO_DEFAULT): Date {
  return fechaVigencia(vigenteHasta, horario.hasta - 1, horario)
}

export type PasoCadencia = typeof REASON_PROPUESTA_RECORDATORIO | typeof REASON_PROPUESTA_VENCE

/**
 * Próximo toque a programar después de `despuesDe` (null = no queda ninguno).
 * - Si el recordatorio del día 3 todavía no pasó → recordatorio.
 * - Si no, el aviso de vencimiento, siempre que quede al menos un día entre los
 *   dos toques y no se haya pasado el límite.
 */
export function siguientePasoCadencia(params: {
  ahora: Date
  propuestaEnviadaAt: Date
  vigenteHasta: string
  /** El paso que acaba de procesarse (null si todavía no salió ninguno de estos dos). */
  ultimoPaso: PasoCadencia | null
  horario?: HorarioPermitido
}): { paso: PasoCadencia; at: Date } | null {
  const horario = params.horario ?? HORARIO_DEFAULT
  const ahora = params.ahora.getTime()
  const aviso = calcularAvisoVencimiento(params.vigenteHasta, horario)
  const limite = limiteAvisoVencimiento(params.vigenteHasta, horario)

  if (params.ultimoPaso === null) {
    const recordatorio = calcularRecordatorioPropuesta(params.propuestaEnviadaAt, horario)
    // El recordatorio tiene sentido si sale al menos un día antes del aviso de vencimiento
    if (recordatorio.getTime() > ahora && recordatorio.getTime() <= aviso.getTime() - DIA_MS) {
      return { paso: REASON_PROPUESTA_RECORDATORIO, at: recordatorio }
    }
  }
  if (params.ultimoPaso === REASON_PROPUESTA_VENCE) return null
  if (limite.getTime() <= ahora) return null
  const at = aviso.getTime() > ahora ? aviso : posponerAHorarioPermitido(new Date(ahora + HORA_MS), horario)
  if (at.getTime() > limite.getTime()) return null
  return { paso: REASON_PROPUESTA_VENCE, at }
}

export type AccionCadencia =
  | { tipo: 'enviar' }
  | { tipo: 'omitir'; motivo: string }
  | { tipo: 'posponer'; hasta: Date }

/**
 * Qué hacer cuando le toca salir a un toque:
 * - lead cerrado, fuera de "Propuesta enviada" o con el bot apagado a mano → omitir;
 * - la propuesta ya no está vigente → omitir;
 * - alguien (cliente o vendedor) escribió hace menos de 48 hs → posponer a 48 hs
 *   de ese mensaje, salvo que eso pase del límite (entonces se omite).
 */
export function decidirPasoCadencia(params: {
  ahora: Date
  ultimoMensajeHumanoAt: Date | null
  limite: Date
  enEtapaPropuesta: boolean | null
  botApagadoAMano: boolean
  propuestaVigente: boolean
  horario?: HorarioPermitido
}): AccionCadencia {
  if (params.botApagadoAMano) return { tipo: 'omitir', motivo: 'el bot está apagado a mano en esta conversación' }
  if (params.enEtapaPropuesta === false) return { tipo: 'omitir', motivo: 'el lead ya no está en "Propuesta enviada"' }
  if (!params.propuestaVigente) return { tipo: 'omitir', motivo: 'la propuesta ya no está vigente' }

  const ultimo = params.ultimoMensajeHumanoAt
  if (ultimo && params.ahora.getTime() - ultimo.getTime() < CHARLA_ACTIVA_HORAS * HORA_MS) {
    const hasta = posponerAHorarioPermitido(
      new Date(ultimo.getTime() + CHARLA_ACTIVA_HORAS * HORA_MS),
      params.horario ?? HORARIO_DEFAULT,
    )
    if (hasta.getTime() > params.limite.getTime()) return { tipo: 'omitir', motivo: 'la charla siguió activa' }
    return { tipo: 'posponer', hasta }
  }
  return { tipo: 'enviar' }
}
