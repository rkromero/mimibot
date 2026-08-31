import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { messages } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import { z } from 'zod'
import { toApiError } from '@/lib/errors'
import { canAccessConversacion } from '@/lib/authz/conversaciones'
import { validateUuidParam } from '@/lib/api/validate-params'

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
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    // Conversación de lead o de cliente: la autorización sigue al dueño.
    await canAccessConversacion(session.user, id)

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
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    await canAccessConversacion(session.user, id)

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
