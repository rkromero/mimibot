/**
 * Estado de entrega de un mensaje saliente según los avisos `statuses` del
 * webhook de Meta: sent → delivered → read (o failed). Es lo que se muestra
 * como los tildes del chat.
 */

export const ESTADOS_WA = ['sent', 'delivered', 'read', 'failed'] as const
export type EstadoWa = (typeof ESTADOS_WA)[number]

const ORDEN: Record<EstadoWa, number> = { sent: 1, delivered: 2, read: 3, failed: 4 }

export function esEstadoWa(s: string | null | undefined): s is EstadoWa {
  return (ESTADOS_WA as readonly string[]).includes(s ?? '')
}

/**
 * Meta puede mandar los avisos fuera de orden o repetidos (por ejemplo
 * "delivered" después de "read"). Solo se avanza, nunca se retrocede;
 * "failed" pisa cualquier cosa.
 */
export function estadoMasAvanzado(actual: string | null | undefined, nuevo: string): EstadoWa | null {
  if (!esEstadoWa(nuevo)) return esEstadoWa(actual) ? actual : null
  if (!esEstadoWa(actual)) return nuevo
  return ORDEN[nuevo] >= ORDEN[actual] ? nuevo : actual
}

export type Tilde = {
  /** Cuántos tildes dibujar: 0 = reloj (todavía no salió), 1 = enviado, 2 = entregado/leído */
  cantidad: 0 | 1 | 2
  /** Los dos tildes en azul = leído */
  leido: boolean
  fallo: boolean
  label: string
}

/** Qué dibujar al lado de un mensaje saliente. */
export function tildeDe(msg: { waMessageId: string | null; waStatus?: string | null; waError?: string | null }): Tilde {
  if (msg.waStatus === 'failed') {
    return { cantidad: 0, leido: false, fallo: true, label: msg.waError ? `No se pudo entregar: ${msg.waError}` : 'No se pudo entregar' }
  }
  if (!msg.waMessageId) return { cantidad: 0, leido: false, fallo: false, label: 'Pendiente de envío' }
  switch (msg.waStatus) {
    case 'read':      return { cantidad: 2, leido: true,  fallo: false, label: 'Leído' }
    case 'delivered': return { cantidad: 2, leido: false, fallo: false, label: 'Entregado' }
    default:          return { cantidad: 1, leido: false, fallo: false, label: 'Enviado' }
  }
}
