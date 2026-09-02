import { formatFechaAR } from '@/lib/dates'

/**
 * Recordatorio de llamada del lead (uno por lead): el vendedor anota el día en
 * que tiene que volver a hablarle ("arrancan en noviembre") y una nota corta.
 * Se guarda como día calendario de Argentina (YYYY-MM-DD), sin hora.
 *
 * Helpers puros (sin DB, usables en cliente y servidor) compartidos por el
 * botón "Recordar" del panel del lead, el chip del kanban y el inbox, el
 * filtro del pipeline, la tarjeta de Mi día y el popup "para llamar hoy".
 */

export const RECORDATORIO_NOTA_MAX = 300

/** Día calendario YYYY-MM-DD (sin hora ni zona). */
const RE_FECHA_DIA = /^\d{4}-\d{2}-\d{2}$/

export type EstadoRecordatorio = 'vencido' | 'hoy' | 'proximo'

export type AtajoRecordatorio = 'manana' | 'semana' | 'mes'

export const ATAJOS_RECORDATORIO: ReadonlyArray<{ value: AtajoRecordatorio; label: string }> = [
  { value: 'manana', label: 'Mañana' },
  { value: 'semana', label: 'En una semana' },
  { value: 'mes', label: 'En un mes' },
]

/** Fila que devuelve GET /api/leads/recordatorios (popup y Mi día). */
export type RecordatorioHoy = {
  leadId: string
  nombre: string
  telefono: string | null
  /** YYYY-MM-DD */
  fecha: string
  nota: string | null
  vencido: boolean
  etapa: string | null
  etapaColor: string | null
  asignadoNombre: string | null
}

/** true si es un día calendario válido en formato YYYY-MM-DD (rechaza 2026-02-30). */
export function esFechaDia(v: unknown): v is string {
  if (typeof v !== 'string' || !RE_FECHA_DIA.test(v)) return false
  const [y, m, d] = partes(v)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** El formato YYYY-MM-DD ordena igual que el calendario: alcanza con comparar strings. */
export function estadoRecordatorio(fecha: string, hoy: string): EstadoRecordatorio {
  if (fecha < hoy) return 'vencido'
  if (fecha === hoy) return 'hoy'
  return 'proximo'
}

/** true si hay que atenderlo hoy: es de hoy o ya venció. */
export function esParaHoy(fecha: string, hoy: string): boolean {
  return fecha <= hoy
}

function partes(fecha: string): [number, number, number] {
  const [y, m, d] = fecha.split('-').map(Number)
  return [y!, m!, d!]
}

function aDia(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

/** Suma días calendario a un YYYY-MM-DD sin pasar por la zona horaria local. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = partes(fecha)
  return aDia(Date.UTC(y, m - 1, d + dias, 12))
}

/** Suma meses; si el mes destino no tiene ese día (31 → febrero), cae al último día del mes. */
export function sumarMeses(fecha: string, meses: number): string {
  const [y, m, d] = partes(fecha)
  const ultimoDia = new Date(Date.UTC(y, m - 1 + meses + 1, 0, 12)).getUTCDate()
  return aDia(Date.UTC(y, m - 1 + meses, Math.min(d, ultimoDia), 12))
}

export function fechaAtajo(atajo: AtajoRecordatorio, hoy: string): string {
  switch (atajo) {
    case 'manana': return sumarDias(hoy, 1)
    case 'semana': return sumarDias(hoy, 7)
    case 'mes': return sumarMeses(hoy, 1)
  }
}

/** Texto del chip: "Llamar hoy" · "Vencido 03/11/26" · "Llamar 03/11/26". */
export function etiquetaRecordatorio(fecha: string, hoy: string): string {
  switch (estadoRecordatorio(fecha, hoy)) {
    case 'hoy': return 'Llamar hoy'
    case 'vencido': return `Vencido ${formatFechaAR(fecha, true)}`
    case 'proximo': return `Llamar ${formatFechaAR(fecha, true)}`
  }
}

/** Nota de sistema en la actividad del lead al fijar el recordatorio. */
export function textoRecordatorio(fecha: string, nota: string | null): string {
  return `Recordatorio para llamar el ${formatFechaAR(fecha)}${nota ? `: ${nota}` : ''}`
}

/** Nota de sistema al darlo por cumplido. */
export function textoRecordatorioCumplido(fecha: string, nota: string | null): string {
  return `Recordatorio cumplido (${formatFechaAR(fecha)}${nota ? `: ${nota}` : ''})`
}

/** Clave de localStorage: el popup se muestra una vez por día y por usuario. */
export function clavePopupVisto(userId: string, hoy: string): string {
  return `recordatorios-popup-visto:${userId}:${hoy}`
}
