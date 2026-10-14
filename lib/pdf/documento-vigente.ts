/**
 * Un pedido tiene UN remito y UNA proforma vigentes: volver a descargar,
 * imprimir o mandar el documento reutiliza el número ya emitido. Solo se
 * emite un número nuevo cuando el pedido todavía no tiene documento de ese
 * tipo, o cuando su contenido (ítems, importes, entrega) cambió desde la
 * última emisión — ahí el documento viejo ya no refleja lo que hay que pagar.
 *
 * El "contenido" se resume en un hash guardado en documentos_emitidos. Las
 * emisiones anteriores a esa columna (hash null) se consideran vigentes si el
 * pedido no se modificó después de emitirlas.
 */
import { createHash } from 'node:crypto'
import { db } from '@/db'
import { documentosEmitidos } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import type { TipoDocumentoPedido } from './nombre-archivo'

export type ContenidoPedido = {
  total: string
  costoEnvio: string | null
  descuento: string | null
  metodoEntrega: string | null
  expresoNombre: string | null
  expresoDireccion: string | null
  items: Array<{
    productoId: string
    cantidad: number
    precioUnitario: string
    subtotal: string
  }>
}

/** Huella estable del contenido del pedido: no depende del orden de los ítems. */
export function hashContenidoPedido(pedido: ContenidoPedido): string {
  const items = pedido.items
    .map((i) => `${i.productoId}|${i.cantidad}|${i.precioUnitario}|${i.subtotal}`)
    .sort()
  const partes = [
    `total=${pedido.total}`,
    `envio=${pedido.costoEnvio ?? '0'}`,
    `descuento=${pedido.descuento ?? '0'}`,
    `entrega=${pedido.metodoEntrega ?? ''}`,
    `expreso=${pedido.expresoNombre ?? ''}`,
    `expresoDir=${pedido.expresoDireccion ?? ''}`,
    ...items,
  ]
  return createHash('sha256').update(partes.join('\n')).digest('hex').slice(0, 32)
}

export type DocumentoEmitidoResumen = {
  numero: number
  emitidoAt: Date
  contenidoHash: string | null
}

/**
 * ¿La última emisión sigue valiendo para el pedido tal como está hoy?
 * - Con hash: vale si el contenido no cambió.
 * - Sin hash (emisión vieja): vale si el pedido no se tocó después de emitirla.
 */
export function documentoSigueVigente(
  ultimo: DocumentoEmitidoResumen | null | undefined,
  hashActual: string,
  pedidoUpdatedAt: Date,
): boolean {
  if (!ultimo) return false
  if (ultimo.contenidoHash !== null) return ultimo.contenidoHash === hashActual
  return pedidoUpdatedAt.getTime() <= ultimo.emitidoAt.getTime()
}

/** Última emisión de ese tipo para el pedido (la de número más alto), o null. */
export async function buscarUltimoDocumento(
  pedidoId: string,
  tipo: TipoDocumentoPedido,
): Promise<DocumentoEmitidoResumen | null> {
  const [row] = await db
    .select({
      numero: documentosEmitidos.numero,
      emitidoAt: documentosEmitidos.emitidoAt,
      contenidoHash: documentosEmitidos.contenidoHash,
    })
    .from(documentosEmitidos)
    .where(and(eq(documentosEmitidos.pedidoId, pedidoId), eq(documentosEmitidos.tipo, tipo)))
    .orderBy(desc(documentosEmitidos.numero))
    .limit(1)
  return row ?? null
}

/**
 * Número vigente del documento para el pedido, o null si la próxima emisión
 * va a sacar un número nuevo (nunca se emitió o el pedido cambió).
 */
export async function numeroDocumentoVigente(
  pedido: ContenidoPedido & { id: string; updatedAt: Date },
  tipo: TipoDocumentoPedido,
): Promise<number | null> {
  const ultimo = await buscarUltimoDocumento(pedido.id, tipo)
  return documentoSigueVigente(ultimo, hashContenidoPedido(pedido), pedido.updatedAt)
    ? ultimo!.numero
    : null
}
