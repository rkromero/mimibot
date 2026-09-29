/**
 * Envíos masivos de plantillas: reglas puras (sin base de datos), testeables.
 *
 * - Quién queda afuera y por qué (sin WhatsApp, lead cerrado, ya recibió la
 *   misma plantilla hace poco).
 * - Cuándo sale: ahora o programado, siempre dentro del horario permitido
 *   (8 a 22 hs Argentina); si cae afuera, se corre al próximo inicio.
 * - Ritmo de envío: un mensaje cada ~700 ms para no chocar con Meta.
 */
import { estaEnHorarioPermitido, posponerAHorarioPermitido, type HorarioPermitido } from '@/lib/followup/indagacion'

/** No se repite la misma plantilla a un lead que la recibió en este plazo. */
export const DIAS_ANTIREPETICION = 7

/** Pausa entre mensajes de un mismo envío (ms). */
export const PAUSA_ENTRE_MENSAJES_MS = 700

/** Tope de destinatarios por envío (protección contra un filtro vacío que trae todo). */
export const MAX_DESTINATARIOS = 1000

export type MotivoExclusion =
  | 'sin_whatsapp'
  | 'lead_cerrado'
  | 'plantilla_repetida'

export const MOTIVO_EXCLUSION_LABEL: Record<MotivoExclusion, string> = {
  sin_whatsapp: 'Sin teléfono de WhatsApp',
  lead_cerrado: 'Lead cerrado',
  plantilla_repetida: `Ya recibió esta plantilla en los últimos ${DIAS_ANTIREPETICION} días`,
}

export type LeadCandidato = {
  isOpen: boolean
  waContactPhone: string | null
  /** Última vez que se le mandó ESTA plantilla por un envío masivo */
  ultimoEnvioMismaPlantillaAt: Date | null
}

/** Motivo por el que un lead no entra en el envío, o null si entra. */
export function motivoExclusion(lead: LeadCandidato, ahora: Date, diasAntirepeticion = DIAS_ANTIREPETICION): MotivoExclusion | null {
  if (!lead.isOpen) return 'lead_cerrado'
  if (!lead.waContactPhone) return 'sin_whatsapp'
  if (lead.ultimoEnvioMismaPlantillaAt) {
    const limite = ahora.getTime() - diasAntirepeticion * 86_400_000
    if (lead.ultimoEnvioMismaPlantillaAt.getTime() > limite) return 'plantilla_repetida'
  }
  return null
}

export type ResumenExclusiones = Record<MotivoExclusion, number> & { elegibles: number }

export function resumirExclusiones(motivos: Array<MotivoExclusion | null>): ResumenExclusiones {
  const r: ResumenExclusiones = { elegibles: 0, sin_whatsapp: 0, lead_cerrado: 0, plantilla_repetida: 0 }
  for (const m of motivos) {
    if (m === null) r.elegibles++
    else r[m]++
  }
  return r
}

/**
 * Cuándo arranca el envío. `programadoAt` null = ahora. En ambos casos se
 * respeta el horario permitido: fuera de horario se corre al próximo inicio.
 */
export function momentoDeEnvio(programadoAt: Date | null, ahora: Date, horario?: HorarioPermitido): Date {
  const base = programadoAt && programadoAt.getTime() > ahora.getTime() ? programadoAt : ahora
  return posponerAHorarioPermitido(base, horario)
}

/** ¿Se puede seguir mandando en este instante? (dentro del horario permitido) */
export function puedeEnviarAhora(ahora: Date, horario?: HorarioPermitido): boolean {
  return estaEnHorarioPermitido(ahora, horario)
}

/** Duración estimada de un envío, en minutos, al ritmo configurado. */
export function minutosEstimados(cantidad: number): number {
  return Math.ceil((cantidad * PAUSA_ENTRE_MENSAJES_MS) / 60_000)
}
