/**
 * Recordatorio de seña: reglas puras (sin base de datos).
 *
 * Cuando a un cliente nuevo (vino de un lead del chat, es su primer pedido) se
 * le mandó la proforma y no entró ningún pago, se le recuerda la seña del 50%
 * a las 24 hs, 72 hs y 7 días de la primera proforma. Nunca a clientes con
 * compras anteriores: esos pagan con cuenta corriente y figuran impagos aunque
 * estén al día. Lo que toca la base está en `sena.engine.ts`.
 */
import { estaEnHorarioPermitido, HORARIO_DEFAULT, type HorarioPermitido } from './indagacion'

export const REASON_SENA = 'sena'

/** Plantilla aprobada en Meta ({{1}} nombre) para cuando la ventana de 24 hs está cerrada. */
export const TEMPLATE_SENA = 'recordatorio_sena'

export const TEXTO_SENA =
  'Hola {{1}}! Te recuerdo que para arrancar con la producción de tu pedido necesitamos la seña del 50%. Cuando hagas ' +
  'la transferencia, mandame el comprobante por acá y lo ponemos en la fila de producción.'

/** Horas desde la primera proforma en las que sale cada recordatorio. */
export const HORAS_RECORDATORIOS_SENA = [24, 72, 168] as const

/** Si alguien escribió hace menos de esto, la charla está viva: se espera a que se calme. */
export const SENA_CHARLA_ACTIVA_HORAS = 12

/** Pasado esto desde la proforma no se insiste más (aunque no haya salido el último). */
export const SENA_MAX_DIAS = 10

const HORA_MS = 60 * 60 * 1000

export type CandidatoSena = {
  proformaAt: Date
  /** Recordatorios de seña ya mandados (o resueltos) para este pedido. */
  recordatoriosEnviados: number
  /** Ya se cortó la cadena para este pedido (p. ej. mandó un comprobante). */
  cortado: boolean
  /** El cliente mandó una imagen o un PDF después de la proforma (probable comprobante). */
  mandoArchivoDespuesDeProforma: boolean
  ultimoMensajeHumanoAt: Date | null
}

export type AccionSena =
  | { tipo: 'esperar' }
  | { tipo: 'enviar'; paso: number }
  | { tipo: 'cortar'; motivo: string }

export function decidirRecordatorioSena(
  c: CandidatoSena,
  ahora: Date,
  horario: HorarioPermitido = HORARIO_DEFAULT,
): AccionSena {
  if (c.cortado) return { tipo: 'esperar' }
  if (c.recordatoriosEnviados >= HORAS_RECORDATORIOS_SENA.length) return { tipo: 'esperar' }
  if (c.mandoArchivoDespuesDeProforma) {
    return { tipo: 'cortar', motivo: 'el cliente mandó un archivo después de la proforma (posible comprobante)' }
  }
  const desdeProforma = ahora.getTime() - c.proformaAt.getTime()
  if (desdeProforma > SENA_MAX_DIAS * 24 * HORA_MS) return { tipo: 'cortar', motivo: 'pasaron más de 10 días desde la proforma' }

  const toca = HORAS_RECORDATORIOS_SENA[c.recordatoriosEnviados]!
  if (desdeProforma < toca * HORA_MS) return { tipo: 'esperar' }
  if (!estaEnHorarioPermitido(ahora, horario)) return { tipo: 'esperar' }
  if (c.ultimoMensajeHumanoAt && ahora.getTime() - c.ultimoMensajeHumanoAt.getTime() < SENA_CHARLA_ACTIVA_HORAS * HORA_MS) {
    return { tipo: 'esperar' }
  }
  return { tipo: 'enviar', paso: c.recordatoriosEnviados + 1 }
}

/** Texto con el primer nombre (o sin nombre). */
export function renderTextoSena(nombre: string | null | undefined): string {
  const n = nombre?.trim()
  return (n ? TEXTO_SENA.replace('{{1}}', n) : TEXTO_SENA.replace(' {{1}}', '')).trim()
}
