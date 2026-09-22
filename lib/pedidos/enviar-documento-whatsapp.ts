/**
 * Envío de la proforma (o remito) de un pedido por el WhatsApp embebido: el
 * PDF va como documento a la conversación del cliente, igual que los adjuntos
 * del inbox y la propuesta del cotizador. Queda en el chat con sus tildes.
 *
 * Si el cliente escribió en las últimas 24 hs va como documento suelto. Si
 * no, WhatsApp solo deja mandar plantillas: se usa la plantilla de proforma
 * configurada en Ajustes → WhatsApp (encabezado de tipo documento) con el PDF
 * adjunto. Sin plantilla configurada, se avisa qué hacer.
 *
 * Orden de las verificaciones: primero teléfono, ventana y plantilla, después
 * se emite el documento. Así una conversación que no se puede usar no gasta
 * un número de proforma.
 */
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { clientes, whatsappConfig, whatsappTemplates } from '@/db/schema'
import { ValidationError } from '@/lib/errors'
import { nombrePersona } from '@/lib/clientes/nombre'
import { emitirDocumento } from '@/lib/pdf/pdf.service'
import { etiquetaDocumento, padNumeroDocumento, type TipoDocumentoPedido } from '@/lib/pdf/nombre-archivo'
import { estaDentroDe24h } from '@/lib/whatsapp/ventana'
import {
  applyTemplateValues,
  resolveTemplateVariables,
  toTemplateVariables,
  type TemplateVariable,
} from '@/lib/whatsapp/variables'
import {
  destinoDelCliente,
  enviarArchivoAlCliente,
  VentanaCerradaError,
  type EnvioArchivoResult,
  type ModoEnvio,
} from './enviar-archivo-cliente'

export { MENSAJE_VENTANA_CERRADA, VentanaCerradaError, EnvioWhatsappError } from './enviar-archivo-cliente'

export const MENSAJE_VENTANA_CERRADA_SIN_PLANTILLA =
  'Pasaron más de 24 hs desde el último mensaje del cliente: WhatsApp solo deja mandar plantillas. ' +
  'Elegí una plantilla de proforma en Ajustes → WhatsApp para mandarla igual, ' +
  'o abrí el chat, mandale una plantilla de apertura y cuando responda volvé a intentar.'

export type EnviarDocumentoWhatsappParams = {
  pedidoId: string
  clienteId: string
  tipo: TipoDocumentoPedido
  userId: string
  /** Quien manda; va en la variable "vendedor" de la plantilla. */
  vendedorNombre?: string | null
  /** Total del pedido ("1234.50"); va en la variable "total" de la plantilla. */
  pedidoTotal?: string | null
}

export type EnviarDocumentoWhatsappResult = EnvioArchivoResult & {
  numero: number
  nombreArchivo: string
  /** true si salió como plantilla (ventana de 24 hs cerrada). */
  sentAsTemplate: boolean
}

/** Texto que acompaña al PDF en el chat: "Proforma 000141". */
export function captionDocumento(tipo: TipoDocumentoPedido, numero: number): string {
  return `${etiquetaDocumento(tipo)} ${padNumeroDocumento(numero)}`
}

/** "$ 1.234,50" para la variable de total de la plantilla. */
export function formatoTotalPlantilla(total: string | null | undefined): string | undefined {
  if (total == null || total === '') return undefined
  const n = Number(total)
  if (!Number.isFinite(n)) return undefined
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
}

/**
 * Variables del cuerpo de la plantilla. Si se importó de Meta sin configurar
 * las fuentes, van por posición: {{1}} cliente, {{2}} nº de proforma,
 * {{3}} total, {{4}} vendedor.
 */
export function variablesProforma(bodyText: string, rawVariables: unknown): TemplateVariable[] {
  const configuradas = toTemplateVariables(rawVariables)
  if (configuradas.length > 0) return configuradas
  const porPosicion: Array<{ source: string; sample: string }> = [
    { source: 'cliente_nombre', sample: 'Cliente' },
    { source: 'pedido_numero', sample: '000000' },
    { source: 'pedido_total', sample: '$ 0' },
    { source: 'vendedor_nombre', sample: 'el equipo' },
  ]
  return porPosicion
    .map((v, i) => ({ index: i + 1, ...v }))
    .filter((v) => bodyText.includes(`{{${v.index}}}`))
}

