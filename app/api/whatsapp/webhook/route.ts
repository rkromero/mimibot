export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { verifyWhatsAppSignature } from '@/lib/whatsapp/webhook-validate'
import { getWaSecrets } from '@/lib/whatsapp/client'
import { waWebhookSchema, type WaMessage } from '@/lib/validations/webhook'
import { db } from '@/db'
import { leads, contacts, conversations, messages, activityLog, pipelineStages } from '@/db/schema'
import { eq, asc, sql } from 'drizzle-orm'
import { processBotTurn } from '@/lib/claude/bot'
import { persistInboundMedia } from '@/lib/whatsapp/media'
import { waMediaType } from '@/lib/whatsapp/mime'
import { assignNextAgent } from '@/lib/assignment'
import { emitLeadEvent } from '@/lib/realtime/broker'

// GET: verificación del webhook por Meta
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  const { verifyToken } = await getWaSecrets()
  if (mode === 'subscribe' && token === verifyToken) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// POST: recibe eventos de Meta
export async function POST(req: NextRequest) {
  // 1. Leer el body como texto para verificar la firma HMAC
  const rawBody = await req.text()

  const signature = req.headers.get('x-hub-signature-256')
  const { appSecret } = await getWaSecrets()

  if (!verifyWhatsAppSignature(rawBody, signature, appSecret)) {
    console.error('[webhook] HMAC inválido')
    // Devolvemos 200 igual para que Meta no reintente — logueamos el rechazo
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 2. Parsear payload
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const parsed = waWebhookSchema.safeParse(payload)
  if (!parsed.success) {
    console.warn('[webhook] payload inesperado:', parsed.error.message)
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 3. Responder 200 a Meta ANTES de procesar (fire-and-forget para Claude)
  // Procesamos de forma async sin bloquear la respuesta
  void handleWebhookEntries(parsed.data.entry)

  return NextResponse.json({ received: true }, { status: 200 })
}

async function handleWebhookEntries(
  entries: ReturnType<typeof waWebhookSchema.parse>['entry'],
) {
  for (const entry of entries) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue
      const { value } = change
      const phoneNumberId = value.metadata.phone_number_id

      for (const msg of value.messages ?? []) {
        // Ignorar tipos no soportados
        if (!['text', 'image', 'audio', 'video', 'document'].includes(msg.type)) continue

        const contactPhone = `+${msg.from}` // normalizar a E.164 con +
        const contactName = value.contacts?.find((c) => c.wa_id === msg.from)?.profile.name ?? 'Desconocido'

        try {
          await handleInboundMessage({ msg, contactPhone, contactName, phoneNumberId })
        } catch (err) {
          console.error('[webhook] error procesando mensaje:', msg.id, err)
        }
      }
    }
  }
}

