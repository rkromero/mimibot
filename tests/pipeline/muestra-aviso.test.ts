/**
 * Helpers puros del aviso "salió tu muestra" (lib/leads/muestra-aviso.ts):
 * estado pendiente, detección del tipo de archivo y nombre de la guía.
 */
import { describe, it, expect } from 'vitest'
import {
  esperaAvisoMuestra,
  detectarMime,
  formatoHeaderParaMime,
  nombreArchivoGuia,
  numeroPedidoCorto,
  claveMuestrasPopupVisto,
} from '@/lib/leads/muestra-aviso'

describe('esperaAvisoMuestra', () => {
  it('pendiente solo si la muestra se entregó y todavía no se avisó', () => {
    expect(esperaAvisoMuestra({ muestraEntregadaAt: '2026-09-01T10:00:00Z', muestraAvisadaAt: null })).toBe(true)
    expect(esperaAvisoMuestra({ muestraEntregadaAt: new Date(), muestraAvisadaAt: new Date() })).toBe(false)
    expect(esperaAvisoMuestra({ muestraEntregadaAt: null, muestraAvisadaAt: null })).toBe(false)
    expect(esperaAvisoMuestra(null)).toBe(false)
    expect(esperaAvisoMuestra(undefined)).toBe(false)
  })
})

describe('detectarMime', () => {
  it('reconoce JPEG, PNG, WEBP, GIF y PDF por los primeros bytes', () => {
    expect(detectarMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg')
    expect(detectarMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(detectarMime(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'binary'))).toBe('image/webp')
    expect(detectarMime(Buffer.from('GIF89a', 'binary'))).toBe('image/gif')
    expect(detectarMime(Buffer.from('%PDF-1.4\n', 'binary'))).toBe('application/pdf')
  })

  it('la foto del remito subida como PNG pero que en realidad es JPEG sale como JPEG', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb])
    expect(detectarMime(jpeg, 'image/png')).toBe('image/jpeg')
  })

  it('si no reconoce el tipo devuelve el fallback', () => {
    expect(detectarMime(Buffer.from('hola'), 'image/png')).toBe('image/png')
    expect(detectarMime(Buffer.from([]))).toBe('application/octet-stream')
  })
})

describe('formatoHeaderParaMime', () => {
  it('imágenes JPEG/PNG van como encabezado IMAGE, PDF como DOCUMENT, el resto no se puede', () => {
    expect(formatoHeaderParaMime('image/jpeg')).toBe('IMAGE')
    expect(formatoHeaderParaMime('image/png')).toBe('IMAGE')
    expect(formatoHeaderParaMime('application/pdf')).toBe('DOCUMENT')
    expect(formatoHeaderParaMime('image/webp')).toBeNull()
    expect(formatoHeaderParaMime('application/octet-stream')).toBeNull()
  })
})

describe('nombreArchivoGuia / numeroPedidoCorto', () => {
  it('usa los últimos 8 del id en mayúsculas, como la nota de muestra entregada', () => {
    expect(numeroPedidoCorto('aaaaaaaa-0000-0000-0000-0000abcd1234')).toBe('ABCD1234')
    expect(nombreArchivoGuia('aaaaaaaa-0000-0000-0000-0000abcd1234', 'image/jpeg')).toBe('guia-envio-ABCD1234.jpg')
    expect(nombreArchivoGuia('aaaaaaaa-0000-0000-0000-0000abcd1234', 'application/pdf')).toBe('guia-envio-ABCD1234.pdf')
  })
})

describe('claveMuestrasPopupVisto', () => {
  it('es por usuario', () => {
    expect(claveMuestrasPopupVisto('u1')).toBe('muestras-sin-avisar:u1')
  })
})
