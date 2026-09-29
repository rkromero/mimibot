import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { messages, enviosMasivos } from '@/db/schema'
import { eq, asc, inArray } from 'drizzle-orm'
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

    // Mensajes que salieron de un envío masivo: se marcan con el nombre del envío
    const envioIds = [...new Set(msgs.map((m) => m.envioMasivoId).filter((x): x is string => !!x))]
    const envios = envioIds.length > 0
      ? await db.select({ id: enviosMasivos.id, nombre: enviosMasivos.nombre }).from(enviosMasivos).where(inArray(enviosMasivos.id, envioIds))
      : []
    const nombrePorEnvio = new Map(envios.map((e) => [e.id, e.nombre]))
    const data = msgs.map((m) => ({
      ...m,
      envioMasivo: m.envioMasivoId ? { id: m.envioMasivoId, nombre: nombrePorEnvio.get(m.envioMasivoId) ?? 'Envío masivo' } : null,
    }))

    return NextResponse.json({ data })
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