async function handleInboundMessage(params: {
  msg: WaMessage
  contactPhone: string
  contactName: string
  phoneNumberId: string
}) {
  const { msg, contactPhone, contactName, phoneNumberId } = params

  // Deduplicar por wa_message_id (Meta puede reintentar)
  const existing = await db.query.messages.findFirst({
    where: eq(messages.waMessageId, msg.id),
    columns: { id: true },
  })
  if (existing) return

  // Buscar o crear contacto
  let contact = await db.query.contacts.findFirst({ where: eq(contacts.phone, contactPhone) })
  if (!contact) {
    const [c] = await db
      .insert(contacts)
      .values({ name: contactName, phone: contactPhone })
      .returning()
    contact = c!
  }

  // Buscar lead abierto de este contacto, o crear uno nuevo
  let conversation = await db.query.conversations.findFirst({
    where: eq(conversations.waContactPhone, contactPhone),
    with: { lead: true },
  })

  let leadId: string
  let conversationId: string
  let assignedTo: string | null = null

  if (conversation && conversation.lead.isOpen) {
    leadId = conversation.lead.id
    conversationId = conversation.id
    assignedTo = conversation.lead.assignedTo ?? null
  } else {
    // Nuevo lead — asignar a la primera etapa del pipeline
    const firstStage = await db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.slug, 'nuevo'),
    }) ?? await db.query.pipelineStages.findFirst({
      orderBy: [asc(pipelineStages.position)],
    })

    if (!firstStage) {
      console.error('[webhook] No hay etapas configuradas en el pipeline')
      return
    }

    assignedTo = await assignNextAgent()

    const [newLead] = await db
      .insert(leads)
      .values({
        contactId: contact.id,
        stageId: firstStage.id,
        source: 'whatsapp',
        botEnabled: true,
        assignedTo,
      })
      .returning()

    await db.insert(activityLog).values({
      leadId: newLead!.id,
      action: 'lead_created',
      metadata: { source: 'whatsapp', phone: contactPhone },
    })

    const [newConv] = await db
      .insert(conversations)
      .values({
        leadId: newLead!.id,
        waPhoneNumberId: phoneNumberId,
        waContactPhone: contactPhone,
      })
      .returning()

    leadId = newLead!.id
    conversationId = newConv!.id
  }

  // Determinar tipo de contenido
  const contentType = msgContentType(msg.type)
  const body = msg.type === 'text' ? (msg.text?.body ?? null) : null
  const sentAt = new Date(parseInt(msg.timestamp) * 1000)

  // Guardar mensaje
  const [savedMsg] = await db
    .insert(messages)
    .values({
      conversationId,
      waMessageId: msg.id,
      direction: 'inbound',
      senderType: 'contact',
      contentType,
      body,
      isRead: false,
      sentAt,
    })
    .returning()

  // Actualizar metadatos de conversación + incrementar unread atómicamente
  await db.execute(
    sql`UPDATE conversations SET last_message_at = ${sentAt}, unread_count = unread_count + 1, updated_at = NOW() WHERE id = ${conversationId}`,
  )

  // Actualizar last_contacted_at en el lead
  await db.update(leads)
    .set({ lastContactedAt: sentAt, updatedAt: new Date() })
    .where(eq(leads.id, leadId))

  // Procesar media en background (no bloquea)
  const mediaId = getMediaId(msg)
  if (mediaId && savedMsg) {
    const mimeType = getMediaMimeType(msg) ?? 'application/octet-stream'
    void persistInboundMedia({
      waMediaId: mediaId,
      messageId: savedMsg.id,
      conversationId,
      mimeType,
      filename: getMediaFilename(msg),
    }).catch((err) => console.error('[webhook] error guardando media:', err))
  }

  // Emitir evento SSE para actualizar bandeja y chat en tiempo real
  emitLeadEvent({
    type: 'new_message',
    conversationId,
    leadId,
    assignedTo,
    direction: 'inbound',
  })

  // Activar bot si está habilitado
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    columns: { botEnabled: true, botQualified: true },
  })

  if (lead?.botEnabled && !lead.botQualified && msg.type === 'text') {
    void processBotTurn({
      leadId,
      conversationId,
      inboundMessageId: savedMsg!.id,
      contactPhone,
    }).catch((err) => console.error('[bot] error en processBotTurn:', err))
  }
}

function msgContentType(type: string): 'text' | 'image' | 'audio' | 'video' | 'document' {
  const map: Record<string, 'text' | 'image' | 'audio' | 'video' | 'document'> = {
    text: 'text', image: 'image', audio: 'audio', video: 'video', document: 'document',
  }
  return map[type] ?? 'text'
}

function getMediaId(msg: WaMessage): string | null {
  return msg.image?.id ?? msg.audio?.id ?? msg.video?.id ?? msg.document?.id ?? null
}

function getMediaMimeType(msg: WaMessage): string | null {
  return msg.image?.mime_type ?? msg.audio?.mime_type ?? msg.video?.mime_type ?? msg.document?.mime_type ?? null
}

function getMediaFilename(msg: WaMessage): string | null {
  return msg.document?.filename ?? null
}
