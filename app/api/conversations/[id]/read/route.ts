import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { conversations, messages } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { toApiError, NotFoundError } from '@/lib/errors'
import { canAccessLead } from '@/lib/authz'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params

    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
      columns: { leadId: true },
    })
    if (!conv) throw new NotFoundError('Conversación')
    await canAccessLead(session.user, conv.leadId)

    await db
      .update(messages)
      .set({ isRead: true })
      .where(and(eq(messages.conversationId, id), eq(messages.isRead, false)))

    await db
      .update(conversations)
      .set({ unreadCount: 0, updatedAt: new Date() })
      .where(eq(conversations.id, id))

    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
