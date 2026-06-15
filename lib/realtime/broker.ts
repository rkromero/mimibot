// Broker SSE: mapa userId → set de Response writers
// Se ejecuta en el proceso Node como singleton — no funciona con múltiples instancias.
// Para escalar horizontalmente, reemplazar con Redis Pub/Sub.

import { db } from '@/db'
import { sql } from 'drizzle-orm'

type SseClient = {
  userId: string
  role: 'admin' | 'gerente' | 'agent' | 'vendedor' | 'fabrica' | 'repartidor' | 'rtv'
  write: (data: string) => void
  close: () => void
}

const clients = new Map<string, Set<SseClient>>()

export function addSseClient(client: SseClient) {
  const set = clients.get(client.userId) ?? new Set()
  set.add(client)
  clients.set(client.userId, set)
}

export function removeSseClient(client: SseClient) {
  const set = clients.get(client.userId)
  if (!set) return
  set.delete(client)
  if (set.size === 0) clients.delete(client.userId)
}

export type CrmEvent =
  | { type: 'new_message'; conversationId: string; leadId: string | null; assignedTo: string | null; direction: string }
  | { type: 'lead_updated'; leadId: string; assignedTo: string | null; oldAssigned: string | null; stageId: string; oldStageId: string }

export function emitLeadEvent(event: CrmEvent) {
  const payload = JSON.stringify(event)

  for (const [, set] of clients) {
    for (const client of set) {
      // Admins reciben todo
      if (client.role === 'admin') {
        client.write(payload)
        continue
      }

      // Agentes solo reciben eventos de sus leads
      const targetAgent =
        'assignedTo' in event ? event.assignedTo : null
      if (targetAgent === client.userId) {
        client.write(payload)
      }
    }
  }
}

export function broadcastToAll(event: CrmEvent) {
  const payload = JSON.stringify(event)
  for (const [, set] of clients) {
    for (const client of set) {
      client.write(payload)
    }
  }
}

export async function publishCrmEvent(event: CrmEvent) {
  try {
    await db.execute(sql`SELECT pg_notify('crm_events', ${JSON.stringify(event)})`)
  } catch (err) {
    console.error('[realtime] pg_notify falló:', err)
  }
}
