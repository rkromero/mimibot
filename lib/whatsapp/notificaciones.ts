import { db } from '@/db'
import { conversations, messages, whatsappConfig, whatsappTemplates } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { sendTemplateMessage, sendTextMessage, buildBodyComponents } from '@/lib/whatsapp/client'
import { ensureConversacionParaCliente } from '@/lib/inbox/ensure-conversacion'
import { estaDentroDe24h } from '@/lib/whatsapp/ventana'
import { resolveTemplateVariables, applyTemplateValues, type TemplateVariable } from '@/lib/whatsapp/variables'

function toTemplateVariables(raw: unknown): TemplateVariable[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (v): v is TemplateVariable =>
      typeof v === 'object' && v !== null && 'index' in v && 'source' in v && 'sample' in v,
  )
}

function fallbackPedidoVariables(bodyText: string): TemplateVariable[] {
  const vars: TemplateVariable[] = []
  if (bodyText.includes('{{1}}')) vars.push({ index: 1, source: 'cliente_nombre', sample: 'Cliente' })
  if (bodyText.includes('{{2}}')) vars.push({ index: 2, source: 'pedido_numero', sample: 'ABC12345' })
  if (bodyText.includes('{{3}}')) vars.push({ index: 3, source: 'pedido_total', sample: '$1.000,00' })
  return vars
}

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

    let convResult: { conversationId: string; clienteId: string }
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
        cliente: {
          columns: { nombre: true, apellido: true },
        },
        lead: {
          columns: { id: true },
          with: { contact: { columns: { name: true } } },
        },
      },
    })

    if (!conv?.waContactPhone) return

    const contactName =
      conv.cliente
        ? `${conv.cliente.nombre} ${conv.cliente.apellido}`.trim()
        : (conv.lead?.contact?.name ?? '')
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
      columns: { bodyText: true, variables: true },
    })

    const configuredVars = toTemplateVariables(tmpl?.variables)
    const varsToUse = configuredVars.length > 0
      ? configuredVars
      : fallbackPedidoVariables(tmpl?.bodyText ?? '')

    const resolvedValues = resolveTemplateVariables(varsToUse, {
      clienteNombre: contactName,
      pedidoNumero: pedidoNum,
      pedidoTotal: totalStr,
    })

    const resolvedBody = tmpl?.bodyText
      ? applyTemplateValues(tmpl.bodyText, resolvedValues).trim()
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
      const components = buildBodyComponents(resolvedValues)
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
