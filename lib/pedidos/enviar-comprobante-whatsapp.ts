/**
 * "Enviar comprobante" desde el detalle del pedido: la foto del remito firmado
 * (expreso) o la firma del cliente (reparto propio) sale como imagen por el
 * WhatsApp embebido a la conversación del cliente.
 *
 * El archivo ya está en R2 (lo subió el repartidor o la fábrica). Se baja, se
 * pasa por `adaptarImagenParaMeta` porque la firma se guarda como PNG aunque
 * a veces los bytes sean JPEG, y se manda con el número de pedido de caption.
 */
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { getObjectBuffer } from '@/lib/r2/get-object'
import { adaptarImagenParaMeta } from '@/lib/whatsapp/imagen-meta'
import { ext } from '@/lib/whatsapp/mime'
import { enviarArchivoAlCliente, prepararEnvioAlCliente, type EnvioArchivoResult } from './enviar-archivo-cliente'

export const MENSAJE_VENTANA_CERRADA_COMPROBANTE =
  'Pasaron más de 24 hs desde el último mensaje del cliente: WhatsApp no deja mandar archivos. ' +
  'Abrí el chat, mandale una plantilla de apertura y cuando responda enviá el comprobante.'

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

/** "Comprobante de entrega - Pedido #ABCD1234 (remito firmado)". */
export function captionComprobante(pedidoId: string, tipo: TipoComprobanteEntrega): string {
  const detalle = tipo === 'remito' ? 'remito firmado' : 'firma del cliente'
  return `Comprobante de entrega - Pedido #${pedidoId.slice(-8).toUpperCase()} (${detalle})`
}

export type EnviarComprobanteResult = EnvioArchivoResult & { tipo: TipoComprobanteEntrega }

/**
 * Lee el pedido, resuelve el comprobante y lo manda. Quien llama ya verificó
 * sesión y acceso al cliente.
 */
export async function enviarComprobanteEntregaPorWhatsapp(params: {
  pedido: PedidoComprobante
  userId: string
}): Promise<EnviarComprobanteResult> {
  const { pedido, userId } = params

  const comprobante = comprobanteDelPedido(pedido)
  if (!comprobante) {
    throw new ValidationError('El pedido no tiene comprobante de entrega cargado')
  }

  // Teléfono y ventana de 24 hs antes de bajar nada de R2
  const destino = await prepararEnvioAlCliente(pedido.clienteId, MENSAJE_VENTANA_CERRADA_COMPROBANTE)

  const { buffer, contentType } = await getObjectBuffer(comprobante.key)
  const base = `comprobante-entrega-${pedido.id.slice(-8).toUpperCase()}`
  const archivo = await adaptarImagenParaMeta({
    buffer,
    mimeType: contentType ?? 'image/png',
    filename: `${base}.${ext(contentType ?? 'image/png')}`,
  })

  const r = await enviarArchivoAlCliente(
    destino,
    { ...archivo, caption: captionComprobante(pedido.id, comprobante.tipo) },
    userId,
  )
  return { ...r, tipo: comprobante.tipo }
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
