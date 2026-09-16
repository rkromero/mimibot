/**
 * Envío de la proforma (o remito) de un pedido por el WhatsApp embebido: el
 * PDF va como documento a la conversación del cliente, igual que los adjuntos
 * del inbox y la propuesta del cotizador. Queda en el chat con sus tildes.
 *
 * Orden de las verificaciones: primero teléfono y ventana de 24 hs, después
 * se emite el documento. Así una conversación que no se puede usar no gasta
 * un número de proforma.
 */
import { emitirDocumento } from '@/lib/pdf/pdf.service'
import { etiquetaDocumento, padNumeroDocumento, type TipoDocumentoPedido } from '@/lib/pdf/nombre-archivo'
import { enviarArchivoAlCliente, prepararEnvioAlCliente } from './enviar-archivo-cliente'

export { MENSAJE_VENTANA_CERRADA, VentanaCerradaError, EnvioWhatsappError } from './enviar-archivo-cliente'

export type EnviarDocumentoWhatsappParams = {
  pedidoId: string
  clienteId: string
  tipo: TipoDocumentoPedido
  userId: string
}

export type EnviarDocumentoWhatsappResult = {
  conversationId: string
  messageId: string
  waMessageId: string
  numero: number
  nombreArchivo: string
}

/** Texto que acompaña al PDF en el chat: "Proforma 000141". */
export function captionDocumento(tipo: TipoDocumentoPedido, numero: number): string {
  return `${etiquetaDocumento(tipo)} ${padNumeroDocumento(numero)}`
}

export async function enviarDocumentoPorWhatsapp(
  params: EnviarDocumentoWhatsappParams,
): Promise<EnviarDocumentoWhatsappResult> {
  const { pedidoId, clienteId, tipo, userId } = params

  // Conversación del cliente (la del lead si vino del chat; se crea si no hay).
  const destino = await prepararEnvioAlCliente(clienteId)

  const { buffer, numero, nombreArchivo } = await emitirDocumento(pedidoId, tipo, userId)
  const caption = captionDocumento(tipo, numero)

  const r = await enviarArchivoAlCliente(
    destino,
    { buffer, mimeType: 'application/pdf', filename: nombreArchivo, caption },
    userId,
  )

  return { ...r, numero, nombreArchivo }
}
