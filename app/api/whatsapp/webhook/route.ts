export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { verifyWhatsAppSignature } from '@/lib/whatsapp/webhook-validate'
import { estadoMasAvanzado } from '@/lib/whatsapp/estado-mensaje'
import { cancelarSeguimientoPropuestaPorRespuesta, manejarRespuestaClienteIndagacion } from '@/lib/followup/engine'
import { ultimos10 } from '@/lib/whatsapp/phone'
import { getWaSecrets } from '@/lib/whatsapp/client'
import { waWebhookSchema, type WaWebhookPayload, type WaMessage } from '@/lib/validations/webhook'
import { db } from '@/db'
import { leads, contacts, conversations, messages, activityLog, pipelineStages, clientes } from '@/db/schema'
import { eq, and, asc, desc, isNull, sql } from 'drizzle-orm'
import { programarTurnoBot } from '@/lib/claude/bot-debounce'
import { persistInboundMedia } from '@/lib/whatsapp/media'
import { waMediaType } from '@/lib/whatsapp/mime'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { handleAdminMenu } from '@/lib/whatsapp/admin-menu'
import { ensureConversacionParaCliente } from '@/lib/inbox/ensure-conversacion'

// ─── Admin routing helpers ────────────────────────────────────────────────────

function isAdminPhone(phone: string): boolean {
  const raw = process.env['ADMIN_WHATSAPP_NUMBERS'] ?? ''
  if (!raw.trim()) return false
  return raw.split(',').map((n) => n.trim()).includes(phone)
}

