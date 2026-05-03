// Singleton pg LISTEN — se inicializa una vez por proceso.
// Hot reload en dev puede crear múltiples instancias; el flag global lo previene.

import postgres from 'postgres'
import { emitLeadEvent, type CrmEvent } from './broker'

const globalForListener = globalThis as unknown as { pgListenerStarted?: boolean }

export function startPgListener() {
  if (globalForListener.pgListenerStarted) return
  globalForListener.pgListenerStarted = true

  if (!process.env['DATABASE_URL']) {
    console.error('[realtime] DATABASE_URL no está configurado, listener desactivado')
    return
  }

  // Conexión dedicada para LISTEN — no reutilizar el pool de queries
  const listenerClient = postgres(process.env['DATABASE_URL'], {
    max: 1,
    idle_timeout: 0,
    connect_timeout: 10,
    onnotice: () => {},
  })

  listenerClient.listen('crm_events', (payload) => {
    try {
      const event = JSON.parse(payload) as CrmEvent
      emitLeadEvent(event)
    } catch {
      console.error('[realtime] payload inválido:', payload)
    }
  }).catch((err) => {
    console.error('[realtime] error en LISTEN:', err)
    globalForListener.pgListenerStarted = false
    // Reconectar en 5s
    setTimeout(startPgListener, 5_000)
  })

  console.info('[realtime] pg LISTEN activo en canal crm_events')
}
