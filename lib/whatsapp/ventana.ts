import { db } from '@/db'
import { messages } from '@/db/schema'
import { and, eq, gte } from 'drizzle-orm'

export async function estaDentroDe24h(conversationId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const msg = await db.query.messages.findFirst({
    where: and(
      eq(messages.conversationId, conversationId),
      eq(messages.direction, 'inbound'),
      gte(messages.sentAt, since),
    ),
    columns: { id: true },
  })
  return !!msg
}
