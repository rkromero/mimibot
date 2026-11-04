/**
 * Recordatorio de seña: la parte que toca la base. Las reglas están en `sena.ts`.
 *
 * Corre en cada vuelta del programador de seguimientos. Candidatos: pedidos de
 * venta todavía sin producir (pendiente / pendiente de aprobación), sin ningún
 * pago ni comprobante, con proforma emitida hace menos de 10 días, de un
 * cliente que vino de un lead del chat y que no tiene otras ventas pagadas o
 * entregadas (primer pedido). Cada recordatorio queda en el activity_log del
 * lead (reason 'sena' + pedidoId), que es lo que se cuenta para no repetir.
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { activityLog, contacts, leads, messages, whatsappTemplates } from '@/db/schema'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { buildBodyComponents, sendTemplateMessage, sendTextMessage } from '@/lib/whatsapp/client'
import { primerNombre } from '@/lib/whatsapp/variables'
import { estaDentroDe24h } from '@/lib/whatsapp/ventana'
import { OFFSET_ARGENTINA_HORAS } from './indagacion'
import { REASON_SENA, TEMPLATE_SENA, decidirRecordatorioSena, renderTextoSena } from './sena'

type FilaCandidato = {
  pedido_id: string
  conversation_id: string
  lead_id: string
  wa_contact_phone: string
  proforma_at: Date | string
  enviados: number | string
  cortado: boolean
  archivo: boolean
  ultimo_humano_at: Date | string | null
}

async function candidatos(): Promise<FilaCandidato[]> {
  const rows = await db.execute<FilaCandidato>(sql`
    WITH base AS (
      SELECT p.id AS pedido_id, MIN(d.emitido_at) AS proforma_at
      FROM pedidos p
      JOIN documentos_emitidos d ON d.pedido_id = p.id AND d.tipo = 'proforma'
      WHERE p.deleted_at IS NULL
        AND p.tipo = 'venta'
        AND p.estado IN ('pendiente', 'pendiente_aprobacion')
        AND p.estado_pago = 'impago'
        AND p.monto_pagado = 0
        AND p.comprobante_pago_url IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM pedidos p2
          WHERE p2.cliente_id = p.cliente_id AND p2.id <> p.id AND p2.deleted_at IS NULL
            AND p2.tipo = 'venta' AND (p2.estado = 'entregado' OR p2.monto_pagado > 0)
        )
      GROUP BY p.id
      HAVING MIN(d.emitido_at) > NOW() - INTERVAL '10 days'
    )
    SELECT DISTINCT ON (b.pedido_id)
      b.pedido_id, cv.id AS conversation_id, cv.lead_id, cv.wa_contact_phone, b.proforma_at,
      (SELECT COUNT(*) FROM activity_log a
        WHERE a.lead_id = cv.lead_id AND a.action = 'follow_up_sent'
          AND a.metadata->>'reason' = ${REASON_SENA} AND a.metadata->>'pedidoId' = b.pedido_id::text) AS enviados,
      EXISTS (SELECT 1 FROM activity_log a
        WHERE a.lead_id = cv.lead_id AND a.action = 'follow_up_cancelled'
          AND a.metadata->>'reason' = ${REASON_SENA} AND a.metadata->>'pedidoId' = b.pedido_id::text) AS cortado,
      EXISTS (SELECT 1 FROM messages m
        WHERE m.conversation_id = cv.id AND m.direction = 'inbound'
          AND m.content_type IN ('image', 'document') AND m.sent_at > b.proforma_at) AS archivo,
      (SELECT MAX(m.sent_at) FROM messages m
        WHERE m.conversation_id = cv.id
          AND (m.direction = 'inbound' OR (m.sender_type = 'agent' AND m.content_type NOT IN ('template', 'internal_note')))
      ) AS ultimo_humano_at
    FROM base b
    JOIN pedidos p ON p.id = b.pedido_id
    JOIN conversations cv ON cv.cliente_id = p.cliente_id AND cv.lead_id IS NOT NULL AND cv.wa_contact_phone IS NOT NULL
    ORDER BY b.pedido_id, cv.last_message_at DESC NULLS LAST
  `)
  return Array.from(rows as Iterable<FilaCandidato>)
}

/** Manda los recordatorios de seña que tocan ahora. Devuelve cuántos salieron. */
export async function procesarRecordatoriosSena(): Promise<number> {
  const config = await db.query.followUpConfig.findFirst()
  if (config && !config.isEnabled) return 0
  const horario = { desde: config?.horarioDesde ?? 8, hasta: config?.horarioHasta ?? 22, offsetHoras: OFFSET_ARGENTINA_HORAS }

  let enviados = 0
  for (const c of await candidatos()) {
    try {
      const accion = decidirRecordatorioSena(
        {
          proformaAt: new Date(c.proforma_at),
          recordatoriosEnviados: Number(c.enviados),
          cortado: c.cortado,
          mandoArchivoDespuesDeProforma: c.archivo,
          ultimoMensajeHumanoAt: c.ultimo_humano_at ? new Date(c.ultimo_humano_at) : null,
        },
        new Date(),
        horario,
      )
      if (accion.tipo === 'esperar') continue
      if (accion.tipo === 'cortar') {
        await db.insert(activityLog).values({
          leadId: c.lead_id,
          action: 'follow_up_cancelled',
          metadata: { reason: REASON_SENA, pedidoId: c.pedido_id, motivo: accion.motivo },
        })
        continue
      }
      if (await enviarRecordatorio(c, accion.paso)) enviados++
    } catch (err) {
      console.error(`[followup] recordatorio de seña del pedido ${c.pedido_id}:`, err)
    }
  }
  return enviados
}

