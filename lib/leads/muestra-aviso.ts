/**
 * Aviso al cliente de que salió la muestra CDA.
 *
 * Cuando fábrica despacha la muestra por expreso, marca el pedido entregado
 * con la foto de la guía (remito firmado). Como eso suele pasar fuera de la
 * ventana de 24 hs de WhatsApp, el aviso va como plantilla aprobada con la
 * foto en el encabezado (encabezado de tipo imagen); el cuerpo lleva las
 * variables de siempre (nombre, expreso, nº de pedido).
 *
 * Acá van solo los helpers puros (sin DB, usables en cliente y servidor):
 * el estado "pendiente de aviso" que muestran el kanban y el panel del lead,
 * y la detección del tipo de archivo. Lo que toca la base y WhatsApp está en
 * `muestra-despachada.ts`.
 */

/** Campos del lead que definen si el aviso está pendiente (vienen con GET /api/leads/[id] y el kanban). */
export type EstadoAvisoMuestra = {
  muestraEntregadaAt: Date | string | null
  muestraAvisadaAt: Date | string | null
}

/** ¿La muestra ya se entregó y todavía no se le avisó al cliente? */
export function esperaAvisoMuestra(lead: EstadoAvisoMuestra | null | undefined): boolean {
  return !!lead?.muestraEntregadaAt && !lead.muestraAvisadaAt
}

/** Fila que devuelve GET /api/leads/muestras-pendientes (popup y Mi día). */
export type MuestraPendienteAviso = {
  leadId: string
  nombre: string
  telefono: string | null
  /** ISO: cuándo fábrica la marcó entregada */
  entregadaAt: string
  pedidoId: string | null
  expresoNombre: string | null
  /** true si el pedido tiene la foto de la guía (se puede mandar la plantilla) */
  conFoto: boolean
  etapa: string | null
  etapaColor: string | null
  asignadoNombre: string | null
}

/** Encabezado que acepta Meta para cada tipo de archivo que podemos adjuntar. */
export type FormatoHeaderGuia = 'IMAGE' | 'DOCUMENT'

/**
 * Tipo real del archivo por sus primeros bytes. La foto del remito se sube
 * siempre como `image/png` (ver /api/repartidor/upload-firma) aunque la cámara
 * mande JPEG, y Meta valida el contenido, así que no confiamos en la extensión.
 */
export function detectarMime(buffer: Uint8Array, fallback = 'application/octet-stream'): string {
  const b = buffer
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp'
  if (b.length >= 4 && ascii(b, 0, 4) === 'GIF8') return 'image/gif'
  if (b.length >= 4 && ascii(b, 0, 4) === '%PDF') return 'application/pdf'
  return fallback
}

function ascii(b: Uint8Array, from: number, to: number): string {
  let s = ''
  for (let i = from; i < to; i++) s += String.fromCharCode(b[i] ?? 0)
  return s
}

/** Con qué encabezado de plantilla se puede mandar un archivo de este tipo (null = no se puede). */
export function formatoHeaderParaMime(mime: string): FormatoHeaderGuia | null {
  if (mime === 'image/jpeg' || mime === 'image/png') return 'IMAGE'
  if (mime === 'application/pdf') return 'DOCUMENT'
  return null
}

const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
}

/** Nombre con el que el cliente ve el archivo: "guia-envio-ABCD1234.jpg". */
export function nombreArchivoGuia(pedidoId: string, mime: string): string {
  return `guia-envio-${numeroPedidoCorto(pedidoId)}.${EXT_POR_MIME[mime] ?? 'bin'}`
}

/** Mismo nº corto que usa la nota de "muestra entregada" en la actividad del lead. */
export function numeroPedidoCorto(pedidoId: string): string {
  return pedidoId.slice(-8).toUpperCase()
}

/** Clave de sessionStorage para no repetir el popup de muestras sin avisar en la misma sesión. */
export function claveMuestrasPopupVisto(userId: string): string {
  return `muestras-sin-avisar:${userId}`
}
