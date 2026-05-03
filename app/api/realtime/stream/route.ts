export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { addSseClient, removeSseClient } from '@/lib/realtime/broker'
import { startPgListener } from '@/lib/realtime/listener'

export async function GET() {
  const session = await auth()
  if (!session) {
    return new Response('No autorizado', { status: 401 })
  }

  startPgListener()

  let cleanup: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      function send(data: string) {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch {
          // conexión cerrada
        }
      }

      const client = {
        userId: session.user.id,
        role: session.user.role,
        write: send,
        close: () => controller.close(),
      }

      addSseClient(client)

      // Heartbeat cada 30s para mantener la conexión viva
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30_000)

      cleanup = () => {
        clearInterval(heartbeat)
        removeSseClient(client)
      }

      // Enviar evento de conexión confirmada
      send(JSON.stringify({ type: 'connected', userId: session.user.id }))
    },
    cancel() {
      cleanup?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
