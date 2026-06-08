export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { conversations, messages, whatsappConfig, whatsappTemplates } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { sendTextMessage, sendMediaMessage, uploadMediaToMeta, sendTemplateMessage } from '@/lib/whatsapp/client'
import { persistOutboundMedia } from '@/lib/whatsapp/media'
import { waMediaType, contentTypeFromExt } from '@/lib/whatsapp/mime'
import { AuthzError, toApiError, NotFoundError, ValidationError } from '@/lib/errors'
import { estaDentroDe24h } from '@/lib/whatsapp/ventana'
import type { Session } from 'next-auth'

type SessionUser = Session['user']

const sendTextSchema = z.object({
  conversationId: z.string().uuid(),
  // leadId kept as optional for backwards compatibility with existing clients
  leadId: z.string().uuid().optional(),
  body: z.string().min(1).max(4096),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      return handleMediaSend(req, session.user)
    }

    return handleTextSend(req, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/** Returns the conversation with enough data to send, after verifying access. */
async function resolveConversation(user: SessionUser, conversationId: string) {
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { id: true, waContactPhone: true, clienteId: true, leadId: true },
    with: {
      cliente: { columns: { asignadoA: true, nombre: true, apellido: true } },
      lead: {
        columns: { id: true, assignedTo: true },
        with: { contact: { columns: { name: true } } },
      },
    },
  })

  if (!conv) throw new NotFoundError('Conversación')
  if (!conv.waContactPhone) throw new ValidationError('La conversación no tiene teléfono de contacto')

  // Permission check for non-admin/non-gerente roles
  if (user.role !== 'admin' && user.role !== 'gerente') {
    const effectiveAssignment = conv.clienteId
      ? conv.cliente?.asignadoA ?? null
      : conv.lead?.assignedTo ?? null
    if (effectiveAssignment !== user.id) {
      throw new AuthzError('No tenés acceso a esta conversación')
    }
  }

  const contactName = conv.clienteId
    ? `${conv.cliente?.nombre ?? ''} ${conv.cliente?.apellido ?? ''}`.trim()
    : (conv.lead?.contact?.name ?? '')

  return { waContactPhone: conv.waContactPhone, contactName }
}

async function handleTextSend(req: NextRequest, user: SessionUser) {
  const body: unknown = await req.json()
  const parsed = sendTextSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const { conversationId, body: text } = parsed.data
  const { waContactPhone, contactName } = await resolveConversation(user, conversationId)

  const dentro24h = await estaDentroDe24h(conversationId)

  if (!dentro24h) {
    const config = await db.query.whatsappConfig.findFirst({
      columns: { aperturaTemplateName: true, aperturaTemplateLang: true },
    })

    if (!config?.aperturaTemplateName) {
      return NextResponse.json(
        {
          error: 'Han pasado más de 24h desde el último mensaje del cliente. Configurá una plantilla de apertura en Sistema → WhatsApp para poder iniciar la conversación.',
          code: 'WINDOW_CLOSED_NO_TEMPLATE',
        },
        { status: 422 },
      )
    }

    const templateName = config.aperturaTemplateName
    const templateLang = config.aperturaTemplateLang ?? 'es'

    const tmpl = await db.query.whatsappTemplates.findFirst({
      where: and(
        eq(whatsappTemplates.name, templateName),
        eq(whatsappTemplates.language, templateLang),
        eq(whatsappTemplates.status, 'APPROVED'),
      ),
      columns: { bodyText: true },
    })

    const hasVar = !!tmpl?.bodyText?.includes('{{1}}')
    const components = hasVar && contactName
      ? [{ type: 'body' as const, parameters: [{ type: 'text' as const, text: contactName }] }]
      : undefined

    const resolvedBody = tmpl?.bodyText
      ? tmpl.bodyText.replace(/\{\{1\}\}/g, contactName).trim()
      : text

    const [msg] = await db
      .insert(messages)
      .values({
        conversationId,
        direction: 'outbound',
        senderType: 'agent',
        senderId: user.id,
        contentType: 'template',
        body: resolvedBody,
        isRead: true,
        sentAt: new Date(),
      })
      .returning()

    let waMessageId: string | null = null
    try {
      waMessageId = await sendTemplateMessage(waContactPhone, templateName, templateLang, components)
    } catch (err) {
      console.error('[send] Error enviando plantilla de apertura:', err)
    }

    if (waMessageId) {
      await db.update(messages).set({ waMessageId }).where(eq(messages.id, msg!.id))
    }

    await db.execute(
      sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${conversationId}`,
    )

    return NextResponse.json({ data: msg, sentAsTemplate: true }, { status: 201 })
  }

  // Dentro de la ventana de 24h — enviar texto libre
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId,
      direction: 'outbound',
      senderType: 'agent',
      senderId: user.id,
      contentType: 'text',
      body: text,
      isRead: true,
      sentAt: new Date(),
    })
    .returning()

  let waMessageId: string | null = null
  try {
    waMessageId = await sendTextMessage(waContactPhone, text)
  } catch (err) {
    console.error('[send] Error enviando por WhatsApp:', err)
  }

  if (waMessageId) {
    await db.update(messages).set({ waMessageId }).where(eq(messages.id, msg!.id))
  }

  await db.execute(
    sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${conversationId}`,
  )

  return NextResponse.json({ data: msg }, { status: 201 })
}

async function handleMediaSend(req: NextRequest, user: SessionUser) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const conversationId = formData.get('conversationId') as string | null

  if (!file || !conversationId) {
    throw new ValidationError('file y conversationId son requeridos')
  }

  const { waContactPhone } = await resolveConversation(user, conversationId)

  const buffer = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || contentTypeFromExt(file.name)
  const mediaKind = waMediaType(mimeType)

  const [msg] = await db
    .insert(messages)
    .values({
      conversationId,
      direction: 'outbound',
      senderType: 'agent',
      senderId: user.id,
      contentType: mediaKind,
      isRead: true,
      sentAt: new Date(),
    })
    .returning()

  const [r2Key, metaMediaId] = await Promise.all([
    persistOutboundMedia({
      buffer,
      messageId: msg!.id,
      conversationId,
      mimeType,
      filename: file.name,
    }),
    uploadMediaToMeta(buffer, mimeType, file.name),
  ])

  let waMessageId: string | null = null
  try {
    waMessageId = await sendMediaMessage(waContactPhone, metaMediaId, mediaKind)
  } catch (err) {
    console.error('[send] Error enviando media por WhatsApp:', err)
  }

  if (waMessageId) {
    await db.update(messages).set({ waMessageId }).where(eq(messages.id, msg!.id))
  }

  await db.execute(
    sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${conversationId}`,
  )

  return NextResponse.json({ data: { ...msg, r2Key } }, { status: 201 })
}
