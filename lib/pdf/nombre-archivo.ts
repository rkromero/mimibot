/**
 * Título y nombre de archivo de los PDFs de un pedido (remito / proforma):
 * "Juan Pérez - Pedido 3A9F12BC - Proforma.pdf". El código del pedido es el
 * mismo que se ve en la ficha (#últimos 8 del id).
 */

export type TipoDocumentoPedido = 'remito' | 'proforma'

const ETIQUETA: Record<TipoDocumentoPedido, string> = {
  remito: 'Remito',
  proforma: 'Proforma',
}

/** Código corto del pedido, igual que en la UI: "Pedido #3A9F12BC". */
export function codigoPedido(pedidoId: string): string {
  return pedidoId.slice(-8).toUpperCase()
}

/** Nombre completo del cliente limpio para usar en un nombre de archivo (ASCII, sin caracteres inválidos). */
function nombreClienteParaArchivo(cliente: { nombre: string; apellido?: string | null }): string {
  return [cliente.nombre, cliente.apellido]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9 ._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Juan Perez - Pedido 3A9F12BC - Proforma" (también va como título del PDF). */
export function tituloDocumento(
  tipo: TipoDocumentoPedido,
  cliente: { nombre: string; apellido?: string | null },
  pedidoId: string,
): string {
  const nombre = nombreClienteParaArchivo(cliente) || 'Cliente'
  return `${nombre} - Pedido ${codigoPedido(pedidoId)} - ${ETIQUETA[tipo]}`
}

export function nombreArchivoDocumento(
  tipo: TipoDocumentoPedido,
  cliente: { nombre: string; apellido?: string | null },
  pedidoId: string,
): string {
  return `${tituloDocumento(tipo, cliente, pedidoId)}.pdf`
}

/** Lee el nombre de archivo del header Content-Disposition (o null). */
export function nombreArchivoDesdeHeader(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null
  const m = /filename="([^"]+)"/i.exec(contentDisposition)
  return m?.[1]?.trim() || null
}
