/**
 * Seguimiento automático después de enviar una propuesta (cotización).
 *
 * Reglas puras (sin base de datos) para decidir CUÁNDO mandarlo y QUÉ texto
 * sale. La parte que toca la base está en `engine.ts`.
 *
 * La ventana de 24 hs de WhatsApp se cuenta desde el último mensaje del
 * cliente, no desde la propuesta. Por eso el seguimiento se programa a
 * N horas (23 por defecto) del último mensaje del cliente: es el último
 * momento seguro para mandar texto libre sin plantilla.
 */
import { primerNombre } from '@/lib/whatsapp/variables'

export const MENSAJE_SEGUIMIENTO_PROPUESTA_DEFAULT =
  'Hola {{1}}, {{2}} de ALIPRO. Te escribo por la cotización que te mandé ayer. Pudiste verla? Cualquier duda me decís y lo vemos.'

const HORA_MS = 60 * 60 * 1000

export type PlanSeguimientoPropuesta = {
  enviarAt: Date
  /** true: cae dentro de la ventana de 24 hs → sale como texto libre. false: va a necesitar plantilla. */
  dentroVentana: boolean
}

/**
 * Cuándo mandar el seguimiento.
 * - Hay último mensaje del cliente y (último + horas) queda al menos `minimoHoras` en el futuro:
 *   se manda ahí, dentro de la ventana.
 * - Si no (el cliente nunca escribió, o hace demasiado que no escribe): se manda
 *   `fallbackHoras` después de la propuesta, y va a salir por plantilla.
 */
export function calcularEnvioSeguimientoPropuesta(params: {
  ahora: Date
  ultimoMensajeClienteAt: Date | null
  horasDesdeUltimoMensaje: number
  minimoHoras?: number
  fallbackHoras?: number
}): PlanSeguimientoPropuesta {
  const { ahora, ultimoMensajeClienteAt } = params
  const horas = Math.max(1, Math.min(params.horasDesdeUltimoMensaje, 23.5))
  const minimo = (params.minimoHoras ?? 1) * HORA_MS
  const fallback = (params.fallbackHoras ?? 22) * HORA_MS

  if (ultimoMensajeClienteAt) {
    const enVentana = new Date(ultimoMensajeClienteAt.getTime() + horas * HORA_MS)
    if (enVentana.getTime() - ahora.getTime() >= minimo) {
      return { enviarAt: enVentana, dentroVentana: true }
    }
  }
  return { enviarAt: new Date(ahora.getTime() + fallback), dentroVentana: false }
}

/**
 * Texto final del seguimiento: {{1}} = primer nombre del cliente, {{2}} = nombre del vendedor.
 * Sin vendedor conocido, firma "el equipo".
 */
export function renderMensajeSeguimientoPropuesta(
  plantilla: string | null | undefined,
  datos: { clienteNombre?: string | null; vendedorNombre?: string | null },
): string {
  const base = plantilla?.trim() || MENSAJE_SEGUIMIENTO_PROPUESTA_DEFAULT
  const nombre = primerNombre(datos.clienteNombre)
  const vendedor = datos.vendedorNombre?.trim() || 'el equipo'
  return base
    .replace(/\{\{1\}\}/g, nombre)
    .replace(/\{\{2\}\}/g, vendedor)
    // "Hola , ..." cuando no hay nombre
    .replace(/Hola\s*,/g, 'Hola,')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
