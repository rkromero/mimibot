/**
 * Botón "Último seguimiento" del panel del lead.
 *
 * El vendedor manda a mano la plantilla aprobada configurada en Ajustes →
 * Seguimiento (por defecto `ultimo_seguimiento`). Desde ese momento corre un
 * plazo de N horas contadas solo dentro del horario permitido (8 a 22, hora
 * Argentina): si nadie contesta, el lead pasa a Perdido con "Dejó de responder".
 * Cualquier mensaje de la persona cancela el cierre, salvo las respuestas
 * automáticas de negocios ("estamos cerrados, te contestamos a la brevedad").
 *
 * Acá van solo las reglas puras (plazos y detección de texto); lo que toca la
 * base está en `engine.ts`.
 */
import {
  HORARIO_DEFAULT,
  OFFSET_ARGENTINA_HORAS,
  conHoraLocal,
  posponerAHorarioPermitido,
  type HorarioPermitido,
} from './indagacion'

const HORA_MS = 60 * 60 * 1000

/** Valor de leads.follow_up_reason mientras se espera respuesta al último seguimiento. */
export const REASON_ULTIMO_SEGUIMIENTO = 'ultimo_seguimiento'

export const ULTIMO_SEGUIMIENTO_TEMPLATE_DEFAULT = 'ultimo_seguimiento'
export const ULTIMO_SEGUIMIENTO_HORAS_DEFAULT = 10

/**
 * Respuestas automáticas típicas de negocios (se comparan sin tildes ni
 * mayúsculas, por inclusión). Las frases extra se cargan en Ajustes → Seguimiento.
 */
export const RESPUESTAS_AUTOMATICAS_DEFAULT: ReadonlyArray<string> = [
  'estamos cerrados',
  'en este momento no podemos atenderte',
  'en este momento no podemos responder',
  'te contestamos a la brevedad',
  'te responderemos a la brevedad',
  'responderemos a la brevedad',
  'nos comunicaremos a la brevedad',
  'a la brevedad posible',
  'fuera de nuestro horario',
  'fuera del horario de atención',
  'nuestro horario de atención',
  'horario de atención',
  'gracias por comunicarte',
  'gracias por contactarnos',
  'gracias por contactarte',
  'gracias por escribirnos',
  'nos pondremos en contacto',
  'en breve nos comunicaremos',
  'un asesor se comunicará',
  'un representante se comunicará',
  'mensaje automático',
  'respuesta automática',
  'dejanos tu mensaje',
  'dejá tu mensaje',
  'deje su mensaje',
  'no estamos disponibles',
]

/** Minúsculas, sin tildes, espacios colapsados: para comparar textos escritos de cualquier forma. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * true si el texto parece una respuesta automática de negocio (contestador de
 * WhatsApp Business) y por lo tanto NO cuenta como respuesta al último seguimiento.
 * Solo aplica a mensajes de texto: un audio o una foto siempre es una persona.
 */
export function esRespuestaAutomatica(texto: string | null | undefined, frasesExtra: ReadonlyArray<string> = []): boolean {
  if (!texto) return false
  const t = normalizarTexto(texto)
  if (!t) return false
  for (const frase of [...RESPUESTAS_AUTOMATICAS_DEFAULT, ...frasesExtra]) {
    const f = normalizarTexto(frase)
    if (f && t.includes(f)) return true
  }
  return false
}

/**
 * Momento del cierre: `horas` contadas solo dentro del horario permitido.
 * Ejemplo con 8 a 22 y 10 horas: enviado a las 20:00 → 2 horas hasta las 22 y
 * las 8 restantes desde las 8 del día siguiente → 16:00. Enviado de noche o
 * de madrugada, el reloj arranca a las 8.
 */
export function calcularCierreUltimoSeguimiento(
  desde: Date,
  horas: number,
  horario: HorarioPermitido = HORARIO_DEFAULT,
): Date {
  let restanteMs = Math.max(0.25, horas) * HORA_MS
  // Horario inválido o de 24 horas: no hay nada que saltear
  if (horario.hasta <= horario.desde) return new Date(desde.getTime() + restanteMs)

  const off = horario.offsetHoras ?? OFFSET_ARGENTINA_HORAS
  let cursor = posponerAHorarioPermitido(desde, horario)
  // Cada vuelta consume lo que queda del día permitido; nunca más de un par de días
  for (let dia = 0; dia < 60; dia++) {
    const finDelDia = conHoraLocal(cursor, horario.hasta, off)
    const disponibleMs = finDelDia.getTime() - cursor.getTime()
    if (disponibleMs >= restanteMs) return new Date(cursor.getTime() + restanteMs)
    restanteMs -= disponibleMs
    cursor = posponerAHorarioPermitido(finDelDia, horario)
  }
  return cursor
}