async function enviarRecordatorio(c: FilaCandidato, paso: number): Promise<boolean> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, c.lead_id), columns: { contactId: true, assignedTo: true } })
  const contact = lead
    ? await db.query.contacts.findFirst({ where: eq(contacts.id, lead.contactId), columns: { name: true } })
    : null
  const nombre = primerNombre(contact?.name)
  const registrar = (metadata: Record<string, unknown>) =>
    db.insert(activityLog).values({
      leadId: c.lead_id,
      action: 'follow_up_sent',
      metadata: { reason: REASON_SENA, pedidoId: c.pedido_id, paso, ...metadata },
    })

  let body: string
  let contentType: 'text' | 'template'
  let waMessageId: string

  if (await estaDentroDe24h(c.conversation_id)) {
    body = renderTextoSena(nombre)
    contentType = 'text'
    waMessageId = await sendTextMessage(c.wa_contact_phone, body)
  } else {
    const tmpl = await db.query.whatsappTemplates.findFirst({
      where: and(eq(whatsappTemplates.name, TEMPLATE_SENA), eq(whatsappTemplates.status, 'APPROVED')),
      columns: { bodyText: true, language: true },
    })
    if (!tmpl) {
      // Sin plantilla: aviso al vendedor (una vez por paso, cuenta como hecho)
      await db.insert(messages).values({
        conversationId: c.conversation_id,
        direction: 'outbound',
        senderType: 'system',
        contentType: 'internal_note',
        body: 'La proforma salió y todavía no entró la seña. No salió el recordatorio automático porque la plantilla ' +
          '"recordatorio_sena" no está aprobada en WhatsApp: recordale a mano.',
        isRead: true,
        sentAt: new Date(),
      })
      await registrar({ motivo: 'sin_plantilla' })
      await publishCrmEvent({ type: 'new_message', conversationId: c.conversation_id, leadId: c.lead_id, assignedTo: lead?.assignedTo ?? null, direction: 'outbound' })
      return false
    }
    const valores = [nombre || 'cómo estás']
    body = tmpl.bodyText.replaceAll('{{1}}', valores[0]!).trim()
    contentType = 'template'
    waMessageId = await sendTemplateMessage(c.wa_contact_phone, TEMPLATE_SENA, tmpl.language, buildBodyComponents(valores))
  }

  await db.insert(messages).values({
    conversationId: c.conversation_id,
    waMessageId,
    direction: 'outbound',
    senderType: 'system',
    contentType,
    body,
    isRead: true,
    sentAt: new Date(),
  })
  await db.execute(sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${c.conversation_id}`)
  await registrar({ usedTemplate: contentType === 'template' })
  await publishCrmEvent({ type: 'new_message', conversationId: c.conversation_id, leadId: c.lead_id, assignedTo: lead?.assignedTo ?? null, direction: 'outbound' })
  return true
}

