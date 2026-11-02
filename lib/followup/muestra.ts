/**
 * Seguimiento después de la muestra: reglas puras (sin base de datos).
 *
 * El expreso tarda, así que a los N días (4 por defecto) de entregada la
 * muestra se le manda la plantilla aprobada "¿qué te pareció?" y el bot
 * (modo post-propuesta) sigue la charla hacia el primer pedido. Lo que toca
 * la base está en `engine.ts`.
 *
 * Que el cliente conteste la guía ("¿cuánto pago de envío?", "gracias") NO
 * cancela el seguimiento: a esa altura la muestra todavía no llegó. Solo se
 * corre si la charla está activa justo cuando le toca salir.
 */
import { HORARIO_DEFAULT, posponerAHorarioPermitido, type HorarioPermitido } from './indagacion'

/** Valor de leads.follow_up_reason mientras se espera el seguimiento de la muestra. */
export const REASON_MUESTRA = 'muestra'

export const MUESTRA_SEGUIMIENTO_DIAS_DEFAULT = 4

/** Si alguien (cliente o vendedor) escribió hace menos de esto, la charla está viva: se espera. */
export const MUESTRA_CHARLA_ACTIVA_HORAS = 48

/** Pasados estos días extra sobre el seguimiento original sin un hueco de silencio, se deja de intentar. */
export const MUESTRA_POSPONER_MAX_DIAS = 10

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS

/** N días después de la entrega, corrido al horario permitido si cae de noche. */
export function calcularSeguimientoMuestra(
  entregadaAt: Date,
  dias: number = MUESTRA_SEGUIMIENTO_DIAS_DEFAULT,
  horario: HorarioPermitido = HORARIO_DEFAULT,
): Date {
  const d = Math.max(1, Math.min(dias, 60))
  return posponerAHorarioPermitido(new Date(entregadaAt.getTime() + d * DIA_MS), horario)
}

/** Plantilla aprobada en Meta que se usa si en Ajustes no se eligió otra. */
export const MUESTRA_SEGUIMIENTO_TEMPLATE_DEFAULT = 'muestra_seguimiento'

export const MOTIVO_SIN_PLANTILLA_MUESTRA = 'sin_plantilla'

export type AccionSeguimientoMuestra =
  | { tipo: 'enviar' }
  | { tipo: 'omitir'; motivo: string }
  | { tipo: 'posponer'; hasta: Date }

/**
 * Qué hacer con el seguimiento de la muestra cuando le toca salir:
 * - Bot apagado a mano: el vendedor pidió que no haya automatismos → omitir.
 * - El lead ya no está en "Muestra enviada" (pedido, llamada, etc.) → omitir.
 *   `enEtapaMuestra` en null = no se pudo determinar (borraron la etapa) y no se usa.
 * - Alguien (cliente o vendedor, no plantillas ni avisos automáticos) escribió
 *   hace menos de 48 hs: hay una charla en curso, se pospone hasta 48 hs después
 *   de ese último mensaje. Si eso pasa del límite, se deja de intentar.
 * - Si no, se manda.
 */
export function decidirSeguimientoMuestra(params: {
  ahora: Date
  ultimoMensajeHumanoAt: Date | null
  /** Hasta cuándo se puede posponer (ver `limitePosponerMuestra`) */
  limite: Date
  enEtapaMuestra: boolean | null
  botApagadoAMano: boolean
  horario?: HorarioPermitido
}): AccionSeguimientoMuestra {
  if (params.botApagadoAMano) return { tipo: 'omitir', motivo: 'el bot está apagado a mano en esta conversación' }
  if (params.enEtapaMuestra === false) return { tipo: 'omitir', motivo: 'el lead ya no está en "Muestra enviada"' }

  const ultimo = params.ultimoMensajeHumanoAt
  if (ultimo && params.ahora.getTime() - ultimo.getTime() < MUESTRA_CHARLA_ACTIVA_HORAS * HORA_MS) {
    const hasta = posponerAHorarioPermitido(
      new Date(ultimo.getTime() + MUESTRA_CHARLA_ACTIVA_HORAS * HORA_MS),
      params.horario ?? HORARIO_DEFAULT,
    )
    if (hasta.getTime() > params.limite.getTime()) {
      return { tipo: 'omitir', motivo: 'la charla siguió activa después de la muestra' }
    }
    return { tipo: 'posponer', hasta }
  }
  return { tipo: 'enviar' }
}

/** Límite para seguir posponiendo: el seguimiento original + 10 días. */
export function limitePosponerMuestra(seguimientoOriginal: Date): Date {
  return new Date(seguimientoOriginal.getTime() + MUESTRA_POSPONER_MAX_DIAS * DIA_MS)
}
