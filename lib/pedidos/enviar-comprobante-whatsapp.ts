/**
 * "Enviar comprobante" desde el detalle del pedido: la foto del remito firmado
 * (expreso) o la firma del cliente (reparto propio) sale por el WhatsApp
 * embebido a la conversación del cliente.
 *
 * Si el cliente escribió en las últimas 24 hs va como imagen suelta (gratis).
 * Si no, WhatsApp solo deja mandar plantillas: se usa la plantilla de
 * comprobante de entrega configurada en Ajustes → WhatsApp, con la foto en el
 * encabezado. Sin plantilla configurada, se avisa qué hacer.
 *
 * El archivo ya está en R2 (lo subió el repartidor o la fábrica). Se pasa por
 * `adaptarImagenParaMeta` porque la firma se guarda como PNG aunque a veces
 * los bytes sean JPEG, y Meta valida el contenido real.
 */
import { db } from '@/db'
import { clientes, pedidos, whatsappTemplates } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { nombrePersona } from '@/lib/clientes/nombre'
import { getObjectBuffer } from '@/lib/r2/get-object'
import { adaptarImagenParaMeta } from '@/lib/whatsapp/imagen-meta'
import { ext } from '@/lib/whatsapp/mime'
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
  type ArchivoParaCliente,
  type EnvioArchivoResult,
  type ModoEnvio,
} from './enviar-archivo-cliente'

export const MENSAJE_VENTANA_CERRADA_SIN_PLANTILLA =
  'Pasaron más de 24 hs desde el último mensaje del cliente: WhatsApp solo deja mandar plantillas. ' +
  'Elegí una plantilla de comprobante de entrega en Ajustes → WhatsApp para mandarlo igual, ' +
  'o abrí el chat, mandale una plantilla de apertura y cuando responda volvé a intentar.'

export type TipoComprobanteEntrega = 'remito' | 'firma'

type PedidoComprobante = {
  id: string
  clienteId: string
  estado: string
  metodoEntrega: string | null
  esReparto: boolean
  firmaUrl: string | null
  remitoFotoUrl: string | null
}

/** Qué comprobante tiene el pedido y dónde está en R2 (misma regla que GET /comprobante). */
export function comprobanteDelPedido(p: PedidoComprobante): { key: string; tipo: TipoComprobanteEntrega } | null {
  if (p.metodoEntrega === 'expreso') {
    return p.remitoFotoUrl ? { key: sanearKey(p.remitoFotoUrl), tipo: 'remito' } : null
  }
  if (p.esReparto) {
    return p.firmaUrl ? { key: sanearKey(p.firmaUrl), tipo: 'firma' } : null
  }
  return null
}

function sanearKey(key: string): string {
  return key.replace(/\.\./g, '').replace(/^\/+/, '')
}

export function numeroPedidoCorto(pedidoId: string): string {
  return pedidoId.slice(-8).toUpperCase()
}

/** "Comprobante de entrega - Pedido #ABCD1234 (remito firmado)". */
export function captionComprobante(pedidoId: string, tipo: TipoComprobanteEntrega): string {
  const detalle = tipo === 'remito' ? 'remito firmado' : 'firma del cliente'
  return `Comprobante de entrega - Pedido #${numeroPedidoCorto(pedidoId)} (${detalle})`
}

/**
 * Variables del cuerpo de la plantilla. Si se importó de Meta sin configurar
 * las fuentes, van por posición: {{1}} cliente, {{2}} nº de pedido, {{3}} vendedor.
 */
export function variablesComprobante(bodyText: string, rawVariables: unknown): TemplateVariable[] {
  const configuradas = toTemplateVariables(rawVariables)
  if (configuradas.length > 0) return configuradas
  const porPosicion: Array<{ source: string; sample: string }> = [
    { source: 'cliente_nombre', sample: 'Cliente' },
    { source: 'pedido_numero', sample: '00000000' },
    { source: 'vendedor_nombre', sample: 'el equipo' },
  ]
  return porPosicion
    .map((v, i) => ({ index: i + 1, ...v }))
    .filter((v) => bodyText.includes(`{{${v.index}}}`))
}

