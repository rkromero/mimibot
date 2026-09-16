/**
 * Meta solo acepta `image/jpeg` e `image/png` como imagen de un mensaje
 * (WebP es únicamente para stickers y GIF no se acepta). Cuando desde el chat
 * se adjunta otra cosa, la convertimos a JPG antes de subirla en vez de
 * devolverle al vendedor el error crudo de Meta.
 */
import { ValidationError } from '@/lib/errors'

export const MIMES_IMAGEN_META = new Set(['image/jpeg', 'image/png'])

export type ArchivoAdjunto = { buffer: Buffer; mimeType: string; filename: string }

/** Tipo real por los primeros bytes: el navegador a veces manda `type` vacío o mal. */
export function detectarMimeImagen(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp'
  if (b.length >= 4 && ascii(b, 0, 4) === 'GIF8') return 'image/gif'
  if (b.length >= 2 && ascii(b, 0, 2) === 'BM') return 'image/bmp'
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp') {
    const brand = ascii(b, 8, 12)
    if (brand.startsWith('hei') || brand.startsWith('mif') || brand.startsWith('avif')) return 'image/heic'
  }
  return null
}

function ascii(b: Uint8Array, from: number, to: number): string {
  let s = ''
  for (let i = from; i < to; i++) s += String.fromCharCode(b[i] ?? 0)
  return s
}

function nombreConExtension(filename: string, ext: string): string {
  const base = filename.replace(/\.[^.]+$/, '') || 'imagen'
  return `${base}.${ext}`
}

/**
 * Deja el adjunto en un formato que Meta acepte. JPG/PNG pasan tal cual;
 * cualquier otra imagen (WebP, GIF, BMP, TIFF, AVIF…) se convierte a JPG.
 * Los no-imagen (PDF, audio) no se tocan.
 */
export async function adaptarImagenParaMeta(archivo: ArchivoAdjunto): Promise<ArchivoAdjunto> {
  const real = detectarMimeImagen(archivo.buffer)
  const mimeType = real ?? archivo.mimeType

  if (!mimeType.startsWith('image/')) return archivo
  if (MIMES_IMAGEN_META.has(mimeType)) return { ...archivo, mimeType }

  try {
    const { default: sharp } = await import('sharp')
    // Con `animated` solo tomamos el primer cuadro: Meta no acepta animación de todos modos.
    const buffer = await sharp(archivo.buffer)
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer()
    return { buffer, mimeType: 'image/jpeg', filename: nombreConExtension(archivo.filename, 'jpg') }
  } catch (err) {
    console.error('[imagen-meta] No se pudo convertir', mimeType, err)
    throw new ValidationError(
      `WhatsApp no acepta imágenes ${etiqueta(mimeType)} y no se pudo convertir. Mandala en JPG o PNG.`,
    )
  }
}

function etiqueta(mime: string): string {
  const sub = mime.split('/')[1] ?? mime
  return sub.toUpperCase()
}