function getInteractiveReplyId(msg: WaMessage): string | null {
  return msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id ?? null
}

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

      // Avisos de entrega/lectura de mensajes salientes (tildes del chat)
      for (const st of value.statuses ?? []) {
        try {
          await handleMessageStatus(st)
        } catch (err) {
          console.error('[webhook] error procesando status:', st.id, err)
        }
      }

      for (const msg of value.messages ?? []) {
        const contactPhone = `+${msg.from}` // normalizar a E.164 con +
        const contactName = value.contacts?.find((c) => c.wa_id === msg.from)?.profile.name ?? 'Desconocido'

        // Admin: interceptar ANTES de cualquier lógica de lead/bot
        if (isAdminPhone(contactPhone)) {
          const interactiveId = getInteractiveReplyId(msg)
          const adminInput = interactiveId ?? (msg.type === 'text' ? (msg.text?.body ?? '') : '')
          if (adminInput) {
            try {
              await handleAdminMenu(contactPhone, adminInput)
            } catch (err) {
              console.error('[webhook] error en handleAdminMenu:', err)
            }
          }
          continue // no crear lead ni activar bot para admins
        }

        // Ignorar tipos no soportados para no-admins
        if (!['text', 'image', 'audio', 'video', 'document'].includes(msg.type)) continue

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

  // Ruteo: cliente tiene prioridad sobre lead. `clientes.telefono` es texto
  // libre ("+54 9 11 5755-7499", "011 4162-8140"...), así que se compara por
  // los últimos 10 dígitos (área + número) en vez de por igualdad.
  const nacional = ultimos10(contactPhone)
  const cliente = nacional
    ? await db.query.clientes.findFirst({
        where: and(
          isNull(clientes.deletedAt),
          sql`right(regexp_replace(${clientes.telefono}, '[^0-9]', '', 'g'), 10) = ${nacional}`,
        ),
        columns: { id: true, asignadoA: true },
        orderBy: [desc(clientes.createdAt)],
      })
    : undefined

  if (cliente) {
    await handleInboundFromCliente({ msg, contactPhone, phoneNumberId, cliente })
    return
  }

  // Flujo lead (teléfono desconocido o sin cliente)
  // Buscar o crear contacto
  let contact = await db.query.contacts.findFirst({ where: eq(contacts.phone, contactPhone) })
  if (!contact) {
    const [c] = await db
      .insert(contacts)
      .values({ name: contactName, phone: contactPhone })
      .returning()
    contact = c!
  }

  // Buscar conversación cuyo lead esté vigente (no borrado y abierto)
  const [convRow] = await db
    .select({
      conversationId: conversations.id,
      leadId: leads.id,
      assignedTo: leads.assignedTo,
    })
    .from(conversations)
    .innerJoin(leads, eq(conversations.leadId, leads.id))
    .where(
      and(
        eq(conversations.waContactPhone, contactPhone),
        isNull(leads.deletedAt),
        eq(leads.isOpen, true),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1)

  let leadId: string
  let conversationId: string
  let assignedTo: string | null = null

  if (convRow) {
    leadId = convRow.leadId
    conversationId = convRow.conversationId
    assignedTo = convRow.assignedTo ?? null
  } else {
    const firstStage = await db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.slug, 'nuevo'),
    }) ?? await db.query.pipelineStages.findFirst({
      orderBy: [asc(pipelineStages.position)],
    })

    if (!firstStage) {
      console.error('[webhook] No hay etapas configuradas en el pipeline')
      return
    }

    // ¿Es alguien que ya tuvo un lead (cerrado como perdido, ganado, etc.) y vuelve a escribir?
    // Se crea un lead nuevo pero se conserva la conversación: el chat mantiene el historial
    // y el bot arranca sabiendo lo que ya se habló.
    const [convPrevia] = await db
      .select({
        conversationId: conversations.id,
        leadId: leads.id,
        leadUpdatedAt: leads.updatedAt,
        notes: leads.notes,
        productInterest: leads.productInterest,
      })
      .from(conversations)
      .innerJoin(leads, eq(conversations.leadId, leads.id))
      .where(and(eq(conversations.waContactPhone, contactPhone), isNull(leads.deletedAt)))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(1)

    const diasDesdeCierre = convPrevia
      ? Math.max(0, Math.round((Date.now() - convPrevia.leadUpdatedAt.getTime()) / 86_400_000))
      : null
    const notasReapertura = convPrevia
      ? `Volvió a escribir por WhatsApp ${diasDesdeCierre} día(s) después de cerrarse el lead anterior. La conversación conserva el historial previo.`
      : null

    const [newLead] = await db
      .insert(leads)
      .values({
        contactId: contact.id,
        stageId: firstStage.id,
        source: 'whatsapp',
        botEnabled: true,
        ...(convPrevia ? { productInterest: convPrevia.productInterest, notes: notasReapertura } : {}),
      })
      .returning()

    await db.insert(activityLog).values({
      leadId: newLead!.id,
      action: 'lead_created',
      metadata: { source: 'whatsapp', phone: contactPhone, ...(convPrevia ? { reaperturaDeLead: convPrevia.leadId } : {}) },
    })

    if (convPrevia) {
      await db
        .update(conversations)
        .set({ leadId: newLead!.id, waPhoneNumberId: phoneNumberId, updatedAt: new Date() })
        .where(eq(conversations.id, convPrevia.conversationId))
      await db.insert(messages).values({
        conversationId: convPrevia.conversationId,
        direction: 'outbound',
        senderType: 'system',
        contentType: 'internal_note',
        body: notasReapertura!,
        isRead: true,
        sentAt: new Date(),
      })
      conversationId = convPrevia.conversationId
    } else {
      const [newConv] = await db
        .insert(conversations)
        .values({
          leadId: newLead!.id,
          waPhoneNumberId: phoneNumberId,
          waContactPhone: contactPhone,
        })
        .returning()
      conversationId = newConv!.id
    }

    leadId = newLead!.id
  }

  const contentType = msgContentType(msg.type)
  const body = msg.type === 'text' ? (msg.text?.body ?? null) : null
  const sentAt = new Date(parseInt(msg.timestamp) * 1000)

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

  await db.execute(
    sql`UPDATE conversations SET last_message_at = ${sentAt.toISOString()}, unread_count = unread_count + 1, updated_at = NOW() WHERE id = ${conversationId}`,
  )

  await db.update(leads)
    .set({ lastContactedAt: sentAt, updatedAt: new Date() })
    .where(eq(leads.id, leadId))

  // Seguimientos: la persona respondió. Propuesta → se cancela. Indagación → se cancela,
  // salvo que sea un "más adelante" al mensaje final, que cierra el lead como perdido.
  try {
    await cancelarSeguimientoPropuestaPorRespuesta(leadId)
    await manejarRespuestaClienteIndagacion(leadId, body ?? '')
  } catch (err) {
    console.error('[webhook] error procesando seguimientos al recibir mensaje:', err)
  }

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

  await publishCrmEvent({
    type: 'new_message',
    conversationId,
    leadId,
    assignedTo,
    direction: 'inbound',
  })

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    columns: { botEnabled: true, botQualified: true },
  })

  if (lead?.botEnabled && !lead.botQualified && msg.type === 'text') {
    // No responde ya: espera unos segundos (Ajustes → Bot) por si la persona
    // manda varios mensajes seguidos, y contesta una sola vez al conjunto.
    void programarTurnoBot({
      leadId,
      conversationId,
      inboundMessageId: savedMsg!.id,
      contactPhone,
    }).catch((err) => console.error('[bot] error programando el turno del bot:', err))
  }
}

