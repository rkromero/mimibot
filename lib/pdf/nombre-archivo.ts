/**
 * Título y nombre de archivo de los PDFs de un pedido (remito / proforma):
 * "Juan Perez - Proforma 000141.pdf". El número es el del documento emitido,
 * el mismo que va impreso en el PDF ("Nº 000141"), correlativo por tipo.
 */

export type TipoDocumentoPedido = 'remito' | 'proforma'

const ETIQUETA: Record<TipoDocumentoPedido, string> = {
  remito: 'Remito',
  proforma: 'Proforma',
}

/** "Proforma" / "Remito": cómo se nombra el documento en títulos, archivos y mensajes. */
export function etiquetaDocumento(tipo: TipoDocumentoPedido): string {
  return ETIQUETA[tipo]
}

/** Número de documento con 6 dígitos, igual que impreso en el PDF. */
export function padNumeroDocumento(numero: number): string {
  return String(numero).padStart(6, '0')
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

/** "Juan Perez - Proforma 000141" (también va como título del PDF). */
export function tituloDocumento(
  tipo: TipoDocumentoPedido,
  cliente: { nombre: string; apellido?: string | null },
  numero: number,
): string {
  const nombre = nombreClienteParaArchivo(cliente) || 'Cliente'
  return `${nombre} - ${ETIQUETA[tipo]} ${padNumeroDocumento(numero)}`
}

export function nombreArchivoDocumento(
  tipo: TipoDocumentoPedido,
  cliente: { nombre: string; apellido?: string | null },
  numero: number,
): string {
  return `${tituloDocumento(tipo, cliente, numero)}.pdf`
}

/** Lee el nombre de archivo del header Content-Disposition (o null). */
export function nombreArchivoDesdeHeader(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null
  const m = /filename="([^"]+)"/i.exec(contentDisposition)
  return m?.[1]?.trim() || null
}
