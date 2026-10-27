/**
 * Seguimiento después de la muestra: reglas puras (sin base de datos).
 *
 * El expreso tarda, así que a los N días (5 por defecto) de entregada la
 * muestra, si la persona no escribió, se le manda la plantilla aprobada
 * "¿qué te pareció?" y el bot (modo post-propuesta) sigue la charla hacia
 * el primer pedido. Lo que toca la base está en `engine.ts`.
 */
import { HORARIO_DEFAULT, posponerAHorarioPermitido, type HorarioPermitido } from './indagacion'

/** Valor de leads.follow_up_reason mientras se espera el seguimiento de la muestra. */
export const REASON_MUESTRA = 'muestra'

export const MUESTRA_SEGUIMIENTO_DIAS_DEFAULT = 5

const DIA_MS = 24 * 60 * 60 * 1000

/** N días después de la entrega, corrido al horario permitido si cae de noche. */
export function calcularSeguimientoMuestra(
  entregadaAt: Date,
  dias: number = MUESTRA_SEGUIMIENTO_DIAS_DEFAULT,
  horario: HorarioPermitido = HORARIO_DEFAULT,
): Date {
  const d = Math.max(1, Math.min(dias, 60))
  return posponerAHorarioPermitido(new Date(entregadaAt.getTime() + d * DIA_MS), horario)
}

export const MOTIVO_SIN_PLANTILLA_MUESTRA = 'sin_plantilla'

/**
 * Motivo para NO mandar el seguimiento de la muestra al momento de
 * procesarlo, o null si corresponde mandarlo.
 * - La persona ya escribió después de entregada la muestra: la charla siguió.
 * - El lead ya no está en "Muestra enviada" (lo avanzaron a pedido, llamada, etc.).
 * - El bot está apagado a mano: el vendedor pidió que no haya automatismos.
 * `enEtapaMuestra` en null = no se pudo determinar (borraron la etapa) y no se usa.
 */
export function motivoParaOmitirSeguimientoMuestra(params: {
  mensajesDelClienteDesdeProgramado: number
  enEtapaMuestra: boolean | null
  botApagadoAMano: boolean
}): string | null {
  if (params.botApagadoAMano) return 'el bot está apagado a mano en esta conversación'
  if (params.mensajesDelClienteDesdeProgramado > 0) return 'el cliente ya escribió después de la muestra'
  if (params.enEtapaMuestra === false) return 'el lead ya no está en "Muestra enviada"'
  return null
}