async function handleInboundFromCliente(params: {
  msg: WaMessage
  contactPhone: string
  phoneNumberId: string
  cliente: { id: string; asignadoA: string | null }
}) {
  const { msg, contactPhone, phoneNumberId, cliente } = params

  const { conversationId } = await ensureConversacionParaCliente(cliente.id)

  // Actualizar waPhoneNumberId si no estaba seteado
  await db.execute(
    sql`UPDATE conversations SET wa_phone_number_id = COALESCE(wa_phone_number_id, ${phoneNumberId}), wa_contact_phone = COALESCE(wa_contact_phone, ${contactPhone}) WHERE id = ${conversationId}`,
  )

  const contentType = msgContentType(msg.type)
  const body = msg.type === 'text' ? (msg.text?.body ?? null) : null
  const sentAt = new Date(parseInt(msg.timestamp) * 1000)

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

  await db.execute(
    sql`UPDATE conversations SET last_message_at = ${sentAt.toISOString()}, unread_count = unread_count + 1, updated_at = NOW() WHERE id = ${conversationId}`,
  )

  const mediaId = getMediaId(msg)
  if (mediaId && savedMsg) {
    const mimeType = getMediaMimeType(msg) ?? 'application/octet-stream'
    void persistInboundMedia({
      waMediaId: mediaId,
      messageId: savedMsg.id,
      conversationId,
      mimeType,
      filename: getMediaFilename(msg),
    }).catch((err) => console.error('[webhook] error guardando media (cliente):', err))
  }

  await publishCrmEvent({
    type: 'new_message',
    conversationId,
    leadId: null,
    assignedTo: cliente.asignadoA,
    direction: 'inbound',
  })
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

type WaStatus = NonNullable<WaWebhookPayload['entry'][number]['changes'][number]['value']['statuses']>[number]

/**
 * Guarda el estado de entrega (sent → delivered → read / failed) del mensaje
 * saliente identificado por wa_message_id y avisa al chat por SSE.
 */
async function handleMessageStatus(st: WaStatus) {
  const msg = await db.query.messages.findFirst({
    where: eq(messages.waMessageId, st.id),
    columns: { id: true, conversationId: true, waStatus: true },
    with: {
      conversation: {
        columns: { leadId: true },
        with: {
          lead: { columns: { assignedTo: true } },
          cliente: { columns: { asignadoA: true } },
        },
      },
    },
  })
  if (!msg) return

  const nuevo = estadoMasAvanzado(msg.waStatus, st.status)
  if (!nuevo || nuevo === msg.waStatus) return

  const err = st.errors?.[0]
  const waError = nuevo === 'failed'
    ? [err?.title, err?.message, err?.error_data?.details].filter(Boolean).join(' — ') || `Error ${err?.code ?? ''}`.trim()
    : null

  await db.update(messages)
    .set({
      waStatus: nuevo,
      waStatusAt: new Date(parseInt(st.timestamp) * 1000),
      waError,
    })
    .where(eq(messages.id, msg.id))

  const conv = msg.conversation
  await publishCrmEvent({
    type: 'message_status',
    conversationId: msg.conversationId,
    leadId: conv?.leadId ?? null,
    assignedTo: conv?.lead?.assignedTo ?? conv?.cliente?.asignadoA ?? null,
    status: nuevo,
  })
}
