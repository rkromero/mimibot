/**
 * Adjuntos de imagen desde el chat: Meta solo acepta JPG/PNG como imagen.
 *
 * Bug real: al adjuntar un WebP desde el chat, Meta rechazaba la subida
 * ("unsupported media type") y el vendedor veía un error sin explicación.
 *
 *  1. WebP → se convierte a JPG (bytes JPEG, mime y extensión cambian).
 *  2. GIF → también a JPG.
 *  3. JPG y PNG pasan tal cual, sin recodificar.
 *  4. El mime real manda: un WebP que el navegador etiquetó como PNG igual se convierte.
 *  5. PDF / audio no se tocan.
 *  6. Imagen que sharp no puede decodificar → ValidationError con mensaje claro.
 */
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { adaptarImagenParaMeta, detectarMimeImagen } from '@/lib/whatsapp/imagen-meta'
import { ValidationError } from '@/lib/errors'

async function cuadrado(formato: 'webp' | 'gif' | 'jpeg' | 'png'): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 0.5 } } })
    .toFormat(formato)
    .toBuffer()
}

describe('adaptarImagenParaMeta', () => {
  it('1. WebP → JPG', async () => {
    const webp = await cuadrado('webp')
    expect(detectarMimeImagen(webp)).toBe('image/webp')

    const r = await adaptarImagenParaMeta({ buffer: webp, mimeType: 'image/webp', filename: 'foto.webp' })
    expect(r.mimeType).toBe('image/jpeg')
    expect(r.filename).toBe('foto.jpg')
    expect(detectarMimeImagen(r.buffer)).toBe('image/jpeg')
  })

  it('2. GIF → JPG', async () => {
    const gif = await cuadrado('gif')
    const r = await adaptarImagenParaMeta({ buffer: gif, mimeType: 'image/gif', filename: 'anim.gif' })
    expect(r.mimeType).toBe('image/jpeg')
    expect(detectarMimeImagen(r.buffer)).toBe('image/jpeg')
  })

  it('3. JPG y PNG pasan tal cual', async () => {
    const jpg = await cuadrado('jpeg')
    const rj = await adaptarImagenParaMeta({ buffer: jpg, mimeType: 'image/jpeg', filename: 'a.jpg' })
    expect(rj.buffer).toBe(jpg)
    expect(rj.filename).toBe('a.jpg')

    const png = await cuadrado('png')
    const rp = await adaptarImagenParaMeta({ buffer: png, mimeType: 'image/png', filename: 'a.png' })
    expect(rp.buffer).toBe(png)
    expect(rp.mimeType).toBe('image/png')
  })

  it('4. manda el mime real: WebP etiquetado como PNG se convierte igual', async () => {
    const webp = await cuadrado('webp')
    const r = await adaptarImagenParaMeta({ buffer: webp, mimeType: 'image/png', filename: 'x.png' })
    expect(r.mimeType).toBe('image/jpeg')
    expect(r.filename).toBe('x.jpg')
  })

  it('5. PDF y audio no se tocan', async () => {
    const pdf = Buffer.from('%PDF-1.4 hola')
    const r = await adaptarImagenParaMeta({ buffer: pdf, mimeType: 'application/pdf', filename: 'guia.pdf' })
    expect(r.buffer).toBe(pdf)
    expect(r.mimeType).toBe('application/pdf')

    const ogg = Buffer.from('OggS....')
    const a = await adaptarImagenParaMeta({ buffer: ogg, mimeType: 'audio/ogg', filename: 'nota.ogg' })
    expect(a.buffer).toBe(ogg)
  })

  it('6. imagen indecodificable → ValidationError con mensaje claro', async () => {
    const basura = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 basura', 'binary')
    await expect(
      adaptarImagenParaMeta({ buffer: basura, mimeType: 'image/webp', filename: 'rota.webp' }),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      adaptarImagenParaMeta({ buffer: basura, mimeType: 'image/webp', filename: 'rota.webp' }),
    ).rejects.toThrow(/WEBP.*JPG o PNG/)
  })
})
