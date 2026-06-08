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
import { canAccessLead } from '@/lib/authz'
import { toApiError, NotFoundError, ValidationError } from '@/lib/errors'
import { estaDentroDe24h } from '@/lib/whatsapp/ventana'
import type { Session } from 'next-auth'

type SessionUser = Session['user']

const sendTextSchema = z.object({
  conversationId: z.string().uuid(),
  leadId: z.string().uuid(),
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

async function handleTextSend(req: NextRequest, user: SessionUser) {
  const body: unknown = await req.json()
  const parsed = sendTextSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
  }

  const { conversationId, leadId, body: text } = parsed.data
  await canAccessLead(user, leadId)

  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { waContactPhone: true },
    with: {
      lead: {
        columns: { id: true },
        with: { contact: { columns: { name: true } } },
      },
    },
  })
  if (!conv?.waContactPhone) throw new NotFoundError('Conversación')

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

    const contactName = conv.lead?.contact?.name ?? ''
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
      waMessageId = await sendTemplateMessage(conv.waContactPhone, templateName, templateLang, components)
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
    waMessageId = await sendTextMessage(conv.waContactPhone, text)
  } catch (err) {
    console.error('[send] Error enviando por WhatsApp:', err)
  }

  if (waMessageId) {
    await db.update(messages)
      .set({ waMessageId })
      .where(eq(messages.id, msg!.id))
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
  const leadId = formData.get('leadId') as string | null

  if (!file || !conversationId || !leadId) {
    throw new ValidationError('file, conversationId y leadId son requeridos')
  }

  await canAccessLead(user, leadId)

  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { waContactPhone: true },
  })
  if (!conv?.waContactPhone) throw new NotFoundError('Conversación')

  const buffer = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || contentTypeFromExt(file.name)
  const mediaKind = waMediaType(mimeType)

  // Guardar mensaje en DB
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

  // Subir a R2 (para nuestro storage) + subir a Meta (para envío)
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

  // Enviar por WhatsApp
  let waMessageId: string | null = null
  try {
    waMessageId = await sendMediaMessage(conv.waContactPhone, metaMediaId, mediaKind)
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
