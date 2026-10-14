import { describe, it, expect, vi } from 'vitest'

// El módulo importa db para las consultas; acá solo probamos la lógica pura.
vi.mock('@/db', () => ({ db: {} }))

import {
  hashContenidoPedido,
  documentoSigueVigente,
  type ContenidoPedido,
} from '@/lib/pdf/documento-vigente'

const base: ContenidoPedido = {
  total: '1500.00',
  costoEnvio: '0',
  descuento: '0',
  metodoEntrega: null,
  expresoNombre: null,
  expresoDireccion: null,
  items: [
    { productoId: 'a', cantidad: 2, precioUnitario: '500.00', subtotal: '1000.00' },
    { productoId: 'b', cantidad: 1, precioUnitario: '500.00', subtotal: '500.00' },
  ],
}

describe('hashContenidoPedido', () => {
  it('es estable para el mismo contenido', () => {
    expect(hashContenidoPedido(base)).toBe(hashContenidoPedido({ ...base }))
  })

  it('no depende del orden de los ítems', () => {
    const invertido = { ...base, items: [...base.items].reverse() }
    expect(hashContenidoPedido(invertido)).toBe(hashContenidoPedido(base))
  })

  it('cambia si cambia la cantidad de un ítem', () => {
    const otro = { ...base, items: [{ ...base.items[0]!, cantidad: 3 }, base.items[1]!] }
    expect(hashContenidoPedido(otro)).not.toBe(hashContenidoPedido(base))
  })

  it('cambia si cambia el total, el envío o la entrega', () => {
    expect(hashContenidoPedido({ ...base, total: '1600.00' })).not.toBe(hashContenidoPedido(base))
    expect(hashContenidoPedido({ ...base, costoEnvio: '200.00' })).not.toBe(hashContenidoPedido(base))
    expect(hashContenidoPedido({ ...base, metodoEntrega: 'expreso', expresoNombre: 'Via Cargo' }))
      .not.toBe(hashContenidoPedido(base))
  })
})

describe('documentoSigueVigente', () => {
  const hash = hashContenidoPedido(base)
  const emitidoAt = new Date('2026-10-01T12:00:00Z')

  it('sin emisión previa → no vigente (sale número nuevo)', () => {
    expect(documentoSigueVigente(null, hash, new Date())).toBe(false)
  })

  it('con hash igual → vigente aunque el pedido se haya tocado después (ej. estado, comprobante)', () => {
    const ultimo = { numero: 141, emitidoAt, contenidoHash: hash }
    expect(documentoSigueVigente(ultimo, hash, new Date('2026-10-10T00:00:00Z'))).toBe(true)
  })

  it('con hash distinto → no vigente (el pedido cambió)', () => {
    const ultimo = { numero: 141, emitidoAt, contenidoHash: 'otro' }
    expect(documentoSigueVigente(ultimo, hash, emitidoAt)).toBe(false)
  })

  it('emisión vieja sin hash: vigente solo si el pedido no se modificó después', () => {
    const ultimo = { numero: 7, emitidoAt, contenidoHash: null }
    expect(documentoSigueVigente(ultimo, hash, new Date('2026-09-30T00:00:00Z'))).toBe(true)
    expect(documentoSigueVigente(ultimo, hash, emitidoAt)).toBe(true)
    expect(documentoSigueVigente(ultimo, hash, new Date('2026-10-02T00:00:00Z'))).toBe(false)
  })
})
