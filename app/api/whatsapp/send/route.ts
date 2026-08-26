export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { messages, whatsappConfig, whatsappTemplates } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { sendTextMessage, sendMediaMessage, uploadMediaToMeta, sendTemplateMessage, buildBodyComponents } from '@/lib/whatsapp/client'
import { resolveTemplateVariables, applyTemplateValues } from '@/lib/whatsapp/variables'
import { resolverConversacionParaEnvio, variablesParaChat } from '@/lib/whatsapp/apertura'
import { persistOutboundMedia } from '@/lib/whatsapp/media'
import { waMediaType, contentTypeFromExt } from '@/lib/whatsapp/mime'
import { toApiError, ValidationError } from '@/lib/errors'
import { estaDentroDe24h } from '@/lib/whatsapp/ventana'
import type { Session } from 'next-auth'

type SessionUser = Session['user']

const sendTextSchema = z.object({
  conversationId: z.string().uuid(),
  // leadId kept as optional for backwards compatibility with existing clients
  leadId: z.string().uuid().optional(),
  /** Texto libre. Opcional cuando se manda una plantilla (ventana cerrada). */
  body: z.string().max(4096).optional().default(''),
  /** Plantilla elegida en el chat para abrir la conversación; si falta, se usa la de Ajustes → WhatsApp. */
  templateName: z.string().max(200).optional(),
  templateLang: z.string().max(20).optional(),
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
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const { conversationId, body: text, templateName: elegidaName, templateLang: elegidaLang } = parsed.data
  const { waContactPhone, contactName, productoInteres } = await resolverConversacionParaEnvio(user, conversationId)

  const dentro24h = await estaDentroDe24h(conversationId)

  if (!dentro24h) {
    // Plantilla elegida en el chat, o la de apertura configurada en Ajustes → WhatsApp
    let templateName = elegidaName ?? null
    let templateLang = elegidaLang ?? 'es'
    if (!templateName) {
      const config = await db.query.whatsappConfig.findFirst({
        columns: { aperturaTemplateName: true, aperturaTemplateLang: true },
      })
      templateName = config?.aperturaTemplateName ?? null
      templateLang = config?.aperturaTemplateLang ?? 'es'
    }

    if (!templateName) {
      return NextResponse.json(
        {
          error: 'Han pasado más de 24h desde el último mensaje del cliente. Elegí una plantilla aprobada en el chat o configurá una de apertura en Sistema → WhatsApp.',
          code: 'WINDOW_CLOSED_NO_TEMPLATE',
        },
        { status: 422 },
      )
    }

    const tmpl = await db.query.whatsappTemplates.findFirst({
      where: and(
        eq(whatsappTemplates.name, templateName),
        eq(whatsappTemplates.language, templateLang),
        eq(whatsappTemplates.status, 'APPROVED'),
      ),
      columns: { bodyText: true, variables: true },
    })

    if (!tmpl) {
      return NextResponse.json(
        {
          error: `La plantilla "${templateName}" (${templateLang}) no está aprobada en la cuenta de WhatsApp actual. Sincronizá los estados en Ajustes → WhatsApp → Plantillas.`,
          code: 'TEMPLATE_NOT_APPROVED',
        },
        { status: 422 },
      )
    }

    const varsToUse = variablesParaChat(tmpl.bodyText, tmpl.variables)
    const resolvedValues = resolveTemplateVariables(varsToUse, {
      clienteNombre: contactName,
      vendedorNombre: user.name ?? undefined,
      productoInteres: productoInteres ?? undefined,
    })
    const components = buildBodyComponents(resolvedValues)
    const resolvedBody = applyTemplateValues(tmpl.bodyText, resolvedValues).trim()

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
  if (!text.trim()) throw new ValidationError('Escribí un mensaje para enviar')

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

  const { waContactPhone } = await resolverConversacionParaEnvio(user, conversationId)

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