export type EnviarComprobanteResult = EnvioArchivoResult & {
  tipo: TipoComprobanteEntrega
  /** true si salió como plantilla (ventana de 24 hs cerrada). */
  sentAsTemplate: boolean
}

/**
 * Resuelve el comprobante y lo manda. Quien llama ya verificó sesión y acceso
 * al cliente.
 */
export async function enviarComprobanteEntregaPorWhatsapp(params: {
  pedido: PedidoComprobante
  user: { id: string; name: string | null }
}): Promise<EnviarComprobanteResult> {
  const { pedido, user } = params

  const comprobante = comprobanteDelPedido(pedido)
  if (!comprobante) {
    throw new ValidationError('El pedido no tiene comprobante de entrega cargado')
  }

  // Teléfono y ventana antes de bajar nada de R2
  const destino = await destinoDelCliente(pedido.clienteId)
  const ventanaAbierta = await estaDentroDe24h(destino.conversationId)
  const modo: ModoEnvio = ventanaAbierta
    ? { tipo: 'suelto' }
    : await modoPlantillaComprobante(pedido, user.name)

  const { buffer, contentType } = await getObjectBuffer(comprobante.key)
  const mimeGuardado = contentType ?? 'image/png'
  const imagen = await adaptarImagenParaMeta({
    buffer,
    mimeType: mimeGuardado,
    filename: `comprobante-entrega-${numeroPedidoCorto(pedido.id)}.${ext(mimeGuardado)}`,
  })
  const archivo: ArchivoParaCliente = { ...imagen, caption: captionComprobante(pedido.id, comprobante.tipo) }

  const r = await enviarArchivoAlCliente(destino, archivo, user.id, modo)
  return { ...r, tipo: comprobante.tipo, sentAsTemplate: modo.tipo === 'plantilla' }
}

/**
 * Con la ventana cerrada: la plantilla configurada, aprobada y con encabezado
 * de imagen, con sus variables resueltas. Si falta algo, dice qué.
 */
async function modoPlantillaComprobante(
  pedido: PedidoComprobante,
  vendedorNombre: string | null,
): Promise<ModoEnvio> {
  const config = await db.query.whatsappConfig.findFirst({
    columns: { comprobanteTemplateName: true, comprobanteTemplateLang: true },
  })
  const templateName = config?.comprobanteTemplateName?.trim() || null
  const templateLang = config?.comprobanteTemplateLang?.trim() || 'es'
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
      `La plantilla de comprobante "${templateName}" (${templateLang}) no está aprobada en WhatsApp. ` +
        'Cuando Meta la apruebe, sincronizá en Ajustes → WhatsApp → Plantillas.',
    )
  }
  if (tmpl.headerFormat !== 'IMAGE') {
    throw new ValidationError(
      `La plantilla "${templateName}" no tiene encabezado de imagen, así que el comprobante no se puede adjuntar. ` +
        'Creala en el Administrador de WhatsApp de Meta con encabezado "Imagen" y sincronizá las plantillas.',
    )
  }

  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, pedido.clienteId),
    columns: { nombre: true, apellido: true },
  })

  const valores = resolveTemplateVariables(variablesComprobante(tmpl.bodyText, tmpl.variables), {
    clienteNombre: cliente ? nombrePersona(cliente) : undefined,
    vendedorNombre: vendedorNombre ?? undefined,
    pedidoNumero: numeroPedidoCorto(pedido.id),
  })
  const body = applyTemplateValues(tmpl.bodyText, valores).trim()

  return { tipo: 'plantilla', templateName, templateLang, headerFormat: 'IMAGE', valores, body }
}

/** Pedido con las columnas que hacen falta para el envío del comprobante. */
export async function buscarPedidoParaComprobante(pedidoId: string): Promise<PedidoComprobante> {
  const pedido = await db.query.pedidos.findFirst({
    where: and(eq(pedidos.id, pedidoId), isNull(pedidos.deletedAt)),
    columns: {
      id: true,
      clienteId: true,
      estado: true,
      metodoEntrega: true,
      esReparto: true,
      firmaUrl: true,
      remitoFotoUrl: true,
    },
  })
  if (!pedido) throw new NotFoundError('Pedido')
  return pedido
}
