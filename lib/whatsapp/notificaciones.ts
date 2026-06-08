import { db } from '@/db'
import { conversations, messages, whatsappConfig, whatsappTemplates } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { sendTemplateMessage, sendTextMessage } from '@/lib/whatsapp/client'
import { ensureConversacionParaCliente } from '@/lib/inbox/ensure-conversacion'
import { estaDentroDe24h } from '@/lib/whatsapp/ventana'

export async function notificarPedidoCreado(
  clienteId: string,
  pedidoId: string,
  total: string,
): Promise<void> {
  try {
    const config = await db.query.whatsappConfig.findFirst({
      columns: {
        pedidoCreadoEnabled: true,
        pedidoCreadoTemplateName: true,
        pedidoCreadoTemplateLang: true,
      },
    })

    if (!config?.pedidoCreadoEnabled || !config.pedidoCreadoTemplateName) return

    let convResult: { leadId: string; conversationId: string }
    try {
      convResult = await ensureConversacionParaCliente(clienteId)
    } catch (err) {
      console.warn('[notificarPedidoCreado] No se pudo obtener conversación:', err)
      return
    }

    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, convResult.conversationId),
      columns: { waContactPhone: true },
      with: {
        lead: {
          columns: { id: true },
          with: { contact: { columns: { name: true } } },
        },
      },
    })

    if (!conv?.waContactPhone) return

    const contactName = conv.lead?.contact?.name ?? ''
    const pedidoNum = pedidoId.slice(0, 8).toUpperCase()
    const totalStr = `$${parseFloat(total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

    const templateName = config.pedidoCreadoTemplateName
    const templateLang = config.pedidoCreadoTemplateLang ?? 'es'

    const dentro24h = await estaDentroDe24h(convResult.conversationId)

    const tmpl = await db.query.whatsappTemplates.findFirst({
      where: dentro24h
        ? and(eq(whatsappTemplates.name, templateName), eq(whatsappTemplates.language, templateLang))
        : and(
            eq(whatsappTemplates.name, templateName),
            eq(whatsappTemplates.language, templateLang),
            eq(whatsappTemplates.status, 'APPROVED'),
          ),
      columns: { bodyText: true },
    })

    const resolvedBody = tmpl?.bodyText
      ? tmpl.bodyText
          .replace(/\{\{1\}\}/g, contactName)
          .replace(/\{\{2\}\}/g, pedidoNum)
          .replace(/\{\{3\}\}/g, totalStr)
          .trim()
      : `Tu pedido #${pedidoNum} por ${totalStr} fue confirmado.`

    let waMessageId: string | null = null
    let contentType: 'text' | 'template'

    if (dentro24h) {
      contentType = 'text'
      try {
        waMessageId = await sendTextMessage(conv.waContactPhone, resolvedBody)
      } catch (err) {
        console.error('[notificarPedidoCreado] Error enviando texto libre:', err)
      }
    } else {
      contentType = 'template'
      const bodyText = tmpl?.bodyText ?? ''
      const params: { type: 'text'; text: string }[] = []
      if (bodyText.includes('{{1}}')) params.push({ type: 'text', text: contactName })
      if (bodyText.includes('{{2}}')) params.push({ type: 'text', text: pedidoNum })
      if (bodyText.includes('{{3}}')) params.push({ type: 'text', text: totalStr })
      const components = params.length > 0
        ? [{ type: 'body' as const, parameters: params }]
        : undefined

      try {
        waMessageId = await sendTemplateMessage(conv.waContactPhone, templateName, templateLang, components)
      } catch (err) {
        console.error('[notificarPedidoCreado] Error enviando plantilla:', err)
      }
    }

    await db.insert(messages).values({
      conversationId: convResult.conversationId,
      direction: 'outbound',
      senderType: 'system',
      contentType,
      body: resolvedBody,
      isRead: true,
      sentAt: new Date(),
      ...(waMessageId ? { waMessageId } : {}),
    })

    await db.execute(
      sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${convResult.conversationId}`,
    )
  } catch (err) {
    console.error('[notificarPedidoCreado] Error inesperado:', err)
  }
}
