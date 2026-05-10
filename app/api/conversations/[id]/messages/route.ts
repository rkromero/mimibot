import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { messages, conversations, leads, attachments } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import { z } from 'zod'
import { toApiError, NotFoundError } from '@/lib/errors'
import { canAccessLead } from '@/lib/authz'

const addNoteSchema = z.object({
  body: z.string().min(1).max(4000),
  contentType: z.literal('internal_note'),
  conversationId: z.string().uuid(),
})

export async function GET(
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

    const msgs = await db.query.messages.findMany({
      where: eq(messages.conversationId, id),
      orderBy: [asc(messages.sentAt)],
      with: {
        attachments: true,
        sender: { columns: { id: true, name: true, avatarColor: true } },
      },
    })

    return NextResponse.json({ data: msgs })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(
  req: NextRequest,
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

    const body: unknown = await req.json()
    const parsed = addNoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }

    const [msg] = await db
      .insert(messages)
      .values({
        conversationId: id,
        direction: 'outbound',
        senderType: 'agent',
        senderId: session.user.id,
        contentType: 'internal_note',
        body: parsed.data.body,
        isRead: true,
        sentAt: new Date(),
      })
      .returning()

    return NextResponse.json({ data: msg }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
