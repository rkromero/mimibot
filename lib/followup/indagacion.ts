/**
 * Seguimiento de leads en etapa Nuevo que dejan de responder mientras el bot
 * los está calificando ("indagación").
 *
 * Cadencia (todo contado con la ventana de 24 hs de WhatsApp, que corre desde
 * el último mensaje de la persona):
 *   1. A las N horas (2) sin respuesta: el bot retoma la pregunta pendiente.
 *   2. A las M horas (23) del último mensaje de la persona: mensaje final
 *      "seguimos o lo dejamos?". Último momento sin plantilla.
 *   3. Si tampoco responde en K horas (24): el lead pasa a Cerrado Perdido.
 * Nada sale en el horario bloqueado (22:00 a 08:00, hora Argentina).
 *
 * Acá van solo las reglas puras (fechas y textos); lo que toca la base está
 * en `engine.ts`.
 */
import { primerNombre } from '@/lib/whatsapp/variables'

const HORA_MS = 60 * 60 * 1000
/** Argentina no tiene horario de verano: UTC-3 fijo. */
export const OFFSET_ARGENTINA_HORAS = -3

export type HorarioPermitido = {
  /** Hora local a partir de la cual se puede enviar (inclusive). */
  desde: number
  /** Hora local a partir de la cual NO se puede enviar (exclusive). */
  hasta: number
  offsetHoras?: number
}

export const HORARIO_DEFAULT: HorarioPermitido = { desde: 8, hasta: 22, offsetHoras: OFFSET_ARGENTINA_HORAS }

export const MENSAJE_FINAL_DEFAULT =
  'Hola {{1}}, te escribo por última vez por tu consulta de {{2}}. Querés que sigamos con la cotización o preferís dejarlo? Cualquier cosa quedo a disposición.'

export const MENSAJE_RETOMAR_FALLBACK =
  'Hola {{1}}, seguimos? Me quedó pendiente tu respuesta para poder avanzar con la cotización de {{2}}.'

/** Hora local (0-23, con fracción) de una fecha en la zona indicada. */
function horaLocal(date: Date, offsetHoras: number): number {
  const local = new Date(date.getTime() + offsetHoras * HORA_MS)
  return local.getUTCHours() + local.getUTCMinutes() / 60
}

/** Fecha con la hora local puesta en `hora` (0-23.99) del mismo día local, más `diasExtra` días. */
function conHoraLocal(date: Date, hora: number, offsetHoras: number, diasExtra = 0): Date {
  const local = new Date(date.getTime() + offsetHoras * HORA_MS)
  const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + diasExtra)
  return new Date(base + hora * HORA_MS - offsetHoras * HORA_MS)
}

export function estaEnHorarioPermitido(date: Date, horario: HorarioPermitido = HORARIO_DEFAULT): boolean {
  const h = horaLocal(date, horario.offsetHoras ?? OFFSET_ARGENTINA_HORAS)
  return h >= horario.desde && h < horario.hasta
}

/**
 * Si la fecha cae en el horario bloqueado, la corre HACIA ADELANTE al próximo
 * inicio del horario permitido (08:00). Para el primer seguimiento.
 */
export function posponerAHorarioPermitido(date: Date, horario: HorarioPermitido = HORARIO_DEFAULT): Date {
  const off = horario.offsetHoras ?? OFFSET_ARGENTINA_HORAS
  if (estaEnHorarioPermitido(date, horario)) return date
  const h = horaLocal(date, off)
  // Antes de `desde`: hoy a las `desde`. Después de `hasta`: mañana a las `desde`.
  return conHoraLocal(date, horario.desde, off, h < horario.desde ? 0 : 1)
}

/**
 * Si la fecha cae en el horario bloqueado, la corre HACIA ATRÁS al último
 * momento permitido (media hora antes de `hasta`). Para el mensaje final, que
 * no puede pasarse de la ventana de 24 hs.
 */
export function adelantarAHorarioPermitido(date: Date, horario: HorarioPermitido = HORARIO_DEFAULT): Date {
  const off = horario.offsetHoras ?? OFFSET_ARGENTINA_HORAS
  if (estaEnHorarioPermitido(date, horario)) return date
  const h = horaLocal(date, off)
  // Después de `hasta`: hoy a `hasta` - 30 min. Antes de `desde` (madrugada): ayer a `hasta` - 30 min.
  return conHoraLocal(date, horario.hasta - 0.5, off, h < horario.desde ? -1 : 0)
}

/** Primer seguimiento: N horas después del último mensaje del bot, pospuesto si cae de noche. */
export function calcularPrimerSeguimiento(
  ultimoMensajeBotAt: Date,
  horas: number,
  horario: HorarioPermitido = HORARIO_DEFAULT,
): Date {
  return posponerAHorarioPermitido(new Date(ultimoMensajeBotAt.getTime() + Math.max(0.25, horas) * HORA_MS), horario)
}

/**
 * Mensaje final: M horas después del último mensaje de la persona (dentro de la
 * ventana), adelantado si cae de noche. Nunca antes de `noAntesDe` (el primer
 * seguimiento + un margen), y nunca en el pasado.
 */
export function calcularSeguimientoFinal(params: {
  ultimoMensajeClienteAt: Date
  horas: number
  ahora: Date
  noAntesDe?: Date | null
  horario?: HorarioPermitido
}): Date {
  const horario = params.horario ?? HORARIO_DEFAULT
  const horas = Math.max(1, Math.min(params.horas, 23.5))
  let at = adelantarAHorarioPermitido(new Date(params.ultimoMensajeClienteAt.getTime() + horas * HORA_MS), horario)
  const piso = Math.max(params.ahora.getTime() + 5 * 60 * 1000, params.noAntesDe?.getTime() ?? 0)
  if (at.getTime() < piso) at = new Date(piso)
  return at
}

/** Reemplaza {{1}} (primer nombre) y {{2}} (producto de interés, o un comodín). */
export function renderMensajeIndagacion(
  plantilla: string | null | undefined,
  datos: { clienteNombre?: string | null; productoInteres?: string | null },
  fallback: string = MENSAJE_FINAL_DEFAULT,
): string {
  const base = plantilla?.trim() || fallback
  const nombre = primerNombre(datos.clienteNombre)
  const producto = datos.productoInteres?.trim() || 'tu producto'
  return base
    .replace(/\{\{1\}\}/g, nombre)
    .replace(/\{\{2\}\}/g, producto)
    .replace(/Hola\s*,/g, 'Hola,')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