type PlantillaProforma = {
  templateName: string
  templateLang: string
  bodyText: string
  variables: unknown
}

/**
 * Con la ventana cerrada: la plantilla configurada, aprobada y con encabezado
 * de documento. Se valida ANTES de emitir la proforma para no gastar número.
 */
async function plantillaProforma(): Promise<PlantillaProforma> {
  const config = await db.query.whatsappConfig.findFirst({
    columns: { proformaTemplateName: true, proformaTemplateLang: true },
  })
  const templateName = config?.proformaTemplateName?.trim() || null
  const templateLang = config?.proformaTemplateLang?.trim() || 'es'
  if (!templateName) throw new VentanaCerradaError(MENSAJE_VENTANA_CERRADA_SIN_PLANTILLA)

  const tmpl = await db.query.whatsappTemplates.findFirst({
    where: and(
      eq(whatsappTemplates.name, templateName),
      eq(whatsappTemplates.language, templateLang),
      eq(whatsappTemplates.status, 'APPROVED'),
    ),
    columns: { bodyText: true, variables: true, headerFormat: true },
  })
  if (!tmpl) {
    throw new ValidationError(
      `La plantilla de proforma "${templateName}" (${templateLang}) no está aprobada en WhatsApp. ` +
        'Cuando Meta la apruebe, sincronizá en Ajustes → WhatsApp → Plantillas.',
    )
  }
  if (tmpl.headerFormat !== 'DOCUMENT') {
    throw new ValidationError(
      `La plantilla "${templateName}" no tiene encabezado de documento, así que la proforma no se puede adjuntar. ` +
        'Creala en el Administrador de WhatsApp de Meta con encabezado "Documento" y sincronizá las plantillas.',
    )
  }
  return { templateName, templateLang, bodyText: tmpl.bodyText, variables: tmpl.variables }
}

export async function enviarDocumentoPorWhatsapp(
  params: EnviarDocumentoWhatsappParams,
): Promise<EnviarDocumentoWhatsappResult> {
  const { pedidoId, clienteId, tipo, userId } = params

  // Conversación del cliente (la del lead si vino del chat; se crea si no hay).
  const destino = await destinoDelCliente(clienteId)
  const ventanaAbierta = await estaDentroDe24h(destino.conversationId)
  const plantilla = ventanaAbierta ? null : await plantillaProforma()

  const { buffer, numero, nombreArchivo } = await emitirDocumento(pedidoId, tipo, userId)
  const caption = captionDocumento(tipo, numero)

  let modo: ModoEnvio = { tipo: 'suelto' }
  if (plantilla) {
    const cliente = await db.query.clientes.findFirst({
      where: eq(clientes.id, clienteId),
      columns: { nombre: true, apellido: true },
    })
    const valores = resolveTemplateVariables(variablesProforma(plantilla.bodyText, plantilla.variables), {
      clienteNombre: cliente ? nombrePersona(cliente) : undefined,
      vendedorNombre: params.vendedorNombre ?? undefined,
      pedidoNumero: padNumeroDocumento(numero),
      pedidoTotal: formatoTotalPlantilla(params.pedidoTotal),
    })
    modo = {
      tipo: 'plantilla',
      templateName: plantilla.templateName,
      templateLang: plantilla.templateLang,
      headerFormat: 'DOCUMENT',
      valores,
      body: applyTemplateValues(plantilla.bodyText, valores).trim(),
    }
  }

  const r = await enviarArchivoAlCliente(
    destino,
    { buffer, mimeType: 'application/pdf', filename: nombreArchivo, caption },
    userId,
    modo,
  )

  return { ...r, numero, nombreArchivo, sentAsTemplate: modo.tipo === 'plantilla' }
}
